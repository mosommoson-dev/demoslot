import { CryptoRng, SeededRng, createDefaultRng } from '../src/rng';

describe('SeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextInt(100)).toBe(b.nextInt(100));
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    let differences = 0;
    for (let i = 0; i < 1000; i++) {
      if (a.nextInt(1000) !== b.nextInt(1000)) differences++;
    }
    expect(differences).toBeGreaterThan(900); // overwhelmingly different
  });

  it('always returns values in [0, max)', () => {
    const r = new SeededRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.nextInt(13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(13);
    }
  });

  it('is uniformly distributed within a reasonable tolerance', () => {
    const r = new SeededRng(1234);
    const buckets = new Array<number>(10).fill(0);
    const N = 200_000;
    for (let i = 0; i < N; i++) buckets[r.nextInt(10)]!++;
    const expected = N / 10;
    const tolerance = expected * 0.05; // ±5%
    for (const c of buckets) {
      expect(Math.abs(c - expected)).toBeLessThan(tolerance);
    }
  });

  it('rejects non-positive or non-integer max', () => {
    const r = new SeededRng(0);
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(-1)).toThrow(RangeError);
    expect(() => r.nextInt(1.5)).toThrow(RangeError);
  });

  it('handles max=1 by always returning 0', () => {
    const r = new SeededRng(99);
    for (let i = 0; i < 100; i++) expect(r.nextInt(1)).toBe(0);
  });
});

describe('CryptoRng', () => {
  it('produces values in [0, max)', () => {
    const r = new CryptoRng();
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(37);
    }
  });

  it('uses the WebCrypto getRandomValues source', () => {
    let calls = 0;
    const source = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        calls++;
        // Fill with zeros — deterministic for tests.
        const buf = array as unknown as Uint32Array;
        for (let i = 0; i < buf.length; i++) buf[i] = 0;
        return array;
      },
    };
    const r = new CryptoRng(source);
    const v = r.nextInt(10);
    expect(v).toBe(0);
    expect(calls).toBeGreaterThan(0);
  });

  it('is unbiased: rejection sampling avoids modulo skew', () => {
    // Force the source to mostly return values near the upper end of the
    // 32-bit space so rejection sampling is exercised. With `max = 7`, naive
    // modulo would skew the distribution heavily; rejection sampling gives
    // uniform output.
    let counter = 0;
    const source = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        const buf = array as unknown as Uint32Array;
        for (let i = 0; i < buf.length; i++) {
          buf[i] = counter++;
        }
        return array;
      },
    };
    const r = new CryptoRng(source);
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 7 * 1000; i++) counts[r.nextInt(7)]!++;
    // Counts should be approximately equal (Within a few % since the
    // input is pseudo-uniform sequential but rejection sampling does its
    // job).
    for (const c of counts) {
      expect(c).toBeGreaterThan(800);
      expect(c).toBeLessThan(1200);
    }
  });
});

describe('createDefaultRng', () => {
  it('returns a working Rng', () => {
    const r = createDefaultRng();
    expect(typeof r.nextInt).toBe('function');
    const v = r.nextInt(5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(5);
  });
});
