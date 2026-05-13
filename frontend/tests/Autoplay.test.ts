import { describe, it, expect } from "vitest";
import { Autoplay, DEFAULT_AUTOPLAY_LIMITS } from "../src/game/Autoplay";

describe("Autoplay", () => {
  it("starts inactive with zero remaining", () => {
    const a = new Autoplay();
    expect(a.active).toBe(false);
    expect(a.remaining).toBe(0);
  });

  it("counts down on consume() and completes after N rounds", () => {
    const a = new Autoplay();
    a.start(10);
    expect(a.active).toBe(true);
    expect(a.remaining).toBe(10);
    for (let i = 0; i < 9; i++) a.consume();
    expect(a.remaining).toBe(1);
    expect(a.active).toBe(true);
    a.consume();
    expect(a.remaining).toBe(0);
    expect(a.active).toBe(false);
  });

  it("returns 'completed' when remaining reaches zero", () => {
    const a = new Autoplay();
    a.start(2);
    a.consume();
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 0, freeSpinsJustTriggered: false }),
    ).toBeNull();
    a.consume();
    // After final consume, autoplay is inactive and remaining=0 — shouldStop reports completion.
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 0, freeSpinsJustTriggered: false }),
    ).toBe("completed");
  });

  it("stops on free-spins trigger when limit enabled (default)", () => {
    const a = new Autoplay();
    a.start(10, DEFAULT_AUTOPLAY_LIMITS);
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 30, freeSpinsJustTriggered: true }),
    ).toBe("free-spins");
  });

  it("does NOT stop on free-spins when limit disabled", () => {
    const a = new Autoplay();
    a.start(10, { ...DEFAULT_AUTOPLAY_LIMITS, stopOnFreeSpins: false });
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 30, freeSpinsJustTriggered: true }),
    ).toBeNull();
  });

  it("stops below balance threshold (uses balance - bet check)", () => {
    const a = new Autoplay();
    a.start(10, { ...DEFAULT_AUTOPLAY_LIMITS, stopBelowBalance: 10 });
    // balance - bet = 5 < 10 → stop
    expect(
      a.shouldStop({ currentBalance: 6, currentBet: 1, lastWin: 0, freeSpinsJustTriggered: false }),
    ).toBe("low-balance");
    // balance - bet = 11 → continue
    expect(
      a.shouldStop({ currentBalance: 12, currentBet: 1, lastWin: 0, freeSpinsJustTriggered: false }),
    ).toBeNull();
  });

  it("stops on single-spin win over threshold", () => {
    const a = new Autoplay();
    a.start(10, { ...DEFAULT_AUTOPLAY_LIMITS, stopOnSingleWinAbove: 25 });
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 30, freeSpinsJustTriggered: false }),
    ).toBe("big-win");
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 20, freeSpinsJustTriggered: false }),
    ).toBeNull();
  });

  it("user stop() halts immediately; shouldStop subsequently reports 'completed'", () => {
    // shouldStop never returns 'user-stopped' — that's a controller-side signal
    // emitted by stop() itself. Once remaining is forced to 0, shouldStop just
    // reports 'completed' if the caller asks again.
    const a = new Autoplay();
    a.start(10);
    a.stop();
    expect(a.active).toBe(false);
    expect(
      a.shouldStop({ currentBalance: 100, currentBet: 1, lastWin: 0, freeSpinsJustTriggered: false }),
    ).toBe("completed");
  });
});
