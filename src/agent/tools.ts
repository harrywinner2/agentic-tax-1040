/**
 * Tool pillar. The agent can only act through these typed tools. Each one
 * validates its inputs (schema) and respects state preconditions (guardrails)
 * before mutating anything. The terminal `respond` tool is how every turn ends.
 */
import type { Env, SessionState } from '../types';
import type { Tracer } from '../observability/trace';
import { callModel, type ChatTool } from './providers';
import {
  w2RecordSchema,
  setFilingStatusSchema,
  setDependentInfoSchema,
  respondSchema,
} from '../guardrails/schemas';
import {
  validateW2Plausibility,
  computePrecondition,
  fillPrecondition,
  crossCheckMath,
} from '../guardrails/guards';
import { computeReturn } from '../tax/engine';
import { fill1040 } from '../pdf/fill1040';
import { FILING_STATUS_LABELS } from '../tax/facts';

export interface ToolContext {
  env: Env;
  tracer: Tracer;
  state: SessionState;
  /** A W-2 image/PDF the user attached this turn, as a data URL. */
  pendingImage?: string;
}

/** Tool schema list advertised to the model. */
export const TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'extract_w2',
      description:
        "Read the W-2 the user just uploaded (an image or PDF) and pull out the wage and withholding values. Call this when the user has attached a W-2 file. Returns the values found.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_w2',
      description:
        'Record W-2 values the user typed in chat (use this for the fallback when no file is uploaded). Provide at least box1 wages and box2 federal withholding.',
      parameters: {
        type: 'object',
        properties: {
          employeeName: { type: 'string' },
          ssn: { type: 'string' },
          box1_wages: { type: 'number', description: 'Box 1 — wages, tips, other comp' },
          box2_federalWithholding: { type: 'number', description: 'Box 2 — federal income tax withheld' },
          address: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zip: { type: 'string' },
        },
        required: ['box1_wages', 'box2_federalWithholding'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_filing_status',
      description: 'Record the filing status once the user tells you.',
      parameters: {
        type: 'object',
        properties: { filingStatus: { type: 'string', enum: ['single', 'mfj', 'mfs', 'hoh', 'qss'] } },
        required: ['filingStatus'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_dependent_info',
      description:
        'Optionally record whether someone else can claim this taxpayer as a dependent, and any number of dependents. Only call if it comes up.',
      parameters: {
        type: 'object',
        properties: {
          claimedAsDependent: { type: 'boolean' },
          numDependents: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_tax',
      description:
        'Compute the 2025 Form 1040 result from the recorded W-2 and filing status. Call once you have wages, withholding, and filing status.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_form',
      description:
        'Generate the completed, downloadable 2025 Form 1040 PDF. Only call after compute_tax has succeeded.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'respond',
      description:
        'ALWAYS end your turn by calling this with the message to show the user. Set asksQuestion=true ONLY when your message asks the user for new information.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          asksQuestion: { type: 'boolean' },
          stage: { type: 'string', enum: ['greeting', 'collecting', 'review', 'done'] },
        },
        required: ['message', 'asksQuestion', 'stage'],
        additionalProperties: false,
      },
    },
  },
];

/** Vision prompt for W-2 extraction. */
const W2_VISION_SYSTEM =
  'You are a precise document reader. Extract these fields from this W-2 image and return ONLY compact JSON ' +
  '(no prose, no code fences): {"employeeName":string,"ssn":string,"employerName":string,"address":string,' +
  '"city":string,"state":string,"zip":string,"box1_wages":number,"box2_federalWithholding":number}. ' +
  'IMPORTANT: "employeeName" and "address"/"city"/"state"/"zip" are the EMPLOYEE\'s name and HOME address ' +
  '(box e/f), NOT the employer. "employerName" is the company (box c). ' +
  'Use numbers (not strings) for the money boxes. If a field is missing, use null.';

async function runExtractW2(ctx: ToolContext): Promise<string> {
  if (!ctx.pendingImage) {
    return 'NO_FILE: No W-2 file is attached to this turn. Ask the user to upload their W-2, or to type box 1 (wages) and box 2 (withholding) and you will use record_w2.';
  }
  const { message } = await callModel(ctx.env, ctx.tracer, {
    role: 'vision',
    temperature: 0,
    messages: [
      { role: 'system', content: W2_VISION_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read this W-2 and return the JSON.' },
          { type: 'image_url', image_url: { url: ctx.pendingImage } },
        ],
      },
    ],
  });
  const raw = (message.content ?? '').replace(/```json|```/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return `EXTRACT_FAILED: could not parse the W-2. Ask the user to re-upload a clearer image or type the numbers. (model said: ${raw.slice(0, 120)})`;
  }
  return applyW2(ctx, parsed, 'vision');
}

function applyW2(ctx: ToolContext, parsed: unknown, source: string): string {
  const result = w2RecordSchema.safeParse(parsed);
  if (!result.success) {
    return `INVALID_W2: ${result.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}. Ask the user to confirm box 1 and box 2.`;
  }
  const w2 = result.data;
  const plaus = validateW2Plausibility(w2.box1_wages, w2.box2_federalWithholding);
  ctx.tracer.guardrail(plaus.name, plaus.status, plaus.detail);

  ctx.state.w2 = {
    ...ctx.state.w2,
    employeeName: w2.employeeName ?? ctx.state.w2.employeeName,
    ssn: w2.ssn ?? ctx.state.w2.ssn,
    employerName: w2.employerName ?? ctx.state.w2.employerName,
    address: w2.address ?? ctx.state.w2.address,
    city: w2.city ?? ctx.state.w2.city,
    state: w2.state ?? ctx.state.w2.state,
    zip: w2.zip ?? ctx.state.w2.zip,
    box1_wages: w2.box1_wages,
    box2_federalWithholding: w2.box2_federalWithholding,
  };
  ctx.tracer.stateChange(`w2 recorded via ${source}: wages=${w2.box1_wages}, withholding=${w2.box2_federalWithholding}`);
  const note = plaus.systemNote ? ` NOTE: ${plaus.systemNote}` : '';
  return `OK: recorded wages $${w2.box1_wages.toLocaleString()} and federal withholding $${w2.box2_federalWithholding.toLocaleString()} for ${ctx.state.w2.employeeName ?? 'the taxpayer'}.${note} Confirm these with the user in plain language.`;
}

async function runComputeTax(ctx: ToolContext): Promise<string> {
  const pre = computePrecondition(ctx.state);
  if (pre) return `BLOCKED: ${pre}`;
  const result = computeReturn({
    filingStatus: ctx.state.filingStatus!,
    wages: ctx.state.w2.box1_wages!,
    federalWithholding: ctx.state.w2.box2_federalWithholding!,
  });
  const check = crossCheckMath(ctx.state, result);
  ctx.tracer.guardrail(check.name, check.status, check.detail);
  if (check.status === 'block') {
    return `BLOCKED: internal math check failed (${check.detail}). Do not present numbers.`;
  }
  ctx.state.result = result;
  ctx.state.stage = 'review';
  ctx.tracer.stateChange(`computed: taxable=${result.line15_taxableIncome}, tax=${result.line24_totalTax}, net=${result.refundOrOwe}`);
  const outcome = result.refundOrOwe >= 0 ? `refund of $${result.line34_overpaid.toLocaleString()}` : `balance due of $${result.line37_amountOwed.toLocaleString()}`;
  return `OK: ${FILING_STATUS_LABELS[result.filingStatus]}. AGI $${result.line11_agi.toLocaleString()}, standard deduction $${result.line12_deduction.toLocaleString()}, taxable income $${result.line15_taxableIncome.toLocaleString()}, total tax $${result.line24_totalTax.toLocaleString()}, withholding $${result.line25d_totalWithholding.toLocaleString()} -> ${outcome}. Explain this warmly and offer to generate the PDF.`;
}

async function runFillForm(ctx: ToolContext): Promise<string> {
  const pre = fillPrecondition(ctx.state);
  if (pre) return `BLOCKED: ${pre}`;
  const formRes = await ctx.env.ASSETS.fetch('https://assets.local/forms/f1040_2025.pdf');
  if (!formRes.ok) return 'ERROR: could not load the blank form template.';
  const blank = await formRes.arrayBuffer();
  const r = ctx.state.result!;
  const name = (ctx.state.w2.employeeName ?? 'Taxpayer Sample').trim();
  const parts = name.split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1]! : name;
  const firstNameMI = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;
  const pdfBytes = await fill1040(blank, r, {
    firstNameMI,
    lastName,
    ssn: ctx.state.w2.ssn ?? '',
    address: ctx.state.w2.address,
    city: ctx.state.w2.city,
    state: ctx.state.w2.state,
    zip: ctx.state.w2.zip,
  });
  ctx.state.formReady = true;
  ctx.tracer.stateChange(`form generated (${pdfBytes.length} bytes)`);
  return 'OK: the completed 2025 Form 1040 is ready to download. Tell the user it is ready and that they can click the Download button.';
}

/** Execute one work tool. Returns the tool-result content for the model. */
export async function executeTool(ctx: ToolContext, name: string, argsJson: string): Promise<string> {
  const started = Date.now();
  let out: string;
  let status: 'ok' | 'error' | 'block' = 'ok';
  try {
    const args = argsJson ? JSON.parse(argsJson) : {};
    switch (name) {
      case 'extract_w2':
        out = await runExtractW2(ctx);
        break;
      case 'record_w2':
        out = applyW2(ctx, args, 'chat');
        break;
      case 'set_filing_status': {
        const p = setFilingStatusSchema.parse(args);
        ctx.state.filingStatus = p.filingStatus;
        ctx.tracer.stateChange(`filing status = ${p.filingStatus}`);
        out = `OK: filing status set to ${FILING_STATUS_LABELS[p.filingStatus]}.`;
        break;
      }
      case 'set_dependent_info': {
        const p = setDependentInfoSchema.parse(args);
        if (p.claimedAsDependent !== undefined) ctx.state.claimedAsDependent = p.claimedAsDependent;
        if (p.numDependents !== undefined) ctx.state.numDependents = p.numDependents;
        ctx.tracer.stateChange(`dependent info updated`);
        out = 'OK: noted.';
        break;
      }
      case 'compute_tax':
        out = await runComputeTax(ctx);
        break;
      case 'fill_form':
        out = await runFillForm(ctx);
        break;
      default:
        out = `UNKNOWN_TOOL: ${name}`;
        status = 'error';
    }
    if (out.startsWith('BLOCKED')) status = 'block';
    if (out.startsWith('ERROR') || out.startsWith('INVALID') || out.startsWith('UNKNOWN')) status = 'error';
  } catch (e) {
    status = 'error';
    out = `ERROR: ${name} failed — ${(e as Error).message}`;
  }
  ctx.tracer.toolCall(name, status, Date.now() - started, out.slice(0, 160));
  return out;
}

export { respondSchema };
