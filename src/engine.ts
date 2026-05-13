import { PAYLINES } from './paylines';
import { PAYTABLE, SCATTER_PAY } from './paytable';
import { DEFAULT_REELS, ReelStrip } from './reels';
import { createDefaultRng } from './rng';
import type {
  FreeSpinConfig,
  FreeSpinSessionResult,
  Grid,
  Payline,
  PaylineWin,
  Paytable,
  PaytableEntry,
  ReelStripDefinition,
  RegularSymbolId,
  Rng,
  ScatterWin,
  SlotEngineConfig,
  SpinEvaluation,
  SymbolId,
} from './types';

/** Default free-spin configuration: 10 spins, 3x multiplier, retriggers enabled. */
export const DEFAULT_FREE_SPIN_CONFIG: FreeSpinConfig = {
  count: 10,
  multiplier: 3,
  triggerScatters: 3,
  retriggerEnabled: true,
  retriggerCount: 5,
};

/** Default engine configuration. Uses the reels / paytable / paylines from this package. */
export const DEFAULT_CONFIG: SlotEngineConfig = {
  reels: DEFAULT_REELS,
  paylines: PAYLINES,
  paytable: PAYTABLE,
  scatterPay: SCATTER_PAY,
  rows: 3,
  freeSpins: DEFAULT_FREE_SPIN_CONFIG,
  minBet: 0.2,
  maxBet: 100,
};

/**
 * Main math engine.
 *
 * Stateless w.r.t. the player session — every call takes the bet as an
 * argument and the engine is safe to share between spins. RNG is injected
 * so that tests can drive deterministic sequences.
 */
export class SlotEngine {
  public readonly config: SlotEngineConfig;
  public readonly strips: ReadonlyArray<ReelStrip>;
  private readonly rng: Rng;

  constructor(config: SlotEngineConfig = DEFAULT_CONFIG, rng: Rng = createDefaultRng()) {
    SlotEngine.assertConfig(config);
    this.config = config;
    this.rng = rng;
    this.strips = config.reels.map((def) => new ReelStrip(def));
  }

  // ───────────────────────── Spin generation ─────────────────────────

  /**
   * Spin all reels and return the visible 5xrows grid.
   * grid[reel][row] — reel 0 is leftmost; row 0 is top.
   */
  spin(): Grid {
    const grid: Grid = new Array(this.strips.length);
    for (let r = 0; r < this.strips.length; r++) {
      grid[r] = this.strips[r]!.spin(this.rng, this.config.rows);
    }
    return grid;
  }

  // ───────────────────────── Evaluation ─────────────────────────

  /**
   * Evaluate every payline + scatter on the grid for a given bet.
   *
   * The bet is the total stake the player put on the spin. Bet-per-line is
   * computed as `bet / paylines.length`, matching commercial convention.
   * Pass `multiplier > 1` to apply a free-spin multiplier.
   */
  evaluateWins(grid: Grid, bet: number, multiplier: number = 1, isFreeSpin = false): SpinEvaluation {
    this.assertBet(bet);
    if (multiplier <= 0) throw new RangeError(`evaluateWins: multiplier must be positive (got ${multiplier})`);

    const betPerLine = bet / this.config.paylines.length;
    const lineWins: PaylineWin[] = [];
    for (let lineIndex = 0; lineIndex < this.config.paylines.length; lineIndex++) {
      const line = this.config.paylines[lineIndex]!;
      const win = SlotEngine.evaluatePayline(grid, line, lineIndex, this.config.paytable, betPerLine, multiplier);
      if (win) lineWins.push(win);
    }

    const scatter = this.detectScatter(grid, bet, multiplier);

    const totalWin = lineWins.reduce((acc, w) => acc + w.amount, 0) + scatter.amount;
    return { grid, lineWins, scatter, totalWin, multiplier, isFreeSpin };
  }

  /**
   * Compute the win on a single payline.
   *
   * Algorithm (left-to-right, leftmost-anchored — the industry-standard rule):
   *  1. Read the symbol at the leftmost reel along the line. If it is a
   *     SCATTER, the line cannot pay (scatters are not line symbols).
   *  2. If it is a WILD, the line's "anchor" symbol is the cheapest *regular*
   *     symbol that the wild run could resolve to. We greedily look at the
   *     next non-wild on the line to determine the regular symbol identity;
   *     if every reel on the line is wild, the wild itself is the symbol.
   *  3. Starting from reel 0, extend the run while each reel shows either
   *     the anchor symbol or a WILD. The run length is the match length.
   *  4. Compare the **wild-only** pay for that run length against the
   *     anchor-symbol pay and keep the higher of the two. This protects the
   *     player from getting paid less for a 5x WILD line than for 5x
   *     (anchor) which the game might naively choose.
   */
  static evaluatePayline(
    grid: Grid,
    line: Payline,
    lineIndex: number,
    paytable: Paytable,
    betPerLine: number,
    multiplier: number,
  ): PaylineWin | null {
    const symbolsOnLine: SymbolId[] = line.map((row, reel) => grid[reel]![row]!);
    const leftmost = symbolsOnLine[0]!;
    if (leftmost === 'SCATTER') return null;

    // Find the first non-wild symbol; this is the "anchor" that wilds substitute for.
    let anchor: RegularSymbolId | 'WILD' = leftmost === 'WILD' ? 'WILD' : (leftmost as RegularSymbolId);
    if (leftmost === 'WILD') {
      for (let r = 1; r < symbolsOnLine.length; r++) {
        const s = symbolsOnLine[r]!;
        if (s !== 'WILD' && s !== 'SCATTER') {
          anchor = s as RegularSymbolId;
          break;
        }
      }
    }

    // Walk the line. Wilds always count toward the run. Scatters break the run.
    let runLength = 0;
    const positions: Array<readonly [number, number]> = [];
    for (let reel = 0; reel < symbolsOnLine.length; reel++) {
      const s = symbolsOnLine[reel]!;
      if (s === 'SCATTER') break;
      if (anchor === 'WILD') {
        if (s !== 'WILD') break;
      } else if (s !== 'WILD' && s !== anchor) {
        break;
      }
      runLength++;
      positions.push([reel, line[reel]!] as const);
    }

    if (runLength < 3) return null;

    // Best pay = the symbol pay we matched. If anchor was forced to WILD
    // (every contributing reel is wild) we use the WILD line pay outright.
    const lengthKey = runLength as 3 | 4 | 5;
    const anchorPay = (paytable[anchor as SymbolId]?.[lengthKey]) ?? 0;

    // Compare against the WILD-only pay for the leading wild-only prefix.
    // This guarantees the player always receives max(anchorPay, wildPay).
    let leadingWilds = 0;
    for (let r = 0; r < symbolsOnLine.length; r++) {
      if (symbolsOnLine[r] === 'WILD') leadingWilds++;
      else break;
    }
    let payMultiplier = anchorPay;
    const resolvedSymbol: RegularSymbolId =
      anchor === 'WILD' ? 'A' /* arbitrary; pure wild paid as wild below */ : anchor;

    if (leadingWilds >= 3) {
      const wildPay = paytable.WILD[(leadingWilds as 3 | 4 | 5)] ?? 0;
      if (wildPay > payMultiplier) {
        payMultiplier = wildPay;
        // Represent the win as a WILD win by encoding leadingWilds positions.
        const wildPositions: Array<readonly [number, number]> = [];
        for (let r = 0; r < leadingWilds; r++) wildPositions.push([r, line[r]!] as const);
        const amount = wildPay * betPerLine * multiplier;
        return {
          lineIndex,
          // We surface WILD by mapping to a sentinel — but `symbol` is typed as RegularSymbolId.
          // To keep the public typing simple, we encode 5x-wild as Symbol_A in the response and
          // record the actual amount; consumers that care can detect via the `WILD` entry length.
          symbol: 'A',
          matchLength: leadingWilds as 3 | 4 | 5,
          positions: wildPositions,
          amount,
        };
      }
    }

    if (payMultiplier <= 0) return null;
    const amount = payMultiplier * betPerLine * multiplier;
    return { lineIndex, symbol: resolvedSymbol, matchLength: lengthKey, positions, amount };
  }

  // ───────────────────────── Scatter detection ─────────────────────────

  /** Detect all scatter symbols on the grid and compute their pay. */
  detectScatter(grid: Grid, bet: number, multiplier: number): ScatterWin {
    const positions: Array<readonly [number, number]> = [];
    for (let reel = 0; reel < grid.length; reel++) {
      const col = grid[reel]!;
      for (let row = 0; row < col.length; row++) {
        if (col[row] === 'SCATTER') positions.push([reel, row] as const);
      }
    }
    const count = positions.length;
    let amount = 0;
    if (count >= 3) {
      const lengthKey = Math.min(count, 5) as 3 | 4 | 5;
      const payTableValue: PaytableEntry = this.config.scatterPay;
      amount = payTableValue[lengthKey] * bet * multiplier;
    }
    const triggersFreeSpins = count >= this.config.freeSpins.triggerScatters;
    return { count, positions, amount, triggersFreeSpins };
  }

  // ───────────────────────── Free spins ─────────────────────────

  /**
   * Run an entire free-spin bonus session (including retriggers if enabled).
   *
   * Wins inside the session are multiplied by `freeSpins.multiplier`.
   */
  playFreeSpinSession(bet: number): FreeSpinSessionResult {
    this.assertBet(bet);
    const cfg = this.config.freeSpins;
    let remaining = cfg.count;
    let retriggers = 0;
    const spins: SpinEvaluation[] = [];

    while (remaining > 0) {
      remaining--;
      const grid = this.spin();
      const evalResult = this.evaluateWins(grid, bet, cfg.multiplier, /* isFreeSpin */ true);
      spins.push(evalResult);
      if (cfg.retriggerEnabled && evalResult.scatter.count >= cfg.triggerScatters) {
        remaining += cfg.retriggerCount;
        retriggers++;
      }
    }

    const totalWin = spins.reduce((acc, s) => acc + s.totalWin, 0);
    return { totalWin, spins, spinsPlayed: spins.length, retriggers };
  }

  /** Perform one full base-game spin and, if triggered, run the free spin session. */
  playRound(bet: number): { base: SpinEvaluation; freeSpins: FreeSpinSessionResult | null; totalWin: number } {
    this.assertBet(bet);
    const grid = this.spin();
    const base = this.evaluateWins(grid, bet, 1, false);
    let free: FreeSpinSessionResult | null = null;
    if (base.scatter.triggersFreeSpins) {
      free = this.playFreeSpinSession(bet);
    }
    const totalWin = base.totalWin + (free?.totalWin ?? 0);
    return { base, freeSpins: free, totalWin };
  }

  // ───────────────────────── Helpers ─────────────────────────

  /**
   * Compute the theoretical 5-of-a-kind probability for a regular symbol on
   * a single payline, given the reel strip composition. Wilds are
   * substitutable. Useful for unit tests and balancing.
   */
  theoretical5OfAKind(symbol: RegularSymbolId): number {
    let p = 1;
    for (const strip of this.strips) {
      const weights = strip.weights();
      const matches = (weights.get(symbol) ?? 0) + (weights.get('WILD') ?? 0);
      p *= matches / strip.length;
    }
    return p;
  }

  // ───────────────────────── Validation ─────────────────────────

  private assertBet(bet: number): void {
    if (!Number.isFinite(bet) || bet <= 0) {
      throw new RangeError(`bet must be a positive number (got ${bet})`);
    }
    if (bet < this.config.minBet) {
      throw new RangeError(`bet ${bet} below minBet ${this.config.minBet}`);
    }
    if (bet > this.config.maxBet) {
      throw new RangeError(`bet ${bet} above maxBet ${this.config.maxBet}`);
    }
  }

  private static assertConfig(config: SlotEngineConfig): void {
    if (config.reels.length !== 5) {
      throw new RangeError(`SlotEngine: expected exactly 5 reels, got ${config.reels.length}`);
    }
    if (config.rows < 1) throw new RangeError('SlotEngine: rows must be >= 1');
    if (config.paylines.length === 0) throw new RangeError('SlotEngine: at least one payline required');
    for (const line of config.paylines) {
      if (line.length !== 5) throw new RangeError('SlotEngine: every payline must have 5 reel entries');
      for (const row of line) {
        if (row < 0 || row >= config.rows) {
          throw new RangeError(`SlotEngine: payline row ${row} out of range [0, ${config.rows - 1}]`);
        }
      }
    }
    for (const reel of config.reels) {
      if (reel.length === 0) throw new RangeError('SlotEngine: reels must be non-empty');
    }
    if (config.minBet <= 0) throw new RangeError('SlotEngine: minBet must be positive');
    if (config.maxBet < config.minBet) throw new RangeError('SlotEngine: maxBet must be >= minBet');
    if (config.freeSpins.count <= 0) throw new RangeError('SlotEngine: free spin count must be positive');
    if (config.freeSpins.multiplier <= 0) throw new RangeError('SlotEngine: free spin multiplier must be positive');
    if (config.freeSpins.triggerScatters < 1) {
      throw new RangeError('SlotEngine: triggerScatters must be >= 1');
    }
  }
}

/**
 * Helper: convert a {@link Grid} to a printable 5xrows table.
 *
 * Each cell is rendered using its symbol id, padded for visual alignment.
 * Primarily used by `npm run simulate` to show sample spins.
 */
export function gridToString(grid: Grid): string {
  if (grid.length === 0) return '<empty>';
  const rows = grid[0]!.length;
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    const cells: string[] = [];
    for (let reel = 0; reel < grid.length; reel++) {
      cells.push(grid[reel]![row]!.padStart(7));
    }
    lines.push(cells.join(' | '));
  }
  return lines.join('\n');
}

/** Type re-export for convenience when consumers only import this file. */
export type { ReelStripDefinition };
