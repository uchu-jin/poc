// ADR-0002 の検証用の使い捨てコード。本体（src/core/tree.ts）の step を、仕組みの案 A〜E で書き換えたもの。
// 本体には混ぜない（docs/adr/README.md「検証のために書いた使い捨てのコード」）。
import { Rng } from '../../../../src/core/rng';
import { recomputeShape, stageOf, growthFactor } from '../../../../src/core/tree';
import { MAX_LEAVES, MAX_NODES, WATER_DECAY } from '../../../../src/core/constants';
import type { SaveData, TreeNode, Vec3 } from '../../../../src/core/types';

type GrowingStage = 'sprout' | 'seedling' | 'young' | 'mature';

export const P = {
  baseLength: { sprout: 0.012, seedling: 0.014, young: 0.012, mature: 0.008 },
  // A. 頂芽優勢の衰え：枝先が伸びる確率。order は枝の次数（幹 0、幹から出た枝 1 …）
  elongate: {
    0: { sprout: 1, seedling: 1, young: 0.45, mature: 0.08 },
    1: { sprout: 1, seedling: 0.7, young: 0.5, mature: 0.25 },
    2: { sprout: 1, seedling: 0.5, young: 0.4, mature: 0.2 },
  } as Record<number, Record<GrowingStage, number>>,
  // B. 枝は水平へ：幹は上向き、枝は水平（少し上）へ寄る
  trunkUp: 0.15,
  branchTargetY: 0.12,
  branchPull: 0.3,
  // C. 開き角
  lateralMinDeg: 45,
  lateralRangeDeg: 35,
  // D. 枝分かれ
  branchP: { sprout: 0, seedling: 0.005, young: 0.003, mature: 0.001 },
  lateralWindow: 12,
  jitter: 0.3,
  // E. 葉：枝先から数節（葉の塊＝葉張り）
  leafDepth: 5,
  leavesPerNode: 3,
};

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function rotateAway(dir: Vec3, angle: number, azimuth: number): Vec3 {
  const d = normalize(dir);
  const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(d, helper));
  const v = cross(d, u);
  const phi = azimuth * 2 * Math.PI;
  const perp: Vec3 = [
    u[0] * Math.cos(phi) + v[0] * Math.sin(phi),
    u[1] * Math.cos(phi) + v[1] * Math.sin(phi),
    u[2] * Math.cos(phi) + v[2] * Math.sin(phi),
  ];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return normalize([d[0] * ca + perp[0] * sa, d[1] * ca + perp[1] * sa, d[2] * ca + perp[2] * sa]);
}

/** 枝の次数：子のうち id が最小のものは延長（次数そのまま）、ほかは横枝（次数 +1） */
function orders(nodes: TreeNode[]): Map<number, number> {
  const first = new Map<number, number>();
  for (const n of nodes) if (n.parent >= 0 && !first.has(n.parent)) first.set(n.parent, n.id);
  const ord = new Map<number, number>();
  for (const n of nodes) {
    if (n.parent < 0) ord.set(n.id, 0);
    else ord.set(n.id, ord.get(n.parent)! + (first.get(n.parent) === n.id ? 0 : 1));
  }
  return ord;
}

export function stepProposal(data: SaveData): void {
  const rng = new Rng(data.rngState);
  const ageBefore = data.age;
  const s = stageOf(ageBefore);
  const stage: GrowingStage = s === 'seed' ? 'sprout' : s;
  const nodes = data.nodes;
  const { straightness, branchiness, spread, leafSize } = data.traits;
  data.water = Math.max(0, data.water - WATER_DECAY);
  const f = growthFactor(data.water);
  const base = P.baseLength[stage];
  const ord = orders(nodes);
  const childCount = new Map<number, number>();
  for (const n of nodes) if (n.parent >= 0) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
  const snapshot = nodes.length;

  const add = (parent: TreeNode, dir: Vec3, lenRand: number, order: number): void => {
    nodes.push({
      id: data.nextId,
      parent: parent.id,
      pos: [0, 0, 0],
      dir,
      length: base * f * (0.8 + 0.4 * lenRand),
      radius: 0.004,
      bornAge: ageBefore + 1,
      bud: true,
      boostUntil: null,
      wire: null,
      leaves: [],
    });
    ord.set(data.nextId, order);
    data.nextId += 1;
    childCount.set(parent.id, (childCount.get(parent.id) ?? 0) + 1);
  };

  const bias = (d: Vec3, order: number): Vec3 =>
    order === 0
      ? normalize([d[0], d[1] + P.trunkUp, d[2]])
      : normalize([d[0], d[1] + (P.branchTargetY - d[1]) * P.branchPull, d[2]]);

  // 3. 枝先：次数と段階に応じた確率で伸びる（A）。伸びなかった枝先は頂芽を持ったまま
  for (let i = 0; i < snapshot; i++) {
    const n = nodes[i]!;
    if (!n.bud) continue;
    const go = rng.next();
    const az = rng.next();
    const mag = rng.next();
    const lenRand = rng.next();
    const o = ord.get(n.id)!;
    const pe = P.elongate[Math.min(o, 2)]![stage];
    if (go >= pe || nodes.length >= MAX_NODES) continue;
    const bent = rotateAway(n.dir, P.jitter * (1 - straightness) * mag, az);
    add(n, bias(bent, o), lenRand, o);
    n.bud = false;
  }

  // 4. 側芽（C・D）
  const ang = ((P.lateralMinDeg + spread * P.lateralRangeDeg) * Math.PI) / 180;
  for (let i = 0; i < snapshot; i++) {
    const n = nodes[i]!;
    if (ageBefore - n.bornAge > P.lateralWindow || (childCount.get(n.id) ?? 0) > 1) continue;
    const r = rng.next();
    const az = rng.next();
    const lenRand = rng.next();
    const crowd = Math.max(0, 1 - nodes.length / MAX_NODES);
    const p = P.branchP[stage] * (0.5 + branchiness) * crowd;
    if (r >= p || nodes.length >= MAX_NODES) continue;
    const o = ord.get(n.id)! + 1;
    add(n, bias(rotateAway(n.dir, ang, az), o), lenRand, o);
  }

  recomputeShape(data);

  // 6. 葉（E）
  const index = new Map<number, number>();
  nodes.forEach((n, i) => index.set(n.id, i));
  const depth = new Int32Array(nodes.length).fill(-1);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const d = depth[i] === -1 ? 0 : depth[i]!;
    depth[i] = d;
    const n = nodes[i]!;
    if (n.parent >= 0) {
      const pi = index.get(n.parent)!;
      if (depth[pi] === -1 || d + 1 < depth[pi]!) depth[pi] = d + 1;
    }
  }
  let total = 0;
  nodes.forEach((n, i) => {
    if (depth[i]! >= P.leafDepth) n.leaves = [];
    total += n.leaves.length;
  });
  const size = 0.6 + 0.8 * leafSize;
  nodes.forEach((n, i) => {
    if (depth[i]! >= P.leafDepth || n.leaves.length > 0) return;
    for (let k = 0; k < P.leavesPerNode && total < MAX_LEAVES; k++) {
      n.leaves.push({ size, regrowAt: null });
      total++;
    }
  });

  data.age = ageBefore + 1;
  data.rngState = rng.state;
}
