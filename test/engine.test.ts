import { describe, it, expect } from 'vitest';
import { computeReturn, computeTaxOnTaxableIncome, standardDeductionFor } from '../src/tax/engine';

describe('2025 standard deduction', () => {
  it('uses One Big Beautiful Bill amounts', () => {
    expect(standardDeductionFor('single')).toBe(15_750);
    expect(standardDeductionFor('mfj')).toBe(31_500);
    expect(standardDeductionFor('hoh')).toBe(23_625);
    expect(standardDeductionFor('mfs')).toBe(15_750);
    expect(standardDeductionFor('qss')).toBe(31_500);
  });

  it('adds the age/blind amount per box', () => {
    expect(standardDeductionFor('single', 1)).toBe(15_750 + 2_000);
    expect(standardDeductionFor('mfj', 2)).toBe(31_500 + 3_200);
  });
});

describe('tax-table midpoint method (< $100k)', () => {
  it('taxes the midpoint of the $50 row, single', () => {
    // taxable 24,250 -> row 24,250–24,300 -> midpoint 24,275
    // 11,925 * 10% = 1,192.50 ; (24,275 - 11,925) * 12% = 1,482.00 ; total 2,674.50 -> 2,675
    expect(computeTaxOnTaxableIncome(24_250, 'single')).toBe(2_675);
  });

  it('returns 0 for non-positive taxable income', () => {
    expect(computeTaxOnTaxableIncome(0, 'single')).toBe(0);
    expect(computeTaxOnTaxableIncome(-500, 'single')).toBe(0);
  });

  it('switches to the rate schedule at/above $100k', () => {
    // 100,000 single: 1,192.50 + (48,475-11,925)*.12 + (100,000-48,475)*.22
    // = 1,192.50 + 4,386 + 11,335.50 = 16,914
    expect(computeTaxOnTaxableIncome(100_000, 'single')).toBe(16_914);
  });
});

describe('end-to-end return — the challenge profile', () => {
  it('single, ~$40k W-2, $4,200 withheld -> refund', () => {
    const r = computeReturn({
      filingStatus: 'single',
      wages: 40_000,
      federalWithholding: 4_200,
    });
    expect(r.line11_agi).toBe(40_000);
    expect(r.line12_deduction).toBe(15_750);
    expect(r.line15_taxableIncome).toBe(24_250);
    expect(r.line16_tax).toBe(2_675);
    expect(r.line24_totalTax).toBe(2_675);
    expect(r.line33_totalPayments).toBe(4_200);
    expect(r.line34_overpaid).toBe(1_525);
    expect(r.line37_amountOwed).toBe(0);
    expect(r.refundOrOwe).toBe(1_525);
  });

  it('flips to amount-owed when withholding is low', () => {
    const r = computeReturn({
      filingStatus: 'single',
      wages: 40_000,
      federalWithholding: 1_000,
    });
    expect(r.line34_overpaid).toBe(0);
    expect(r.line37_amountOwed).toBe(1_675);
    expect(r.refundOrOwe).toBe(-1_675);
  });

  it('married filing jointly gets the larger deduction', () => {
    const r = computeReturn({
      filingStatus: 'mfj',
      wages: 40_000,
      federalWithholding: 2_000,
    });
    expect(r.line12_deduction).toBe(31_500);
    expect(r.line15_taxableIncome).toBe(8_500);
    // 8,500 -> midpoint 8,525 * 10% = 852.50 -> 853
    expect(r.line16_tax).toBe(853);
  });
});
