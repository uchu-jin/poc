// 骨格の線から、合成に渡す図形を作る：膨らませた帯（三角形）＋ 角の図形 ＋ 自由な端の形
import { expandToTriangles, strokeWidthAt } from './expand';
import { distToSegment, unit } from './geometry';
import { piecesOf, type Piece } from './pieces';
import { capPolys, joinPolys, slabSize } from './terminals';
import type { Params, Poly, Skeleton, Vec } from './types';

/** 端が他の線と重なるとみなす距離 */
const TOUCH_EPS = 2;

const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOUCH_EPS;

/** 端 p が、exclude 以外の線の上にあるか */
function onOtherPiece(p: Vec, exclude: Set<number>, pieces: Piece[]): boolean {
  return pieces.some((piece, j) => {
    if (exclude.has(j)) return false;
    const pts = piece.pts;
    const m = piece.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++)
      if (distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!) < TOUCH_EPS) return true;
    return false;
  });
}

type End = { piece: number; at: Vec; away: Vec; isLine: boolean };
/** 自由な端と、その端に重なっている線（同じ線を重ねた・引き返した。スラブの障害物から除く） */
type FreeEnd = End & { overlapping: Set<number> };

/** 同じ向きとみなす角度（5°） */
const SAME_DIR_COS = Math.cos((5 * Math.PI) / 180);

/** スラブが隣の線までの空きの何割まで張り出してよいか（2026-11-23 作者が決定） */
const SLAB_ROOM_SHARE = 0.4;

/**
 * スラブを左右それぞれどこまで張り出してよいか。スラブの高さの範囲にある他の線を、太さの半分だけ太らせて
 * 障害物とし、縦線の端から障害物までの空きの 4 割まで（2 本の足のスラブが向かい合ってもくっつかない）。
 * 自分の線の他の部分と、尖った角の図形も障害物に数える
 */
function slabRoom(
  e: FreeEnd,
  pieces: Piece[],
  joinShapes: Poly[],
  w: { weight: number; hWeight: number },
) {
  const out: Vec = [-e.away[0], -e.away[1]];
  const stemHalf = strokeWidthAt(out, w) / 2;
  const { thickness } = slabSize(w.weight);
  const y0 = out[1] < 0 ? e.at[1] : e.at[1] - thickness;
  const y1 = y0 + thickness;
  const hObs = Math.max(w.weight, w.hWeight) / 2;
  const x = e.at[0];
  let freeL = Infinity;
  let freeR = Infinity;

  /** 線分 ab を pad だけ太らせた障害物として数える。own のとき、端をまたぐ部分（端の縦線そのもの）は除く */
  const consider = (a: Vec, b: Vec, pad: number, own: boolean) => {
    const lo = y0 - pad;
    const hi = y1 + pad;
    // 線分のうち y が [lo, hi] に入る部分の x の範囲
    let t0 = 0;
    let t1 = 1;
    const dy = b[1] - a[1];
    if (dy === 0) {
      if (a[1] < lo || a[1] > hi) return;
    } else {
      const ta = (lo - a[1]) / dy;
      const tb = (hi - a[1]) / dy;
      t0 = Math.max(0, Math.min(ta, tb));
      t1 = Math.min(1, Math.max(ta, tb));
      if (t0 > t1) return;
    }
    const xa = a[0] + (b[0] - a[0]) * t0;
    const xb = a[0] + (b[0] - a[0]) * t1;
    const minX = Math.min(xa, xb) - pad;
    const maxX = Math.max(xa, xb) + pad;
    if (maxX <= x) freeL = Math.min(freeL, x - stemHalf - maxX);
    else if (minX >= x) freeR = Math.min(freeR, minX - (x + stemHalf));
    else if (!own) {
      freeL = 0;
      freeR = 0;
    }
  };

  // 骨格の線（自分の線の他の部分も数える。U のように 1 本の線の両端が向かい合うため）
  pieces.forEach((pc, j) => {
    const pts = pc.pts;
    const m = pc.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++)
      consider(pts[i]!, pts[(i + 1) % pts.length]!, hObs, e.overlapping.has(j));
  });
  // 尖った角の図形（M・w の頂点の先端がスラブに届かないように）
  for (const poly of joinShapes)
    for (const ring of poly)
      for (let i = 0; i < ring.length; i++)
        consider(ring[i]!, ring[(i + 1) % ring.length]!, 0, false);

  const room = (free: number) => stemHalf + Math.max(0, free) * SLAB_ROOM_SHARE;
  return { left: room(freeL), right: room(freeR) };
}

export function shapesOf(skeleton: Skeleton, p: Params): Poly[] {
  const pieces = piecesOf(skeleton);
  const w = { weight: p.weight, hWeight: p.hWeight };
  const polys: Poly[] = pieces.flatMap((pc) => expandToTriangles(pc.pts, pc.closed, w));

  // 開いた線の両端。away は端から線に沿って離れる向き
  const ends: End[] = [];
  pieces.forEach((pc, i) => {
    if (pc.closed) return;
    const a = pc.pts[0]!;
    const b = pc.pts[pc.pts.length - 1]!;
    ends.push({
      piece: i,
      at: a,
      away: unit([pc.pts[1]![0] - a[0], pc.pts[1]![1] - a[1]]),
      isLine: pc.startIsLine,
    });
    const b1 = pc.pts[pc.pts.length - 2]!;
    ends.push({ piece: i, at: b, away: unit([b1[0] - b[0], b1[1] - b[1]]), isLine: pc.endIsLine });
  });

  const used = new Set<number>();
  const joinShapes: Poly[] = [];
  const freeEnds: FreeEnd[] = [];
  ends.forEach((e, i) => {
    if (used.has(i)) return;
    const group = [i];
    ends.forEach((f, j) => {
      if (j !== i && !used.has(j) && near(e.at, f.at)) group.push(j);
    });
    group.forEach((g) => used.add(g));
    // 同じ向きに離れていく端は 1 つにまとめる（同じ線を重ねた・同じ道を引き返した。実装レビュー P1-5）
    const dirs: End[] = [];
    for (const g of group) {
      const x = ends[g]!;
      if (!dirs.some((d) => d.away[0] * x.away[0] + d.away[1] * x.away[1] > SAME_DIR_COS))
        dirs.push(x);
    }
    const overlapping = new Set(group.map((g) => ends[g]!.piece));
    if (dirs.length >= 2) {
      // 線どうしがつながる点 → 角
      const half = (x: End) => strokeWidthAt(x.away, w) / 2;
      if (p.join === 'round') {
        joinShapes.push(
          ...joinPolys(e.at, e.away, Math.max(...dirs.map(half)), e.away, 0, 'round'),
        );
        return;
      }
      // 向きの順に並べ、隣り合う向きの組だけに角を付ける（組の数を端の数に比例させる。実装レビュー P1-1）
      const sorted = [...dirs].sort(
        (a, b) => Math.atan2(a.away[1], a.away[0]) - Math.atan2(b.away[1], b.away[0]),
      );
      const pairs = sorted.length === 2 ? 1 : sorted.length;
      for (let k = 0; k < pairs; k++) {
        const x = sorted[k]!;
        const y = sorted[(k + 1) % sorted.length]!;
        joinShapes.push(...joinPolys(x.at, x.away, half(x), y.away, half(y), 'miter'));
      }
      return;
    }
    // 他の線の上にある端（横棒の端など。T 字）には、どの端の形も足さない
    if (onOtherPiece(e.at, overlapping, pieces)) return;
    freeEnds.push({ ...dirs[0]!, overlapping });
  });
  polys.push(...joinShapes);
  // 自由な端の形。スラブは、線と尖った角の図形を避けて張り出す
  for (const e of freeEnds) {
    const out: Vec = [-e.away[0], -e.away[1]];
    const room = p.terminal === 'slab' ? slabRoom(e, pieces, joinShapes, w) : undefined;
    polys.push(...capPolys(e.at, out, w, p.terminal, e.isLine, room));
  }
  return polys;
}
