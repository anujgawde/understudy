import { z } from 'zod';
import { LocatorLadder } from './locator';
import { FailureCode } from './outcome';
import { Step, StepRisk } from './step';

export const ValueType = z.enum(['string', 'number', 'boolean', 'date']);
export type ValueType = z.infer<typeof ValueType>;

export const Assertion = z.discriminatedUnion('assert', [
  z.object({ assert: z.literal('text_present'), text: z.string().min(1) }),
  z.object({ assert: z.literal('text_absent'), text: z.string().min(1) }),
  z.object({ assert: z.literal('element_present'), target: LocatorLadder }),
  z.object({ assert: z.literal('url_matches'), pattern: z.string().min(1) }),
]);
export type Assertion = z.infer<typeof Assertion>;

export const Checkpoint = z.object({
  checkpointId: z.string().min(1),
  afterStepId: z.string().min(1),
  allOf: z.array(Assertion).min(1),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

export const BusinessOutcomeRule = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  // A failed checkpoint says only that the expected result is missing, and a
  // validation error, an expired session and a genuinely empty result all look
  // identical through it. The signal is what the page must positively show for
  // this rule to fire, so each of those reaches the caller as itself instead of
  // as whichever rule happened to be listed first.
  signal: Assertion,
  condition: z.discriminatedUnion('when', [
    z.object({
      when: z.literal('step_failed'),
      stepId: z.string().min(1),
      failureCode: FailureCode,
    }),
    z.object({
      when: z.literal('checkpoint_failed'),
      checkpointId: z.string().min(1),
    }),
  ]),
});
export type BusinessOutcomeRule = z.infer<typeof BusinessOutcomeRule>;

export const Capability = z
  .object({
    capabilityId: z.string().min(1),
    name: z.string().min(1),
    version: z.number().int().positive(),
    goal: z.string().min(1),
    status: z.enum(['draft', 'approved']),
    inputs: z.array(
      z.object({
        name: z.string().min(1),
        valueType: ValueType,
        required: z.boolean(),
        description: z.string().optional(),
        // A secret is held by reference: the step that consumes it carries
        // "{{name}}", never the value, so the artifact stays safe to read and
        // the credential is supplied at replay time instead.
        secret: z.boolean().default(false),
      }),
    ),
    outputs: z.array(
      z.object({
        name: z.string().min(1),
        valueType: ValueType,
        required: z.boolean(),
        description: z.string().optional(),
      }),
    ),
    steps: z.array(Step).min(1),
    checkpoints: z.array(Checkpoint),
    extractions: z.array(
      z.object({
        outputName: z.string().min(1),
        target: LocatorLadder,
        valueType: ValueType,
      }),
    ),
    businessOutcomes: z.array(BusinessOutcomeRule).default([]),
    // Dialog text this flow legitimately raises. Replay accepts these and
    // dismisses anything else as an unexpected dialog rather than letting it
    // block the page silently.
    expectedDialogs: z.array(z.string().min(1)).default([]),
    // Notices that can appear over the flow and be cleared without changing
    // anything — a maintenance banner, a survey prompt. Declared per capability
    // because "dismissible" is a claim about this app, not a guess replay can
    // safely make on its own.
    interstitials: z
      .array(
        z.object({
          name: z.string().min(1),
          when: Assertion,
          dismiss: LocatorLadder,
          // Dismissing is a click like any other. A notice whose only control
          // also commits something is not something replay may press on its
          // own, so the declaration carries the same risk the steps do.
          risk: StepRisk.default('reversible'),
        }),
      )
      .default([]),
    provenance: z
      .object({
        discoveredByModel: z.string().min(1),
        discoveryRunId: z.string().min(1),
        discoveredAt: z.iso.datetime(),
      })
      .optional(),
  })
  // Cross-field integrity. These would otherwise surface mid-replay as a
  // confusing runtime error rather than as a malformed artifact.
  .superRefine((capability, context) => {
    const declaredOutputs = new Set(capability.outputs.map((output) => output.name));
    capability.extractions.forEach((extraction, index) => {
      if (!declaredOutputs.has(extraction.outputName)) {
        context.addIssue({
          code: 'custom',
          path: ['extractions', index, 'outputName'],
          message: `extraction writes to "${extraction.outputName}", which is not a declared output`,
        });
      }
    });

    const stepIds = new Set(capability.steps.map((step) => step.stepId));
    capability.checkpoints.forEach((checkpoint, index) => {
      if (!stepIds.has(checkpoint.afterStepId)) {
        context.addIssue({
          code: 'custom',
          path: ['checkpoints', index, 'afterStepId'],
          message: `checkpoint runs after "${checkpoint.afterStepId}", which is not a step in this capability`,
        });
      }
    });

    const checkpointIds = new Set(capability.checkpoints.map((c) => c.checkpointId));
    capability.businessOutcomes.forEach((rule, index) => {
      // `text_absent` would make the rule fire on the absence of something,
      // which is the ambiguity the signal exists to remove.
      if (rule.signal.assert === 'text_absent') {
        context.addIssue({
          code: 'custom',
          path: ['businessOutcomes', index, 'signal'],
          message: `business outcome "${rule.code}" uses a text_absent signal; a signal must be something the page positively shows`,
        });
      }
      if (rule.condition.when === 'step_failed' && !stepIds.has(rule.condition.stepId)) {
        context.addIssue({
          code: 'custom',
          path: ['businessOutcomes', index, 'condition', 'stepId'],
          message: `business outcome references step "${rule.condition.stepId}", which is not a step in this capability`,
        });
      }
      if (
        rule.condition.when === 'checkpoint_failed' &&
        !checkpointIds.has(rule.condition.checkpointId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['businessOutcomes', index, 'condition', 'checkpointId'],
          message: `business outcome references checkpoint "${rule.condition.checkpointId}", which is not a checkpoint in this capability`,
        });
      }
    });

    // Replay resolves "{{name}}" in navigate urls and fill values and nowhere
    // else, so a placeholder fails in two different ways. Named input that was
    // never declared: nothing can supply it. Placeholder in a locator or a wait
    // condition: it is matched against the page verbatim and never resolves.
    const inputPlaceholder = /\{\{(\w+)\}\}/g;
    const declaredInputs = new Set(capability.inputs.map((input) => input.name));

    capability.steps.forEach((step, index) => {
      const substituted =
        step.action.actionType === 'navigate'
          ? step.action.url
          : step.action.actionType === 'fill'
            ? step.action.value
            : '';

      for (const match of substituted.matchAll(inputPlaceholder)) {
        const inputName = match[1]!;
        if (!declaredInputs.has(inputName)) {
          context.addIssue({
            code: 'custom',
            path: ['steps', index, 'action'],
            message: `step "${step.stepId}" uses "{{${inputName}}}", which is not a declared input`,
          });
        }
      }

      const leftLiteral = JSON.stringify([
        'target' in step.action ? step.action.target : null,
        step.waitFor ?? null,
      ]);
      for (const match of leftLiteral.matchAll(inputPlaceholder)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index],
          message: `step "${step.stepId}" carries "{{${match[1]!}}}" in a locator or wait condition, where replay does not substitute inputs`,
        });
      }
    });
  });
export type Capability = z.infer<typeof Capability>;
