/**
 * Autoplay preset + stop conditions.
 *
 * The controller asks the autoplay manager `shouldContinue(stats, balance, lastWin)`
 * after every round; the manager returns the reason for stopping (or null if
 * it should keep going). All limits are optional and configurable.
 */

export type AutoplayPreset = 10 | 25 | 50 | 100;

export interface AutoplayLimits {
  /** Stop automatically when free spins trigger. Defaults true. */
  readonly stopOnFreeSpins: boolean;
  /**
   * Stop when balance falls below this absolute amount (in demo coins).
   * Null disables the check.
   */
  readonly stopBelowBalance: number | null;
  /**
   * Stop when a single spin pays more than this amount (in demo coins).
   * Null disables the check.
   */
  readonly stopOnSingleWinAbove: number | null;
}

export type AutoplayStopReason =
  | "completed"
  | "free-spins"
  | "low-balance"
  | "big-win"
  | "user-stopped";

/**
 * Reasons returned by `Autoplay.shouldStop` — strictly a subset.
 * `user-stopped` is signalled by `Autoplay.stop()` directly; it cannot be the
 * result of inspecting state.
 */
export type AutoplayCheckReason = Exclude<AutoplayStopReason, "user-stopped">;

export interface AutoplaySnapshot {
  readonly active: boolean;
  readonly preset: AutoplayPreset;
  readonly remaining: number;
  readonly limits: AutoplayLimits;
}

export const DEFAULT_AUTOPLAY_LIMITS: AutoplayLimits = Object.freeze({
  stopOnFreeSpins: true,
  stopBelowBalance: null,
  stopOnSingleWinAbove: null,
});

export class Autoplay {
  private _active = false;
  private _preset: AutoplayPreset = 10;
  private _remaining = 0;
  private _limits: AutoplayLimits = DEFAULT_AUTOPLAY_LIMITS;

  start(preset: AutoplayPreset, limits: AutoplayLimits = DEFAULT_AUTOPLAY_LIMITS): void {
    this._active = true;
    this._preset = preset;
    this._remaining = preset;
    this._limits = limits;
  }

  setLimits(limits: AutoplayLimits): void {
    this._limits = limits;
  }

  /** Mark one round as consumed. Should be called *after* the round resolves. */
  consume(): void {
    if (!this._active) return;
    this._remaining -= 1;
    if (this._remaining <= 0) {
      this._active = false;
      this._remaining = 0;
    }
  }

  /** Force stop (user-initiated). */
  stop(): void {
    this._active = false;
    this._remaining = 0;
  }

  /**
   * Inspect post-round state and decide whether to keep going. This does NOT
   * report `user-stopped` — that signal is owned by `Autoplay.stop()` and
   * surfaced by the controller directly.
   */
  shouldStop(opts: {
    readonly currentBalance: number;
    readonly currentBet: number;
    readonly lastWin: number;
    readonly freeSpinsJustTriggered: boolean;
  }): AutoplayCheckReason | null {
    if (this._remaining <= 0) return "completed";
    if (this._limits.stopOnFreeSpins && opts.freeSpinsJustTriggered) return "free-spins";
    if (
      this._limits.stopBelowBalance !== null &&
      opts.currentBalance - opts.currentBet < this._limits.stopBelowBalance
    ) {
      return "low-balance";
    }
    if (
      this._limits.stopOnSingleWinAbove !== null &&
      opts.lastWin > this._limits.stopOnSingleWinAbove
    ) {
      return "big-win";
    }
    return null;
  }

  snapshot(): AutoplaySnapshot {
    return {
      active: this._active,
      preset: this._preset,
      remaining: this._remaining,
      limits: this._limits,
    };
  }

  get active(): boolean {
    return this._active;
  }
  get remaining(): number {
    return this._remaining;
  }
  get limits(): AutoplayLimits {
    return this._limits;
  }
}
