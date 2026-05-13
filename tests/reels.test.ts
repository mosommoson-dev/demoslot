import { DEFAULT_REELS, ReelStrip } from '../src/reels';
import { SeededRng } from '../src/rng';

describe('ReelStrip', () => {
  it('throws when constructed from an empty array', () => {
    expect(() => new ReelStrip([])).toThrow(RangeError);
  });

  it('preserves the input sequence', () => {
    const strip = new ReelStrip(['A', 'B', 'C', 'D']);
    expect(strip.length).toBe(4);
    expect(Array.from(strip.symbols)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('computes weights correctly', () => {
    const strip = new ReelStrip(['A', 'A', 'B', 'C', 'A']);
    const w = strip.weights();
    expect(w.get('A')).toBe(3);
    expect(w.get('B')).toBe(1);
    expect(w.get('C')).toBe(1);
    expect(w.get('D')).toBeUndefined();
  });

  it('produces a window of windowSize symbols', () => {
    const strip = new ReelStrip(['A', 'B', 'C', 'D', 'E']);
    const r = new SeededRng(0);
    const window = strip.spin(r, 3);
    expect(window).toHaveLength(3);
  });

  it('wraps around the strip when the stop is near the end', () => {
    const strip = new ReelStrip(['A', 'B', 'C', 'D', 'E']);
    // Stub RNG that always returns the last index.
    const stub = { nextInt: () => 4 };
    const window = strip.spin(stub, 3);
    expect(window).toEqual(['E', 'A', 'B']);
  });

  it('respects windowSize correctness check', () => {
    const strip = new ReelStrip(['A']);
    const r = new SeededRng(0);
    expect(() => strip.spin(r, 0)).toThrow(RangeError);
    expect(() => strip.spin(r, -1)).toThrow(RangeError);
    expect(() => strip.spin(r, 1.5)).toThrow(RangeError);
  });

  it('window symbols are uniformly drawn from the strip over many spins', () => {
    const strip = new ReelStrip([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'WILD',
    ]);
    const r = new SeededRng(99);
    const counts = new Map<string, number>();
    const N = 50_000;
    for (let i = 0; i < N; i++) {
      const window = strip.spin(r, 3);
      for (const s of window) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    // Each symbol should appear roughly N * 3 / 10 times.
    const expected = (N * 3) / 10;
    for (const [, c] of counts) {
      expect(Math.abs(c - expected)).toBeLessThan(expected * 0.05);
    }
  });
});

describe('DEFAULT_REELS', () => {
  it('contains 5 strips with expected lengths', () => {
    expect(DEFAULT_REELS).toHaveLength(5);
    expect(DEFAULT_REELS[0]).toHaveLength(28);
    expect(DEFAULT_REELS[1]).toHaveLength(35);
    expect(DEFAULT_REELS[2]).toHaveLength(35);
    expect(DEFAULT_REELS[3]).toHaveLength(35);
    expect(DEFAULT_REELS[4]).toHaveLength(28);
  });

  it('places exactly one SCATTER on every reel', () => {
    for (const reel of DEFAULT_REELS) {
      const count = reel.filter((s) => s === 'SCATTER').length;
      expect(count).toBe(1);
    }
  });

  it('places NO WILDs on reels 1 and 5 (the outer reels)', () => {
    expect(DEFAULT_REELS[0]!.filter((s) => s === 'WILD').length).toBe(0);
    expect(DEFAULT_REELS[4]!.filter((s) => s === 'WILD').length).toBe(0);
  });

  it('places WILDs on reels 2, 3, 4 (the middle reels)', () => {
    for (let i = 1; i <= 3; i++) {
      expect(DEFAULT_REELS[i]!.filter((s) => s === 'WILD').length).toBeGreaterThan(0);
    }
  });
});
