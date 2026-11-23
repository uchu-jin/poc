import { describe, expect, it } from 'vitest';
import { capPolys, joinPolys, slabSize } from '../../src/features/glyph-engine/terminals';
import type { Vec } from '../../src/features/glyph-engine/types';

const W = { weight: 120, hWeight: 40 };
const radius = (ring: Vec[], c: Vec) =>
  Math.max(...ring.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));

describe('capPolys（端）', () => {
  it('平らな端 → 何も足さない', () => {
    expect(capPolys([0, 0], [0, -1], W, 'flat', true)).toEqual([]);
  });

  it('丸い端 → その点の太さの半分の半径の円（垂直の線 60、水平の線 20）', () => {
    const v = capPolys([0, 0], [0, -1], W, 'round', true);
    expect(v).toHaveLength(1);
    expect(radius(v[0]![0]!, [0, 0])).toBeCloseTo(60);
    const h = capPolys([0, 0], [1, 0], W, 'round', true);
    expect(radius(h[0]![0]!, [0, 0])).toBeCloseTo(20);
  });

  it('スラブ → 直線の端だけに付き、曲線の終わりには付かない', () => {
    expect(capPolys([0, 0], [0, -1], W, 'slab', true)).toHaveLength(1);
    expect(capPolys([0, 0], [0, -1], W, 'slab', false)).toEqual([]);
  });

  it('スラブは下向きの端なら端から上へ、上向きの端なら端から下へ付く', () => {
    const down = capPolys([100, 0], [0, -1], { weight: 100, hWeight: 100 }, 'slab', true)[0]![0]!;
    const ys = down.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(45);
    const xs = down.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-40);
    expect(Math.max(...xs)).toBeCloseTo(240);
    const up = capPolys([100, 700], [0, 1], { weight: 100, hWeight: 100 }, 'slab', true)[0]![0]!;
    expect(Math.max(...up.map((p) => p[1]))).toBeCloseTo(700);
    expect(Math.min(...up.map((p) => p[1]))).toBeCloseTo(655);
  });
});

describe('slabSize', () => {
  it.each([
    [20, 12, 28],
    [26, 12, 36.4],
    [27, 12.15, 37.8],
    [100, 45, 140],
  ])('太さ %s → 厚み %s・張り出し %s', (w, t, o) => {
    const s = slabSize(w);
    expect(s.thickness).toBeCloseTo(t);
    expect(s.overhang).toBeCloseTo(o);
  });
});

describe('joinPolys（角）', () => {
  // P から左下・右下へ伸びる 2 本の線（開き角 phi）
  const legs = (phi: number): [Vec, Vec] => [
    [-Math.sin(phi / 2), -Math.cos(phi / 2)],
    [Math.sin(phi / 2), -Math.cos(phi / 2)],
  ];

  it('丸い角 → つながる点に円', () => {
    const [t1, t2] = legs(Math.PI / 3);
    const r = joinPolys([0, 0], t1, 45, t2, 45, 'round');
    expect(r).toHaveLength(1);
    expect(radius(r[0]![0]!, [0, 0])).toBeCloseTo(45);
  });

  it('尖った角 → 外側の辺を延長した交点まで埋める（A の頂点の切れ込みがない）', () => {
    const phi = 2 * Math.atan(240 / 700);
    const [t1, t2] = legs(phi);
    const r = joinPolys([300, 700], t1, 45, t2, 45, 'miter');
    expect(r).toHaveLength(1);
    const ring = r[0]![0]!;
    expect(ring).toHaveLength(4);
    const top = Math.max(...ring.map((p) => p[1]));
    expect(top).toBeCloseTo(700 + 45 / Math.sin(phi / 2));
  });

  it('miter と bevel の境目：延長がちょうど太さの 4 倍 → miter、超えると bevel', () => {
    const phi0 = 2 * Math.asin(1 / 8); // 延長 = h / sin(phi/2) = 8h = 太さ(2h) × 4
    const at = (phi: number) =>
      joinPolys(
        [0, 0],
        ...(legs(phi).flatMap((t) => [t, 10] as const) as [Vec, number, Vec, number]),
        'miter',
      )[0]![0]!.length;
    expect(at(phi0 + 1e-9)).toBe(4);
    expect(at(phi0 - 1e-6)).toBe(3);
  });

  it('まっすぐつながる 2 本（180°）→ 隙間がないので何も足さない', () => {
    expect(joinPolys([0, 0], [0, 1], 45, [0, -1], 45, 'miter')).toEqual([]);
  });
});
