import { z } from 'zod';
import { LocatorLadder } from './locator';
import { Step } from './step';

export const ValueType = z.enum(['string', 'number', 'boolean', 'date']);
export type ValueType = z.infer<typeof ValueType>;

export const InputDefinition = z.object({
  name: z.string().min(1),
  valueType: ValueType,
  required: z.boolean(),
  description: z.string().optional(),
});

export const OutputDefinition = z.object({
  name: z.string().min(1),
  valueType: ValueType,
  required: z.boolean(),
  description: z.string().optional(),
});

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

export const ExtractionRule = z.object({
  outputName: z.string().min(1),
  target: LocatorLadder,
  valueType: ValueType,
});

export const CapabilityProvenance = z.object({
  discoveredByModel: z.string().min(1),
  discoveryRunId: z.string().min(1),
  discoveredAt: z.iso.datetime(),
});

export const Capability = z
  .object({
    capabilityId: z.string().min(1),
    name: z.string().min(1),
    version: z.number().int().positive(),
    goal: z.string().min(1),
    status: z.enum(['draft', 'approved']),
    inputs: z.array(InputDefinition),
    outputs: z.array(OutputDefinition),
    steps: z.array(Step).min(1),
    checkpoints: z.array(Checkpoint),
    extractions: z.array(ExtractionRule),
    provenance: CapabilityProvenance.optional(),
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
  });
export type Capability = z.infer<typeof Capability>;
