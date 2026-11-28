import { describe, expect, it } from 'vitest';
import { snapDistance, snapValue } from '../../src/features/glyph-editor/snap';

describe('snapValue（値をグリッド刻みに丸める。上限・下限ちょうどにも止まる）', () => {
  it.each([
    [19, 20],
    [20, 20],
    [21, 20],
    [23, 25],
    [37, 25],
    [38, 50],
    [140, 150],
    [150, 150],
    [151, 150],
  ])('刻み 25・範囲 20〜150：%s → %s', (v, e) => {
    expect(snapValue(v, 25, 20, 150, true)).toBe(e);
  });
  it('刻み 10・50', () => {
    expect(snapValue(24, 10, 20, 150, true)).toBe(20);
    expect(snapValue(26, 10, 20, 150, true)).toBe(30);
    expect(snapValue(74, 50, 20, 150, true)).toBe(50);
    expect(snapValue(76, 50, 20, 150, true)).toBe(100);
  });
  it('吸着 OFF は 1 刻み', () => {
    expect(snapValue(37.4, 25, 20, 150, false)).toBe(37);
    expect(snapValue(19.6, 25, 20, 150, false)).toBe(20);
    expect(snapValue(150.4, 25, 20, 150, false)).toBe(150);
  });
  it('NaN → 下限（例外を投げない）', () => {
    expect(snapValue(NaN, 25, 20, 150, true)).toBe(20);
    expect(snapValue(NaN, 25, 20, 150, false)).toBe(20);
  });
});

describe('snapDistance（距離をグリッド刻みに丸める）', () => {
  it.each([
    [12, 0],
    [13, 25],
    [-13, -25],
    [12.5, 25],
    [-12.5, -25],
  ])('刻み 25：%s → %s', (d, e) => {
    expect(snapDistance(d, 25, true)).toBe(e);
  });
  it('−0 にしない', () => {
    expect(Object.is(snapDistance(-12, 25, true), -0)).toBe(false);
    expect(Object.is(snapDistance(-0.2, 25, false), -0)).toBe(false);
  });
  it('吸着 OFF は 1 刻み', () => {
    expect(snapDistance(12.6, 25, false)).toBe(13);
  });
});
