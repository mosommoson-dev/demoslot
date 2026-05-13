import type { Paytable, PaytableEntry } from './types';

/**
 * Paytable, as bet-per-line multipliers.
 *
 * Conventions:
 *  - Symbol_A..D are "high pay" symbols; E..I are "low pay".
 *  - WILD pays as a regular symbol when 3+ wilds align on a payline. Its line
 *    pay is the highest in the game so 5 wilds == 1000x bet-per-line.
 *  - SCATTER pays separately on the TOTAL bet (see {@link SCATTER_PAY}).
 *
 * The paytable is intentionally close to common medium-high volatility
 * commercial slots: the highest single-line top symbol pays 500x, the wild
 * line pays 1000x, and 5 scatters add 50x of total bet.
 */
export const PAYTABLE: Paytable = {
  WILD:    { 3: 75, 4: 250, 5: 1000 },
  SCATTER: { 3: 0,  4: 0,   5: 0    }, // Scatter handled separately on total bet.
  // 5oak pays are fixed by the spec. 3/4oak pays were tuned empirically:
  // first scaled up to push line RTP from 30% to 60%, then trimmed so the
  // total RTP (including scatter+free spins) sits at 96.5% ± 0.2%.
  // Final ratios: 3oak ≈ 5oak/7, 4oak ≈ 5oak/3.
  A:       { 3: 72,  4: 190, 5: 500  },
  B:       { 3: 36,  4: 92,  5: 250  },
  C:       { 3: 23,  4: 58,  5: 150  },
  D:       { 3: 17,  4: 41,  5: 100  },
  // Low-pay: generous 3/4oak — these drive the bulk of the line RTP because
  // they are the most frequent hits.
  E:       { 3: 12,  4: 32,  5: 50   },
  F:       { 3: 10,  4: 27,  5: 40   },
  G:       { 3: 9,   4: 22,  5: 30   },
  H:       { 3: 7,   4: 16,  5: 25   },
  I:       { 3: 5,   4: 13,  5: 20   },
};

/**
 * Scatter pay, as multipliers of the TOTAL bet (not bet-per-line).
 *
 * The 3-scatter pay also serves as the free-spin trigger reward. Tuned so
 * scatter wins add ≈ 1.7% RTP on top of the line pays without dominating
 * the variance budget.
 */
export const SCATTER_PAY: PaytableEntry = { 3: 2, 4: 10, 5: 50 };
