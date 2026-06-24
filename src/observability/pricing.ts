/**
 * Token pricing for cost observability (USD per 1M tokens).
 * Approximate published rates; the point is a real, visible cost figure per
 * step, not penny-accurate billing. Unknown models fall back to a default.
 */
export interface ModelPrice {
  inPerM: number;
  outPerM: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4o': { inPerM: 2.5, outPerM: 10 },
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-4.1': { inPerM: 2.0, outPerM: 8 },
  'gpt-4.1-mini': { inPerM: 0.4, outPerM: 1.6 },
  // OpenRouter (representative; varies by underlying provider)
  'openai/gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'anthropic/claude-3.5-sonnet': { inPerM: 3, outPerM: 15 },
  'meta-llama/llama-3.1-8b-instruct': { inPerM: 0.05, outPerM: 0.08 },
};

const DEFAULT_PRICE: ModelPrice = { inPerM: 1, outPerM: 3 };

export function costFor(model: string, promptTokens = 0, completionTokens = 0): number {
  const p = PRICING[model] ?? DEFAULT_PRICE;
  return (promptTokens / 1_000_000) * p.inPerM + (completionTokens / 1_000_000) * p.outPerM;
}
