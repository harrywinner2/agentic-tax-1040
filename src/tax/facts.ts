/**
 * Verified 2025 federal tax facts (tax year 2025, filed in 2026).
 *
 * Sources (captured 2026-06, see DECISIONS.md):
 *  - Standard deduction reflects the One Big Beautiful Bill increase:
 *    IRS Form 1040 (2025) marginal notes + Pub 501.
 *  - Bracket schedule: Tax Foundation 2025 brackets (mirrors IRS Rev. Proc.).
 *
 * These are the ONLY place tax constants live. The engine is pure arithmetic
 * over these tables — the LLM never computes a number.
 */

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

export const TAX_YEAR = 2025 as const;

/** Standard deduction by filing status (2025). QSS uses the MFJ amount. */
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_750,
  mfs: 15_750,
  mfj: 31_500,
  qss: 31_500,
  hoh: 23_625,
};

/** Additional standard deduction per qualifying box (65+ or blind), 2025. */
export const ADDITIONAL_STD_DEDUCTION: Record<FilingStatus, number> = {
  single: 2_000,
  hoh: 2_000,
  mfj: 1_600,
  mfs: 1_600,
  qss: 1_600,
};

/** A single marginal bracket: `rate` applies to income above `floor` up to `ceiling`. */
export interface Bracket {
  rate: number;
  floor: number;
  ceiling: number; // Infinity for the top bracket
}

/**
 * 2025 ordinary-income rate schedules. MFS mirrors Single for the lower five
 * brackets and is half of MFJ at the top two (statutory).
 */
export const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { rate: 0.1, floor: 0, ceiling: 11_925 },
    { rate: 0.12, floor: 11_925, ceiling: 48_475 },
    { rate: 0.22, floor: 48_475, ceiling: 103_350 },
    { rate: 0.24, floor: 103_350, ceiling: 197_300 },
    { rate: 0.32, floor: 197_300, ceiling: 250_525 },
    { rate: 0.35, floor: 250_525, ceiling: 626_350 },
    { rate: 0.37, floor: 626_350, ceiling: Infinity },
  ],
  mfj: [
    { rate: 0.1, floor: 0, ceiling: 23_850 },
    { rate: 0.12, floor: 23_850, ceiling: 96_950 },
    { rate: 0.22, floor: 96_950, ceiling: 206_700 },
    { rate: 0.24, floor: 206_700, ceiling: 394_600 },
    { rate: 0.32, floor: 394_600, ceiling: 501_050 },
    { rate: 0.35, floor: 501_050, ceiling: 751_600 },
    { rate: 0.37, floor: 751_600, ceiling: Infinity },
  ],
  hoh: [
    { rate: 0.1, floor: 0, ceiling: 17_000 },
    { rate: 0.12, floor: 17_000, ceiling: 64_850 },
    { rate: 0.22, floor: 64_850, ceiling: 103_350 },
    { rate: 0.24, floor: 103_350, ceiling: 197_300 },
    { rate: 0.32, floor: 197_300, ceiling: 250_500 },
    { rate: 0.35, floor: 250_500, ceiling: 626_350 },
    { rate: 0.37, floor: 626_350, ceiling: Infinity },
  ],
  // Married filing separately = Single thresholds for lower brackets, half-of-MFJ at top.
  mfs: [
    { rate: 0.1, floor: 0, ceiling: 11_925 },
    { rate: 0.12, floor: 11_925, ceiling: 48_475 },
    { rate: 0.22, floor: 48_475, ceiling: 103_350 },
    { rate: 0.24, floor: 103_350, ceiling: 197_300 },
    { rate: 0.32, floor: 197_300, ceiling: 250_525 },
    { rate: 0.35, floor: 250_525, ceiling: 375_800 },
    { rate: 0.37, floor: 375_800, ceiling: Infinity },
  ],
  // Qualifying surviving spouse uses the MFJ schedule.
  qss: [
    { rate: 0.1, floor: 0, ceiling: 23_850 },
    { rate: 0.12, floor: 23_850, ceiling: 96_950 },
    { rate: 0.22, floor: 96_950, ceiling: 206_700 },
    { rate: 0.24, floor: 206_700, ceiling: 394_600 },
    { rate: 0.32, floor: 394_600, ceiling: 501_050 },
    { rate: 0.35, floor: 501_050, ceiling: 751_600 },
    { rate: 0.37, floor: 751_600, ceiling: Infinity },
  ],
};

/**
 * The IRS requires the Tax Table (not the rate schedule) for taxable income
 * under $100,000. The table taxes the midpoint of each $50 row. We replicate
 * that so our line 16 matches the official tables to the dollar.
 */
export const TAX_TABLE_THRESHOLD = 100_000;
export const TAX_TABLE_BRACKET_WIDTH = 50;

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
  qss: 'Qualifying surviving spouse',
};
