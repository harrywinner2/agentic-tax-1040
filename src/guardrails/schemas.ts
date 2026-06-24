/**
 * Zod schemas validate everything the agent accepts before it touches state.
 * Tool inputs are parsed through these — invalid data is rejected at the schema
 * boundary, not "hopefully handled" by the prompt.
 */
import { z } from 'zod';

export const MAX_QUESTIONS = 5;
export const MAX_USER_MESSAGE_CHARS = 4000;

/** Plausibility bounds for the target profile (a single W-2 wage earner). */
export const WAGE_HARD_MAX = 1_000_000; // reject anything above this outright
export const WAGE_PLAUSIBLE_MIN = 1_000;
export const WAGE_PLAUSIBLE_MAX = 250_000;

export const filingStatusSchema = z.enum(['single', 'mfj', 'mfs', 'hoh', 'qss']);

export const w2RecordSchema = z.object({
  employeeName: z.string().min(1).max(120).optional(),
  ssn: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s.length === 0 || s.length === 9, 'SSN must be 9 digits')
    .optional(),
  employerName: z.string().max(120).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  zip: z.string().max(12).optional(),
  box1_wages: z.number().nonnegative().max(WAGE_HARD_MAX),
  box2_federalWithholding: z.number().nonnegative().max(WAGE_HARD_MAX),
});
export type W2Record = z.infer<typeof w2RecordSchema>;

export const setFilingStatusSchema = z.object({ filingStatus: filingStatusSchema });

export const setDependentInfoSchema = z.object({
  claimedAsDependent: z.boolean().optional(),
  numDependents: z.number().int().min(0).max(15).optional(),
});

/** The terminal tool the agent must call to end every turn. */
export const respondSchema = z.object({
  message: z.string().min(1).max(2000),
  /** True only when this message asks the user for new information. */
  asksQuestion: z.boolean(),
  stage: z.enum(['greeting', 'collecting', 'review', 'done']),
});
export type RespondArgs = z.infer<typeof respondSchema>;
