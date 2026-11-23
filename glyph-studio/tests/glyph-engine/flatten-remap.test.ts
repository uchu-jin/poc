import { describe, expect, it } from 'vitest';
import { flattenStroke } from '../../src/features/glyph-engine/flatten';
import { remapY } from '../../src/features/glyph-engine/verticalRemap';
import type { Stroke } from '../../src/features/glyph-engine/types';

const pt = (id: string, x: number, y: number) => ({ id, x, y });

describe('flattenStroke', () => {
  it('直線 1 本 → 両端の 2 点', () => {
    const s: Stroke = { start: pt('a', 0, 0), segments: [{ kind: 'line', to: pt('b', 0, 700) }] };
    expect(flattenStroke(s)).toEqual([
      [0, 0],
      [0, 700],
    ]);
  });

  it('3 次ベジェ 1 本 → 17 点で、始点・終点が一致', () => {
    const s: Stroke = {
      start: pt('a', 0, 0),
      segments: [
        { kind: 'cubic', c1: pt('b', 0, 100), c2: pt('c', 100, 200), to: pt('d', 200, 200) },
      ],
    };
    const p = flattenStroke(s);
    expect(p).toHaveLength(17);
    expect(p[0]).toEqual([0, 0]);
    expect(p[16]).toEqual([200, 200]);
  });

  it('閉じた線 → 最後の点が最初と重複しない', () => {
    const s: Stroke = {
      closed: true,
      start: pt('a', 0, 0),
      segments: [
        { kind: 'line', to: pt('b', 100, 0) },
        { kind: 'line', to: pt('c', 100, 100) },
        { kind: 'line', to: pt('d', 0, 0) },
      ],
    };
    expect(flattenStroke(s)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('直線のあとにベジェが続く線 → つなぎ目の点が 2 回入らない', () => {
    const s: Stroke = {
      start: pt('a', 0, 0),
      segments: [
        { kind: 'line', to: pt('b', 0, 300) },
        { kind: 'cubic', c1: pt('c', 0, 400), c2: pt('d', 100, 500), to: pt('e', 200, 500) },
      ],
    };
    const p = flattenStroke(s);
    expect(p).toHaveLength(2 + 16);
    for (let i = 1; i < p.length; i++) expect(p[i]).not.toEqual(p[i - 1]);
  });
});

describe('remapY（FR-019）', () => {
  it('x ハイト 420（下限）', () => {
    expect(remapY(0, 420)).toBe(0);
    expect(remapY(500, 420)).toBe(420);
    expect(remapY(250, 420)).toBe(210);
    expect(remapY(625, 420)).toBe(585);
    expect(remapY(750, 420)).toBe(750);
    expect(remapY(-100, 420)).toBe(-100);
    expect(remapY(-250, 420)).toBe(-250);
  });

  it('x ハイト 580（上限）', () => {
    expect(remapY(500, 580)).toBe(580);
    expect(remapY(625, 580)).toBe(665);
    expect(remapY(750, 580)).toBe(750);
    expect(remapY(-100, 580)).toBe(-100);
  });

  it('750 より上は動かさない（仮置き）', () => {
    for (const xh of [420, 580]) {
      expect(remapY(800, xh)).toBe(800);
      expect(remapY(1000, xh)).toBe(1000);
    }
  });

  it('基準の x ハイト 500 では変わらない', () => {
    for (const y of [-250, 0, 123, 500, 640, 750, 900]) expect(remapY(y, 500)).toBe(y);
  });
});
