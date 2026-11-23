import type { Bounds, Outline, Ring, Vec } from './types';

/** 符号付き面積。y 上向きで反時計回りが正 */
export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function boundsOf(outline: Outline): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of outline)
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** 輪郭の穴の数（時計回りのリングの数） */
export function holeCount(outline: Outline): number {
  return outline.filter((r) => signedArea(r) < 0).length;
}

/** 水平線 y で輪郭を切ったときの、塗られている区間（NonZero） */
export function crossSection(outline: Outline, y: number): [number, number][] {
  const hits: { x: number; dir: number }[] = [];
  for (const ring of outline)
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if (p[1] === q[1]) continue;
      const lo = Math.min(p[1], q[1]);
      const hi = Math.max(p[1], q[1]);
      if (y < lo || y >= hi) continue;
      const t = (y - p[1]) / (q[1] - p[1]);
      hits.push({ x: p[0] + t * (q[0] - p[0]), dir: q[1] > p[1] ? 1 : -1 });
    }
  hits.sort((a, b) => a.x - b.x);
  const spans: [number, number][] = [];
  let winding = 0;
  let start = 0;
  for (const h of hits) {
    const before = winding;
    winding += h.dir;
    if (before === 0 && winding !== 0) start = h.x;
    if (before !== 0 && winding === 0) spans.push([start, h.x]);
  }
  return spans;
}

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
export const len = (a: Vec): number => Math.hypot(a[0], a[1]);
export const unit = (a: Vec): Vec => {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};
/** 左向きの法線（進行方向に対して左） */
export const leftNormal = (d: Vec): Vec => [-d[1], d[0]];
export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec, b: Vec): number => a[0] * b[1] - a[1] * b[0];

/** 点 p から線分 ab までの距離 */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return len(sub(p, add(a, scale(ab, t))));
}

/** 正多角形で近似した円 */
export function circle(c: Vec, r: number, n = 24): Ring {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Vec;
  });
}
