import { CURVE_STEPS } from './metrics';
import type { Point, Segment, Stroke, Vec } from './types';

const v = (p: Point): Vec => [p.x, p.y];

/** 1 つの区間を折れ線にする（始点を含まない） */
export function flattenSegment(from: Vec, seg: Segment, steps = CURVE_STEPS): Vec[] {
  if (seg.kind === 'line') return [v(seg.to)];
  const [p1, p2, p3] = [v(seg.c1), v(seg.c2), v(seg.to)];
  const out: Vec[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    if (i === steps) {
      out.push(p3);
      break;
    }
    out.push([
      u * u * u * from[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * from[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** 骨格の線を折れ線にする。閉じた線は最後の点（始点と重複）を落とす */
export function flattenStroke(stroke: Stroke): Vec[] {
  const pts: Vec[] = [v(stroke.start)];
  for (const seg of stroke.segments) {
    for (const p of flattenSegment(pts[pts.length - 1]!, seg)) {
      const last = pts[pts.length - 1]!;
      if (last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
  }
  if (stroke.closed && pts.length > 1) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) pts.pop();
  }
  return pts;
}
