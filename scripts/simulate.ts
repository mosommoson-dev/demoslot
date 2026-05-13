/**
 * CLI entry point: run a long-running RTP simulation and print the report.
 *
 * Usage:
 *   npm run simulate                    # 1M spins, bet=1
 *   npm run simulate -- --spins 2000000 # 2M spins
 *   npm run simulate -- --bet 0.20      # bet 0.20 per spin
 */
import { SlotEngine, gridToString } from '../src/engine';
import { formatStatistics, simulate } from '../src/simulator';

function parseArgs(): { spins: number; bet: number } {
  const args = process.argv.slice(2);
  let spins = 1_000_000;
  let bet = 1;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--spins') spins = Number(args[++i]);
    else if (a === '--bet') bet = Number(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: simulate [--spins N] [--bet B]');
      process.exit(0);
    }
  }
  return { spins, bet };
}

function main(): void {
  const { spins, bet } = parseArgs();
  const engine = new SlotEngine();

  // Show 3 sample spins so the developer can eyeball the visual output.
  console.log('Sample spins (visual sanity check):');
  for (let i = 0; i < 3; i++) {
    const round = engine.playRound(bet);
    console.log(`\n--- Spin ${i + 1} (totalWin=${round.totalWin.toFixed(2)}) ---`);
    console.log(gridToString(round.base.grid));
    if (round.base.lineWins.length > 0) {
      console.log(`Lines:`);
      for (const w of round.base.lineWins) {
        console.log(`  line=${w.lineIndex} ${w.symbol} x${w.matchLength} -> ${w.amount.toFixed(2)}`);
      }
    }
    if (round.base.scatter.count >= 3) {
      console.log(`Scatter x${round.base.scatter.count} -> ${round.base.scatter.amount.toFixed(2)} (free spins triggered)`);
    }
  }

  console.log(`\nRunning RTP simulation: ${spins.toLocaleString()} spins @ bet=${bet}...`);
  const start = Date.now();
  let lastProgress = start;
  const stats = simulate(engine, {
    simulations: spins,
    bet,
    onProgress: (n, partial) => {
      const now = Date.now();
      if (now - lastProgress > 5_000) {
        lastProgress = now;
        const rate = (n / ((now - start) / 1000)).toFixed(0);
        console.log(`  ${n.toLocaleString()} spins  RTP=${(partial.rtp * 100).toFixed(3)}%  ${rate} spins/s`);
      }
    },
  });
  const elapsed = (Date.now() - start) / 1000;
  console.log(`\n${formatStatistics(stats)}\n\nElapsed: ${elapsed.toFixed(1)}s (${(spins / elapsed).toFixed(0)} spins/s)`);
}

main();
