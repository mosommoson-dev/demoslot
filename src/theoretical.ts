import type { Payline, Paytable, RegularSymbolId, SymbolId } from './types';
import type { ReelStrip } from './reels';

/**
 * Exact theoretical RTP for the line-pay portion of the game.
 *
 * Because each reel stop is independent and uniformly chosen, the
 * probability of a particular symbol landing on reel `r` is simply
 * `weight(symbol, r) / stripLength(r)`. We therefore enumerate every
 * possible symbol combination on a payline (11^5 ≈ 161K tuples) and
 * weight each by its exact probability.
 *
 * Output: expected payout per spin per unit of *total bet* contributed by
 * line pays only. Scatter / free-spin contributions are NOT included —
 * those are measured via Monte Carlo because they depend on the joint
 * distribution across multiple rows per reel.
 *
 * This function is the workhorse during reel-strip balancing: an evaluation
 * takes <100 ms and gives the exact line-pay RTP, so we can hill-climb the
 * weight vector toward the target without paying for 1M-spin simulations
 * on every iteration.
 */
export function computeLinePayRtp(
  strips: ReadonlyArray<ReelStrip>,
  payline: Payline,
  paytable: Paytable,
): number {
  // Marginal P(symbol on reel r) — depends only on the reel, not on row
  // for this calculation because we are looking at one symbol on the line.
  const probs: Array<Map<SymbolId, number>> = strips.map((strip) => {
    const w = strip.weights();
    const out = new Map<SymbolId, number>();
    for (const [s, c] of w) out.set(s, c / strip.length);
    return out;
  });

  const allSymbols: SymbolId[] = ['WILD', 'SCATTER', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

  let expected = 0;
  const tuple: SymbolId[] = new Array(5);
  // Pre-extract numeric per-reel probabilities for speed.
  const reelProbs: Array<Array<readonly [SymbolId, number]>> = probs.map((m) =>
    allSymbols.map((s) => [s, m.get(s) ?? 0] as const).filter(([, p]) => p > 0),
  );

  function recurse(reel: number, p: number): void {
    if (reel === 5) {
      const pay = evaluateTupleLinePay(tuple, paytable);
      if (pay > 0) expected += p * pay;
      return;
    }
    for (const [s, ps] of reelProbs[reel]!) {
      tuple[reel] = s;
      recurse(reel + 1, p * ps);
    }
  }
  recurse(0, 1);

  // Expected payout above is in units of bet-per-line. The total bet is
  // numLines * betPerLine, but we only care about ONE line here; the
  // caller multiplies by numLines / numLines (i.e. nothing) — RTP from
  // line pays sums over all lines because each line's expected pay
  // shares the same payline geometry (only row indices differ; column
  // symbol distribution is identical).
  // We return expected pay PER LINE in bet-per-line units.
  void payline;
  return expected;
}

/**
 * Reproduce the leftmost-anchored evaluation rule from {@link SlotEngine.evaluatePayline}
 * for a single 5-symbol tuple and return the line pay (in bet-per-line units).
 */
function evaluateTupleLinePay(tuple: readonly SymbolId[], paytable: Paytable): number {
  const leftmost = tuple[0]!;
  if (leftmost === 'SCATTER') return 0;

  let anchor: RegularSymbolId | 'WILD' = leftmost === 'WILD' ? 'WILD' : (leftmost as RegularSymbolId);
  if (leftmost === 'WILD') {
    for (let r = 1; r < tuple.length; r++) {
      const s = tuple[r]!;
      if (s !== 'WILD' && s !== 'SCATTER') {
        anchor = s as RegularSymbolId;
        break;
      }
    }
  }

  let runLength = 0;
  for (let r = 0; r < tuple.length; r++) {
    const s = tuple[r]!;
    if (s === 'SCATTER') break;
    if (anchor === 'WILD') {
      if (s !== 'WILD') break;
    } else if (s !== 'WILD' && s !== anchor) {
      break;
    }
    runLength++;
  }
  if (runLength < 3) return 0;

  let leadingWilds = 0;
  for (let r = 0; r < tuple.length; r++) {
    if (tuple[r] === 'WILD') leadingWilds++;
    else break;
  }

  const lengthKey = runLength as 3 | 4 | 5;
  const anchorPay = anchor === 'WILD' ? 0 : paytable[anchor as SymbolId][lengthKey];
  let pay = anchorPay;
  if (leadingWilds >= 3) {
    const wildPay = paytable.WILD[leadingWilds as 3 | 4 | 5] ?? 0;
    if (wildPay > pay) pay = wildPay;
  }
  return pay;
}

/**
 * Total theoretical line-pay RTP across all paylines.
 *
 * Returns RTP as a fraction (e.g. 0.94 means the line pays contribute 94%
 * of expected payout). Multiply by the bet to get expected payout per spin.
 *
 * For the typical config:
 *   line_RTP + scatter_RTP + free_spin_RTP ≈ total_RTP
 */
export function totalTheoreticalLineRtp(
  strips: ReadonlyArray<ReelStrip>,
  paylines: readonly Payline[],
  paytable: Paytable,
): number {
  // Because each payline picks one row per reel and column symbol distribution
  // does NOT depend on the row (the strip is read sequentially with wrap-around
  // and the 3-row window is uniformly drawn over the strip), the per-line
  // expected pay is identical for every payline.
  const perLineBetUnits = computeLinePayRtp(strips, paylines[0]!, paytable);
  // total RTP = (sum over lines of expected_pay_per_line) / total_bet
  //           = numLines * perLineBetUnits / (numLines * betPerLine_when_bet=1)
  //           = perLineBetUnits   (because betPerLine = 1/numLines when totalBet=1,
  //              and pay is in bet-per-line units => sum = numLines * pay/numLines = pay)
  // i.e. the total expected payout in bet-units == expected pay per line in
  // bet-per-line units, when total bet is normalized to 1.
  return perLineBetUnits;
}
