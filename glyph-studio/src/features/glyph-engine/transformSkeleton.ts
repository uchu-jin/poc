import type { Point, Skeleton } from './types';

/** 骨格のすべての点（制御点を含む）に f を当てた写しを返す */
export function mapSkeletonPoints(skeleton: Skeleton, f: (p: Point) => Point): Skeleton {
  return {
    strokes: skeleton.strokes.map((s) => ({
      ...s,
      start: f(s.start),
      segments: s.segments.map((seg) =>
        seg.kind === 'line'
          ? { kind: 'line', to: f(seg.to) }
          : { kind: 'cubic', c1: f(seg.c1), c2: f(seg.c2), to: f(seg.to) },
      ),
    })),
  };
}
