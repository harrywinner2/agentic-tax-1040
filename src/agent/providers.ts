/**
 * Multi-provider router. OpenAI is the default; OpenRouter is a real alternate
 * (it speaks the same Chat Completions API). Each logical "role" has a primary
 * and a fallback route; if the primary key is missing or the call fails, we fall
 * through to the alternate. Every attempt is recorded in the trace with the
 * provider + model that actually served it, so routing is observable, not magic.
 */
import type { Env } from '../types';
import type { Tracer } from '../observability/trace';

export type Role = 'chat' | 'vision';

interface Route {
  provider: 'openai' | 'openrouter';
  model: string;
}

const ENDPOINTS: Record<Route['provider'], string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/**
 * Primary + fallback per role — a real per-role routing decision, visible in
 * the trace. The conversational loop runs on OpenAI; W-2 vision extraction is
 * routed to OpenRouter. Either role falls back to the other provider if its
 * primary is unavailable, and the order auto-swaps if a key is absent.
 */
const ROUTES: Record<Role, Route[]> = {
  chat: [
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
  ],
  vision: [
    { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
    { provider: 'openai', model: 'gpt-4o-mini' },
  ],
};

function keyFor(provider: Route['provider'], env: Env): string | undefined {
  return provider === 'openai' ? env.OPENAI_API_KEY : env.OPENROUTER_API_KEY;
}

/** Order routes so a route whose key exists comes first. */
function availableRoutes(role: Role, env: Env): Route[] {
  return [...ROUTES[role]].sort((a, b) => {
    const aHas = keyFor(a.provider, env) ? 0 : 1;
    const bHas = keyFor(b.provider, env) ? 0 : 1;
    return aHas - bHas;
  });
}

export function hasAnyProvider(env: Env): boolean {
  return Boolean(env.OPENAI_API_KEY || env.OPENROUTER_API_KEY);
}

// Minimal Chat Completions shapes.
export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}
export type ApiMessage =
  | { role: 'system' | 'user' | 'assistant'; content: unknown }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface CallResult {
  message: AssistantMessage;
  provider: string;
  model: string;
}

export interface CallOptions {
  role: Role;
  messages: ApiMessage[];
  tools?: ChatTool[];
  toolChoice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
}

/** Call a model with automatic provider fallback, tracing each attempt. */
export async function callModel(env: Env, tracer: Tracer, opts: CallOptions): Promise<CallResult> {
  const routes = availableRoutes(opts.role, env);
  let lastErr: Error | null = null;

  for (const route of routes) {
    const apiKey = keyFor(route.provider, env);
    if (!apiKey) continue;

    const body: Record<string, unknown> = {
      model: route.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
    };
    if (opts.tools) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice ?? 'auto';
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
    if (route.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://agentic-tax-1040.workers.dev';
      headers['X-Title'] = 'Agentic Tax 1040';
    }

    const started = Date.now();
    try {
      const res = await fetch(ENDPOINTS[route.provider], {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - started;

      if (!res.ok) {
        const text = await res.text();
        lastErr = new Error(`${route.provider} ${res.status}: ${text.slice(0, 200)}`);
        tracer.event('model_call', `${route.provider}:${route.model}`, {
          status: 'error',
          latencyMs,
          provider: route.provider,
          model: route.model,
          detail: `HTTP ${res.status}`,
        });
        continue; // try next route
      }

      const json = (await res.json()) as {
        choices: { message: AssistantMessage }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const message = json.choices[0]?.message ?? { role: 'assistant', content: '' };
      tracer.modelCall({
        provider: route.provider,
        model: route.model,
        latencyMs,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        detail: message.tool_calls ? `${message.tool_calls.length} tool call(s)` : 'text',
      });
      return { message, provider: route.provider, model: route.model };
    } catch (e) {
      lastErr = e as Error;
      tracer.event('model_call', `${route.provider}:${route.model}`, {
        status: 'error',
        latencyMs: Date.now() - started,
        provider: route.provider,
        model: route.model,
        detail: lastErr.message.slice(0, 120),
      });
    }
  }

  throw lastErr ?? new Error('No model provider configured (set OPENAI_API_KEY or OPENROUTER_API_KEY).');
}
