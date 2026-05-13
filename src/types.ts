/**
 * Public type definitions for the slot Math Engine.
 *
 * The engine is intentionally pure-data: a configuration object (paytable,
 * reels, paylines, etc.) is fed into {@link SlotEngine} together with an RNG
 * implementation. Nothing here depends on a particular host environment,
 * which makes the math directly portable between server-side certification
 * code and a browser-side replay/animation layer.
 */

/** Canonical identifiers of all symbols that can appear on the reels. */
export type SymbolId =
  | 'WILD'
  | 'SCATTER'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I';

/** All non-special "regular" symbols that participate in payline wins. */
export type RegularSymbolId = Exclude<SymbolId, 'WILD' | 'SCATTER'>;

/** Pay multipliers per symbol per match length. Indexes are length-3..5. */
export interface PaytableEntry {
  /** Multiplier applied to the bet-per-line for 3 of a kind. */
  3: number;
  /** Multiplier applied to the bet-per-line for 4 of a kind. */
  4: number;
  /** Multiplier applied to the bet-per-line for 5 of a kind. */
  5: number;
}

/** Full paytable keyed by SymbolId. WILD has its own line pay; SCATTER pays on total bet. */
export type Paytable = Readonly<Record<SymbolId, PaytableEntry>>;

/** A single reel strip is an ordered list of symbol ids; weights are encoded by repetition. */
export type ReelStripDefinition = readonly SymbolId[];

/**
 * Coordinates of a payline on a 5x3 grid.
 * Index `i` is the reel (0..4); the value is the row (0..2) the line passes through.
 * `paylines.length` therefore equals the number of lines the player is paying for.
 */
export type Payline = readonly [number, number, number, number, number];

/** A 5x3 visible grid; grid[reel][row]. */
export type Grid = SymbolId[][];

/** Description of one winning combination on a payline. */
export interface PaylineWin {
  /** Index into `engine.paylines` (0-based). */
  lineIndex: number;
  /** Which regular symbol formed the win (after Wild substitution). */
  symbol: RegularSymbolId;
  /** Number of consecutive matching reels starting from reel 0 (3, 4, or 5). */
  matchLength: 3 | 4 | 5;
  /** Coordinates of every contributing position, leftmost first. */
  positions: ReadonlyArray<readonly [number, number]>;
  /** Amount paid for this line in the bet's currency unit (after free-spin multipliers). */
  amount: number;
}

/** Result of detecting scatter symbols on the grid. */
export interface ScatterWin {
  /** Number of scatters anywhere on the grid (>=3 triggers free spins by default). */
  count: number;
  /** Positions of each scatter, in scan order. */
  positions: ReadonlyArray<readonly [number, number]>;
  /** Amount paid (scatter pays on TOTAL bet, not bet-per-line). */
  amount: number;
  /** Whether this scatter event triggers the free-spin bonus. */
  triggersFreeSpins: boolean;
}

/** Full evaluation of one spin. */
export interface SpinEvaluation {
  /** The visible grid that produced this evaluation. */
  grid: Grid;
  /** All paying paylines (already merged via Wild substitution). */
  lineWins: PaylineWin[];
  /** Scatter outcome (always present; amount=0 if fewer than 3 scatters). */
  scatter: ScatterWin;
  /** Total payout in the bet's currency unit. */
  totalWin: number;
  /** Multiplier that was applied during this evaluation (1 in base, configurable in free spins). */
  multiplier: number;
  /** Whether the spin was performed inside the free-spin bonus. */
  isFreeSpin: boolean;
}

/** Aggregate evaluation of an entire free-spin bonus session. */
export interface FreeSpinSessionResult {
  /** Total payout across all free spins. */
  totalWin: number;
  /** Per-spin evaluations, in chronological order. */
  spins: SpinEvaluation[];
  /** Total number of spins that were actually played, including retriggers. */
  spinsPlayed: number;
  /** Number of additional spins added by retriggers. */
  retriggers: number;
}

/** Statistics produced by the long-run RTP simulation. */
export interface RtpStatistics {
  /** Number of base spins simulated. */
  simulations: number;
  /** Total bet wagered (= simulations * bet). */
  totalBet: number;
  /** Total win returned to the player (base wins + free spins). */
  totalWin: number;
  /** Observed RTP as a fraction (e.g. 0.965). */
  rtp: number;
  /**
   * Standard error of the RTP estimate. Useful to know whether N spins
   * were enough to be confident that the observed RTP is within tolerance.
   */
  rtpStdError: number;
  /** Fraction of paid spins (any payout > 0, including scatter+free-spin trigger). */
  hitFrequency: number;
  /** Fraction of base spins that triggered free spins. */
  freeSpinTriggerFrequency: number;
  /** Average total win per free-spin bonus session, in bet units. */
  averageFreeSpinPayout: number;
  /**
   * Distribution of win sizes expressed as bet multipliers, bucketed.
   * Each entry holds the number of paid spins whose payout fell in
   * [bucketStart, bucketEnd). The final bucket has bucketEnd = +Infinity.
   */
  winDistribution: WinBucket[];
  /** RTP contribution from base game alone (not including free spins). */
  rtpBase: number;
  /** RTP contribution from free spins. */
  rtpFreeSpins: number;
}

export interface WinBucket {
  /** Inclusive lower bound, as multiples of total bet. */
  bucketStart: number;
  /** Exclusive upper bound, as multiples of total bet (Infinity for the last bucket). */
  bucketEnd: number;
  /** Number of paid spins that fell into the bucket. */
  count: number;
  /** Average payout (in bet multiples) inside this bucket. */
  average: number;
}

/**
 * Pluggable RNG interface. The default implementation uses
 * `crypto.getRandomValues` from WebCrypto, which is available in Node 18+
 * and all modern browsers. Tests inject deterministic implementations.
 */
export interface Rng {
  /** Returns a uniformly distributed integer in [0, max). */
  nextInt(max: number): number;
}

/** Configuration that fully defines a slot game's math model. */
export interface SlotEngineConfig {
  readonly reels: readonly ReelStripDefinition[];
  readonly paylines: readonly Payline[];
  readonly paytable: Paytable;
  readonly scatterPay: PaytableEntry;
  readonly rows: number;
  readonly freeSpins: FreeSpinConfig;
  readonly minBet: number;
  readonly maxBet: number;
}

export interface FreeSpinConfig {
  /** Number of free spins awarded when the trigger condition is met. */
  readonly count: number;
  /** Multiplier applied to all wins (line + scatter) inside free spins. */
  readonly multiplier: number;
  /** Number of scatters needed to trigger and to retrigger. */
  readonly triggerScatters: number;
  /** Whether landing another set of scatters during free spins awards more spins. */
  readonly retriggerEnabled: boolean;
  /** Extra spins per retrigger. */
  readonly retriggerCount: number;
}
