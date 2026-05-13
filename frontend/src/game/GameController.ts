import { SlotEngine, DEFAULT_CONFIG, createDefaultRng } from "@math/index";
import type {
  FreeSpinSessionResult,
  Grid,
  Rng,
  SpinEvaluation,
} from "@math/types";
import { Logger, NsLogger } from "./Logger";
import { SpinHistory, type SessionStats, type HistoryEntry } from "./SpinHistory";
import {
  Autoplay,
  DEFAULT_AUTOPLAY_LIMITS,
  type AutoplayLimits,
  type AutoplayPreset,
  type AutoplaySnapshot,
  type AutoplayStopReason,
} from "./Autoplay";

export type GameState =
  | "IDLE"
  | "SPINNING"
  | "EVALUATING"
  | "WIN_PRESENTATION"
  | "FREE_SPINS"
  | "SESSION_END";

export const BET_STEPS: readonly number[] = [0.2, 0.4, 0.6, 1, 2, 5, 10, 20, 50, 100];
export const DEFAULT_STARTING_BALANCE = 1000;

export interface GameControllerOptions {
  readonly startingBalance?: number;
  readonly engine?: SlotEngine;
  readonly rng?: Rng;
  readonly historyCapacity?: number;
  /**
   * If provided, this hook is awaited between consecutive autoplay spins so
   * the visual layer can animate before the next round starts.
   */
  readonly onPostRoundDelay?: () => Promise<void>;
}

export interface RoundContext {
  readonly bet: number;
  readonly base: SpinEvaluation;
  readonly freeSpins: FreeSpinSessionResult | null;
  readonly totalWin: number;
  /** Balance *before* the round (already after debit). */
  readonly balanceBefore: number;
  /** Balance *after* the round (after winnings credited). */
  readonly balanceAfter: number;
  readonly isAutoplay: boolean;
  readonly autoplayRemaining: number;
}

/** Events emitted by the controller. The view binds to these. */
export interface GameControllerEvents {
  stateChanged: (next: GameState, previous: GameState) => void;
  balanceChanged: (balance: number, delta: number, reason: BalanceReason) => void;
  betChanged: (bet: number, index: number) => void;
  /** Fired with the math result immediately after debit, before reels start. */
  spinResolved: (round: RoundContext) => void;
  /**
   * Visual layer should now animate the base-game reels to `round.base.grid`.
   * Must return a promise that resolves when animation + win presentation
   * have been displayed.
   */
  reelsShouldSpinBase: (round: RoundContext) => Promise<void>;
  /**
   * Visual layer should animate one free-spin row.
   * Returned promise resolves when that spin's animation + win presentation
   * have finished.
   */
  reelsShouldSpinFreeSpin: (
    spin: SpinEvaluation,
    index: number,
    total: number,
    multiplier: number,
  ) => Promise<void>;
  /** Fired when the free-spin session starts (after base game). */
  freeSpinsEntered: (session: FreeSpinSessionResult, retriggerCount: number) => void;
  /** Fired when the free-spin session is finished and totals credited. */
  freeSpinsExited: (session: FreeSpinSessionResult) => void;
  /** Fired after history + stats are updated, at the end of a round. */
  roundCompleted: (round: RoundContext, stats: SessionStats, entry: HistoryEntry) => void;
  /** Autoplay started / advanced / stopped. */
  autoplayChanged: (snapshot: AutoplaySnapshot, reason: AutoplayStopReason | null) => void;
  /** Reset balance button pressed; consumers should redraw all readouts. */
  sessionReset: (balance: number, bet: number) => void;
}

export type BalanceReason = "spin-debit" | "base-win" | "free-spin-win" | "reset";

type Listener<K extends keyof GameControllerEvents> = GameControllerEvents[K];

/**
 * Central state machine for the slot game.
 *
 *   IDLE ─[spin()]─▶ SPINNING ─▶ EVALUATING ─▶ WIN_PRESENTATION ─┐
 *     ▲                                                          │
 *     │                                            (no FS)       │
 *     │                                                          │
 *     └────────────── FREE_SPINS ◀───[scatter ≥ 3]───────────────┘
 *
 *   SESSION_END is entered when balance < minBet *and* autoplay/manual spin
 *   is attempted. The view can show "out of credits" + RESET prompt.
 */
export class GameController {
  private readonly log: NsLogger = Logger.of("slot:fsm");
  private readonly spinLog: NsLogger = Logger.of("slot:spin");
  private readonly autoplayLog: NsLogger = Logger.of("slot:autoplay");
  private readonly walletLog: NsLogger = Logger.of("slot:wallet");

  public readonly engine: SlotEngine;
  public readonly history: SpinHistory;
  public readonly autoplay: Autoplay;

  private listeners = new Map<keyof GameControllerEvents, Set<Function>>();
  private _state: GameState = "IDLE";
  private _balance: number;
  private readonly startingBalance: number;
  private _betIndex = 3; // default bet 1.0
  private readonly postRoundDelay: () => Promise<void>;

  constructor(opts: GameControllerOptions = {}) {
    this.startingBalance = opts.startingBalance ?? DEFAULT_STARTING_BALANCE;
    this._balance = this.startingBalance;
    this.engine = opts.engine ?? new SlotEngine(DEFAULT_CONFIG, opts.rng ?? createDefaultRng());
    this.history = new SpinHistory(opts.historyCapacity ?? 10);
    this.autoplay = new Autoplay();
    this.postRoundDelay =
      opts.onPostRoundDelay ?? (() => new Promise<void>((r) => setTimeout(r, 320)));
  }

  // ─── Public state accessors ────────────────────────────────────────────────

  get state(): GameState {
    return this._state;
  }
  get balance(): number {
    return this._balance;
  }
  get betIndex(): number {
    return this._betIndex;
  }
  get currentBet(): number {
    return BET_STEPS[this._betIndex] ?? 1;
  }
  get isBusy(): boolean {
    return this._state !== "IDLE" && this._state !== "SESSION_END";
  }
  get minBet(): number {
    return this.engine.config.minBet;
  }

  // ─── Event emitter (typed, listener-set per event) ─────────────────────────

  on<K extends keyof GameControllerEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  private emit<K extends keyof GameControllerEvents>(
    event: K,
    ...args: Parameters<Listener<K>>
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const l of set) {
      try {
        (l as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        this.log.error(`listener for ${String(event)} threw`, err);
      }
    }
  }

  // ─── Public commands ──────────────────────────────────────────────────────

  /** Player-initiated spin. No-op (and warns) when busy or out of credits. */
  async requestSpin(): Promise<void> {
    if (this.isBusy) {
      this.spinLog.warn("ignored spin request — controller busy", { state: this._state });
      return;
    }
    if (this._balance < this.currentBet) {
      this.spinLog.warn("balance below current bet — entering SESSION_END");
      this.transition("SESSION_END");
      return;
    }
    await this.runRound(false);
  }

  changeBet(delta: number): boolean {
    if (this.isBusy) return false;
    const next = Math.max(0, Math.min(BET_STEPS.length - 1, this._betIndex + delta));
    if (next === this._betIndex) return false;
    this._betIndex = next;
    this.walletLog.debug("bet changed", { betIndex: next, bet: this.currentBet });
    this.emit("betChanged", this.currentBet, this._betIndex);
    return true;
  }

  setBetIndex(index: number): boolean {
    if (this.isBusy) return false;
    if (index < 0 || index >= BET_STEPS.length || !Number.isInteger(index)) return false;
    if (index === this._betIndex) return false;
    this._betIndex = index;
    this.emit("betChanged", this.currentBet, this._betIndex);
    return true;
  }

  /** Begin an autoplay session with the given preset and limits. */
  async startAutoplay(
    preset: AutoplayPreset,
    limits: AutoplayLimits = DEFAULT_AUTOPLAY_LIMITS,
  ): Promise<void> {
    if (this.autoplay.active) {
      this.autoplayLog.warn("startAutoplay called while already active — ignored");
      return;
    }
    this.autoplay.start(preset, limits);
    this.autoplayLog.info("autoplay started", { preset, limits });
    this.emit("autoplayChanged", this.autoplay.snapshot(), null);
    if (this._state === "IDLE") void this.runAutoplayLoop();
  }

  /** Cancel any in-flight autoplay (does NOT cancel the current round). */
  stopAutoplay(reason: AutoplayStopReason = "user-stopped"): void {
    if (!this.autoplay.active) return;
    this.autoplay.stop();
    this.autoplayLog.info("autoplay stopped", { reason });
    this.emit("autoplayChanged", this.autoplay.snapshot(), reason);
  }

  /** Demo Reset Balance — back to starting balance, history wiped. */
  resetSession(): void {
    if (this.isBusy) {
      this.walletLog.warn("resetSession ignored — controller busy");
      return;
    }
    if (this.autoplay.active) this.stopAutoplay("user-stopped");
    const previous = this._balance;
    this._balance = this.startingBalance;
    this.history.resetSession();
    this.walletLog.info("session reset", { previous, balance: this._balance });
    this.emit("balanceChanged", this._balance, this._balance - previous, "reset");
    this.emit("sessionReset", this._balance, this.currentBet);
    if (this._state === "SESSION_END") this.transition("IDLE");
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private transition(to: GameState): void {
    const from = this._state;
    if (from === to) return;
    this._state = to;
    this.log.info(`state ${from} → ${to}`);
    this.emit("stateChanged", to, from);
  }

  private async runAutoplayLoop(): Promise<void> {
    while (this.autoplay.active) {
      if (this._balance < this.currentBet) {
        this.stopAutoplay("low-balance");
        this.transition("SESSION_END");
        return;
      }
      await this.runRound(true);
      await this.postRoundDelay();
    }
  }

  /**
   * The full round pipeline. Step 1: debit. Step 2: math. Step 3: visual
   * reels. Step 4: win presentation (happens inside reelsShouldSpinBase
   * resolution). Step 5: free spins (if any). Step 6: history + autoplay.
   */
  private async runRound(isAutoplay: boolean): Promise<void> {
    const bet = this.currentBet;
    this.transition("SPINNING");
    this.applyBalance(-bet, "spin-debit");
    const balanceAfterDebit = this._balance;

    // Math first, animation second — the visual layer is a pure replay.
    const round = this.engine.playRound(bet);
    this.spinLog.info("round resolved", {
      bet,
      grid: round.base.grid,
      base: round.base.totalWin,
      freeSpins: round.freeSpins?.totalWin ?? 0,
      total: round.totalWin,
    });

    const ctx: RoundContext = {
      bet,
      base: round.base,
      freeSpins: round.freeSpins,
      totalWin: round.totalWin,
      balanceBefore: balanceAfterDebit,
      balanceAfter: 0, // filled in after winnings credited
      isAutoplay,
      autoplayRemaining: this.autoplay.snapshot().remaining,
    };

    this.emit("spinResolved", ctx);

    // Reels — visual layer awaits its own animations + win highlight.
    this.transition("EVALUATING");
    await this.fireAsync("reelsShouldSpinBase", ctx);

    // Credit base-game winnings.
    this.transition("WIN_PRESENTATION");
    if (round.base.totalWin > 0) this.applyBalance(round.base.totalWin, "base-win");

    // Free spins, if triggered.
    if (round.freeSpins) {
      this.transition("FREE_SPINS");
      this.emit("freeSpinsEntered", round.freeSpins, round.freeSpins.retriggers);
      const cfg = this.engine.config.freeSpins;
      for (let i = 0; i < round.freeSpins.spins.length; i++) {
        const spin = round.freeSpins.spins[i]!;
        this.spinLog.debug(`FS ${i + 1}/${round.freeSpins.spins.length}`, {
          totalWin: spin.totalWin,
        });
        await this.fireAsync(
          "reelsShouldSpinFreeSpin",
          spin,
          i,
          round.freeSpins.spins.length,
          cfg.multiplier,
        );
      }
      if (round.freeSpins.totalWin > 0) this.applyBalance(round.freeSpins.totalWin, "free-spin-win");
      this.emit("freeSpinsExited", round.freeSpins);
    }

    // Finalise round + history.
    const finalCtx: RoundContext = {
      ...ctx,
      balanceAfter: this._balance,
    };
    const entry = this.history.push({
      bet,
      base: round.base,
      freeSpins: round.freeSpins,
      totalWin: round.totalWin,
    });
    const stats = this.history.stats();
    this.emit("roundCompleted", finalCtx, stats, entry);

    // Autoplay accounting + stop-condition check.
    // If the user pressed STOP during the round, autoplay.active is already
    // false — skip accounting; stopAutoplay() already emitted "user-stopped".
    if (isAutoplay && this.autoplay.active) {
      const earlyStop = this.autoplay.shouldStop({
        currentBalance: this._balance,
        currentBet: this.currentBet,
        lastWin: round.totalWin,
        freeSpinsJustTriggered: round.freeSpins !== null,
      });
      if (earlyStop !== null) {
        this.autoplay.stop();
        this.autoplayLog.info("autoplay halted", { reason: earlyStop });
        this.emit("autoplayChanged", this.autoplay.snapshot(), earlyStop);
      } else {
        this.autoplay.consume();
        const completed = !this.autoplay.active;
        if (completed) this.autoplayLog.info("autoplay completed");
        this.emit(
          "autoplayChanged",
          this.autoplay.snapshot(),
          completed ? "completed" : null,
        );
      }
    }

    this.transition("IDLE");
  }

  private applyBalance(delta: number, reason: BalanceReason): void {
    this._balance = Math.max(0, this._balance + delta);
    this.walletLog.debug("balance", { delta, balance: this._balance, reason });
    this.emit("balanceChanged", this._balance, delta, reason);
  }

  /**
   * Emit an event and await all listener-returned promises. Used for events
   * where the listener (visual layer) drives the timeline.
   */
  private async fireAsync<K extends keyof GameControllerEvents>(
    event: K,
    ...args: Parameters<Listener<K>>
  ): Promise<void> {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const promises: Array<Promise<unknown>> = [];
    for (const l of set) {
      try {
        const ret = (l as (...a: unknown[]) => unknown)(...args);
        if (ret && typeof (ret as Promise<unknown>).then === "function") {
          promises.push(ret as Promise<unknown>);
        }
      } catch (err) {
        this.log.error(`async listener for ${String(event)} threw`, err);
      }
    }
    await Promise.all(promises);
  }
}

export type { Grid };
