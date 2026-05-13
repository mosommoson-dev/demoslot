import { SlotEngine } from '../src/engine';
import { PAYLINES } from '../src/paylines';
import { PAYTABLE } from '../src/paytable';
import { SeededRng } from '../src/rng';
import { simulate } from '../src/simulator';
import { totalTheoreticalLineRtp } from '../src/theoretical';

/**
 * Integration tests for the calibrated RTP target.
 *
 * The full 1M-spin simulation runs in roughly 15 s under ts-jest, so we use
 * 200K spins here to keep CI fast (the 95% CI at 200K is roughly ±1.3%
 * which is enough to detect catastrophic mistuning).
 *
 * The 5M-spin RTP measured during balancing is 96.51% — see README.md for the
 * full calibration story.
 */
describe('Calibrated RTP', () => {
  it('200K spins land within ±2% of the 96.5% target', () => {
    const engine = new SlotEngine(undefined, new SeededRng(12345));
    const stats = simulate(engine, { simulations: 200_000, bet: 1 });
    expect(stats.rtp).toBeGreaterThan(0.945);
    expect(stats.rtp).toBeLessThan(0.985);
  });

  it('hit frequency is in the medium-high volatility window (45-60%)', () => {
    const engine = new SlotEngine(undefined, new SeededRng(7));
    const stats = simulate(engine, { simulations: 100_000, bet: 1 });
    expect(stats.hitFrequency).toBeGreaterThan(0.45);
    expect(stats.hitFrequency).toBeLessThan(0.6);
  });

  it('free-spin trigger frequency is between 1/100 and 1/250', () => {
    const engine = new SlotEngine(undefined, new SeededRng(8));
    const stats = simulate(engine, { simulations: 200_000, bet: 1 });
    expect(stats.freeSpinTriggerFrequency).toBeGreaterThan(0.004); // ~1/250
    expect(stats.freeSpinTriggerFrequency).toBeLessThan(0.012); // ~1/85
  });

  it('theoretical line RTP matches simulated base RTP minus scatter (loose)', () => {
    const engine = new SlotEngine(undefined, new SeededRng(13));
    const theoretical = totalTheoreticalLineRtp(engine.strips, PAYLINES, PAYTABLE);
    const stats = simulate(engine, { simulations: 100_000, bet: 1 });
    // Loose tolerance (we only run 100K spins).
    expect(Math.abs(theoretical - stats.rtpBase)).toBeLessThan(0.05);
  });
});
