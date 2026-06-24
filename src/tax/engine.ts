/**
 * Deterministic 2025 Form 1040 tax engine.
 *
 * This is a GUARDRAIL by construction: every dollar figure on the return is
 * produced here in plain arithmetic, never by the language model. The agent may
 * only feed it validated inputs and read back the result.
 *
 * Scope (matches the challenge profile): a wage earner with W-2 income, the
 * standard deduction, ordinary-income tax, and W-2 withholding. We deliberately
 * do NOT implement credits, itemizing, or other income types — when an input is
 * out of scope the caller's guardrails reject it rather than silently mis-filing.
 */
import {
  BRACKETS,
  STANDARD_DEDUCTION,
  ADDITIONAL_STD_DEDUCTION,
  TAX_TABLE_THRESHOLD,
  TAX_TABLE_BRACKET_WIDTH,
  type Bracket,
  type FilingStatus,
} from './facts';

export interface TaxInput {
  filingStatus: FilingStatus;
  /** Form W-2 box 1 — wages, tips, other compensation. */
  wages: number;
  /** Form W-2 box 2 — federal income tax withheld. */
  federalWithholding: number;
  /** Count of "65 or older / blind" boxes checked (0–2 for single, up to 4 MFJ). */
  additionalDeductionBoxes?: number;
}

export interface TaxResult {
  filingStatus: FilingStatus;
  line1a_wages: number;
  line1z_totalWages: number;
  line9_totalIncome: number;
  line11_agi: number;
  line12_deduction: number;
  line15_taxableIncome: number;
  line16_tax: number;
  line22_tax: number;
  line24_totalTax: number;
  line25a_withholding: number;
  line25d_totalWithholding: number;
  line33_totalPayments: number;
  /** Positive when a refund is owed to the taxpayer (line 34). */
  line34_overpaid: number;
  /** Positive when the taxpayer owes the IRS (line 37). */
  line37_amountOwed: number;
  /** Convenience: signed net (positive = refund, negative = owed). */
  refundOrOwe: number;
  /** Effective rate = total tax / total income, for explanations. */
  effectiveRate: number;
}

const round = (n: number) => Math.round(n);

/**
 * Tax on `taxable` income using the marginal schedule for `status`.
 * For taxable income < $100k we apply the Tax-Table midpoint method so the
 * result matches the official IRS tables to the dollar.
 */
export function computeTaxOnTaxableIncome(taxable: number, status: FilingStatus): number {
  if (taxable <= 0) return 0;

  let income = taxable;
  if (taxable < TAX_TABLE_THRESHOLD) {
    // Tax Table: tax the midpoint of the $50 row the income falls in.
    const rowFloor = Math.floor(taxable / TAX_TABLE_BRACKET_WIDTH) * TAX_TABLE_BRACKET_WIDTH;
    income = rowFloor + TAX_TABLE_BRACKET_WIDTH / 2;
  }

  const brackets: Bracket[] = BRACKETS[status];
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.floor) break;
    const upper = Math.min(income, b.ceiling);
    tax += (upper - b.floor) * b.rate;
  }
  return round(tax);
}

/** Standard deduction including any additional amount for age/blindness. */
export function standardDeductionFor(status: FilingStatus, additionalBoxes = 0): number {
  const base = STANDARD_DEDUCTION[status];
  const extra = Math.max(0, additionalBoxes) * ADDITIONAL_STD_DEDUCTION[status];
  return base + extra;
}

export function computeReturn(input: TaxInput): TaxResult {
  const wages = round(Math.max(0, input.wages));
  const withholding = round(Math.max(0, input.federalWithholding));
  const status = input.filingStatus;

  const totalIncome = wages; // W-2 only in scope
  const agi = totalIncome; // no adjustments in scope
  const deduction = standardDeductionFor(status, input.additionalDeductionBoxes ?? 0);
  const taxableIncome = Math.max(0, agi - deduction);
  const tax = computeTaxOnTaxableIncome(taxableIncome, status);

  const totalTax = tax;
  const totalPayments = withholding;
  const overpaid = Math.max(0, totalPayments - totalTax);
  const owed = Math.max(0, totalTax - totalPayments);

  return {
    filingStatus: status,
    line1a_wages: wages,
    line1z_totalWages: wages,
    line9_totalIncome: totalIncome,
    line11_agi: agi,
    line12_deduction: deduction,
    line15_taxableIncome: taxableIncome,
    line16_tax: tax,
    line22_tax: totalTax,
    line24_totalTax: totalTax,
    line25a_withholding: withholding,
    line25d_totalWithholding: withholding,
    line33_totalPayments: totalPayments,
    line34_overpaid: overpaid,
    line37_amountOwed: owed,
    refundOrOwe: totalPayments - totalTax,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
  };
}
