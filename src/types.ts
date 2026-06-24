/** Shared types for the agent harness. */
import type { FilingStatus } from './tax/facts';
import type { TaxResult } from './tax/engine';

/** Conversation stages — the spine of the chat loop. */
export type Stage =
  | 'greeting'
  | 'collecting' // gathering W-2 + filing status (question budget applies here)
  | 'review' // computed, presenting result, offering the PDF
  | 'done';

/** W-2 values the agent extracts/records. Only box 1 + box 2 drive the math. */
export interface W2Data {
  employeeName?: string;
  ssn?: string;
  employerName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  box1_wages?: number;
  box2_federalWithholding?: number;
}

/** Everything we know about this filer, carried across turns. */
export interface SessionState {
  sessionId: string;
  stage: Stage;
  questionsAsked: number; // hard-capped at MAX_QUESTIONS
  w2: W2Data;
  filingStatus?: FilingStatus;
  /** Can someone else claim this taxpayer as a dependent? Affects deduction. */
  claimedAsDependent?: boolean;
  numDependents?: number;
  result?: TaxResult;
  formReady?: boolean; // a filled PDF has been generated and is downloadable
  createdAt: number;
  updatedAt: number;
}

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
  ts: number;
}

/** One observable event in the trace. */
export type TraceEventType =
  | 'user_message'
  | 'guardrail'
  | 'model_call'
  | 'tool_call'
  | 'assistant_message'
  | 'state_change'
  | 'error';

export interface TraceEvent {
  id?: number;
  sessionId: string;
  turn: number;
  seq: number;
  type: TraceEventType;
  /** Short label, e.g. tool name, guardrail name, model id. */
  label: string;
  /** Outcome marker for guardrails/tools: pass | block | warn | ok | error. */
  status?: 'pass' | 'block' | 'warn' | 'ok' | 'error';
  latencyMs?: number;
  costUsd?: number;
  promptTokens?: number;
  completionTokens?: number;
  provider?: string;
  model?: string;
  /** Redacted, human-readable detail. Never contains secrets or raw SSNs. */
  detail?: string;
  ts: number;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}
