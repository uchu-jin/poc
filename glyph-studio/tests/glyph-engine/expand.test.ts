import { describe, expect, it } from 'vitest';
import { expandPolyline, strokeWidthAt } from '../../src/features/glyph-engine/expand';
import { flattenStroke } from '../../src/features/glyph-engine/flatten';
import { signedArea } from '../../src/features/glyph-engine/geometry';
import type { Stroke, Vec } from '../../src/features/glyph-engine/types';

const W = { weight: 120, hWeight: 40 };

/** 2 本の平行な辺の距離（開いた直線を膨らませた 4 点のリング） */
function thickness(ring: Vec[]): number {
  const [a, b, c] = ring as [Vec, Vec, Vec];
  // a→b は左側の辺、c は右側の辺の点。a→b の直線から c までの距離
  const d: Vec = [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(d[0], d[1]);
  return Math.abs(d[0] * (c[1] - a[1]) - d[1] * (c[0] - a[0])) / l;
}

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

describe('expandPolyline', () => {
  it('水平・垂直・45° の直線の太さ', () => {
    const one = (p: Vec[]) => {
      const poly = expandPolyline(p, false, W);
      expect(poly).toHaveLength(1);
      return thickness(poly[0]!);
    };
    expect(
      one([
        [0, 0],
        [100, 0],
      ]),
    ).toBeCloseTo(40);
    expect(
      one([
        [0, 0],
        [0, 100],
      ]),
    ).toBeCloseTo(120);
    expect(
      one([
        [0, 0],
        [100, 100],
      ]),
    ).toBeCloseTo(40 + 80 * Math.SQRT1_2);
  });

  it('円は外側と内側の 2 つの輪郭。天辺と底は横線の太さ、左右の端は太さ', () => {
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
    const poly = expandPolyline(flattenStroke(circle), true, W);
    expect(poly).toHaveLength(2);
    const [outer, inner] = poly as [Vec[], Vec[]];
    expect(Math.abs(signedArea(outer))).toBeGreaterThan(Math.abs(signedArea(inner)));
    // 骨格の天辺・底・左右の点での厚み。外側と内側のリングは骨格の点と同じ順に並ぶので、
    // 骨格の点の番号で外側と内側の点を取り、その距離を測る（輪郭の最高点は天辺からずれるため）
    const pts = flattenStroke(circle);
    const at = (target: Vec) => {
      const i = pts.findIndex((q) => Math.hypot(q[0] - target[0], q[1] - target[1]) < 1e-6);
      expect(i).toBeGreaterThanOrEqual(0);
      return Math.hypot(outer[i]![0] - inner[i]![0], outer[i]![1] - inner[i]![1]);
    };
    expect(at([0, 300])).toBeCloseTo(40, 0);
    expect(at([0, -300])).toBeCloseTo(40, 0);
    expect(at([300, 0])).toBeCloseTo(120, 0);
    expect(at([-300, 0])).toBeCloseTo(120, 0);
  });
});
