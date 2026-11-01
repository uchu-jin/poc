import { describe, expect, it } from 'vitest';
import { FADE_MS, InkFade, growthScale } from '../../src/render/growth-view';

describe('growthScale', () => {
  it('最後のステップで生まれた節は progress 0 のとき長さ 0 となる', () => {
    expect(growthScale(5, 5, 0)).toBe(0);
  });
  it('最後のステップで生まれた節は progress 0.5 のとき半分となる', () => {
    expect(growthScale(5, 5, 0.5)).toBe(0.5);
  });
  it('最後のステップで生まれた節は progress が 1 未満の最大値のときほぼ全長となる', () => {
    const p = 1 - Number.EPSILON;
    expect(growthScale(5, 5, p)).toBeCloseTo(1, 10);
    expect(growthScale(5, 5, p)).toBeLessThan(1);
  });
  it('progress が範囲外のときは 0〜1 にクランプされる', () => {
    expect(growthScale(5, 5, -0.5)).toBe(0);
    expect(growthScale(5, 5, 1.5)).toBe(1);
  });
  it('bornAge が age より小さい節は常に全長となる', () => {
    expect(growthScale(4, 5, 0)).toBe(1);
    expect(growthScale(4, 5, 0.5)).toBe(1);
    expect(growthScale(0, 5, 0)).toBe(1);
  });
  it('age が 0（種）のときも壊れず progress に従う', () => {
    expect(growthScale(0, 0, 0.25)).toBe(0.25);
    expect(Number.isFinite(growthScale(0, 0, 0))).toBe(true);
  });
});

describe('InkFade', () => {
  it('FADE_MS は 1000 となる', () => {
    expect(FADE_MS).toBe(1000);
  });
  it('初めて見た瞬間（0ms）は淡い墨の 0 となる', () => {
    const f = new InkFade();
    f.observe([1], 1000, false);
    expect(f.amount(1, 1000)).toBe(0);
  });
  it('初めて見てから 500ms のときは中間の 0.5 となる', () => {
    const f = new InkFade();
    f.observe([1], 1000, false);
    expect(f.amount(1, 1500)).toBeCloseTo(0.5, 10);
  });
  it('初めて見てから 1000ms 以上のときは本来の濃さ 1 となる', () => {
    const f = new InkFade();
    f.observe([1], 1000, false);
    expect(f.amount(1, 2000)).toBe(1);
    expect(f.amount(1, 99999)).toBe(1);
  });
  it('initial が true のときは最初から 1 となる', () => {
    const f = new InkFade();
    f.observe([1, 2], 1000, true);
    expect(f.amount(1, 1000)).toBe(1);
    expect(f.amount(2, 1000)).toBe(1);
  });
  it('未登録の id は 1 となる', () => {
    expect(new InkFade().amount(42, 0)).toBe(1);
  });
  it('二度目の observe では最初の時刻が保たれる', () => {
    const f = new InkFade();
    f.observe([1], 1000, false);
    f.observe([1], 1800, false);
    expect(f.amount(1, 1500)).toBeCloseTo(0.5, 10);
  });
  it('reset のあとは表が空になり 1 を返す', () => {
    const f = new InkFade();
    f.observe([1], 1000, false);
    f.reset();
    expect(f.amount(1, 1000)).toBe(1);
  });
});

describe('InkFade：起動時の節を次の作り直しでにじませない', () => {
  it('initial で見た節は、あとで initial=false で見直しても本来の濃さのままとなる', () => {
    const f = new InkFade();
    f.observe([0, 1], 1000, true);
    f.observe([0, 1, 2], 2000, false);
    expect(f.amount(0, 2000)).toBe(1);
    expect(f.amount(1, 2000)).toBe(1);
    expect(f.amount(2, 2000)).toBe(0);
  });
});
