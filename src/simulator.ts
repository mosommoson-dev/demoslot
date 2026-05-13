import { SlotEngine } from './engine';
import type { RtpStatistics, WinBucket } from './types';

/**
 * Long-run simulator used both as a public API and as the engine that the
 * `npm run simulate` script invokes.
 */
export interface SimulationOptions {
  /** Number of base-game spins to play. Defaults to 1_000_000. */
  simulations?: number;
  /** Bet placed per spin. Defaults to 1 unit of currency. */
  bet?: number;
  /**
   * If provided, progress callback fired every `progressEvery` spins. Useful for
   * CLI heart-beats during multi-minute simulations.
   */
  onProgress?: (spinsCompleted: number, partial: RtpStatistics) => void;
  progressEvery?: number;
}

/**
 * Default histogram buckets used by {@link simulate}. Bucket bounds are in
 * multiples of the *total bet*, which is the standard way regulators report
 * win distributions.
 */
export const DEFAULT_WIN_BUCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.5],
  [0.5, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 25],
  [25, 50],
  [50, 100],
  [100, 250],
  [250, 500],
  [500, Number.POSITIVE_INFINITY],
];

/**
 * Run the long-run RTP simulation.
 *
 * Returns an aggregated {@link RtpStatistics}. The simulation runs entirely in
 * memory and does not retain individual spin records — a 1M spin simulation
 * uses constant memory.
 *
 * For Monte Carlo accuracy: the variance of a slot is dominated by rare,
 * high-payout 5-of-a-kind hits. We therefore report the standard error of
 * the RTP estimate so callers can decide whether N simulations are enough.
 */
export function simulate(engine: SlotEngine, options: SimulationOptions = {}): RtpStatistics {
  const simulations = options.simulations ?? 1_000_000;
  const bet = options.bet ?? 1;
  const progressEvery = options.progressEvery ?? 50_000;

  if (!Number.isInteger(simulations) || simulations <= 0) {
    throw new RangeError('simulate: simulations must be a positive integer');
  }

  const bucketBounds = DEFAULT_WIN_BUCKETS.map(([a, b]) => [a, b] as const);
  const bucketCounts = new Array<number>(bucketBounds.length).fill(0);
  const bucketTotals = new Array<number>(bucketBounds.length).fill(0);

  let totalWin = 0;
  let totalBaseWin = 0;
  let totalFreeWin = 0;
  let paidSpins = 0;
  let freeSpinTriggers = 0;
  let freeSpinTotalWin = 0;
  // Welford-style running sum-of-squares of the per-spin total return ratio
  // (win / bet). Used to estimate the standard error of the RTP estimate.
  let sumReturnRatio = 0;
  let sumSqReturnRatio = 0;

  for (let i = 0; i < simulations; i++) {
    const round = engine.playRound(bet);
    const win = round.totalWin;
    totalWin += win;
    totalBaseWin += round.base.totalWin;
    totalFreeWin += round.freeSpins?.totalWin ?? 0;
    if (round.freeSpins) {
      freeSpinTriggers++;
      freeSpinTotalWin += round.freeSpins.totalWin;
    }
    if (win > 0) {
      paidSpins++;
      const winMultiple = win / bet;
      for (let b = 0; b < bucketBounds.length; b++) {
        const [lo, hi] = bucketBounds[b]!;
        if (winMultiple >= lo && winMultiple < hi) {
          bucketCounts[b]!++;
          bucketTotals[b]! += winMultiple;
          break;
        }
      }
    }
    const r = win / bet;
    sumReturnRatio += r;
    sumSqReturnRatio += r * r;

    if (options.onProgress && (i + 1) % progressEvery === 0) {
      options.onProgress(i + 1, summarise(i + 1, bet, totalWin, totalBaseWin, totalFreeWin, paidSpins,
        freeSpinTriggers, freeSpinTotalWin, sumReturnRatio, sumSqReturnRatio, bucketCounts, bucketTotals, bucketBounds));
    }
  }

  return summarise(simulations, bet, totalWin, totalBaseWin, totalFreeWin, paidSpins,
    freeSpinTriggers, freeSpinTotalWin, sumReturnRatio, sumSqReturnRatio, bucketCounts, bucketTotals, bucketBounds);
}

function summarise(
  simulations: number,
  bet: number,
  totalWin: number,
  totalBaseWin: number,
  totalFreeWin: number,
  paidSpins: number,
  freeSpinTriggers: number,
  freeSpinTotalWin: number,
  sumReturnRatio: number,
  sumSqReturnRatio: number,
  bucketCounts: number[],
  bucketTotals: number[],
  bucketBounds: ReadonlyArray<readonly [number, number]>,
): RtpStatistics {
  const totalBet = simulations * bet;
  const rtp = totalWin / totalBet;
  // sample variance of the per-spin return ratio
  const meanR = sumReturnRatio / simulations;
  const varR = Math.max(0, sumSqReturnRatio / simulations - meanR * meanR);
  const rtpStdError = Math.sqrt(varR / simulations);

  const winDistribution: WinBucket[] = bucketBounds.map(([lo, hi], i) => ({
    bucketStart: lo,
    bucketEnd: hi,
    count: bucketCounts[i]!,
    average: bucketCounts[i]! > 0 ? bucketTotals[i]! / bucketCounts[i]! : 0,
  }));

  return {
    simulations,
    totalBet,
    totalWin,
    rtp,
    rtpStdError,
    hitFrequency: paidSpins / simulations,
    freeSpinTriggerFrequency: freeSpinTriggers / simulations,
    averageFreeSpinPayout: freeSpinTriggers > 0 ? freeSpinTotalWin / freeSpinTriggers / bet : 0,
    winDistribution,
    rtpBase: totalBaseWin / totalBet,
    rtpFreeSpins: totalFreeWin / totalBet,
  };
}

/** Pretty-print an {@link RtpStatistics} object for the CLI. */
export function formatStatistics(stats: RtpStatistics): string {
  const pct = (x: number) => `${(x * 100).toFixed(4)}%`;
  const lines: string[] = [];
  lines.push(`Simulated spins: ${stats.simulations.toLocaleString()}`);
  lines.push(`Total bet:       ${stats.totalBet.toFixed(2)}`);
  lines.push(`Total win:       ${stats.totalWin.toFixed(2)}`);
  lines.push(`RTP overall:     ${pct(stats.rtp)}  (±${pct(stats.rtpStdError * 1.96)} @95%CI)`);
  lines.push(`  Base game:     ${pct(stats.rtpBase)}`);
  lines.push(`  Free spins:    ${pct(stats.rtpFreeSpins)}`);
  lines.push(`Hit frequency:   ${pct(stats.hitFrequency)}`);
  lines.push(`Free-spin trig.: ${pct(stats.freeSpinTriggerFrequency)} ( ~1 in ${Math.round(1 / Math.max(stats.freeSpinTriggerFrequency, 1e-12)).toLocaleString()} )`);
  lines.push(`Avg FS payout:   ${stats.averageFreeSpinPayout.toFixed(2)}x bet`);
  lines.push('');
  lines.push('Win distribution (per paid spin, as multiples of total bet):');
  for (const b of stats.winDistribution) {
    const range = b.bucketEnd === Number.POSITIVE_INFINITY
      ? `>= ${b.bucketStart}x`
      : `${b.bucketStart}x – ${b.bucketEnd}x`;
    const share = b.count / Math.max(1, stats.simulations);
    lines.push(`  ${range.padEnd(16)} count=${b.count.toString().padStart(8)}  (${pct(share)})  avg=${b.average.toFixed(2)}x`);
  }
  return lines.join('\n');
}
