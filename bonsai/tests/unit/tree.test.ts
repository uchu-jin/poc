import { describe, expect, it } from 'vitest';
import { advance, createTree, crowdFactor, growthFactor, stageOf, step } from '../../src/core/tree';
import {
  BASE_LENGTH,
  CROWD_HALF,
  LATERAL_ANGLE_MIN_DEG,
  LATERAL_ANGLE_RANGE_DEG,
  LATERAL_WINDOW,
  LEAF_DEPTH,
  MAX_LEAVES,
  MAX_NODES,
  TIME_FLOOR,
} from '../../src/core/constants';
import { Rng } from '../../src/core/rng';
import type { SaveData, TreeNode, Vec3 } from '../../src/core/types';
import { childrenOf, clone, leafCount, makeSyntheticTree } from './helpers';

const NOW = Date.UTC(2026, 9, 22);

function grown(seed: number, steps: number): SaveData {
  const t = createTree(seed, NOW);
  advance(t, steps);
  return t;
}

function tip(n: TreeNode): Vec3 {
  return [
    n.pos[0] + n.dir[0] * n.length,
    n.pos[1] + n.dir[1] * n.length,
    n.pos[2] + n.dir[2] * n.length,
  ];
}

function angleDeg(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  return (Math.acos(Math.min(1, Math.max(-1, dot / (la * lb)))) * 180) / Math.PI;
}

/** 横枝（親の子のうち id が最小でないもの）の一覧 */
function laterals(t: SaveData): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of t.nodes) {
    const kids = childrenOf(t, n.id);
    out.push(...kids.slice(1));
  }
  return out;
}

describe('createTree', () => {
  it('作った直後は age 0・段階「種」・根元の節1つ・nextId 1 になる', () => {
    const t = createTree(42, NOW);
    expect(t.age).toBe(0);
    expect(stageOf(t.age)).toBe('seed');
    expect(t.nodes).toHaveLength(1);
    expect(t.nodes[0]).toMatchObject({
      id: 0,
      parent: -1,
      bud: true,
      boostUntil: null,
      wire: null,
    });
    expect(t.nextId).toBe(1);
    expect(t.createdAt).toBe(NOW);
    expect(t.lastTickAt).toBe(NOW);
    expect(t.version).toBe(1);
  });

  it('now が TIME_FLOOR より前なら createdAt・lastTickAt は TIME_FLOOR になる', () => {
    const t = createTree(42, TIME_FLOOR - 1000);
    expect(t.createdAt).toBe(TIME_FLOOR);
    expect(t.lastTickAt).toBe(TIME_FLOOR);
  });

  it('性格値は 0〜1 で、seed ごとに決まる', () => {
    const a = createTree(7, NOW).traits;
    const b = createTree(7, NOW).traits;
    const c = createTree(8, NOW).traits;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const v of Object.values(a)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('stageOf と growthFactor', () => {
  it.each([
    [0, 'seed'],
    [1, 'sprout'],
    [12, 'sprout'],
    [13, 'seedling'],
    [48, 'seedling'],
    [49, 'young'],
    [120, 'young'],
    [121, 'mature'],
    [168, 'mature'],
    [169, 'mature'],
  ])('age %i の段階は %s になる', (age, stage) => {
    expect(stageOf(age)).toBe(stage);
  });

  it('成長係数は水分0で0.3、水分100で1.0になる', () => {
    expect(growthFactor(0)).toBeCloseTo(0.3, 12);
    expect(growthFactor(100)).toBeCloseTo(1.0, 12);
  });
});

describe('step', () => {
  it('種から1ステップで節がちょうど2個になり、新しい節の bornAge は 1、nextId は 2 になる', () => {
    const t = createTree(42, NOW);
    step(t);
    expect(t.age).toBe(1);
    expect(t.nodes).toHaveLength(2);
    expect(t.nodes[1]).toMatchObject({ id: 1, parent: 0, bornAge: 1, bud: true });
    expect(t.nodes[0]!.bud).toBe(false);
    expect(t.nextId).toBe(2);
  });

  it('水分は1ステップで4減り、0より下がらない', () => {
    const t = createTree(42, NOW);
    t.water = 100;
    step(t);
    expect(t.water).toBe(96);
    t.water = 0;
    step(t);
    expect(t.water).toBe(0);
  });

  it('水分を引いてから成長係数を決める（水分4と0で、新しい節の長さが一致する）', () => {
    const a = createTree(42, NOW);
    const b = createTree(42, NOW);
    a.water = 4;
    b.water = 0;
    step(a);
    step(b);
    expect(a.nodes[1]!.length).toBe(b.nodes[1]!.length);
  });

  it('新しい節の長さは「基準値 × 成長係数 × 0.8〜1.2」に入る（段階ごと）', () => {
    const t = createTree(5, NOW);
    for (let i = 0; i < 200; i++) {
      const before = t.nextId;
      const stage = stageOf(t.age) === 'seed' ? 'sprout' : stageOf(t.age);
      const f = growthFactor(Math.max(0, t.water - 4));
      step(t);
      const base = BASE_LENGTH[stage as keyof typeof BASE_LENGTH];
      for (const n of t.nodes.filter((n) => n.id >= before)) {
        expect(n.length).toBeGreaterThanOrEqual(base * f * 0.8 - 1e-12);
        expect(n.length).toBeLessThanOrEqual(base * f * 1.2 + 1e-12);
      }
    }
  });

  it('age 169・500 の木では成木の基準値を使う', () => {
    for (const age of [169, 500]) {
      const t = makeSyntheticTree(10, { trunk: 10, age });
      const before = t.nextId;
      // 成木の幹は毎ステップは伸びないので、伸びるまで進める（ADR-0002 の A）
      for (let i = 0; i < 200 && t.nextId === before; i++) {
        t.water = 4; // 引いたあと 0 → f = 0.3
        step(t);
      }
      const added = t.nodes.filter((n) => n.id >= before);
      expect(added.length).toBeGreaterThan(0);
      for (const n of added) {
        expect(n.length).toBeGreaterThanOrEqual(BASE_LENGTH.mature * 0.3 * 0.8 - 1e-12);
        expect(n.length).toBeLessThanOrEqual(BASE_LENGTH.mature * 0.3 * 1.2 + 1e-12);
      }
    }
  });

  it('境目のステップでは、進める前の age の段階の基準値を使う（age 12→13 は芽の値）', () => {
    const t = makeSyntheticTree(10, { trunk: 10, age: 12 });
    t.water = 4;
    const before = t.nextId;
    step(t);
    for (const n of t.nodes.filter((n) => n.id >= before)) {
      expect(n.length).toBeLessThanOrEqual(BASE_LENGTH.sprout * 0.3 * 1.2 + 1e-12);
      expect(n.length).toBeGreaterThanOrEqual(BASE_LENGTH.sprout * 0.3 * 0.8 - 1e-12);
    }
  });

  it('168 ステップで段階「成木」になる', () => {
    expect(stageOf(grown(3, 168).age)).toBe('mature');
  });
});

describe('決定性（FR-008・SC-010）', () => {
  it('同じ seed で 200 ステップ進めた2本の木は完全に一致し、seed が違えば一致しない', () => {
    expect(grown(11, 200)).toEqual(grown(11, 200));
    expect(grown(11, 200).nodes).not.toEqual(grown(12, 200).nodes);
  });

  it('advance(n) → 保存 → 読み込み → advance(m) は advance(n+m) と一致する', () => {
    const a = grown(21, 70);
    const restored = JSON.parse(JSON.stringify(a)) as SaveData;
    advance(restored, 60);
    expect(restored).toEqual(grown(21, 130));
  });

  it('上限に届いていてもいなくても、1ステップで引く乱数の回数は同じ', () => {
    // 節の数だけ違い、頂芽の並びが同じ2本の木：一方は上限ちょうどで何も足せない
    const free = makeSyntheticTree(400, { trunk: 200 });
    const full = makeSyntheticTree(400, { trunk: 200 });
    // full には、成長しない（頂芽なし・窓の外）節を足して上限ちょうどにする
    for (let id = 400; full.nodes.length < MAX_NODES; id++) {
      full.nodes.push({ ...clone(full.nodes[0]!), id, parent: 0, bud: false });
    }
    full.nextId = full.nodes.length;
    step(free);
    step(full);
    expect(full.nodes).toHaveLength(MAX_NODES);
    expect(full.rngState).toBe(free.rngState);
  });
});

describe('性格値が成長に効く（FR-009）', () => {
  function withTraits(patch: Partial<SaveData['traits']>, steps: number): SaveData {
    const t = createTree(99, NOW);
    Object.assign(t.traits, patch);
    advance(t, steps);
    return t;
  }

  it('leafSize：葉の大きさが 0.6 + 0.8 × leafSize と一致する', () => {
    for (const ls of [0, 0.25, 1]) {
      const t = withTraits({ leafSize: ls }, 10);
      const sizes = t.nodes.flatMap((n) => n.leaves.map((l) => l.size));
      expect(sizes.length).toBeGreaterThan(0);
      for (const s of sizes) expect(s).toBeCloseTo(0.6 + 0.8 * ls, 12);
    }
  });

  it('spread：横枝の最初の節が親から開く角度が 45° + spread × 35° と一致する', () => {
    for (const sp of [0, 0.5, 1]) {
      const t = withTraits({ spread: sp, branchiness: 1 }, 120);
      const lats = laterals(t);
      expect(lats.length).toBeGreaterThan(0);
      for (const l of lats) {
        const parent = t.nodes.find((n) => n.id === l.parent)!;
        expect(angleDeg(parent.dir, l.dir)).toBeCloseTo(
          LATERAL_ANGLE_MIN_DEG + sp * LATERAL_ANGLE_RANGE_DEG,
          6,
        );
      }
    }
  });

  it('branchiness：1 のほうが 0 より横枝が多い', () => {
    expect(laterals(withTraits({ branchiness: 1 }, 120)).length).toBeGreaterThan(
      laterals(withTraits({ branchiness: 0 }, 120)).length,
    );
  });

  it('straightness：1 のほうが 0 より頂芽の向きのずれの平均が小さい', () => {
    function meanDeviation(t: SaveData): number {
      const devs: number[] = [];
      for (const n of t.nodes) {
        const first = childrenOf(t, n.id)[0];
        if (first && n.id !== 0) devs.push(angleDeg(n.dir, first.dir));
      }
      return devs.reduce((a, b) => a + b, 0) / devs.length;
    }
    expect(meanDeviation(withTraits({ straightness: 1 }, 100))).toBeLessThan(
      meanDeviation(withTraits({ straightness: 0 }, 100)),
    );
  });
});

describe('上限（FR-012）', () => {
  it('節 2,999 個・頂芽が複数ある木を1ステップ進めると、ちょうど 3,000 個で、足されたのは最も古い頂芽の子', () => {
    // 芽の段階（age 5）：幹の枝先は必ず伸びる
    const t = makeSyntheticTree(MAX_NODES - 1, { age: 5 });
    const firstBud = t.nodes.find((n) => n.bud)!;
    step(t);
    expect(t.nodes).toHaveLength(MAX_NODES);
    expect(t.nodes[MAX_NODES - 1]!.parent).toBe(firstBud.id);
  });

  it('葉 3,999 枚で2枚付けるべき節があると、1枚だけ付いて 4,000 枚になる', () => {
    const t = makeSyntheticTree(2400, { leavesPerTip: 2 });
    // 頂芽の葉を減らして 3,999 枚にし、葉のない枝先を1つ作る
    const tips = t.nodes.filter((n) => n.bud);
    tips[0]!.leaves = [];
    let total = leafCount(t);
    for (const n of tips.slice(1)) {
      if (total <= MAX_LEAVES - 1) break;
      const drop = Math.min(n.leaves.length, total - (MAX_LEAVES - 1));
      n.leaves.splice(0, drop);
      total -= drop;
    }
    // 成長で節や葉が増えないよう、頂芽を止めて上限の節数にしておく
    for (const n of t.nodes) n.bud = false;
    while (t.nodes.length < MAX_NODES) {
      t.nodes.push({ ...clone(t.nodes[0]!), id: t.nextId++, parent: 0, leaves: [] });
    }
    expect(leafCount(t)).toBe(MAX_LEAVES - 1);
    step(t);
    expect(leafCount(t)).toBe(MAX_LEAVES);
  });

  it('葉が 4,000 枚の木では、葉は増えない', () => {
    const t = makeSyntheticTree(1800, { leavesPerTip: 2 });
    expect(leafCount(t)).toBeLessThan(MAX_LEAVES);
    while (leafCount(t) < MAX_LEAVES) {
      t.nodes.find((n) => n.bud && n.leaves.length < 3)!.leaves.push({ size: 1, regrowAt: null });
    }
    step(t);
    expect(leafCount(t)).toBeLessThanOrEqual(MAX_LEAVES);
  });

  it('節が上限に届いた木を 100 ステップ進めても、葉は 0 枚にならない', () => {
    const t = makeSyntheticTree(MAX_NODES);
    advance(t, 100);
    expect(t.nodes).toHaveLength(MAX_NODES);
    expect(leafCount(t)).toBeGreaterThan(0);
  });
});

describe('形の約束', () => {
  const t = grown(31, 168);
  const byId = new Map(t.nodes.map((n) => [n.id, n]));

  it('id は重複せず、nextId はどの id よりも大きい', () => {
    const ids = t.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(t.nextId).toBeGreaterThan(Math.max(...ids));
  });

  it('子の pos は親の先端と一致する', () => {
    for (const n of t.nodes) {
      if (n.parent < 0) continue;
      const p = tip(byId.get(n.parent)!);
      for (let k = 0; k < 3; k++) expect(n.pos[k]).toBeCloseTo(p[k]!, 9);
    }
  });

  it('親の太さは子のどれよりも太い', () => {
    for (const n of t.nodes) {
      for (const c of childrenOf(t, n.id)) expect(n.radius).toBeGreaterThan(c.radius);
    }
  });

  it('葉は枝先から LEAF_DEPTH 節未満の節にだけ付く', () => {
    const depth = new Map<number, number>();
    for (let i = t.nodes.length - 1; i >= 0; i--) {
      const n = t.nodes[i]!;
      const kids = childrenOf(t, n.id);
      depth.set(n.id, kids.length === 0 ? 0 : 1 + Math.min(...kids.map((k) => depth.get(k.id)!)));
    }
    for (const n of t.nodes) {
      if (depth.get(n.id)! >= LEAF_DEPTH) expect(n.leaves).toHaveLength(0);
    }
    expect(leafCount(t)).toBeGreaterThan(0);
  });
});

describe('剪定の芽吹きブースト（boostUntil）', () => {
  it('boostUntil > age の節は、生まれて LATERAL_WINDOW を過ぎていても横枝を出しうる', () => {
    function lateralsAfter(boost: boolean): number {
      const t = makeSyntheticTree(300, { trunk: 300, age: 100 });
      for (const n of t.nodes) n.bud = false; // 頂芽は伸ばさない
      if (boost) for (const n of t.nodes) n.boostUntil = t.age + LATERAL_WINDOW;
      t.water = 100;
      advance(t, 10);
      return t.nodes.length - 300;
    }
    expect(lateralsAfter(false)).toBe(0);
    expect(lateralsAfter(true)).toBeGreaterThan(0);
  });
});

describe('育ち方の目安（調整値 #2 を変えたら一緒に直す）', () => {
  it.each([1, 2, 3])(
    'seed %i：age 168 で節 150〜1,500 個、age 336 で 3,000 個未満になる',
    (seed) => {
      const t = createTree(seed * 7919, NOW);
      advance(t, 168);
      expect(t.nodes.length).toBeGreaterThanOrEqual(150);
      expect(t.nodes.length).toBeLessThanOrEqual(1500);
      advance(t, 168);
      expect(t.nodes.length).toBeLessThan(MAX_NODES);
    },
  );
});

describe('Rng の使い方（tree が前提にする形）', () => {
  it('Rng は state から作り直すと続きが一致する', () => {
    const r = new Rng(1);
    r.next();
    const s = r.state;
    expect(new Rng(s).next()).toBe(r.next());
  });
});

describe('成長の仕組み（ADR-0002）', () => {
  it('A：成木の幹だけの木を 100 ステップ進めても、伸びた節は 50 未満で、枝先は頂芽を持ったまま', () => {
    const t = makeSyntheticTree(10, { trunk: 10, age: 200 });
    advance(t, 100);
    expect(t.nodes.length - 10).toBeLessThan(50);
    expect(t.nodes.filter((n) => n.bud)).toHaveLength(1);
  });

  it('A：芽の幹の枝先は毎ステップ伸びる', () => {
    const t = makeSyntheticTree(10, { trunk: 10, age: 2 });
    const trunkTip = (): TreeNode => {
      let n = t.nodes[0]!;
      for (;;) {
        const first = childrenOf(t, n.id)[0];
        if (!first) return n;
        n = first;
      }
    };
    for (let i = 0; i < 10; i++) {
      const before = trunkTip().id;
      step(t);
      expect(trunkTip().id).not.toBe(before);
    }
  });

  it('B：枝（次数1以上）の延長の節は、幹の節より水平に近い', () => {
    const t = createTree(9, NOW);
    for (let h = 0; h < 168; h++) {
      if (h % 12 === 0) t.water = 70;
      step(t);
    }
    const order = new Map<number, number>();
    for (const n of t.nodes) {
      if (n.parent < 0) order.set(n.id, 0);
      else {
        const first = childrenOf(t, n.parent)[0]!;
        order.set(n.id, order.get(n.parent)! + (first.id === n.id ? 0 : 1));
      }
    }
    const isExtension = (n: TreeNode): boolean =>
      n.parent >= 0 && childrenOf(t, n.parent)[0]!.id === n.id;
    const trunk = t.nodes.filter((n) => order.get(n.id) === 0 && n.parent >= 0);
    const branch = t.nodes.filter((n) => order.get(n.id)! >= 1 && isExtension(n));
    expect(branch.length).toBeGreaterThan(10);
    const meanY = (ns: TreeNode[]): number => ns.reduce((s, n) => s + n.dir[1], 0) / ns.length;
    expect(meanY(trunk) - meanY(branch)).toBeGreaterThanOrEqual(0.3);
  });

  it('D：生まれて 12 ステップの節は横枝を出しうるが、13 ステップの節は出さない', () => {
    function lateralsFrom(ageSinceBorn: number): number {
      // 混み具合の抑え（crowdFactor）が効きすぎないよう、節は 400 個・苗の段階で確かめる
      const t = makeSyntheticTree(400, { trunk: 400, age: 30 });
      t.traits.branchiness = 1;
      for (const n of t.nodes) {
        n.bud = false;
        n.bornAge = t.age - ageSinceBorn;
      }
      t.water = 100;
      step(t);
      return t.nodes.length - 400;
    }
    expect(lateralsFrom(12)).toBeGreaterThan(0);
    expect(lateralsFrom(13)).toBe(0);
  });
});

describe('混み具合で枝分かれを抑える（2026-10-25 プランの変更）', () => {
  it('節 0 個で 1、CROWD_HALF 個でおよそ半分、上限で 0 になる', () => {
    expect(crowdFactor(0)).toBe(1);
    expect(crowdFactor(CROWD_HALF)).toBeCloseTo(0.5 * (1 - CROWD_HALF / MAX_NODES), 12);
    expect(crowdFactor(MAX_NODES)).toBe(0);
    expect(crowdFactor(MAX_NODES + 1)).toBe(0);
  });

  it('節が多いほど小さくなる（単調に減る）', () => {
    let prev = Infinity;
    for (let n = 0; n <= MAX_NODES; n += 50) {
      const c = crowdFactor(n);
      expect(c).toBeLessThan(prev);
      prev = c;
    }
  });

  it.each([1, 2, 3, 4, 5, 6])('seed %i：7日目（age 168）の節の数が 150〜1,500 に収まる', (seed) => {
    const t = createTree(seed * 7919, NOW);
    advance(t, 168);
    expect(t.nodes.length).toBeGreaterThanOrEqual(150);
    expect(t.nodes.length).toBeLessThanOrEqual(1500);
  });
});
