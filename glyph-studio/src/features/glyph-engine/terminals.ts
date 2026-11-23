// ADR-0001: 端（平ら／丸／スラブ）と角（尖り／丸）は、図形を足してから合成する（V-07）
import { strokeWidthAt, type StrokeWeights } from './expand';
import { circle, cross, dot, leftNormal, len, sub } from './geometry';
import type { Join, Poly, Terminal, Vec } from './types';

/** スラブの寸法：厚み ＝ max（太さ × 0.45、12）、張り出し ＝ 太さ × 1.4（仮置き。V-07 と同じ） */
export function slabSize(weight: number): { thickness: number; overhang: number } {
  return { thickness: Math.max(weight * 0.45, 12), overhang: weight * 1.4 };
}

/** スラブを付けない、水平に近い線の目安（水平から 30° 未満）。実装時の判断 */
const SLAB_MIN_SIN = 0.5;

/**
 * 線の自由な端に足す図形。
 * @param end 端の点
 * @param out 端から外へ向かう単位ベクトル（線の進行方向）
 * @param isLineEnd 端の区間が直線か（スラブは直線の端だけに付ける）
 */
export function capPolys(
  end: Vec,
  out: Vec,
  w: StrokeWeights,
  terminal: Terminal,
  isLineEnd: boolean,
  /** スラブを左右それぞれ、端の中心からどこまで張り出してよいか（隣の線までの空き） */
  room: { left: number; right: number } = { left: Infinity, right: Infinity },
): Poly[] {
  if (terminal === 'round') return [[circle(end, strokeWidthAt(out, w) / 2)]];
  if (terminal === 'slab' && isLineEnd && Math.abs(out[1]) >= SLAB_MIN_SIN) {
    const { thickness, overhang } = slabSize(w.weight);
    const [x, y] = end;
    const left = x - Math.min(overhang, room.left);
    const right = x + Math.min(overhang, room.right);
    // 下向きの端（足）は端から上へ、上向きの端は端から下へ
    const y0 = out[1] < 0 ? y : y - thickness;
    const y1 = out[1] < 0 ? y + thickness : y;
    return [
      [
        [
          [left, y0],
          [right, y0],
          [right, y1],
          [left, y1],
        ],
      ],
    ];
  }
  return [];
}

/** miter の延長が太さの何倍を超えたら bevel にするか */
const MITER_LIMIT = 4;

/**
 * 2 本の線がつながる点に足す図形。
 * @param p つながる点
 * @param t1 p から 1 本目の線に沿って離れる向き（単位ベクトル）
 * @param h1 p での 1 本目の太さの半分
 */
export function joinPolys(p: Vec, t1: Vec, h1: number, t2: Vec, h2: number, join: Join): Poly[] {
  if (join === 'round') return [[circle(p, Math.max(h1, h2))]];
  const gap: Vec = [-(t1[0] + t2[0]), -(t1[1] + t2[1])];
  // まっすぐつながる（隙間なし）か、ほぼ同じ向きに重なる（外側が決まらない）ときは何もしない
  if (len(gap) < 1e-9) return [];
  const side = (t: Vec): Vec => {
    const n = leftNormal(t);
    return dot(n, gap) >= 0 ? n : [-n[0], -n[1]];
  };
  const n1 = side(t1);
  const n2 = side(t2);
  const c1: Vec = [p[0] + n1[0] * h1, p[1] + n1[1] * h1];
  const c2: Vec = [p[0] + n2[0] * h2, p[1] + n2[1] * h2];
  const denom = cross(t1, t2);
  if (Math.abs(denom) < 1e-12) return [[[p, c1, c2]]];
  // c1 + s·t1 = c2 + u·t2 を解く
  const d = sub(c2, c1);
  const s = cross(d, t2) / denom;
  const x: Vec = [c1[0] + s * t1[0], c1[1] + s * t1[1]];
  const extension = len(sub(x, p));
  if (extension <= MITER_LIMIT * (h1 + h2) && s <= 0) return [[[p, c1, x, c2]]];
  return [[[p, c1, c2]]];
}
