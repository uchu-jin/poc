// ADR-0001: 骨格の折れ線を自前のコードで膨らませる。線の向きで太さを変える（コントラスト、FR-020）。
// ADR-0001 で検証したのは太さが一定の場合だけ。例外や速さの問題が出たら ADR-0001 の「見直す条件」に戻る
import { dot, leftNormal, signedArea, unit } from './geometry';
import type { Poly, Ring, Vec } from './types';

export type StrokeWeights = { weight: number; hWeight: number };

/** 向き t（単位ベクトル）の線の太さ：横線の太さ ＋（太さ − 横線の太さ）×｜sin θ｜ */
export function strokeWidthAt(t: Vec, w: StrokeWeights): number {
  return w.hWeight + (w.weight - w.hWeight) * Math.abs(t[1]);
}

const MITER_LIMIT_COS = 0.25; // 折れ線の内側の角で、ずらす量を 4 倍までにする

/** 各点で、左側の法線（長さ込み）と、その点の太さの半分を求める */
function offsets(pts: Vec[], closed: boolean, w: StrokeWeights): { n: Vec; h: number }[] {
  const n = pts.length;
  const segDir = (i: number): Vec => {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    return unit([b[0] - a[0], b[1] - a[1]]);
  };
  return pts.map((_, i) => {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    let m: Vec;
    let s = 1;
    if (!hasPrev) m = leftNormal(segDir(i));
    else if (!hasNext) m = leftNormal(segDir(i - 1));
    else {
      const a = leftNormal(segDir((i - 1 + n) % n));
      const b = leftNormal(segDir(i));
      m = unit([a[0] + b[0], a[1] + b[1]]);
      if (m[0] === 0 && m[1] === 0) m = a;
      s = 1 / Math.max(dot(m, a), MITER_LIMIT_COS);
    }
    const tangent: Vec = [m[1], -m[0]];
    const h = strokeWidthAt(tangent, w) / 2;
    return { n: [m[0] * s, m[1] * s], h };
  });
}

/** 骨格の点ごとの、左右にずらした点（点の順は骨格と同じ） */
function offsetSides(pts: Vec[], closed: boolean, w: StrokeWeights): { left: Ring; right: Ring } {
  const off = offsets(pts, closed, w);
  const left: Ring = pts.map((p, i) => [
    p[0] + off[i]!.n[0] * off[i]!.h,
    p[1] + off[i]!.n[1] * off[i]!.h,
  ]);
  const right: Ring = pts.map((p, i) => [
    p[0] - off[i]!.n[0] * off[i]!.h,
    p[1] - off[i]!.n[1] * off[i]!.h,
  ]);
  return { left, right };
}

/**
 * 折れ線を膨らませた輪郭。開いた線は 1 つのリング、閉じた線は外側と内側の 2 つのリング（先頭が外側）を返す。
 * 骨格の点と同じ順に並ぶので、点ごとの太さを確かめるのに使う
 */
export function expandPolyline(pts: Vec[], closed: boolean, w: StrokeWeights): Poly {
  if (pts.length < 2) return [];
  const { left, right } = offsetSides(pts, closed, w);
  if (!closed) return [[...left, ...right.reverse()]];
  return Math.abs(signedArea(left)) >= Math.abs(signedArea(right)) ? [left, right] : [right, left];
}

/**
 * 合成に渡す形。線分ごとの帯を 2 つの三角形に分ける。1 本のリングのままだと、太い線のきついカーブで
 * 内側のずらし線が自分と交差し、折り返した部分が穴として残るため（実装順 11 の組み合わせテストで t・s に出た）
 */
export function expandToTriangles(pts: Vec[], closed: boolean, w: StrokeWeights): Poly[] {
  if (pts.length < 2) return [];
  const { left, right } = offsetSides(pts, closed, w);
  const n = pts.length;
  const count = closed ? n : n - 1;
  const out: Poly[] = [];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    out.push([[left[i]!, left[j]!, right[j]!]], [[left[i]!, right[j]!, right[i]!]]);
  }
  return out;
}
