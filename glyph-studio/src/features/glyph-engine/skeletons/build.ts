// 骨格を短く書くための道具。点の ID は「s<線の番号>p<点の番号>」を自動で付ける（文字の中で一意）
import type { Point, Segment, Skeleton, Stroke } from '../types';

export type P = [number, number];
/** 点 1 つ＝直線、点 3 つ（制御点 2 つ＋終点）＝3 次ベジェ */
export type Seg = P | [P, P, P];
type Draft = { start: P; segs: Seg[]; closed: boolean };

const isCubic = (s: Seg): s is [P, P, P] => Array.isArray(s[0]);

/** 開いた線 */
export const path = (start: P, ...segs: Seg[]): Draft => ({ start, segs, closed: false });
/** 閉じた線（最後の区間で始点に戻す） */
export const loop = (start: P, ...segs: Seg[]): Draft => ({ start, segs, closed: true });
/** 直線 1 本 */
export const line = (a: P, b: P): Draft => path(a, b);

const K = 0.5523;
/** 楕円（天辺から時計回りに 4 本の 3 次ベジェ。座標は整数に丸める） */
export function ellipse(cx: number, cy: number, rx: number, ry: number): Draft {
  const r = Math.round;
  const kx = r(K * rx);
  const ky = r(K * ry);
  return loop(
    [cx, cy + ry],
    [
      [cx + kx, cy + ry],
      [cx + rx, cy + ky],
      [cx + rx, cy],
    ],
    [
      [cx + rx, cy - ky],
      [cx + kx, cy - ry],
      [cx, cy - ry],
    ],
    [
      [cx - kx, cy - ry],
      [cx - rx, cy - ky],
      [cx - rx, cy],
    ],
    [
      [cx - rx, cy + ky],
      [cx - kx, cy + ry],
      [cx, cy + ry],
    ],
  );
}

/** 下書きの線から骨格を作る */
export function glyph(...drafts: Draft[]): Skeleton {
  const strokes: Stroke[] = drafts.map((d, si) => {
    let pi = 0;
    const pt = ([x, y]: P): Point => ({ id: `s${si}p${pi++}`, x, y });
    const start = pt(d.start);
    const segments: Segment[] = d.segs.map((s) =>
      isCubic(s)
        ? { kind: 'cubic', c1: pt(s[0]), c2: pt(s[1]), to: pt(s[2]) }
        : { kind: 'line', to: pt(s) },
    );
    return d.closed ? { start, segments, closed: true } : { start, segments };
  });
  return { strokes };
}
