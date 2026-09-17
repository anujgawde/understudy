import type {
  Capability,
  Observation,
  ObservedElement,
  RunLog,
  Step,
  ValueType,
} from '@understudy/schemas';
import { distillTrace } from './distill.js';
import { deriveLadder, labelFor } from './ladder.js';

export interface RecordingOptions {
  capabilityId: string;
  name: string;
  modelId: string;
}

interface ExtractedValue {
  rawValue: string;
  observation: Observation;
}

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
      found.set(entry.outputName, { rawValue: entry.rawValue, observation });
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

// Mirrors the replay executor's numeric coercion, so a value the recorder types
// as a number is one replay can actually read back as a number.
function inferValueType(rawValue: string): ValueType {
  const cleaned = rawValue.replace(/[$,]/g, '');
  return cleaned !== '' && !Number.isNaN(Number(cleaned)) ? 'number' : 'string';
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
  const inputs: Capability['inputs'] = [];
  const steps: Step[] = [];

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

    if (action.actionType === 'fill' && valueCameFromOutside(action.value, runLog)) {
      const name = uniqueName(
        identifierFrom(label ?? '') || `input${inputs.length + 1}`,
        takenValueNames,
      );
      inputs.push({
        name,
        valueType: 'string',
        required: true,
        ...(label && { description: label }),
      });
      action = { ...action, value: `{{${name}}}` };
    }

    const after = observations.find((entry) => entry.sequence > distilled.sequence);
    const movedToANewPage =
      after !== undefined &&
      (after.observation.url !== distilled.observationBefore.url ||
        after.observation.pageTitle !== distilled.observationBefore.pageTitle);

    steps.push({
      stepId: uniqueName(
        `${action.actionType}-${identifierFrom(label ?? '') || String(index + 1)}`,
        takenStepIds,
      ),
      action,
      ...(movedToANewPage && { waitFor: { waitUntil: 'pageLoad' as const } }),
    });
  });

  const outputs: Capability['outputs'] = [];
  const extractions: Capability['extractions'] = [];

  for (const [elementRef, extracted] of extractedValues(runLog)) {
    const target = deriveLadder(elementRef, extracted.observation);
    if (target === null) continue;

    const label = labelFor(elementIn(extracted.observation, elementRef));
    const name = uniqueName(
      identifierFrom(label ?? '') || `output${outputs.length + 1}`,
      takenValueNames,
    );
    const valueType = inferValueType(extracted.rawValue);

    outputs.push({ name, valueType, required: true, ...(label && { description: label }) });
    extractions.push({ outputName: name, target, valueType });
  }

  return {
    capabilityId: options.capabilityId,
    name: options.name,
    version: 1,
    goal: runLog.goal ?? options.name,
    status: 'draft',
    inputs,
    outputs,
    steps,
    checkpoints: [],
    extractions,
    businessOutcomes: [],
    provenance: {
      discoveredByModel: options.modelId,
      discoveryRunId: runLog.runId,
      discoveredAt: new Date().toISOString(),
    },
  };
}
