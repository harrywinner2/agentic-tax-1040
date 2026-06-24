/**
 * Field map for the official IRS 2025 Form 1040 (irs.gov/pub/irs-pdf/f1040.pdf).
 *
 * Every name below was verified empirically: we wrote each field's index into
 * the PDF, rendered it with poppler, and read which row it landed on. See
 * scripts/verify-fieldmap (and BUILD_LOG) for the methodology. Do NOT guess —
 * if the IRS reissues the form, re-run the probe.
 */

const P1 = 'topmostSubform[0].Page1[0].';
const ADDR = P1 + 'Address_ReadOrder[0].';
const CBR = P1 + 'Checkbox_ReadOrder[0].';
const P2 = 'topmostSubform[0].Page2[0].';

/** Text fields: line label -> fully-qualified AcroForm field name. */
export const TEXT_FIELDS = {
  // Page 1 — taxpayer identity
  firstNameMI: P1 + 'f1_14[0]',
  lastName: P1 + 'f1_15[0]',
  ssn: P1 + 'f1_16[0]', // 9 digits, NO dashes (maxLength 9)
  spouseFirstNameMI: P1 + 'f1_17[0]',
  spouseLastName: P1 + 'f1_18[0]',
  spouseSsn: P1 + 'f1_19[0]',
  address: ADDR + 'f1_20[0]',
  aptNo: ADDR + 'f1_21[0]',
  city: ADDR + 'f1_22[0]',
  state: ADDR + 'f1_23[0]',
  zip: ADDR + 'f1_24[0]',

  // Page 1 — income
  line1a_wages: P1 + 'f1_47[0]',
  line1z_totalWages: P1 + 'f1_57[0]',
  line9_totalIncome: P1 + 'f1_73[0]',
  line10_adjustments: P1 + 'f1_74[0]',
  line11_agi: P1 + 'f1_75[0]',

  // Page 2 — tax, credits, payments
  line11b_agi: P2 + 'f2_01[0]',
  line12_deduction: P2 + 'f2_02[0]',
  line13a_qbi: P2 + 'f2_03[0]',
  line14_deductions: P2 + 'f2_05[0]',
  line15_taxableIncome: P2 + 'f2_06[0]',
  line16_tax: P2 + 'f2_08[0]',
  line18_addTax: P2 + 'f2_10[0]',
  line22_tax: P2 + 'f2_14[0]',
  line24_totalTax: P2 + 'f2_16[0]',
  line25a_w2Withholding: P2 + 'f2_17[0]',
  line25d_totalWithholding: P2 + 'f2_20[0]',
  line32_otherPayments: P2 + 'f2_28[0]',
  line33_totalPayments: P2 + 'f2_29[0]',
  line34_overpaid: P2 + 'f2_30[0]',
  line35a_refund: P2 + 'f2_31[0]',
  line37_amountOwed: P2 + 'f2_35[0]',
} as const;

/**
 * Checkbox fields. Poppler will not render the IRS `/1` checkbox glyph, so the
 * filler both checks these AND draws an "X" overlay at the widget rectangle.
 */
export const CHECKBOX_FIELDS = {
  filingSingle: CBR + 'c1_8[0]',
  filingMFJ: CBR + 'c1_8[1]',
  filingMFS: CBR + 'c1_8[2]',
  filingHOH: P1 + 'c1_8[0]',
  filingQSS: P1 + 'c1_8[1]',
  digitalAssetsYes: P1 + 'c1_10[0]',
  digitalAssetsNo: P1 + 'c1_10[1]',
} as const;

import type { FilingStatus } from '../tax/facts';

export const FILING_STATUS_CHECKBOX: Record<FilingStatus, keyof typeof CHECKBOX_FIELDS> = {
  single: 'filingSingle',
  mfj: 'filingMFJ',
  mfs: 'filingMFS',
  hoh: 'filingHOH',
  qss: 'filingQSS',
};

export type TextFieldKey = keyof typeof TEXT_FIELDS;
export type CheckboxKey = keyof typeof CHECKBOX_FIELDS;
