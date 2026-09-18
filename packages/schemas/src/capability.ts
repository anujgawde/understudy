import { z } from 'zod';
import { LocatorLadder } from './locator';
import { FailureCode } from './outcome';
import { Step } from './step';

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
    provenance: z
      .object({
        discoveredByModel: z.string().min(1),
        discoveryRunId: z.string().min(1),
        discoveredAt: z.iso.datetime(),
      })
      .optional(),
  })
  // Cross-field integrity. Both of these would otherwise surface mid-replay as
  // a confusing runtime error rather than as a malformed artifact.
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
  });
export type Capability = z.infer<typeof Capability>;
