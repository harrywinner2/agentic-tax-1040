<!-- Narration beats for the demo. Blank lines separate beats; each beat is
     paired by id with the matching clip_00N capture by assemble_video.sh. -->

# Beat 1 — title
This is Tilly, a small agentic system that helps someone file a simple U.S. federal income tax return. You bring a single W-2, have a short, friendly chat, and walk away with a completed 2025 Form 1040 you can download. It was built to demonstrate four things clearly: a chat loop, real tools, enforced guardrails, and full observability.

# Beat 2 — live walkthrough
Here it is running live. The agent greets you warmly and asks for your W-2. I'll use the sample W-2 and send it. Behind the scenes the agent calls a vision tool that reads the wages and withholding straight off the form, then confirms them in plain language and asks the one thing it can't read — my filing status. I say I'm filing single. Now it calls a deterministic tax engine — the model never does the arithmetic — computes the return, and tells me I'm getting a refund of seven hundred sixty-five dollars. I ask for the form, it fills the real I-R-S 1040, and the download button appears. Notice the panel on the right: every step is traced — the cost, the latency, which provider served each call, and a counter showing it only needed one question, well under the budget of five.

# Beat 3 — the four pillars
Each pillar is enforced in code, not just asked for in a prompt. The chat loop carries state across turns in a database. The agent can only act through typed, validated tools. The guardrails are real: schemas on every input, an independent math cross-check that blocks inconsistent numbers, and a five-question budget the loop counts and enforces itself. And everything is observable — the trace you just saw is queryable and rolls up into a live eval pass rate.

# Beat 4 — closing
The tax math is never the model's job — a verified 2025 engine computes every line and fills the official IRS form. Provider routing is real: the conversation runs on OpenAI while the W-2 vision step runs on OpenRouter, each falling back to the other. It's live at the link on screen, with the full source on GitHub. It's an educational prototype — not tax advice, and nothing is ever filed.
