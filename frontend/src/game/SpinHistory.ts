import type { FreeSpinSessionResult, SpinEvaluation } from "@math/types";

export interface HistoryEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly bet: number;
  readonly base: SpinEvaluation;
  readonly freeSpins: FreeSpinSessionResult | null;
  readonly totalWin: number;
}

export interface SessionStats {
  readonly spins: number;
  readonly totalWagered: number;
  readonly totalWin: number;
  /** totalWin - totalWagered (negative if losing). */
  readonly net: number;
  /** Spins that resolved with totalWin > 0. */
  readonly winningSpins: number;
  /** Largest single-round totalWin during the session. */
  readonly biggestWin: number;
  /** Number of rounds where free spins were triggered (base game scatter ≥ 3). */
  readonly freeSpinTriggers: number;
  /** totalWin / totalWagered, 0 when no spins yet. */
  readonly rtp: number;
  /** winningSpins / spins, 0 when no spins yet. */
  readonly hitRate: number;
}

const EMPTY_STATS: SessionStats = Object.freeze({
  spins: 0,
  totalWagered: 0,
  totalWin: 0,
  net: 0,
  winningSpins: 0,
  biggestWin: 0,
  freeSpinTriggers: 0,
  rtp: 0,
  hitRate: 0,
});

/**
 * Ring buffer of the most recent rounds + running session statistics.
 *
 * The buffer is bounded (default 10 entries) but the running totals are
 * not — they accumulate across the whole session and can be cleared with
 * `resetSession()` (which is what RESET BALANCE does).
 */
export class SpinHistory {
  private entries: HistoryEntry[] = [];
  private nextId = 1;
  private running = {
    spins: 0,
    totalWagered: 0,
    totalWin: 0,
    winningSpins: 0,
    biggestWin: 0,
    freeSpinTriggers: 0,
  };

  constructor(private readonly capacity: number = 10) {}

  push(entry: Omit<HistoryEntry, "id" | "timestamp">): HistoryEntry {
    const stored: HistoryEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      ...entry,
    };
    this.entries.unshift(stored);
    if (this.entries.length > this.capacity) this.entries.pop();

    this.running.spins += 1;
    this.running.totalWagered += stored.bet;
    this.running.totalWin += stored.totalWin;
    if (stored.totalWin > 0) this.running.winningSpins += 1;
    if (stored.totalWin > this.running.biggestWin) this.running.biggestWin = stored.totalWin;
    if (stored.freeSpins !== null) this.running.freeSpinTriggers += 1;

    return stored;
  }

  /** Read-only view of the most recent rounds, newest first. */
  recent(): readonly HistoryEntry[] {
    return this.entries.slice();
  }

  stats(): SessionStats {
    const r = this.running;
    if (r.spins === 0) return EMPTY_STATS;
    return {
      spins: r.spins,
      totalWagered: r.totalWagered,
      totalWin: r.totalWin,
      net: r.totalWin - r.totalWagered,
      winningSpins: r.winningSpins,
      biggestWin: r.biggestWin,
      freeSpinTriggers: r.freeSpinTriggers,
      rtp: r.totalWagered > 0 ? r.totalWin / r.totalWagered : 0,
      hitRate: r.spins > 0 ? r.winningSpins / r.spins : 0,
    };
  }

  resetSession(): void {
    this.entries = [];
    this.running = {
      spins: 0,
      totalWagered: 0,
      totalWin: 0,
      winningSpins: 0,
      biggestWin: 0,
      freeSpinTriggers: 0,
    };
  }
}
