import { z } from 'zod';
import { Action } from './action';
import { Observation } from './observation';
import { Outcome, Recovery } from './outcome';
import { ActionClass, PolicyDecision } from './policy';

export const Actor = z.enum(['system', 'model', 'operator']);
export type Actor = z.infer<typeof Actor>;

// Every entry carries who caused it, so an operator takeover is attributable
// after the fact rather than blending into the system's own steps.
const commonEntryFields = {
  sequence: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime(),
  actor: Actor,
};

export const RunLogEntry = z.discriminatedUnion('entryType', [
  z.object({
    ...commonEntryFields,
    entryType: z.literal('observation'),
    observation: Observation,
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('rationale'),
    text: z.string().min(1),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('action'),
    action: Action,
    stepId: z.string().min(1).optional(),
    // Which ladder position actually matched, so the recorder can tell a
    // durable locator from one that only ever worked as a fallback.
    resolvedByIndex: z.number().int().nonnegative().optional(),
    succeeded: z.boolean(),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('policy_decision'),
    actionClass: ActionClass,
    decision: PolicyDecision,
    reason: z.string().min(1),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('assertion'),
    checkpointId: z.string().min(1),
    passed: z.boolean(),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('extraction'),
    outputName: z.string().min(1),
    rawValue: z.string(),
    coerced: z.boolean(),
  }),
  // A native dialog blocks the page until something answers it. Recorded
  // whether or not the capability expected it, because "a dialog appeared and
  // was dismissed" is the fact a caller needs to explain what the run saw.
  z.object({
    ...commonEntryFields,
    entryType: z.literal('dialog'),
    kind: z.string().min(1),
    message: z.string(),
    expected: z.boolean(),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('recovery'),
    recovery: Recovery,
  }),
  // Why a business outcome did or did not fire. A rule whose condition matched
  // but whose signal was absent is the interesting line in the log: it is the
  // run declining to call something a business answer on the strength of a
  // failed checkpoint alone.
  z.object({
    ...commonEntryFields,
    entryType: z.literal('outcome_rule'),
    code: z.string().min(1),
    signalPresent: z.boolean(),
  }),
  z.object({
    ...commonEntryFields,
    entryType: z.literal('intervention'),
    interventionId: z.string().min(1),
    state: z.enum(['raised', 'handed_off', 'handed_back', 'resolved']),
  }),
]);
export type RunLogEntry = z.infer<typeof RunLogEntry>;

export const RunLog = z.object({
  runId: z.string().min(1),
  mode: z.enum(['discovery', 'replay']),
  capabilityId: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  inputs: z.record(z.string(), z.string()),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  entries: z.array(RunLogEntry),
  outcome: Outcome.optional(),
});
export type RunLog = z.infer<typeof RunLog>;
