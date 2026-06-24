/**
 * The chat loop — one call per user turn. It carries state across turns, runs
 * the guardrails, drives the tool-calling sub-loop, and enforces the question
 * budget in code. Returns the assistant's user-facing message plus the new state.
 */
import type { Env, SessionState, ChatMessage } from '../types';
import { Tracer } from '../observability/trace';
import { inputGuard } from '../guardrails/guards';
import { MAX_QUESTIONS, MAX_USER_MESSAGE_CHARS, respondSchema } from '../guardrails/schemas';
import { callModel, type ApiMessage } from './providers';
import { TOOLS, executeTool, type ToolContext } from './tools';
import { SYSTEM_PROMPT, stateBriefing } from './prompt';

const MAX_STEPS = 8;

export interface TurnInput {
  env: Env;
  state: SessionState;
  history: ChatMessage[];
  userText: string;
  pendingImage?: string;
  turn: number;
}

export interface TurnOutput {
  assistant: string;
  state: SessionState;
  tracer: Tracer;
}

export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const { env, state } = input;
  const tracer = new Tracer(state.sessionId, input.turn);

  let userText = input.userText;
  tracer.event('user_message', 'user', { detail: redact(userText).slice(0, 200) });

  // --- Guardrail layer 1: scan the incoming message ---
  const guardNotes: string[] = [];
  for (const g of inputGuard(userText)) {
    tracer.guardrail(g.name, g.status, g.detail);
    if (g.systemNote) guardNotes.push(g.systemNote);
    if (g.status === 'block' && g.name === 'message_size') {
      userText = userText.slice(0, MAX_USER_MESSAGE_CHARS);
    }
  }
  if (input.pendingImage) guardNotes.push('The user has attached a W-2 file this turn; call extract_w2 to read it.');

  // --- Build the message list ---
  const messages: ApiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const m of input.history) messages.push({ role: m.role, content: m.content });
  messages.push({ role: 'system', content: stateBriefing(state) });
  if (guardNotes.length) messages.push({ role: 'system', content: `[Guardrail notes]\n- ${guardNotes.join('\n- ')}` });
  messages.push({ role: 'user', content: userText });

  const ctx: ToolContext = { env, tracer, state, pendingImage: input.pendingImage };

  let assistant = '';
  let budgetForced = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message } = await callModel(env, tracer, { role: 'chat', messages, tools: TOOLS, toolChoice: 'auto' });
    const toolCalls = message.tool_calls ?? [];

    // No tool calls: coerce plain text into a respond.
    if (toolCalls.length === 0) {
      const text = message.content ?? '';
      const counts = countsAsQuestion(state, text, false);
      assistant = finalizeRespond(state, tracer, text || 'Sorry, could you say that again?', counts);
      break;
    }

    // Append the assistant tool-call message verbatim (required by the API).
    messages.push(message as unknown as ApiMessage);

    // Run work tools first; capture a respond call to handle as terminal.
    let respondCall: { id: string; args: unknown } | null = null;
    for (const tc of toolCalls) {
      if (tc.function.name === 'respond') {
        respondCall = { id: tc.id, args: safeJson(tc.function.arguments) };
        // We still must answer the tool call id in the message list.
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ack' });
        continue;
      }
      const result = await executeTool(ctx, tc.function.name, tc.function.arguments);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }

    if (!respondCall) continue; // model did work; loop again to let it talk

    // --- Validate + enforce the question budget on the terminal respond ---
    const parsed = respondSchema.safeParse(respondCall.args);
    if (!parsed.success) {
      messages.push({ role: 'system', content: 'Your respond call was malformed. Call respond again with {message, asksQuestion, stage}.' });
      continue;
    }
    const { message: text, asksQuestion } = parsed.data;
    // Budget is code-authoritative: count any question while a required slot is
    // still missing, regardless of what the model self-reports.
    let counts = countsAsQuestion(state, text, asksQuestion);

    if (counts && state.questionsAsked >= MAX_QUESTIONS && !budgetForced) {
      tracer.guardrail('question_budget', 'block', `attempted question ${state.questionsAsked + 1} of ${MAX_QUESTIONS}`);
      budgetForced = true;
      messages.push({
        role: 'system',
        content: `QUESTION BUDGET REACHED (${MAX_QUESTIONS}/${MAX_QUESTIONS}). Do not ask another question. Assume Single filing status if still unknown and assume the taxpayer is not claimed as a dependent. Move ahead: call compute_tax, then fill_form, then respond without asking anything.`,
      });
      continue;
    }
    if (counts && budgetForced) counts = false; // hard override — drop the trailing question

    assistant = finalizeRespond(state, tracer, text, counts);
    break;
  }

  if (!assistant) {
    assistant = "I hit a snag putting that together — let's try again. Could you re-send your W-2 or tell me your filing status?";
    tracer.error('loop', 'no assistant message produced within step budget');
  }

  state.stage = deriveStage(state);
  state.updatedAt = Date.now();
  tracer.event('assistant_message', 'assistant', { detail: assistant.slice(0, 200) });
  return { assistant, state, tracer };
}

/** True while the agent still lacks a required slot (so a '?' is a real ask). */
function isGathering(state: SessionState): boolean {
  return state.w2.box1_wages === undefined || state.filingStatus === undefined;
}

/** Code-authoritative: a question counts if the model flags it OR the message
 *  contains a '?' while we're still gathering required inputs. */
function countsAsQuestion(state: SessionState, text: string, modelFlag: boolean): boolean {
  return modelFlag || (/\?/.test(text) && isGathering(state));
}

/** Stage is derived from real state, not the model's say-so. */
function deriveStage(state: SessionState): SessionState['stage'] {
  if (state.formReady) return 'done';
  if (state.result) return 'review';
  if (state.w2.box1_wages !== undefined || state.questionsAsked > 0) return 'collecting';
  return 'greeting';
}

function finalizeRespond(state: SessionState, tracer: Tracer, text: string, counts: boolean): string {
  if (counts && state.questionsAsked < MAX_QUESTIONS) {
    state.questionsAsked += 1;
    tracer.guardrail('question_budget', 'pass', `question ${state.questionsAsked}/${MAX_QUESTIONS}`);
  }
  return text;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

/** Redact anything that looks like an SSN before it reaches the trace. */
function redact(s: string): string {
  return s.replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '***-**-****');
}
