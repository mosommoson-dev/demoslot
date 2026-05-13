import { webcrypto } from 'node:crypto';

import type { Rng } from './types';

/** Minimal subset of the WebCrypto Crypto interface we depend on. */
interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

/**
 * Cryptographically secure RNG backed by WebCrypto's `getRandomValues`.
 *
 * `crypto.getRandomValues` is mandated by every certification lab (GLI-19,
 * BMM, eCOGRA) as an acceptable source of entropy. We use rejection sampling
 * on top of it to guarantee an unbiased uniform integer over [0, max). Naive
 * `Math.floor(random * max)` from a 32-bit RNG produces modulo bias whenever
 * `max` does not divide 2^32 evenly.
 */
export class CryptoRng implements Rng {
  private readonly buffer = new Uint32Array(1);

  private readonly source: CryptoLike;

  constructor(source?: CryptoLike) {
    // In Node 18+ webcrypto.getRandomValues is bound to the webcrypto object.
    // We accept an override for testability.
    this.source = source ?? (webcrypto as unknown as CryptoLike);
  }

  /**
   * Returns a uniformly distributed integer in [0, max).
   *
   * Uses rejection sampling so that the result is exactly uniform regardless
   * of whether `max` is a power of two.
   */
  nextInt(max: number): number {
    if (!Number.isInteger(max) || max <= 0) {
      throw new RangeError(`nextInt: max must be a positive integer, got ${max}`);
    }
    if (max === 1) return 0;

    // Largest multiple of `max` that fits in a uint32.
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    let value: number;
    do {
      this.source.getRandomValues(this.buffer);
      value = this.buffer[0]!;
    } while (value >= limit);
    return value % max;
  }
}

/**
 * Deterministic RNG used in tests. Backed by a Mulberry32 PRNG seeded by an
 * integer; produces reproducible spin sequences without leaking outside the
 * test files.
 */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new RangeError('SeededRng: seed must be finite');
    // Force into 32-bit space.
    this.state = (seed | 0) >>> 0;
  }

  private next32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }

  nextInt(max: number): number {
    if (!Number.isInteger(max) || max <= 0) {
      throw new RangeError(`nextInt: max must be a positive integer, got ${max}`);
    }
    if (max === 1) return 0;
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    let value: number;
    do {
      value = this.next32();
    } while (value >= limit);
    return value % max;
  }
}

/** Convenience factory: WebCrypto-backed RNG. */
export function createDefaultRng(): Rng {
  return new CryptoRng();
}
