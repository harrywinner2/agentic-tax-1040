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

## Pending on user
- OpenAI API key (runtime) — required to wire/test live AI and deploy.
- OpenRouter API key (optional) — enables real multi-provider routing.
- Attachments folder (or "none").
