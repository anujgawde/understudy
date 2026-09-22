import type {
  Assertion,
  Capability,
  Checkpoint,
  Observation,
  ObservedElement,
  RunLog,
  Step,
  StepRisk,
  ValueType,
} from '@understudy/schemas';
import { namesIrreversibleControl } from '@understudy/schemas';
import { isSensitiveField } from '@understudy/redaction';
import { distillTrace } from './distill.js';
import { deriveLadder, labelFor } from './ladder.js';
import type { ExtractedValue, RecordingOptions } from './types.js';

function elementIn(observation: Observation, elementRef: string): ObservedElement | undefined {
  return observation.elements.find((element) => element.elementRef === elementRef);
}

// Discovery names each extraction after the element handle it read, so the
// handle plus the observation it came from is enough to relocate the value.
// Keyed by element so a value read twice yields one output, not two.
function extractedValues(runLog: RunLog): Map<string, ExtractedValue> {
  const found = new Map<string, ExtractedValue>();
  let observation: Observation | null = null;

  for (const entry of [...runLog.entries].sort((left, right) => left.sequence - right.sequence)) {
    if (entry.entryType === 'observation') {
      observation = entry.observation;
    } else if (entry.entryType === 'extraction' && observation !== null) {
      found.set(entry.outputName, {
        rawValue: entry.rawValue,
        observation,
        sequence: entry.sequence,
      });
    }
  }

  return found;
}

function identifierFrom(label: string): string {
  const words = label
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  return words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

function uniqueName(preferred: string, taken: Set<string>): string {
  let name = preferred;
  let suffix = 2;
  while (taken.has(name)) name = `${preferred}${suffix++}`;
  taken.add(name);
  return name;
}

/**
 * A value is an input when it can be traced to somewhere outside the page — the
 * inputs the run was handed, or the goal the operator wrote. A value the model
 * supplied from nowhere else is a constant of the flow, not a parameter of it.
 * Single characters are ignored because they match a goal by coincidence.
 */
function valueCameFromOutside(value: string, runLog: RunLog): boolean {
  if (Object.values(runLog.inputs).includes(value)) return true;
  return value.length > 2 && (runLog.goal?.toLowerCase().includes(value.toLowerCase()) ?? false);
}

/**
 * A `url_matches` pattern for the page a step landed on. Only the path is used:
 * the origin changes between environments and tenants, while the path is the
 * part that identifies where the flow got to. Escaped so it matches literally,
 * and closed off so a checkpoint on /members/search is not satisfied by
 * /members/search-archive.
 *
 * Returns null when the path carries a value the run was handed — a URL like
 * /members/12345 would pin the capability to one member, which is the opposite
 * of what a checkpoint is for.
 */
function urlPathPattern(url: string, runLog: RunLog): string | null {
  const path = new URL(url).pathname;
  if (path === '/') return null;

  const inputValues = Object.values(runLog.inputs);
  if (inputValues.some((value) => value.length > 0 && path.includes(value))) return null;

  return `${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?|$)`;
}

// Mirrors the replay executor's numeric coercion, so a value the recorder types
// as a number is one replay can actually read back as a number.
function inferValueType(rawValue: string): ValueType {
  const cleaned = rawValue.replace(/[$,]/g, '');
  return cleaned !== '' && !Number.isNaN(Number(cleaned)) ? 'number' : 'string';
}

/**
 * Recorded at record time rather than judged at replay time, because by the
 * moment replay is looking at the button it is already on the page it would be
 * changing. Only a click can be irreversible: a navigation goes somewhere and a
 * fill stages a value, while the click on "Post" is the step that commits it.
 */
function riskOf(
  action: Step['action'],
  element: ObservedElement | undefined,
  options: RecordingOptions,
): StepRisk {
  if (action.actionType !== 'click' || options.policy === undefined) return 'reversible';

  const names = [
    element?.accessibleName,
    element?.domId,
    element?.testId,
    ...(element?.nearbyText ?? []),
  ];

  return namesIrreversibleControl(options.policy, names) ? 'irreversible' : 'reversible';
}

export function recordCapability(runLog: RunLog, options: RecordingOptions): Capability {
  const distilledSteps = distillTrace(runLog);
  if (distilledSteps.length === 0) {
    throw new Error('Cannot record a capability: the run reached no replayable path.');
  }

  const observations = [...runLog.entries]
    .sort((left, right) => left.sequence - right.sequence)
    .filter((entry) => entry.entryType === 'observation');

  const takenStepIds = new Set<string>();
  const takenValueNames = new Set<string>();
  const takenCheckpointIds = new Set<string>();
  const inputs: Capability['inputs'] = [];
  const steps: Step[] = [];
  const checkpoints: Checkpoint[] = [];

  distilledSteps.forEach((distilled, index) => {
    const element = distilled.elementRef
      ? elementIn(distilled.observationBefore, distilled.elementRef)
      : undefined;
    const label = labelFor(element);

    let action = distilled.action;

    if (action.actionType !== 'navigate') {
      const target = distilled.elementRef
        ? deriveLadder(distilled.elementRef, distilled.observationBefore)
        : null;
      if (target === null) {
        throw new Error(
          `Cannot record a capability: step ${distilled.sequence} acted on an element the run never observed.`,
        );
      }
      action = { ...action, target };
    }

    if (action.actionType === 'fill') {
      // A secret is parameterised whether or not it can be traced to somewhere
      // outside the page: inlining it as a constant of the flow is exactly the
      // leak this is here to prevent.
      const secret =
        element !== undefined && options.policy !== undefined
          ? isSensitiveField(options.policy, element)
          : false;

      if (secret || valueCameFromOutside(action.value, runLog)) {
        const name = uniqueName(
          identifierFrom(label ?? '') || `input${inputs.length + 1}`,
          takenValueNames,
        );
        inputs.push({
          name,
          valueType: 'string',
          required: true,
          secret,
          ...(label && { description: label }),
        });
        action = { ...action, value: `{{${name}}}` };
      }
    }

    const after = observations.find((entry) => entry.sequence > distilled.sequence);
    const movedToANewPage =
      after !== undefined &&
      (after.observation.url !== distilled.observationBefore.url ||
        after.observation.pageTitle !== distilled.observationBefore.pageTitle);

    const stepId = uniqueName(
      `${action.actionType}-${identifierFrom(label ?? '') || String(index + 1)}`,
      takenStepIds,
    );

    steps.push({
      stepId,
      action,
      ...(movedToANewPage && { waitFor: { waitUntil: 'pageLoad' as const } }),
      risk: riskOf(action, element, options),
    });

    // A step that moved the flow to a new page is the one worth asserting on:
    // it is where a login that silently failed, or a search that bounced back
    // to its own form, stops looking like progress.
    if (movedToANewPage && after !== undefined) {
      const pattern = urlPathPattern(after.observation.url, runLog);
      if (pattern !== null) {
        checkpoints.push({
          checkpointId: uniqueName(
            `reached-${identifierFrom(new URL(after.observation.url).pathname) || String(index + 1)}`,
            takenCheckpointIds,
          ),
          afterStepId: stepId,
          allOf: [{ assert: 'url_matches', pattern }],
        });
      }
    }
  });

  const outputs: Capability['outputs'] = [];
  const extractions: Capability['extractions'] = [];

  // Grouped by the step each value was already on screen after. This is the
  // load-bearing checkpoint: it separates "the result never appeared" — a member
  // number that matches nobody — from "the extraction selector broke", which is
  // the distinction every business outcome downstream rests on.
  const resultAssertions = new Map<string, Assertion[]>();

  for (const [elementRef, extracted] of extractedValues(runLog)) {
    const target = deriveLadder(elementRef, extracted.observation);
    if (target === null) continue;

    const guardingStepId =
      steps[distilledSteps.findLastIndex((distilled) => distilled.sequence < extracted.sequence)]
        ?.stepId;
    if (guardingStepId !== undefined) {
      resultAssertions.set(guardingStepId, [
        ...(resultAssertions.get(guardingStepId) ?? []),
        { assert: 'element_present', target },
      ]);
    }

    const label = labelFor(elementIn(extracted.observation, elementRef));
    const name = uniqueName(
      identifierFrom(label ?? '') || `output${outputs.length + 1}`,
      takenValueNames,
    );
    const valueType = inferValueType(extracted.rawValue);

    outputs.push({ name, valueType, required: true, ...(label && { description: label }) });
    extractions.push({ outputName: name, target, valueType });
  }

  for (const [afterStepId, allOf] of resultAssertions) {
    checkpoints.push({
      checkpointId: uniqueName('results-present', takenCheckpointIds),
      afterStepId,
      allOf,
    });
  }

  return {
    capabilityId: options.capabilityId,
    name: options.name,
    version: 1,
    goal: runLog.goal ?? options.name,
    // Recorded ready to use. A capability is only ever written for a run that
    // succeeded, so a draft gate here would filter nothing — it would just mean
    // every capability sat unusable until a human ticked a box that had no
    // information behind it. What would make the status mean something is
    // verifying the artifact against the page rather than trusting the model's
    // own claim of success; see the deferred review in the build plan.
    status: 'approved',
    inputs,
    outputs,
    steps,
    checkpoints,
    extractions,
    businessOutcomes: [],
    expectedDialogs: [],
    interstitials: [],
    provenance: {
      discoveredByModel: options.modelId,
      discoveryRunId: runLog.runId,
      discoveredAt: new Date().toISOString(),
    },
  };
}
