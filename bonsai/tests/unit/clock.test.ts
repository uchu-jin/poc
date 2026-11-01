import { describe, expect, it } from 'vitest';
import { computeTicks, progress } from '../../src/core/clock';
import { GROWTH_STEP_MS, TIME_FLOOR } from '../../src/core/constants';

const H = GROWTH_STEP_MS;
const T0 = TIME_FLOOR + 1_000_000;

describe('computeTicks', () => {
  it('経過が 6 時間のとき、6 ステップとなる', () => {
    expect(computeTicks(T0 + 6 * H, T0, 1)).toEqual({ steps: 6, lastTickAt: T0 + 6 * H });
  });

  it('経過が 3,599,999ms のとき 0、3,600,000ms のとき 1 ステップとなる', () => {
    expect(computeTicks(T0 + H - 1, T0, 1).steps).toBe(0);
    expect(computeTicks(T0 + H, T0, 1).steps).toBe(1);
  });

  it('経過が 6 時間 59 分のとき、6 ステップで端数 59 分が lastTickAt に残る', () => {
    const r = computeTicks(T0 + 6 * H + 59 * 60_000, T0, 1);
    expect(r.steps).toBe(6);
    expect(r.lastTickAt).toBe(T0 + 6 * H);
  });

  it('経過が負のとき、0 ステップで lastTickAt は now となる', () => {
    expect(computeTicks(T0 - 5000, T0, 1)).toEqual({ steps: 0, lastTickAt: T0 - 5000 });
  });

  it('now が TIME_FLOOR より前で経過が負のとき、lastTickAt は TIME_FLOOR となる', () => {
    expect(computeTicks(TIME_FLOOR - 10, TIME_FLOOR + 5, 1)).toEqual({
      steps: 0,
      lastTickAt: TIME_FLOOR,
    });
  });

  it('speed 3600 で 1,000ms のとき、1 ステップとなる', () => {
    expect(computeTicks(T0 + 1000, T0, 3600)).toEqual({ steps: 1, lastTickAt: T0 + 1000 });
  });

  it('speed 7 で 16ms ずつ 10 万回呼んだとき、合計ステップが一度に計算した値と一致し lastTickAt は常に整数となる', () => {
    let last = T0;
    let total = 0;
    let now = T0;
    for (let i = 0; i < 100_000; i++) {
      now += 16;
      const r = computeTicks(now, last, 7);
      total += r.steps;
      last = r.lastTickAt;
      expect(Number.isInteger(last)).toBe(true);
    }
    const once = computeTicks(now, T0, 7);
    expect(total).toBe(once.steps);
  });
});

describe('progress', () => {
  it('経過 0 のとき、0 となる', () => {
    expect(progress(T0, T0, 1)).toBe(0);
  });

  it('途中のとき、0 以上 1 未満の割合となる', () => {
    expect(progress(T0 + H / 2, T0, 1)).toBeCloseTo(0.5, 10);
  });

  it('経過が GROWTH_STEP_MS−1 のとき、1 未満となる', () => {
    const p = progress(T0 + H - 1, T0, 1);
    expect(p).toBeGreaterThan(0.99);
    expect(p).toBeLessThan(1);
  });

  it('経過が負のとき、0 となる', () => {
    expect(progress(T0 - 1, T0, 1)).toBe(0);
  });
});
