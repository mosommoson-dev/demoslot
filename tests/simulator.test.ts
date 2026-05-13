import { SlotEngine } from '../src/engine';
import { SeededRng } from '../src/rng';
import { DEFAULT_WIN_BUCKETS, formatStatistics, simulate } from '../src/simulator';

describe('simulate (small sample sanity checks)', () => {
  it('runs the requested number of spins', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const stats = simulate(engine, { simulations: 1000, bet: 1 });
    expect(stats.simulations).toBe(1000);
    expect(stats.totalBet).toBe(1000);
  });

  it('rejects non-positive simulation counts', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    expect(() => simulate(engine, { simulations: 0 })).toThrow();
    expect(() => simulate(engine, { simulations: -1 })).toThrow();
    expect(() => simulate(engine, { simulations: 1.5 })).toThrow();
  });

  it('returns RTP within plausible bounds (medium sample)', () => {
    const engine = new SlotEngine(undefined, new SeededRng(987654));
    const stats = simulate(engine, { simulations: 50_000, bet: 1 });
    // At 50K spins the 95% CI is roughly ±5%; verify we land somewhere in
    // [80%, 115%] which encompasses target ±5%.
    expect(stats.rtp).toBeGreaterThan(0.80);
    expect(stats.rtp).toBeLessThan(1.15);
    expect(stats.hitFrequency).toBeGreaterThan(0.4);
    expect(stats.hitFrequency).toBeLessThan(0.7);
  });

  it('reports a non-zero standard error estimate', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const stats = simulate(engine, { simulations: 5000, bet: 1 });
    expect(stats.rtpStdError).toBeGreaterThan(0);
    // Sanity: std error should be at most ~10% with only 5K spins.
    expect(stats.rtpStdError).toBeLessThan(0.5);
  });

  it('produces win-distribution buckets covering the configured ranges', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const stats = simulate(engine, { simulations: 5000, bet: 1 });
    expect(stats.winDistribution).toHaveLength(DEFAULT_WIN_BUCKETS.length);
    // Counts must sum to no more than total simulations.
    const total = stats.winDistribution.reduce((s, b) => s + b.count, 0);
    expect(total).toBeLessThanOrEqual(stats.simulations);
  });

  it('decomposes total RTP into base and free-spin components', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const stats = simulate(engine, { simulations: 10_000, bet: 1 });
    expect(stats.rtp).toBeCloseTo(stats.rtpBase + stats.rtpFreeSpins, 8);
  });

  it('calls the progress callback at the configured cadence', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const calls: number[] = [];
    simulate(engine, {
      simulations: 1000,
      bet: 1,
      progressEvery: 250,
      onProgress: (n) => {
        calls.push(n);
      },
    });
    expect(calls).toEqual([250, 500, 750, 1000]);
  });
});

describe('formatStatistics', () => {
  it('produces a multi-line human-readable summary', () => {
    const engine = new SlotEngine(undefined, new SeededRng(1));
    const stats = simulate(engine, { simulations: 1000, bet: 1 });
    const text = formatStatistics(stats);
    expect(text).toContain('RTP overall:');
    expect(text).toContain('Hit frequency:');
    expect(text).toContain('Win distribution');
    expect(text.split('\n').length).toBeGreaterThan(5);
  });
});
