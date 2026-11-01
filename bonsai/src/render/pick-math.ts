// 当たり判定の計算（Three.js・DOM に依存しない）。

/** 枝の当たり判定の幅（画面上の px） */
export const PICK_RADIUS_PX = 6;
/** 深さがこの差以内なら同じ深さとみなす */
export const DEPTH_EPS = 0.02;
const FLOAT_SLACK = 1e-9;

export type Candidate = {
  kind: 'branch' | 'leaf';
  nodeId: number;
  leafIndex?: number;
  /** カーソルからの画面上の距離（px） */
  distPx: number;
  /** カメラからの距離（小さいほど手前） */
  depth: number;
  /** 画面上の半径（px） */
  radius: number;
};

export function distPointSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function choosePick(cands: Candidate[]): Candidate | null {
  const hits = cands.filter((c) =>
    c.kind === 'branch' ? c.distPx <= PICK_RADIUS_PX : c.distPx <= c.radius,
  );
  if (hits.length === 0) return null;
  const minDepth = Math.min(...hits.map((c) => c.depth));
  const near = hits.filter((c) => c.depth <= minDepth + DEPTH_EPS + FLOAT_SLACK);
  let best = near[0] as Candidate;
  for (const c of near) {
    if (c.radius < best.radius) best = c;
  }
  return best;
}
