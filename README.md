# slot-math-engine

A production-grade math engine for a 5×3, 20-payline video slot.

* **RTP**: 96.51% (measured over 5,000,000 spins; target 96.5%)
* **Hit frequency**: ~53.5%
* **Volatility**: medium-high
* **Free-spin trigger frequency**: ≈ 1 in 138 spins
* **Bet range**: 0.20 – 100

The engine is implemented in **TypeScript** with **strict** type checking, uses
`crypto.getRandomValues` for cryptographically strong RNG, and ships with a
Jest test suite, a deterministic simulator and a CLI for balancing the reels.

This repo is pure math: there is no UI, no networking, no persistence. Use
the `SlotEngine` class as the deterministic core of a slot game.

---

## Quick start

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint
npm test            # jest unit tests (60 tests)
npm run balance     # exact theoretical line-pay RTP via enumeration
npm run simulate    # Monte-Carlo simulation, 1M spins by default
npm run simulate -- --spins 5000000 --bet 1   # 5M-spin run used to validate RTP
```

The `simulate` script prints a few sample spins, a streaming progress update
every 350K spins, and a full breakdown at the end:

```text
RTP overall:     96.5067%  (±0.2512% @95%CI)
  Base game:     78.7718%
  Free spins:    17.7349%
Hit frequency:   53.4655%
Free-spin trig.: 0.7243% ( ~1 in 138 )
Avg FS payout:   24.48x bet

Win distribution (per paid spin, as multiples of total bet):
  0x – 0.5x        count=  561859  (11.2372%)  avg=0.35x
  0.5x – 1x        count=  747534  (14.9507%)  avg=0.71x
  1x – 2x          count=  745427  (14.9085%)  avg=1.38x
  2x – 5x          count=  499535  (9.9907%)  avg=2.96x
  5x – 10x         count=   72990  (1.4598%)  avg=6.37x
  ...
```

---

## Architecture

```
src/
  types.ts        Public type vocabulary (SymbolId, Grid, SpinEvaluation, ...).
  rng.ts          Cryptographically-secure RNG with rejection sampling.
                  Plus a Mulberry32 seeded RNG for deterministic tests.
  paytable.ts     The pay table. 5-of-a-kind values come from the spec;
                  3/4-of-a-kind values were tuned empirically (see below).
  paylines.ts     The 20 paylines (rows 0..2) indexed [reel][line].
  reels.ts        ReelStrip class + the 5 default reel strips.
  engine.ts       SlotEngine: spin(), evaluateWins(), playRound(),
                  playFreeSpinSession() + theoretical helpers.
  theoretical.ts  Exact analytical RTP by enumerating all 11^5 = 161,051
                  symbol tuples per payline. Runs in <100 ms.
  simulator.ts    Monte-Carlo simulator. Returns RtpStatistics including
                  RTP std error (95% CI), hit freq, win distribution buckets.
  index.ts        Public surface.

tests/
  rng.test.ts            16 tests on the RNGs (uniformity, rejection sampling).
  reels.test.ts          11 tests on ReelStrip + DEFAULT_REELS invariants.
  engine.test.ts         24 tests on every SlotEngine public method.
  simulator.test.ts       7 tests on the Monte-Carlo simulator.
  rtp.test.ts             4 integration tests verifying the calibrated RTP.

scripts/
  balance.ts      Diagnostic CLI: prints reel weights, per-symbol 5OAK
                  probabilities and the exact theoretical line-pay RTP.
  simulate.ts     Monte-Carlo CLI: 1M-spin RTP measurement by default.
```

---

## Math reference

### 1. Grid representation

A spin produces a `Grid`: 5 columns × 3 rows. Each column is an
independent draw from its reel strip — a single uniform integer in
`[0, strip.length)` chosen by the RNG, followed by reading the
3 consecutive stops with wrap-around. Independence across reels is
the cornerstone of every closed-form probability calculation below.

### 2. Paylines

20 fixed paylines (`src/paylines.ts`). Each payline is a length-5 array
of row indices. The first 3 are the horizontal lines (top, middle,
bottom), then `V`, inverted `V`, and 15 zig-zags. Pay evaluation is
**leftmost-anchored**:

* If the symbol on reel 0 is `SCATTER`, the line cannot win.
* Otherwise the *anchor* is the first non-`WILD` symbol on the line
  (or `WILD` if every contributing reel is wild).
* Extend the run as long as each reel shows either the anchor symbol
  or a wild.
* The pay is `paytable[anchor][runLength]` *in bet-per-line units*,
  i.e. `(totalBet / 20) * paytable[anchor][runLength]`.
* If the leading wilds themselves would pay more under the WILD
  schedule (3+ leading wilds), the player receives that instead.

This means each line wins for **exactly one** symbol — the
expected-value contributions across symbols on a given line are
disjoint, which simplifies the math.

### 3. Scatter detection

`SCATTER` pays *anywhere* on the grid (no payline restriction) and
the pay is a multiplier of the **total bet**, not bet-per-line. 3
or more scatters trigger free spins.

### 4. Free spins

* **10 free spins** awarded per trigger.
* All wins (line + scatter) are multiplied by **×3** during the
  free-spin session.
* **Retriggers**: landing 3+ scatters again during a free spin
  adds **+5** spins. Cap: 50 spins to avoid pathological runaways.

### 5. RTP decomposition

```
RTP_total = RTP_line + RTP_scatter + RTP_freeSpins
```

For the calibrated engine, this decomposes as:

| Component         | Contribution |
|-------------------|-------------:|
| Line pays         |       ≈ 76 % |
| Scatter pays      |        ≈ 3 % |
| Free spin session |     ≈ 17.7 % |
| **Total**         | **96.51 %**  |

### 6. Exact line-pay RTP

Because reels are independent, the expected line pay can be computed
exactly by enumerating all 11⁵ = 161,051 possible
`(s₀, s₁, s₂, s₃, s₄)` symbol tuples:

```
E[pay_line] = Σ over symbol-tuples t [ P(t) × payForLine(t) ]
P(t)        = Π_{reel r} count_of(t_r, reel_r) / length(reel_r)
```

`scripts/balance.ts` runs this in well under 100 ms across all 20
paylines and prints `Line pays only: 76.x%`. This is the
ground-truth target the Monte-Carlo simulation converges toward.

### 7. Variance & confidence intervals

The simulator records `Σwin` and `Σwin²` per spin and reports the
sample standard error of RTP at 95 % confidence:

```
σ̂(RTP) = sqrt( (Var[win]) / N ) / bet
CI95   = 1.96 · σ̂(RTP)
```

| Spins   | Typical CI95 |
|---------|-------------:|
| 100 000 |      ±1.4 %  |
| 500 000 |      ±0.6 %  |
| 1 000 000 |    ±0.4 %  |
| 5 000 000 |    ±0.25 % |

---

## RNG

The default RNG is `CryptoRng`, which wraps `crypto.getRandomValues`
and produces unbiased integers in `[0, max)` via **rejection
sampling**:

```text
range = 2^32 - (2^32 mod max)   // largest multiple of `max` that fits in 32 bits
do
  draw u ∈ [0, 2^32)
while u >= range
return u mod max
```

This avoids the small bias of `Math.floor(Math.random() * max)`
when `max` is not a power of 2.

`SeededRng` (Mulberry32) is used by the test suite to obtain
deterministic spin sequences; it is **not** intended for production.

---

## Balancing methodology

The engine was tuned to land at 96.5 % RTP using the following loop:

1. **Build the reel strips.** Each strip is a hand-tuned list of
   `SymbolId`s. Outer reels (1 & 5) have **no WILD** so that the
   top WILD-line pay (1000×) only fires when middle reels conspire.
   Middle reels (2, 3, 4) carry **4 WILDs each**, which dramatically
   increases the per-line match probability for *every* symbol via
   substitution. Each reel carries exactly **1 SCATTER**, giving a
   ~0.72 % free-spin trigger rate.

2. **Set 5-of-a-kind pays** from the spec
   (A=500, B=250, …, I=20, WILD=1000).

3. **Compute the exact line-pay RTP** by enumeration
   (`scripts/balance.ts`). This is fast (≈50 ms) and deterministic,
   so it can be used inside a tight tuning loop.

4. **Adjust 3- and 4-of-a-kind pays** (the only free parameters)
   until the exact line-pay RTP lands around 76–80 %. Higher
   multipliers help the low symbols (E..I) more than the high ones
   because the low symbols are far more frequent.

5. **Validate scatter + free-spin contribution** with a
   100K-spin Monte-Carlo run (`scripts/simulate.ts --spins 100000`).
   The free-spin session contributes
   `P(trigger) × E[freeSpins × payout]` ≈ 0.0072 × 10 × 3 × 0.79 ≈ 17 %.

6. **Final calibration**: 5 M-spin Monte-Carlo run. The current
   configuration lands at **96.5067 %** with ±0.25 % at 95 % CI.

The full transcript of intermediate tunings is in the git history.

### Final paytable

| Symbol | 3-of-a-kind | 4-of-a-kind | 5-of-a-kind |
|:------:|------------:|------------:|------------:|
| WILD   |          75 |         250 |        1000 |
| A      |          72 |         190 |         500 |
| B      |          36 |          92 |         250 |
| C      |          23 |          58 |         150 |
| D      |          17 |          41 |         100 |
| E      |          12 |          32 |          50 |
| F      |          10 |          27 |          40 |
| G      |           9 |          22 |          30 |
| H      |           7 |          16 |          25 |
| I      |           5 |          13 |          20 |
| SCATTER pays on TOTAL bet:  3→2x, 4→10x, 5→50x         |

### Final reel composition

| Reel | Length | A | B | C | D | E | F | G | H | I | WILD | SCATTER |
|-----:|------:|--:|--:|--:|--:|--:|--:|--:|--:|--:|----:|--------:|
| 1    |    28 | 1 | 1 | 2 | 3 | 3 | 3 | 4 | 5 | 5 |   0 |       1 |
| 2    |    35 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 6 | 8 |   4 |       1 |
| 3    |    35 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 6 | 8 |   4 |       1 |
| 4    |    35 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 6 | 8 |   4 |       1 |
| 5    |    28 | 1 | 1 | 2 | 3 | 3 | 3 | 4 | 5 | 5 |   0 |       1 |

---

## API

```ts
import { SlotEngine, simulate, formatStatistics } from 'slot-math-engine';

const engine = new SlotEngine();           // default reels + paytable

// Single spin (no win evaluation).
const grid = engine.spin();

// Evaluate wins for a given grid at a given bet.
const evalResult = engine.evaluateWins(grid, /* bet */ 1);
console.log(evalResult.totalWin, evalResult.lineWins, evalResult.scatter);

// Play a full round (base spin + free spins if triggered).
const round = engine.playRound(/* bet */ 1);
console.log(round.totalWin);

// 1 M-spin Monte-Carlo with progress callback.
const stats = simulate(engine, {
  simulations: 1_000_000,
  bet: 1,
  onProgress: (n, partial) => console.log(`${n}: ${partial.toFixed(3)}`),
});
console.log(formatStatistics(stats));
```

All public symbols are re-exported from `src/index.ts`.

---

## License

MIT (project is a self-contained reference implementation; the
paytable and reel weights are illustrative and not derived from
any specific commercial game).
