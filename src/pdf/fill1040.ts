/**
 * Fills the official 2025 Form 1040 from a computed TaxResult.
 *
 * Runs inside a Cloudflare Worker: pdf-lib is pure JS and the 14 standard
 * fonts need no external files. The blank form bytes are passed in (the Worker
 * fetches them from its static-assets binding).
 *
 * Two rendering realities we handle explicitly:
 *  - Text fields: set value + regenerate appearance with an embedded standard font.
 *  - Checkboxes: the IRS `/1` glyph does not render in headless rasterizers, so
 *    we check the field (correct semantics in Acrobat) AND draw an "X" overlay
 *    at the widget rectangle (correct visuals everywhere).
 */
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { TEXT_FIELDS, CHECKBOX_FIELDS, FILING_STATUS_CHECKBOX, type CheckboxKey } from './fieldmap';
import type { TaxResult } from '../tax/engine';

export interface TaxpayerIdentity {
  firstNameMI: string;
  lastName: string;
  ssn: string; // any format; digits extracted
  address?: string;
  aptNo?: string;
  city?: string;
  state?: string;
  zip?: string;
  spouseFirstNameMI?: string;
  spouseLastName?: string;
  spouseSsn?: string;
}

const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');
const money = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('en-US'));

export async function fill1040(
  blankFormBytes: ArrayBuffer | Uint8Array,
  result: TaxResult,
  identity: TaxpayerIdentity
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(blankFormBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  const setText = (fqName: string, value: string | number) => {
    if (value === '' || value === undefined || value === null) return;
    try {
      const f = form.getTextField(fqName);
      f.setText(String(value));
      f.setFontSize(9);
    } catch (e) {
      // A missing field means the map drifted from the form; fail loud in dev.
      throw new Error(`PDF text field not found: ${fqName} (${(e as Error).message})`);
    }
  };

  const checkBox = (key: CheckboxKey) => {
    const fqName = CHECKBOX_FIELDS[key];
    const cb = form.getCheckBox(fqName);
    cb.check();
    for (const w of cb.acroField.getWidgets()) {
      const r = w.getRectangle();
      let page = pages[0];
      for (const p of pages) if (p.ref === w.P()) page = p;
      page.drawText('X', {
        x: r.x + r.width / 2 - 3,
        y: r.y + r.height / 2 - 4,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }
  };

  // --- Identity ---
  setText(TEXT_FIELDS.firstNameMI, identity.firstNameMI);
  setText(TEXT_FIELDS.lastName, identity.lastName);
  setText(TEXT_FIELDS.ssn, digitsOnly(identity.ssn).slice(0, 9));
  if (identity.address) setText(TEXT_FIELDS.address, identity.address);
  if (identity.aptNo) setText(TEXT_FIELDS.aptNo, identity.aptNo);
  if (identity.city) setText(TEXT_FIELDS.city, identity.city);
  if (identity.state) setText(TEXT_FIELDS.state, identity.state.toUpperCase().slice(0, 2));
  if (identity.zip) setText(TEXT_FIELDS.zip, identity.zip);
  if (identity.spouseFirstNameMI) setText(TEXT_FIELDS.spouseFirstNameMI, identity.spouseFirstNameMI);
  if (identity.spouseLastName) setText(TEXT_FIELDS.spouseLastName, identity.spouseLastName);
  if (identity.spouseSsn) setText(TEXT_FIELDS.spouseSsn, digitsOnly(identity.spouseSsn).slice(0, 9));

  // --- Filing status + digital assets ---
  checkBox(FILING_STATUS_CHECKBOX[result.filingStatus]);
  checkBox('digitalAssetsNo');

  // --- Income (page 1) ---
  setText(TEXT_FIELDS.line1a_wages, money(result.line1a_wages));
  setText(TEXT_FIELDS.line1z_totalWages, money(result.line1z_totalWages));
  setText(TEXT_FIELDS.line9_totalIncome, money(result.line9_totalIncome));
  setText(TEXT_FIELDS.line11_agi, money(result.line11_agi));

  // --- Tax / payments (page 2) ---
  setText(TEXT_FIELDS.line11b_agi, money(result.line11_agi));
  setText(TEXT_FIELDS.line12_deduction, money(result.line12_deduction));
  setText(TEXT_FIELDS.line14_deductions, money(result.line12_deduction));
  setText(TEXT_FIELDS.line15_taxableIncome, money(result.line15_taxableIncome));
  setText(TEXT_FIELDS.line16_tax, money(result.line16_tax));
  setText(TEXT_FIELDS.line18_addTax, money(result.line16_tax));
  setText(TEXT_FIELDS.line22_tax, money(result.line22_tax));
  setText(TEXT_FIELDS.line24_totalTax, money(result.line24_totalTax));
  setText(TEXT_FIELDS.line25a_w2Withholding, money(result.line25a_withholding));
  setText(TEXT_FIELDS.line25d_totalWithholding, money(result.line25d_totalWithholding));
  setText(TEXT_FIELDS.line33_totalPayments, money(result.line33_totalPayments));
  if (result.line34_overpaid > 0) {
    setText(TEXT_FIELDS.line34_overpaid, money(result.line34_overpaid));
    setText(TEXT_FIELDS.line35a_refund, money(result.line34_overpaid));
  }
  if (result.line37_amountOwed > 0) {
    setText(TEXT_FIELDS.line37_amountOwed, money(result.line37_amountOwed));
  }

  // Regenerate text appearances with our embedded font (checkboxes use overlays).
  for (const f of form.getFields()) {
    if (f.constructor.name === 'PDFTextField') {
      try {
        (f as import('pdf-lib').PDFTextField).updateAppearances(font as PDFFont);
      } catch {
        /* leave default appearance */
      }
    }
  }

  return pdf.save();
}
