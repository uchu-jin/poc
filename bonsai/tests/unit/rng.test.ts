import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';

const seeds = [0, 1, 12345, 2 ** 32 - 1];

describe('Rng', () => {
  it('同じ seed のとき、1,000 個の数列が一致する', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('state から作り直したとき、続きの数列が一致する', () => {
    const a = new Rng(7);
    for (let i = 0; i < 50; i++) a.next();
    const b = new Rng(a.state);
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it('1万個引いたとき、値は常に 0 以上 1 未満となる', () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it.each(seeds)('seed %i のとき、state は常に 0〜2^32−1 の整数となる', (seed) => {
    const r = new Rng(seed);
    expect(r.state).toBe(seed);
    for (let i = 0; i < 2000; i++) {
      r.next();
      expect(Number.isInteger(r.state)).toBe(true);
      expect(r.state).toBeGreaterThanOrEqual(0);
      expect(r.state).toBeLessThanOrEqual(2 ** 32 - 1);
    }
  });

  it('range(a, b) のとき、a 以上 b 未満となる', () => {
    const r = new Rng(3);
    for (let i = 0; i < 5000; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });
});
