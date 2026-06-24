<!-- Narration beats. Blank lines separate beats; each beat is paired by id with
     the matching clip_00N capture by assemble_video.sh. -->

# Beat 1 — title
This is Tilly, a small agentic system that helps someone file a simple U.S. federal income tax return. You bring a single W-2, have a short, friendly chat, and walk away with a completed 2025 Form 1040 you can download. It was built around four pillars — a chat loop, real tools, enforced guardrails, and full observability — and every one of them is something you can point at in the running system, not just words in a prompt.

# Beat 2 — chat loop and guardrails
Here it is live. The agent greets you warmly and asks for your W-2. But first, watch the guardrails. I'll try to derail it — I tell it to ignore its instructions and to also file some self-employment and crypto income, which is out of scope. It politely refuses and stays on task. And on the right, in the observation trail, you can see exactly why: the input scanner flagged a prompt-injection attempt and two out-of-scope topics. Those guardrails run in code on every single message, and every verdict is recorded.

# Beat 3 — tools, the engine, and the question budget
Now the real flow. I attach the sample W-2 and send it. Behind the scenes the agent calls a vision tool that reads the wages and withholding straight off the form — and notice the providers indicator: that vision step is routed to OpenRouter, while the conversation itself runs on OpenAI, with automatic fallback either way. It confirms the numbers in plain language and asks the one thing it can't read: my filing status. I say single. Now it calls a deterministic tax engine — the model never does the arithmetic — a guardrail independently re-checks the math, and it tells me I'm getting a refund of seven hundred sixty-five dollars. I ask for the form, it fills the real IRS 1040, and the download button appears. And look at the counter: it only needed one question, well under the budget of five — which the loop counts and enforces itself. The indicators stay pinned at the top while the events stream in below.

# Beat 4 — the real filled form
And this is the actual output — the official IRS 2025 Form 1040, filled. Wages of forty-one thousand on line 1a, the One-Big-Beautiful-Bill standard deduction of fifteen thousand seven hundred fifty, taxable income of twenty-five thousand two hundred fifty, the tax computed by the table method, the withholding from the W-2, and the seven-hundred-sixty-five-dollar refund on line 34. Every field maps to a position verified against the real form.

# Beat 5 — the four pillars
So, the four pillars, each enforced in code. The chat loop carries state across turns in a database. The agent can only act through typed, validated tools. The guardrails are real — schemas on every input, an independent math cross-check that blocks inconsistent numbers, a scope and injection scanner, and a question budget the loop enforces. And everything is observable: cost, latency, which provider served each call, every guardrail verdict, and a live eval pass rate that's currently a hundred percent.

# Beat 6 — closing
The tax math is never the model's job — a verified 2025 engine computes every line and fills the official form, and provider routing is genuinely multi-vendor. It's live at the link on screen, with the full source on GitHub. It's an educational prototype — not tax advice, and nothing is ever filed.
