/**
 * Observability pillar: a per-turn tracer that records every decision the agent
 * makes — guardrail verdicts, model calls (latency + tokens + cost + which
 * provider served it), tool calls, and state changes — and persists them to D1.
 *
 * The trace is the source of truth a judge can point at: GET /api/trace/:id
 * returns the full event stream + rolled-up metrics, and the UI renders it live.
 */
import type { TraceEvent, TraceEventType } from '../types';
import { costFor } from './pricing';

export class Tracer {
  private events: TraceEvent[] = [];
  private seq = 0;
  constructor(
    private sessionId: string,
    private turn: number
  ) {}

  private push(e: Omit<TraceEvent, 'sessionId' | 'turn' | 'seq' | 'ts'>): TraceEvent {
    const ev: TraceEvent = {
      sessionId: this.sessionId,
      turn: this.turn,
      seq: this.seq++,
      ts: Date.now(),
      ...e,
    };
    this.events.push(ev);
    return ev;
  }

  event(type: TraceEventType, label: string, extra: Partial<TraceEvent> = {}) {
    return this.push({ type, label, ...extra });
  }

  guardrail(name: string, status: 'pass' | 'block' | 'warn', detail?: string) {
    return this.push({ type: 'guardrail', label: name, status, detail });
  }

  modelCall(args: {
    provider: string;
    model: string;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    detail?: string;
  }) {
    const costUsd = costFor(args.model, args.promptTokens, args.completionTokens);
    return this.push({ type: 'model_call', label: `${args.provider}:${args.model}`, status: 'ok', costUsd, ...args });
  }

  toolCall(name: string, status: 'ok' | 'error' | 'block', latencyMs: number, detail?: string) {
    return this.push({ type: 'tool_call', label: name, status, latencyMs, detail });
  }

  stateChange(detail: string) {
    return this.push({ type: 'state_change', label: 'state', status: 'ok', detail });
  }

  error(label: string, detail: string) {
    return this.push({ type: 'error', label, status: 'error', detail });
  }

  list(): TraceEvent[] {
    return this.events;
  }

  /** Persist this turn's events to D1 in one batch. */
  async flush(db: D1Database): Promise<void> {
    if (this.events.length === 0) return;
    const stmt = db.prepare(
      `INSERT INTO trace_events
       (session_id, turn, seq, type, label, status, latency_ms, cost_usd, prompt_tokens, completion_tokens, provider, model, detail, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const batch = this.events.map((e) =>
      stmt.bind(
        e.sessionId,
        e.turn,
        e.seq,
        e.type,
        e.label,
        e.status ?? null,
        e.latencyMs ?? null,
        e.costUsd ?? null,
        e.promptTokens ?? null,
        e.completionTokens ?? null,
        e.provider ?? null,
        e.model ?? null,
        e.detail ?? null,
        e.ts
      )
    );
    await db.batch(batch);
  }
}

export interface TraceSummary {
  events: number;
  turns: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  modelCalls: number;
  toolCalls: number;
  guardrailBlocks: number;
  guardrailWarns: number;
  providers: Record<string, number>;
}

/** Read a full session trace from D1 plus rolled-up metrics. */
export async function readTrace(
  db: D1Database,
  sessionId: string
): Promise<{ events: TraceEvent[]; summary: TraceSummary }> {
  const rows = await db
    .prepare(
      `SELECT * FROM trace_events WHERE session_id = ? ORDER BY turn ASC, seq ASC`
    )
    .bind(sessionId)
    .all<Record<string, unknown>>();

  const events: TraceEvent[] = (rows.results ?? []).map((r) => ({
    id: r.id as number,
    sessionId: r.session_id as string,
    turn: r.turn as number,
    seq: r.seq as number,
    type: r.type as TraceEventType,
    label: r.label as string,
    status: (r.status as TraceEvent['status']) ?? undefined,
    latencyMs: (r.latency_ms as number) ?? undefined,
    costUsd: (r.cost_usd as number) ?? undefined,
    promptTokens: (r.prompt_tokens as number) ?? undefined,
    completionTokens: (r.completion_tokens as number) ?? undefined,
    provider: (r.provider as string) ?? undefined,
    model: (r.model as string) ?? undefined,
    detail: (r.detail as string) ?? undefined,
    ts: r.ts as number,
  }));

  const summary: TraceSummary = {
    events: events.length,
    turns: events.reduce((m, e) => Math.max(m, e.turn), 0),
    totalCostUsd: round6(events.reduce((s, e) => s + (e.costUsd ?? 0), 0)),
    totalLatencyMs: events.reduce((s, e) => s + (e.latencyMs ?? 0), 0),
    modelCalls: events.filter((e) => e.type === 'model_call').length,
    toolCalls: events.filter((e) => e.type === 'tool_call').length,
    guardrailBlocks: events.filter((e) => e.type === 'guardrail' && e.status === 'block').length,
    guardrailWarns: events.filter((e) => e.type === 'guardrail' && e.status === 'warn').length,
    providers: events
      .filter((e) => e.type === 'model_call' && e.provider)
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.provider!] = (acc[e.provider!] ?? 0) + 1;
        return acc;
      }, {}),
  };

  return { events, summary };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
