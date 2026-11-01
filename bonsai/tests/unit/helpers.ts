import type { SaveData, TreeNode } from '../../src/core/types';
import { TIME_FLOOR } from '../../src/core/constants';

/**
 * 上限付近の木を手で作る（成長で上限に届くまで育てると遅く、調整値にも左右されるため）。
 * 根元から幹を trunk 節まっすぐ伸ばし、残りの節は幹の節から1節ずつの横枝として付ける。
 * 横枝はすべて頂芽を持つ。age は側芽の窓の外（200）。
 */
export function makeSyntheticTree(
  count: number,
  opts: { trunk?: number; leavesPerTip?: number; age?: number } = {},
): SaveData {
  const trunk = Math.min(opts.trunk ?? 200, count);
  const age = opts.age ?? 200;
  const nodes: TreeNode[] = [];
  for (let i = 0; i < count; i++) {
    const isTrunk = i < trunk;
    const parent = i === 0 ? -1 : isTrunk ? i - 1 : (i - trunk) % (trunk - 1);
    nodes.push({
      id: i,
      parent,
      pos: [0, 0, 0],
      dir: isTrunk ? [0, 1, 0] : [1, 0, 0],
      length: 0.01,
      radius: 0.004,
      bornAge: 0,
      bud: !isTrunk || i === trunk - 1,
      boostUntil: null,
      wire: null,
      leaves: [],
    });
  }
  const per = opts.leavesPerTip ?? 0;
  if (per > 0) {
    for (const n of nodes) {
      if (n.bud) n.leaves = Array.from({ length: per }, () => ({ size: 1, regrowAt: null }));
    }
  }
  return {
    version: 1,
    seed: 1,
    rngState: 12345,
    createdAt: TIME_FLOOR,
    lastTickAt: TIME_FLOOR,
    age,
    water: 100,
    traits: { straightness: 0.5, branchiness: 0.5, spread: 0.5, leafSize: 0.5 },
    nextId: count,
    nodes,
  };
}

export function leafCount(data: SaveData): number {
  return data.nodes.reduce((s, n) => s + n.leaves.length, 0);
}

export function childrenOf(data: SaveData, id: number): TreeNode[] {
  return data.nodes.filter((n) => n.parent === id);
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}
