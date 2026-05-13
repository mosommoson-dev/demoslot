import { describe, it, expect } from "vitest";
import { SpinHistory } from "../src/game/SpinHistory";
import type { SpinEvaluation, FreeSpinSessionResult } from "@math/types";

function fakeEval(totalWin: number): SpinEvaluation {
  return {
    grid: [
      ["A", "A", "A"],
      ["A", "A", "A"],
      ["A", "A", "A"],
      ["A", "A", "A"],
      ["A", "A", "A"],
    ],
    lineWins: [],
    scatter: { count: 0, amount: 0, positions: [], triggersFreeSpins: false },
    totalWin,
    multiplier: 1,
    isFreeSpin: false,
  };
}

describe("SpinHistory", () => {
  it("starts empty with zeroed stats", () => {
    const h = new SpinHistory();
    expect(h.recent()).toEqual([]);
    const s = h.stats();
    expect(s.spins).toBe(0);
    expect(s.totalWagered).toBe(0);
    expect(s.totalWin).toBe(0);
    expect(s.rtp).toBe(0);
    expect(s.hitRate).toBe(0);
  });

  it("retains only the last N entries (capacity-bounded)", () => {
    const h = new SpinHistory(3);
    for (let i = 0; i < 5; i++) {
      h.push({ bet: 1, base: fakeEval(i), freeSpins: null, totalWin: i });
    }
    const recent = h.recent();
    expect(recent).toHaveLength(3);
    expect(recent.map((e) => e.totalWin)).toEqual([4, 3, 2]);
  });

  it("accumulates running totals across the whole session, not just the buffer", () => {
    const h = new SpinHistory(2);
    for (let i = 0; i < 5; i++) {
      h.push({ bet: 1, base: fakeEval(i), freeSpins: null, totalWin: i });
    }
    const s = h.stats();
    expect(s.spins).toBe(5);
    expect(s.totalWagered).toBe(5);
    expect(s.totalWin).toBe(0 + 1 + 2 + 3 + 4);
    expect(s.net).toBe(s.totalWin - s.totalWagered);
    expect(s.winningSpins).toBe(4); // totalWin>0 four times
    expect(s.biggestWin).toBe(4);
    expect(s.rtp).toBeCloseTo(10 / 5, 5);
    expect(s.hitRate).toBeCloseTo(4 / 5, 5);
  });

  it("counts free spin triggers and resets cleanly", () => {
    const h = new SpinHistory();
    const fs: FreeSpinSessionResult = {
      totalWin: 12,
      spins: [fakeEval(12)],
      spinsPlayed: 10,
      retriggers: 0,
    };
    h.push({ bet: 1, base: fakeEval(0), freeSpins: fs, totalWin: 12 });
    h.push({ bet: 1, base: fakeEval(0), freeSpins: null, totalWin: 0 });
    expect(h.stats().freeSpinTriggers).toBe(1);
    h.resetSession();
    expect(h.stats().spins).toBe(0);
    expect(h.stats().freeSpinTriggers).toBe(0);
    expect(h.recent()).toEqual([]);
  });
});
