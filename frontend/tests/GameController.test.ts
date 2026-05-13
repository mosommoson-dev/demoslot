import { describe, it, expect, beforeEach } from "vitest";
import { SlotEngine, DEFAULT_CONFIG, SeededRng } from "@math/index";
import {
  GameController,
  BET_STEPS,
  DEFAULT_STARTING_BALANCE,
  type GameState,
  type RoundContext,
} from "../src/game/GameController";

function makeController(seed = 42): GameController {
  const rng = new SeededRng(seed);
  const engine = new SlotEngine(DEFAULT_CONFIG, rng);
  return new GameController({
    engine,
    historyCapacity: 10,
    onPostRoundDelay: () => Promise.resolve(),
  });
}

describe("GameController — state machine", () => {
  it("initializes in IDLE with starting balance", () => {
    const c = makeController();
    expect(c.state).toBe("IDLE");
    expect(c.balance).toBe(DEFAULT_STARTING_BALANCE);
    expect(c.currentBet).toBe(BET_STEPS[3]);
  });

  it("transitions IDLE → SPINNING → EVALUATING → WIN_PRESENTATION → IDLE for a base spin", async () => {
    const c = makeController();
    const seen: GameState[] = [];
    c.on("stateChanged", (next) => seen.push(next));
    c.on("reelsShouldSpinBase", () => Promise.resolve());

    await c.requestSpin();
    // SPINNING and EVALUATING happen synchronously before the async animation
    // hook, then WIN_PRESENTATION fires after, then IDLE.
    expect(seen[0]).toBe("SPINNING");
    expect(seen[1]).toBe("EVALUATING");
    expect(seen[2]).toBe("WIN_PRESENTATION");
    expect(seen[seen.length - 1]).toBe("IDLE");
    expect(c.state).toBe("IDLE");
  });

  it("debits the bet, then credits any winnings, in that order", async () => {
    const c = makeController();
    const balanceTrail: number[] = [c.balance];
    c.on("balanceChanged", (b) => balanceTrail.push(b));
    c.on("reelsShouldSpinBase", () => Promise.resolve());

    const bet = c.currentBet;
    await c.requestSpin();

    // Debit must be first event; values must be monotonically consistent.
    expect(balanceTrail[1]).toBe(DEFAULT_STARTING_BALANCE - bet);
    // Final balance = starting - bet + any winnings (>= starting - bet).
    expect(c.balance).toBeGreaterThanOrEqual(DEFAULT_STARTING_BALANCE - bet);
  });

  it("refuses a spin while busy and keeps state intact", async () => {
    const c = makeController();
    c.on("reelsShouldSpinBase", () => new Promise((r) => setTimeout(r, 30)));
    const first = c.requestSpin();
    await Promise.resolve();
    expect(c.state).not.toBe("IDLE");
    await c.requestSpin(); // ignored, no throw
    await first;
    expect(c.state).toBe("IDLE");
  });

  it("emits exactly one spinResolved per spin", async () => {
    const c = makeController();
    c.on("reelsShouldSpinBase", () => Promise.resolve());
    let resolved = 0;
    c.on("spinResolved", () => (resolved += 1));
    await c.requestSpin();
    await c.requestSpin();
    expect(resolved).toBe(2);
  });

  it("changeBet moves through BET_STEPS and clamps at boundaries", () => {
    const c = makeController();
    c.changeBet(+1);
    expect(c.currentBet).toBe(BET_STEPS[4]);
    c.changeBet(-1);
    c.changeBet(-1);
    c.changeBet(-1);
    c.changeBet(-1);
    expect(c.betIndex).toBe(0);
    c.changeBet(-1); // clamp
    expect(c.betIndex).toBe(0);
  });

  it("refuses bet changes while spinning", async () => {
    const c = makeController();
    c.on("reelsShouldSpinBase", () => new Promise((r) => setTimeout(r, 20)));
    const indexBefore = c.betIndex;
    const p = c.requestSpin();
    await Promise.resolve();
    expect(c.changeBet(+1)).toBe(false);
    expect(c.betIndex).toBe(indexBefore);
    await p;
  });

  it("resetSession restores balance, clears history, and emits sessionReset", () => {
    const c = makeController();
    let resetSeen = false;
    c.on("sessionReset", () => (resetSeen = true));
    // Manually push a fake debit so balance moves.
    (c as unknown as { _balance: number })._balance = 13;
    c.resetSession();
    expect(c.balance).toBe(DEFAULT_STARTING_BALANCE);
    expect(c.history.stats().spins).toBe(0);
    expect(resetSeen).toBe(true);
  });

  it("appends each completed round to history with correct totals", async () => {
    const c = makeController();
    c.on("reelsShouldSpinBase", () => Promise.resolve());
    await c.requestSpin();
    await c.requestSpin();
    const s = c.history.stats();
    expect(s.spins).toBe(2);
    expect(s.totalWagered).toBe(2 * c.currentBet);
    const recent = c.history.recent();
    expect(recent).toHaveLength(2);
    // newest first
    expect(recent[0]!.id).toBeGreaterThan(recent[1]!.id);
  });
});

describe("GameController — autoplay", () => {
  // Helper: drain the microtask + timer queue until the loop quiesces.
  async function drainUntil(
    pred: () => boolean,
    maxIterations = 200,
  ): Promise<void> {
    for (let i = 0; i < maxIterations; i++) {
      if (pred()) return;
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  it("runs the requested number of spins and stops automatically", async () => {
    const c = makeController();
    let spins = 0;
    let lastReason: string | null | undefined;
    c.on("autoplayChanged", (_snap, reason) => {
      lastReason = reason;
    });
    c.on("reelsShouldSpinBase", () => {
      spins += 1;
      return Promise.resolve();
    });
    await c.startAutoplay(10);
    await drainUntil(() => !c.autoplay.active && c.state === "IDLE");
    expect(spins).toBe(10);
    expect(c.autoplay.active).toBe(false);
    expect(lastReason).toBe("completed");
  });

  it("stops below balance threshold before next spin", async () => {
    const c = new GameController({
      startingBalance: 1.5,
      historyCapacity: 10,
      engine: new SlotEngine(DEFAULT_CONFIG, new SeededRng(7)),
      onPostRoundDelay: () => Promise.resolve(),
    });
    c.on("reelsShouldSpinBase", () => Promise.resolve());
    const reasons: Array<string | null | undefined> = [];
    c.on("autoplayChanged", (_s, r) => reasons.push(r));
    await c.startAutoplay(100, {
      stopOnFreeSpins: true,
      stopBelowBalance: 0.5,
      stopOnSingleWinAbove: null,
    });
    await drainUntil(() => !c.autoplay.active);
    expect(c.autoplay.active).toBe(false);
    // Acceptable terminal reasons: hit the explicit low-balance limit,
    // or naturally ran out of credits and entered SESSION_END.
    const last = reasons[reasons.length - 1];
    expect(["low-balance", "completed"]).toContain(last ?? "");
  });

  it("user stopAutoplay halts the loop after the current round", async () => {
    const c = makeController();
    let spins = 0;
    const reasons: Array<string | null | undefined> = [];
    c.on("autoplayChanged", (_s, r) => reasons.push(r));
    c.on("reelsShouldSpinBase", () => {
      spins += 1;
      if (spins === 1) c.stopAutoplay();
      return Promise.resolve();
    });
    await c.startAutoplay(50);
    await drainUntil(() => !c.autoplay.active && c.state === "IDLE");
    expect(c.autoplay.active).toBe(false);
    expect(spins).toBe(1);
    expect(reasons).toContain("user-stopped");
  });
});
