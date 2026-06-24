/**
 * Eval runner — produces the "eval pass rate" the observability pillar reports.
 *
 *   npm run eval                 # deterministic engine cases only (CI-safe)
 *   BASE=https://... npm run eval # also runs live agent scenarios end-to-end
 *
 * Writes public/eval-report.json, which the Worker serves and the UI shows.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeReturn } from '../../src/tax/engine';
import { ENGINE_CASES, AGENT_SCENARIOS } from './cases';

interface CaseResult { name: string; kind: 'engine' | 'agent'; pass: boolean; detail: string }

function runEngine(): CaseResult[] {
  return ENGINE_CASES.map((c) => {
    const r = computeReturn(c.input);
    const checks = [
      r.line15_taxableIncome === c.expect.taxable,
      r.line24_totalTax === c.expect.tax,
      r.refundOrOwe === c.expect.refundOrOwe,
    ];
    const pass = checks.every(Boolean);
    return {
      name: c.name,
      kind: 'engine',
      pass,
      detail: pass
        ? `taxable ${r.line15_taxableIncome}, tax ${r.line24_totalTax}, net ${r.refundOrOwe}`
        : `got taxable ${r.line15_taxableIncome}/tax ${r.line24_totalTax}/net ${r.refundOrOwe}, expected ${c.expect.taxable}/${c.expect.tax}/${c.expect.refundOrOwe}`,
    };
  });
}

async function runAgent(base: string): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  const sampleUrl = (await (await fetch(`${base}/api/sample-w2`)).json()) as { dataUrl: string };
  const UA = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 eval' };

  for (const sc of AGENT_SCENARIOS) {
    const sessionId = `eval-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    let last: any = null;
    try {
      for (const t of sc.turns) {
        const res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: UA,
          body: JSON.stringify({ sessionId, message: t.text, image: t.sample ? sampleUrl.dataUrl : undefined }),
        });
        last = await res.json();
      }
      const checks: string[] = [];
      let pass = true;
      if (sc.expect.maxQuestions !== undefined && last.questionsAsked > sc.expect.maxQuestions) {
        pass = false; checks.push(`questions ${last.questionsAsked} > ${sc.expect.maxQuestions}`);
      }
      if (sc.expect.refundOrOwe !== undefined && Math.abs((last.summary?.refundOrOwe ?? 1e9) - sc.expect.refundOrOwe) > 1) {
        pass = false; checks.push(`net ${last.summary?.refundOrOwe} != ${sc.expect.refundOrOwe}`);
      }
      if (sc.expect.formReady !== undefined && Boolean(last.formReady) !== sc.expect.formReady) {
        pass = false; checks.push(`formReady ${last.formReady} != ${sc.expect.formReady}`);
      }
      if (sc.expect.stayedInScope) {
        const trace = (await (await fetch(`${base}/api/trace/${sessionId}`, { headers: UA })).json()) as any;
        const warned = trace.events.some((e: any) => e.label === 'scope' && e.status === 'warn');
        const refused = /can'?t|only|simple|doesn'?t handle|prototype/i.test(last.assistant ?? '');
        if (!(warned && refused)) { pass = false; checks.push('did not visibly decline out-of-scope'); }
      }
      results.push({ name: sc.name, kind: 'agent', pass, detail: pass ? `Q=${last.questionsAsked}, net=${last.summary?.refundOrOwe}` : checks.join('; ') });
    } catch (e) {
      results.push({ name: sc.name, kind: 'agent', pass: false, detail: `error: ${(e as Error).message}` });
    }
  }
  return results;
}

async function main() {
  const base = process.env.BASE;
  const results = [...runEngine()];
  if (base) results.push(...(await runAgent(base)));

  const passed = results.filter((r) => r.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    base: base ?? null,
    total: results.length,
    passed,
    passRate: Math.round((passed / results.length) * 1000) / 10,
    cases: results,
  };

  const outDir = fileURLToPath(new URL('../../public', import.meta.url));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/eval-report.json`, JSON.stringify(report, null, 2));

  console.log(`\nEval: ${passed}/${results.length} passed (${report.passRate}%)${base ? ` [live: ${base}]` : ' [engine only]'}\n`);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  [${r.kind}] ${r.name}\n        ${r.detail}`);
  if (passed !== results.length) process.exitCode = 1;
}

main();
