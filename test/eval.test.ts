import { describe, it, expect } from 'vitest';
import { computeReturn } from '../src/tax/engine';
import { ENGINE_CASES } from './eval/cases';

describe('eval golden cases (engine)', () => {
  for (const c of ENGINE_CASES) {
    it(c.name, () => {
      const r = computeReturn(c.input);
      expect(r.line15_taxableIncome).toBe(c.expect.taxable);
      expect(r.line24_totalTax).toBe(c.expect.tax);
      expect(r.refundOrOwe).toBe(c.expect.refundOrOwe);
    });
  }
});
