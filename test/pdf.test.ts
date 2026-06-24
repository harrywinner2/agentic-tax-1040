import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { computeReturn } from '../src/tax/engine';
import { fill1040 } from '../src/pdf/fill1040';

const formPath = fileURLToPath(new URL('../assets/forms/f1040_2025.pdf', import.meta.url));
const blank = readFileSync(formPath);

describe('fill1040 against the real 2025 form', () => {
  it('produces a valid, larger PDF with the values set', async () => {
    const result = computeReturn({ filingStatus: 'single', wages: 40_000, federalWithholding: 4_200 });
    const bytes = await fill1040(blank, result, {
      firstNameMI: 'Alex P',
      lastName: 'Sample',
      ssn: '123-45-6789',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    });

    // Valid PDF signature
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(blank.length); // we added content

    // Re-open and confirm the wage + tax fields carry our values
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    const wage = form.getTextField('topmostSubform[0].Page1[0].f1_47[0]').getText();
    const taxable = form.getTextField('topmostSubform[0].Page2[0].f2_06[0]').getText();
    const refund = form.getTextField('topmostSubform[0].Page2[0].f2_30[0]').getText();
    expect(wage).toBe('40,000');
    expect(taxable).toBe('24,250');
    expect(refund).toBe('1,525');
  });

  it('does not throw for every filing status (field map covers all)', async () => {
    for (const fs of ['single', 'mfj', 'mfs', 'hoh', 'qss'] as const) {
      const result = computeReturn({ filingStatus: fs, wages: 40_000, federalWithholding: 2_000 });
      const bytes = await fill1040(blank, result, { firstNameMI: 'A', lastName: 'B', ssn: '111223333' });
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });
});
