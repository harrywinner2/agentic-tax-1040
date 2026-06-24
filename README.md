# Tilly — an agentic 2025 Form 1040 assistant

Tilly is a small agentic system that helps someone file a simple U.S. federal income tax return. You show up with a W-2, have a short, friendly chat, and walk away with a completed **2025 IRS Form 1040** you can download. It's an educational hackathon prototype — not tax advice, and nothing is ever filed with the IRS.

**Try it:** https://agentic-tax-1040.harrywinner.workers.dev
Click **Use sample W-2**, send it, say you're filing *single*, and download your 1040.

---

## The four pillars (and where to point in the code)

This was built to demonstrate four things, each *enforced and visible* rather than just described in a prompt.

**1. Chat loop** — `src/agent/loop.ts`, `src/session/store.ts`
A turn-based loop that carries full state across turns in D1. Each turn runs the guardrails, drives a tool-calling sub-loop, and ends with a terminal `respond` tool. The agent is a small state machine: greeting → collecting → review → done.

**2. Tools** — `src/agent/tools.ts`
The agent only acts through typed tools: `extract_w2` (reads an uploaded W-2 with a vision model), `record_w2` (chat fallback), `set_filing_status`, `set_dependent_info`, `compute_tax` (the deterministic engine), and `fill_form` (produces the real PDF). Each validates its inputs and respects state preconditions before doing anything.

**3. Guardrails** — `src/guardrails/`
Enforced in code and schema, not prose: an input scanner (size, prompt-injection, out-of-scope topics), Zod schemas + plausibility checks on W-2 data, compute/fill preconditions, an independent **math cross-check**, and a **code-enforced 5-question budget**. Every verdict is written to the trace.

**4. Observation** — `src/observability/`
A per-turn tracer records every guardrail verdict, model call (latency, tokens, cost, *which provider served it*), tool call, and state change. It's persisted to D1 and exposed at `/api/trace/:sessionId` — and the chat UI renders the live trail next to the conversation. A separate eval pass-rate is at `/api/eval`.

The tax math is **never** done by the model. `src/tax/engine.ts` computes every line in plain arithmetic over verified 2025 facts (`src/tax/facts.ts`), using the IRS Tax-Table midpoint method. The agent can only feed it validated inputs and read the result back.

See **[DECISIONS.md](./DECISIONS.md)** for the reasoning behind each open choice.

---

## How it fits together

```
Browser chat ──POST /api/chat──> Worker (Hono)
                                   │
                                   ├─ guardrails: scan the message
                                   ├─ agent loop ──► OpenAI (chat) ──┐ tool calls
                                   │                 OpenRouter (W-2 vision)
                                   ├─ tools: extract/record/compute/fill
                                   │     └─ tax engine (deterministic)
                                   │     └─ pdf-lib fills the real IRS 2025 1040
                                   ├─ D1: session state + transcript + trace
                                   └─ tracer ──► /api/trace, /api/eval, UI panel

GET /api/form/:id ──► regenerate the filled 1040 PDF for download
```

Provider routing is real and per-role: the conversation runs on OpenAI, W-2 vision extraction runs on OpenRouter, and either falls back to the other. The trace shows which one served each step.

---

## Run it locally

You need Node 20+, a Cloudflare account (`wrangler` is in devDeps), and an OpenAI key (OpenRouter optional).

```bash
git clone https://github.com/harrywinner2/agentic-tax-1040
cd agentic-tax-1040
npm install

# runtime AI keys (gitignored)
cp .dev.vars.example .dev.vars     # then paste your OPENAI_API_KEY (and OPENROUTER_API_KEY)

npm run db:local                   # create the local D1 schema
npm run dev                        # http://localhost:8787
```

Open http://localhost:8787, click **Use sample W-2**, and chat.

### One-command-ish checks

```bash
npm test          # 25 unit tests: engine, real-form fill, guardrails, golden cases
npm run eval      # eval pass-rate (add BASE=<url> to also run live agent scenarios)
npm run typecheck
```

## Deploy your own

```bash
wrangler d1 create tax1040          # put the id in wrangler.jsonc
npm run db:remote                   # apply the schema
wrangler secret put OPENAI_API_KEY  # and OPENROUTER_API_KEY
npm run deploy
```

---

## Notes & scope

- **Fake data only.** The sample W-2 and any data you enter are for testing. No real PII, no e-filing.
- **Not tax advice.** Scope is intentionally narrow: one W-2, standard deduction, the five filing statuses. The agent recognizes and declines itemizing, 1099/self-employment, investments, and other-year/state returns.
- The blank 2025 Form 1040 is the official IRS PDF (public domain). Field positions were verified against the real form (`src/pdf/fieldmap.ts`).
