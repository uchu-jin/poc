import { describe, expect, it } from 'vitest';
import { expandToTriangles, strokeWidthAt } from '../../src/features/glyph-engine/expand';
import { unionPolys } from '../../src/features/glyph-engine/union';
import { flattenStroke } from '../../src/features/glyph-engine/flatten';
import { crossSection, holeCount } from '../../src/features/glyph-engine/geometry';
import type { Stroke, Vec } from '../../src/features/glyph-engine/types';

const W = { weight: 120, hWeight: 40 };

describe('strokeWidthAt（FR-020）', () => {
  it('水平 → 横線の太さ、垂直 → 太さ、45° → その間', () => {
    expect(strokeWidthAt([1, 0], W)).toBeCloseTo(40);
    expect(strokeWidthAt([0, 1], W)).toBeCloseTo(120);
    expect(strokeWidthAt([Math.SQRT1_2, Math.SQRT1_2], W)).toBeCloseTo(40 + 80 * Math.SQRT1_2);
  });
  it('太さ＝横線の太さなら向きによらず同じ', () => {
    for (const t of [
      [1, 0],
      [0, 1],
      [0.6, 0.8],
    ] as Vec[])
      expect(strokeWidthAt(t, { weight: 90, hWeight: 90 })).toBeCloseTo(90);
  });
  it('逆コントラスト（横線の太さ > 太さ）', () => {
    expect(strokeWidthAt([1, 0], { weight: 40, hWeight: 160 })).toBeCloseTo(160);
    expect(strokeWidthAt([0, 1], { weight: 40, hWeight: 160 })).toBeCloseTo(40);
  });
});

// 本番と同じ経路（三角形に分けて合成）で、点ごとの太さを確かめる
const swap = (o: Vec[][]) => o.map((r) => r.map(([x, y]) => [y, x] as Vec));
const widthOf = (spans: [number, number][]) => spans.map(([a, b]) => b - a);
const merged = (pts: Vec[], closed: boolean) => {
  const r = unionPolys(expandToTriangles(pts, closed, W));
  if (!r.ok) throw new Error(r.message);
  return r.outline;
};

describe('膨らませ（三角形に分けて合成した結果）', () => {
  it('水平の線 → 横線の太さ 40、垂直の線 → 太さ 120', () => {
    const h = merged(
      [
        [0, 0],
        [100, 0],
      ],
      false,
    );
    expect(widthOf(crossSection(swap(h), 50))).toEqual([expect.closeTo(40, 0)]);
    const v = merged(
      [
        [0, 0],
        [0, 100],
      ],
      false,
    );
    expect(widthOf(crossSection(v, 50))).toEqual([expect.closeTo(120, 0)]);
  });

  it('45° の線 → 線に直角な太さが 40 ＋ 80 × sin45°', () => {
    const d = merged(
      [
        [0, 0],
        [100, 100],
      ],
      false,
    );
    const [span] = crossSection(d, 50);
    expect((span![1] - span![0]) * Math.SQRT1_2).toBeCloseTo(40 + 80 * Math.SQRT1_2, 0);
  });

  it('円は外側と穴の 2 つの輪郭。天辺と底は横線の太さ、左右の端は太さ', () => {
    const k = 166; // 0.5523 × 300 を丸めた値
    const p = (id: string, x: number, y: number) => ({ id, x, y });
    const circle: Stroke = {
      closed: true,
      start: p('a', 0, 300),
      segments: [
        { kind: 'cubic', c1: p('b', k, 300), c2: p('c', 300, k), to: p('d', 300, 0) },
        { kind: 'cubic', c1: p('e', 300, -k), c2: p('f', k, -300), to: p('g', 0, -300) },
        { kind: 'cubic', c1: p('h', -k, -300), c2: p('i', -300, -k), to: p('j', -300, 0) },
        { kind: 'cubic', c1: p('k', -300, k), c2: p('l', -k, 300), to: p('m', 0, 300) },
      ],
    };
    const o = merged(flattenStroke(circle), true);
    expect(o).toHaveLength(2);
    expect(holeCount(o)).toBe(1);
    // x ＝ 0 で縦に切ると天辺と底、y ＝ 0 で横に切ると左右の端
    expect(widthOf(crossSection(swap(o), 0))).toEqual([
      expect.closeTo(40, 0),
      expect.closeTo(40, 0),
    ]);
    expect(widthOf(crossSection(o, 0))).toEqual([expect.closeTo(120, 0), expect.closeTo(120, 0)]);
  });
});

describe('expandToTriangles', () => {
  // 半径 30 の U ターン（太さ 120 なので、内側のずらし線は自分と交差する）
  const uturn: Vec[] = [
    [-30, 300],
    [-30, 0],
    ...Array.from({ length: 15 }, (_, i) => {
      const a = Math.PI + (Math.PI * (i + 1)) / 16;
      return [30 * Math.cos(a), 30 * Math.sin(a)] as Vec;
    }),
    [30, 0],
    [30, 300],
  ];
  const w = { weight: 120, hWeight: 120 };

  it('三角形に分けて合成すると、U ターンも 1 つの輪郭で穴がない', () => {
    const r = unionPolys(expandToTriangles(uturn, false, w));
    expect(r.ok && r.outline.length).toBe(1);
    expect(r.ok && holeCount(r.outline)).toBe(0);
  });

  it('すべて三角形で、線分 1 本につき 2 つ（閉じた線は最後と最初をつなぐ分も）', () => {
    const open = expandToTriangles(uturn, false, w);
    expect(open).toHaveLength((uturn.length - 1) * 2);
    for (const poly of open) expect(poly[0]).toHaveLength(3);
    const closed = expandToTriangles(uturn, true, w);
    expect(closed).toHaveLength(uturn.length * 2);
  });
});
