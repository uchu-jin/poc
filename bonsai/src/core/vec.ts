// 3次元ベクトルの小さな計算。成長（tree.ts）で使う。Three.js に依存しない。
import type { Vec3 } from './types';

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** a + d × t */
export function addScaled(a: Vec3, d: Vec3, t: number): Vec3 {
  return [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
}

/** dir から角度 angle だけ傾けた向き。傾ける方位は azimuth（0〜1 で一周） */
export function rotateAway(dir: Vec3, angle: number, azimuth: number): Vec3 {
  const d = normalize(dir);
  const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(d, helper));
  const v = cross(d, u);
  const phi = azimuth * 2 * Math.PI;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const perp: Vec3 = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return normalize([d[0] * ca + perp[0] * sa, d[1] * ca + perp[1] * sa, d[2] * ca + perp[2] * sa]);
}
