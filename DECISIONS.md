# DECISIONS

The key choices behind this agentic 2025 Form 1040 assistant, and why.

**Live URL:** https://agentic-tax-1040.harrywinner.workers.dev
**Repo:** https://github.com/harrywinner2/agentic-tax-1040

### Language, framework, hosting — TypeScript on Cloudflare Workers
"Use workers where possible" pointed straight at Cloudflare Workers, and it turned out to be the right call for the *pillars*, not just deployment. A single Worker (Hono) serves the chat API and the static UI; **D1** (SQLite at the edge) persists session state and the full observability trace; `wrangler tail` streams structured logs. It's free, has no cold-start theatre, and `pdf-lib` + the OpenAI/OpenRouter `fetch` calls all run inside the isolate with no native deps. State lives in D1 keyed by session, so the chat loop genuinely carries context across turns and across (stateless) Worker invocations.

### How the 1040 is filled — the real IRS form, mapped empirically
I download the **official 2025 `f1040.pdf`** from irs.gov and fill its AcroForm fields with `pdf-lib`. The field names (`f1_47`, `f2_08`, …) are reading-order, not line numbers, so I didn't guess: I wrote each field's index into the PDF, rendered it with poppler, and read which row it landed on. Checkboxes were the gotcha — rasterizers won't render the IRS `/1` checkbox glyph, so the filler both checks the field (correct in Acrobat) and **draws an "X" overlay** at the widget rectangle (correct everywhere). Every line is verified by re-rendering the filled form.

### Tax computation — deterministic, never the LLM
All arithmetic lives in `src/tax/engine.ts` over verified 2025 constants. This is a guardrail by construction: **the model never produces a dollar figure.** I caught and used the *One Big Beautiful Bill* standard-deduction increase ($15,750 single / $31,500 MFJ / $23,625 HoH — not the originally-projected figures) and implemented the IRS **Tax-Table midpoint method** for taxable income under $100k, so line 16 matches the official tables to the dollar.

### W-2 input — vision upload with a chat fallback
The user uploads a W-2 image/PDF; the `extract_w2` tool reads it with a vision model and returns structured, schema-validated fields. If extraction fails or no file is given, the agent collects box 1 / box 2 conversationally via `record_w2`. A realistic fake W-2 (image + PDF + ground-truth JSON) ships in the repo, with a one-click "use sample" button.

### Model / provider — real multi-provider routing
OpenAI runs the conversational loop; **OpenRouter** runs the W-2 vision extraction — a genuine per-role routing decision, with mutual fallback if either primary is unavailable. The trace records which provider/model served every step, so routing is observable, not asserted. (`gpt-4o-mini` on both sides keeps a full return at ~$0.007.)

### Guardrails — code and schema, not prompt
Three enforced layers, all visible in the trace: (1) an **input scanner** on every user message (size, prompt-injection, out-of-scope topics); (2) **Zod schemas + plausibility + state preconditions** before any tool mutates state or fills a form; (3) an independent **math cross-check** that recomputes the return and blocks if anything is inconsistent. The **5-question budget is code-authoritative** — the loop counts a question whenever a user-facing message contains a "?" while a required input is still missing, regardless of what the model self-reports, and hard-stops a 6th.

### Conversation design — one question, usually
The W-2 already supplies wages, withholding, name, and address, so the only thing the agent genuinely must ask is **filing status**. The persona ("Tilly") is warm and concise, confirms the numbers in plain language, explains the refund/balance like a person, and never claims to give tax advice. In practice it finishes in **1 question** — well under the budget of 5.

### State & sessions — D1 JSON per session
Conversation transcript + structured state are stored as JSON on the session row; trace events are normalized into their own table so `/api/trace/:id` can query them and roll up metrics.

### Testing — unit + live eval
25 unit tests (engine, real-form fill round-trip, guardrails, golden cases) plus an eval runner that drives **live end-to-end agent scenarios** against the deployed URL and reports a pass rate (currently 9/9, 100%), surfaced at `/api/eval` and in the UI.

### Scope I deliberately cut
No itemizing, no 1099/self-employment, no investment income, no state or other-year returns, no e-filing. The agent recognizes these and gently declines. This is an educational prototype, not tax advice.
