// 骨格の線を折れ線にし、1 本の線の中の鋭い折れ（20° 超）で分ける
import { appendSegment } from './flatten';
import { unit } from './geometry';
import type { Point, Segment, Skeleton, Vec } from './types';

/** 区間の境目で向きがこれ以上曲がったら、線を分けて「角」として扱う（実装時の判断） */
const SPLIT_ANGLE_DEG = 20;

/** 線を角で分けたもの。両端の区間が直線かどうかも持つ（スラブは直線の端だけ） */
export type Piece = { pts: Vec[]; closed: boolean; startIsLine: boolean; endIsLine: boolean };

const v = (p: Point): Vec => [p.x, p.y];

function segEndPoint(seg: Segment): Vec {
  return v(seg.to);
}
/** 区間の始まりの向き・終わりの向き */
function segTangents(from: Vec, seg: Segment): { start: Vec; end: Vec } {
  const to = v(seg.to);
  if (seg.kind === 'line') {
    const d = unit([to[0] - from[0], to[1] - from[1]]);
    return { start: d, end: d };
  }
  const c1 = v(seg.c1);
  const c2 = v(seg.c2);
  const pick = (a: Vec, b: Vec, c: Vec): Vec => {
    const d = unit([b[0] - a[0], b[1] - a[1]]);
    return d[0] === 0 && d[1] === 0 ? unit([c[0] - a[0], c[1] - a[1]]) : d;
  };
  return { start: pick(from, c1, to), end: unit(pick(to, c2, from).map((x) => -x) as Vec) };
}
const isSharp = (a: Vec, b: Vec) =>
  a[0] * b[0] + a[1] * b[1] < Math.cos((SPLIT_ANGLE_DEG * Math.PI) / 180);

export function piecesOf(skeleton: Skeleton): Piece[] {
  const pieces: Piece[] = [];
  for (const stroke of skeleton.strokes) {
    const starts: Vec[] = [v(stroke.start)];
    for (const seg of stroke.segments) starts.push(segEndPoint(seg));
    const tan = stroke.segments.map((seg, i) => segTangents(starts[i]!, seg));
    const n = stroke.segments.length;
    // 角になる境目（区間 i の終わりと区間 i+1 の始まり）
    const cuts: number[] = [];
    for (let i = 0; i < n - 1; i++) if (isSharp(tan[i]!.end, tan[i + 1]!.start)) cuts.push(i);
    if (stroke.closed && isSharp(tan[n - 1]!.end, tan[0]!.start)) cuts.push(n - 1);

    const run = (from: number, count: number): Piece => {
      const pts: Vec[] = [starts[from]!];
      for (let k = 0; k < count; k++) {
        const i = (from + k) % n;
        appendSegment(pts, stroke.segments[i]!);
      }
      return {
        pts,
        closed: false,
        startIsLine: stroke.segments[from]!.kind === 'line',
        endIsLine: stroke.segments[(from + count - 1) % n]!.kind === 'line',
      };
    };

    if (stroke.closed && cuts.length === 0) {
      const p = run(0, n);
      const first = p.pts[0]!;
      const last = p.pts[p.pts.length - 1]!;
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) p.pts.pop();
      pieces.push({ ...p, closed: true });
    } else if (stroke.closed) {
      // 角から角までを 1 本ずつ。最後の角から一周して最初の角まで
      for (let c = 0; c < cuts.length; c++) {
        const from = (cuts[c]! + 1) % n;
        const to = cuts[(c + 1) % cuts.length]!;
        const count = ((to - from + n) % n) + 1;
        pieces.push(run(from, count));
      }
    } else {
      let from = 0;
      for (const c of [...cuts, n - 1]) {
        pieces.push(run(from, c - from + 1));
        from = c + 1;
      }
    }
  }
  return pieces.filter((p) => p.pts.length >= 2);
}
