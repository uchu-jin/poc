// 当たり判定（後の手入れの機能が使う）：枝は画面に投影した線分から 6px 以内、葉は見た目の半径以内、
// 土はカーソルの光線と土の面（y = 0）の交点が鉢の内側。枝先は 1px 未満の細さなので、形そのものへの Raycast は使わない。
import { choosePick, distPointSegment, type Candidate } from './pick-math';
import { LEAF_WORLD_SIZE, type LeafArrays } from './leaves';
import { SOIL_RADIUS } from './pot';
import type { SaveData } from '../core/types';
import type { Three, THREE_NS } from './three-types';

export type PickResult =
  | { kind: 'branch'; nodeId: number }
  | { kind: 'leaf'; nodeId: number; leafIndex: number }
  | { kind: 'soil' }
  | null;

export function pickAt(
  THREE: Three,
  camera: THREE_NS.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  data: SaveData | null,
  leaves: LeafArrays,
  leafRefs: { nodeId: number; leafIndex: number }[],
  clientX: number,
  clientY: number,
): PickResult {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const w = rect.width;
  const h = rect.height;
  const toScreen = (v: THREE_NS.Vector3): { x: number; y: number; ok: boolean } => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, ok: p.z > -1 && p.z < 1 };
  };
  const cands: Candidate[] = [];
  if (data) {
    for (const n of data.nodes) {
      if (n.length <= 0) continue;
      const a = new THREE.Vector3(...n.pos);
      const b = new THREE.Vector3(
        n.pos[0] + n.dir[0] * n.length,
        n.pos[1] + n.dir[1] * n.length,
        n.pos[2] + n.dir[2] * n.length,
      );
      const sa = toScreen(a);
      const sb = toScreen(b);
      // カメラの後ろにある節は候補にしない（投影すると画面の反対側に出るため）
      if (!sa.ok || !sb.ok) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      cands.push({
        kind: 'branch',
        nodeId: n.id,
        distPx: distPointSegment(px, py, sa.x, sa.y, sb.x, sb.y),
        depth: mid.distanceTo(camera.position),
        radius: n.radius,
      });
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    leafRefs.forEach((ref, i) => {
      const c = new THREE.Vector3(
        leaves.center[i * 3],
        leaves.center[i * 3 + 1],
        leaves.center[i * 3 + 2],
      );
      const sc = toScreen(c);
      if (!sc.ok) return;
      const edge = toScreen(
        c.clone().addScaledVector(right, (LEAF_WORLD_SIZE * leaves.size[i]!) / 2),
      );
      cands.push({
        kind: 'leaf',
        nodeId: ref.nodeId,
        leafIndex: ref.leafIndex,
        distPx: Math.hypot(px - sc.x, py - sc.y),
        depth: c.distanceTo(camera.position),
        radius: Math.hypot(edge.x - sc.x, edge.y - sc.y),
      });
    });
  }
  const best = choosePick(cands);
  if (best) {
    return best.kind === 'branch'
      ? { kind: 'branch', nodeId: best.nodeId }
      : { kind: 'leaf', nodeId: best.nodeId, leafIndex: best.leafIndex ?? 0 };
  }
  // 土：光線と y = 0 の面の交点
  const ndc = new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hit = ray.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Vector3(),
  );
  if (hit && Math.hypot(hit.x, hit.z) <= SOIL_RADIUS) return { kind: 'soil' };
  return null;
}
