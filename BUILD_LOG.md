# Build Log — Agentic Tax-1040 Assistant

One line per meaningful decision or phase transition. Read this instead of being interrupted.

## Phase 0 — Intake & de-risking
- Deploy target: **Cloudflare Workers** (matches "use workers"; KV/D1 + `wrangler tail` give a strong observability story). Confirmed `wrangler` authed (acct kamdemharry@gmail.com, workers/d1/kv write + workers_tail read).
- GitHub: pushing to `harrywinner2` (public).
- W-2 intake: **upload + AI-vision extraction, with guided-chat fallback** (user choice). Ship a realistic fake W-2 (image+PDF) + "use sample" button.
- Multi-provider: **real runtime routing** — OpenAI default, OpenRouter alternate, visible per-step in the trace (user choice; needs OpenRouter key).
- Verified 2025 tax facts from authoritative sources (One Big Beautiful Bill changed the std deduction): standard deduction Single/MFS **$15,750**, MFJ/QSS **$31,500**, HoH **$23,625**; full 7-bracket schedule captured for all statuses.
- Acquired the official **2025 Form 1040** PDF (irs.gov, confirmed "2025 Form 1040", 199 AcroForm fields).
- **De-risked the PDF pillar end-to-end**: mapped every needed line to its exact field by rendering index-probed PDFs (poppler) and reading them visually. Text fields render via `updateAppearances`; filing-status checkboxes don't render their `/1` glyph in poppler, so we both `check()` the field and **draw an "X" overlay** at the widget rect (verified visually on Single). All target lines (1a, 1z, 9, 11, 12, 14, 15, 16, 22, 24, 25a/d, 33, 34, 37) confirmed landing on the correct rows on pages 1 and 2.

## Phase 1–4 — harness built & tested (no key needed)
- Deterministic core committed: 2025 tax engine + real-form 1040 filler (10 tests).
- Agent harness committed: chat loop (D1 state), tools, guardrails, observability,
  multi-provider router, Hono Worker, minimal chat UI with live trace panel (9 more tests, 19 total; tsc clean).
- Infra: D1 database `tax1040` created (id 6bbf556a-...); local schema applied.
- Public repo pushed: https://github.com/harrywinner2/agentic-tax-1040
- Field-map + tax facts verified against the real 2025 form (see Phase 0).

## Pending on user (genuine gate)
- OpenAI API key (runtime) — required to run the live agent loop end-to-end and deploy.
- OpenRouter API key (optional) — enables real multi-provider routing/fallback.
- Attachments folder (or "none").

## Phase 4 complete — live & verified
- Deployed to Cloudflare Workers: https://agentic-tax-1040.harrywinner.workers.dev
- Live end-to-end verified: greeting → sample W-2 vision extract → filing status → compute → download. 1 question used. Correct refund ($765 for the sample).
- Multi-provider routing visible in trace: OpenRouter served vision, OpenAI served chat (with mutual fallback).
- Fixed: vision now reads the EMPLOYEE home address (not employer); question budget is code-authoritative.
- Eval: 9/9 (100%) live, served at /api/eval and shown in the UI.
- Secrets set via `wrangler secret put` (from gitignored .dev.vars); secret_guard clean before every push/deploy.
- Wrote DECISIONS.md and a human README.md.
- 25 unit tests + live eval all green; tsc clean.
