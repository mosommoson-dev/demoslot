/**
 * Diagnostic tool used during reel-strip tuning.
 *
 * Prints, for each regular symbol, the theoretical 5-of-a-kind probability
 * and its RTP contribution. Use this to decide which weights to tweak when
 * the simulated RTP is too high / too low.
 *
 * Usage:
 *   npm run balance
 */
import { PAYTABLE } from '../src/paytable';
import { PAYLINES } from '../src/paylines';
import { SlotEngine } from '../src/engine';
import { totalTheoreticalLineRtp } from '../src/theoretical';
import type { RegularSymbolId } from '../src/types';

const REGULAR_SYMBOLS: RegularSymbolId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

function main(): void {
  const engine = new SlotEngine();

  console.log('Per-reel weights:');
  engine.strips.forEach((strip, i) => {
    const w = strip.weights();
    const sorted = Array.from(w.entries()).sort((a, b) => b[1] - a[1]);
    const summary = sorted.map(([s, n]) => `${s}=${n}`).join(' ');
    console.log(`  Reel ${i + 1} (len=${strip.length}): ${summary}`);
  });

  console.log('\nTheoretical 5-of-a-kind probability per regular symbol on one line:');
  console.log('  (probability that 5 reels each show that symbol or a WILD)');
  console.log('  RTP contribution = P(5oak per line) * pay5 / numLines * numLines');
  console.log('                    = P(5oak per line) * pay5  (in total-bet RTP units)');
  for (const sym of REGULAR_SYMBOLS) {
    const p5 = engine.theoretical5OfAKind(sym);
    const pay5 = PAYTABLE[sym][5];
    const contribution = p5 * pay5; // == fraction of total bet contributed by 5oak hits
    console.log(`  ${sym}: P(5oak)=${p5.toExponential(3)}  pay5=${pay5.toString().padStart(4)}  RTP@5oak=${(contribution * 100).toFixed(4)}%`);
  }

  console.log('\nExact theoretical line-pay RTP (enumerating all 11^5 tuples per line):');
  const lineRtp = totalTheoreticalLineRtp(engine.strips, PAYLINES, PAYTABLE);
  console.log(`  Line pays only: ${(lineRtp * 100).toFixed(3)}%`);
  console.log('\nRun `npm run simulate` to also measure scatter / free-spin contributions.');
}

main();
