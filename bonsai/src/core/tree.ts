// 木の成長（FR-004〜009・012）。Three.js・DOM に依存しない。
// 決定性の約束（.claude/plans/core-growth.md 3章）：
// - 節は nodes の並び（id の小さい順）で処理し、同じステップで生まれた節は次のステップから対象にする
// - 上限に届いて足さないときも、乱数は同じ回数だけ引いて捨てる
// - 段階と基準値はステップを進める前の age で決める（種からの最初のステップは芽の値）
import {
  APICAL_JITTER,
  BASE_LENGTH,
  BOOST_FACTOR,
  BRANCH_P,
  GROWTH_MIN,
  INITIAL_WATER,
  LEAF_SIZE_MIN,
  LEAF_SIZE_RANGE,
  LENGTH_RAND_MIN,
  LENGTH_RAND_RANGE,
  LATERAL_ANGLE_MIN_DEG,
  LATERAL_ANGLE_RANGE_DEG,
  LATERAL_WINDOW,
  LEAF_DEPTH,
  LEAVES_PER_NODE,
  MAX_LEAVES,
  MAX_NODES,
  R_STEP,
  R_TIP,
  SAVE_VERSION,
  STAGE_END,
  TIME_FLOOR,
  TRUNK_UP,
  BRANCH_TARGET_Y,
  CROWD_HALF,
  BRANCH_PULL,
  ELONGATE,
  WATER_DECAY,
  WATER_MAX,
  type Stage,
} from './constants';
import { Rng } from './rng';
import type { SaveData, TreeNode, Vec3 } from './types';
import { addScaled, normalize, rotateAway } from './vec';

type GrowingStage = Exclude<Stage, 'seed'>;

export function stageOf(age: number): Stage {
  if (age <= STAGE_END.seed) return 'seed';
  if (age <= STAGE_END.sprout) return 'sprout';
  if (age <= STAGE_END.seedling) return 'seedling';
  if (age <= STAGE_END.young) return 'young';
  return 'mature';
}

/** 混み具合による枝分かれの倍率。節が多いほど強く抑え、上限で 0（2026-10-25 プランの変更） */
// ADR-0002: 混み具合で枝分かれを抑える式（V-06。決定に追記済み）
export function crowdFactor(nodeCount: number): number {
  const room = Math.max(0, 1 - nodeCount / MAX_NODES);
  const r = nodeCount / CROWD_HALF;
  return room / (1 + r * r);
}

/** 成長係数。水分0でも GROWTH_MIN（FR-005。2026-10-25 確定） */
export function growthFactor(water: number): number {
  return GROWTH_MIN + ((1 - GROWTH_MIN) * water) / WATER_MAX;
}

export function createTree(seed: number, now: number): SaveData {
  const rng = new Rng(seed);
  const traits = {
    straightness: rng.next(),
    branchiness: rng.next(),
    spread: rng.next(),
    leafSize: rng.next(),
  };
  const t = Math.max(now, TIME_FLOOR);
  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    createdAt: t,
    lastTickAt: t,
    age: 0,
    water: INITIAL_WATER,
    traits,
    nextId: 1,
    nodes: [
      {
        id: 0,
        parent: -1,
        pos: [0, 0, 0],
        dir: [0, 1, 0],
        length: 0,
        radius: R_TIP,
        bornAge: 0,
        bud: true,
        boostUntil: null,
        wire: null,
        leaves: [],
      },
    ],
  };
}

export function advance(data: SaveData, steps: number): void {
  for (let i = 0; i < steps; i++) step(data);
}

/** 1ステップ（1時間）ぶん育てる。data をその場で書き換える */
export function step(data: SaveData): void {
  const rng = new Rng(data.rngState);
  const ageBefore = data.age;
  const s = stageOf(ageBefore);
  const stage: GrowingStage = s === 'seed' ? 'sprout' : s;
  const nodes = data.nodes;
  const { straightness, branchiness, spread, leafSize } = data.traits;

  // 1. 水分を減らす
  data.water = Math.max(0, data.water - WATER_DECAY);
  // 2. 成長係数
  const f = growthFactor(data.water);
  const base = BASE_LENGTH[stage];

  const childCount = new Map<number, number>();
  for (const n of nodes) {
    if (n.parent >= 0) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
  }
  const snapshot = nodes.length;
  const order = branchOrders(nodes);

  // ADR-0001: id は nextId から振り、二度と使わない（parent は親の id を指す）
  const addChild = (parent: TreeNode, dir: Vec3, lenRand: number): void => {
    nodes.push({
      id: data.nextId,
      parent: parent.id,
      pos: [0, 0, 0], // 手順5で計算し直す
      dir,
      length: base * f * (LENGTH_RAND_MIN + LENGTH_RAND_RANGE * lenRand),
      radius: R_TIP,
      bornAge: ageBefore + 1,
      bud: true,
      boostUntil: null,
      wire: null,
      leaves: [],
    });
    data.nextId += 1;
    childCount.set(parent.id, (childCount.get(parent.id) ?? 0) + 1);
  };

  // 3. 枝先が、次数と段階に応じた確率で1節伸びる。
  // ADR-0002: 頂芽優勢の衰え（A）と、幹は上・枝は水平へ寄せる向き（B）。乱数は伸びなくても4回引く
  for (let i = 0; i < snapshot; i++) {
    const n = nodes[i]!;
    if (!n.bud) continue;
    const go = rng.next();
    const az = rng.next();
    const mag = rng.next();
    const lenRand = rng.next();
    const o = order.get(n.id)!;
    const pElongate = ELONGATE[Math.min(o, ELONGATE.length - 1)]![stage];
    if (go >= pElongate || nodes.length >= MAX_NODES) continue;
    const bent = rotateAway(n.dir, APICAL_JITTER * (1 - straightness) * mag, az);
    const dir: Vec3 =
      o === 0
        ? normalize([bent[0], bent[1] + TRUNK_UP, bent[2]])
        : normalize([bent[0], bent[1] + (BRANCH_TARGET_Y - bent[1]) * BRANCH_PULL, bent[2]]);
    addChild(n, dir, lenRand);
    n.bud = false;
  }

  // 4. 側芽が確率で枝になる
  const lateralAngle = ((LATERAL_ANGLE_MIN_DEG + spread * LATERAL_ANGLE_RANGE_DEG) * Math.PI) / 180;
  for (let i = 0; i < snapshot; i++) {
    const n = nodes[i]!;
    // ADR-0001: 剪定の芽吹きブーストは節の boostUntil で持つ。ADR-0002 の D：側芽の窓とブースト
    const boosted = n.boostUntil !== null && n.boostUntil > ageBefore;
    const young = ageBefore - n.bornAge <= LATERAL_WINDOW;
    // 頂芽がまだ伸びていない節（bud: true）は横枝を出さない。出すと横枝が「子のうち id が最小」になり、
    // 延長と見なされて枝の次数が入れ替わるため（2026-10-24 実装時の判断）
    // ADR-0002: 頂芽がまだ伸びていない節は横枝を出さない（V-03。決定に追記済み）
    if (n.bud || !(young || boosted) || (childCount.get(n.id) ?? 0) > 1) continue;
    const r = rng.next();
    const az = rng.next();
    const lenRand = rng.next();
    const crowd = crowdFactor(nodes.length);
    const p = BRANCH_P[stage] * (0.5 + branchiness) * crowd * (boosted ? BOOST_FACTOR : 1);
    if (r >= p || nodes.length >= MAX_NODES) continue;
    addChild(n, rotateAway(n.dir, lateralAngle, az), lenRand);
  }

  // 5. 位置と太さを計算し直す
  recomputeShape(data);

  // 6. 葉：枝先から LEAF_DEPTH 節未満の節にだけ付く（ADR-0002 の E）
  updateLeaves(data, LEAF_SIZE_MIN + LEAF_SIZE_RANGE * leafSize);

  // 7. age を進める
  data.age = ageBefore + 1;
  data.rngState = rng.state;
}

/**
 * 枝の次数（幹 0、幹から出た枝 1 …）。保存せず、節の並びから求める。
 * 子のうち id が最も小さいものは延長（次数そのまま）、ほかは横枝（次数 +1）
 */
// ADR-0002: 枝の次数は保存せず、節の並びから求める
export function branchOrders(nodes: readonly TreeNode[]): Map<number, number> {
  const first = new Map<number, number>();
  for (const n of nodes) if (n.parent >= 0 && !first.has(n.parent)) first.set(n.parent, n.id);
  const order = new Map<number, number>();
  for (const n of nodes) {
    if (n.parent < 0) order.set(n.id, 0);
    else order.set(n.id, order.get(n.parent)! + (first.get(n.parent) === n.id ? 0 : 1));
  }
  return order;
}

/** 節の id から、nodes の中の位置を引く表 */
function indexById(nodes: readonly TreeNode[]): Map<number, number> {
  const index = new Map<number, number>();
  nodes.forEach((n, i) => index.set(n.id, i));
  return index;
}

/** 位置（子の pos ＝ 親の先端）と太さ（r親 = √Σr子² + R_STEP）を計算し直す */
export function recomputeShape(data: SaveData): void {
  const nodes = data.nodes;
  const index = indexById(nodes);
  for (const n of nodes) {
    if (n.parent < 0) continue;
    const p = nodes[index.get(n.parent)!]!;
    n.pos = addScaled(p.pos, p.dir, p.length);
  }
  const sumSq = new Float64Array(nodes.length);
  const hasChild = new Uint8Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    n.radius = hasChild[i] ? Math.sqrt(sumSq[i]!) + R_STEP : R_TIP;
    if (n.parent >= 0) {
      const pi = index.get(n.parent)!;
      sumSq[pi] = sumSq[pi]! + n.radius * n.radius;
      hasChild[pi] = 1;
    }
  }
}

function updateLeaves(data: SaveData, size: number): void {
  const nodes = data.nodes;
  const index = indexById(nodes);
  const depth = new Int32Array(nodes.length).fill(-1);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const d = depth[i] === -1 ? 0 : depth[i]!;
    depth[i] = d;
    const n = nodes[i]!;
    if (n.parent >= 0) {
      const pi = index.get(n.parent)!;
      const cand = d + 1;
      if (depth[pi] === -1 || cand < depth[pi]!) depth[pi] = cand;
    }
  }
  let total = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (depth[i]! >= LEAF_DEPTH) n.leaves = [];
    total += n.leaves.length;
  }
  for (let i = 0; i < nodes.length && total < MAX_LEAVES; i++) {
    const n = nodes[i]!;
    if (depth[i]! >= LEAF_DEPTH || n.leaves.length > 0) continue;
    for (let k = 0; k < LEAVES_PER_NODE && total < MAX_LEAVES; k++) {
      n.leaves.push({ size, regrowAt: null });
      total += 1;
    }
  }
}
