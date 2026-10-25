import { describe, expect, it } from 'vitest';
import { advance } from '../../src/core/tree';
import { MAX_LEAVES, MAX_NODES } from '../../src/core/constants';
import { leafCount, makeSyntheticTree } from './helpers';

describe('計算時間', () => {
  it('節 3,000 個・葉 4,000 枚に近い木から 720 ステップ（30日分）の計算が 5 秒未満で終わる', () => {
    const t = makeSyntheticTree(MAX_NODES, { leavesPerTip: 2 });
    expect(t.nodes).toHaveLength(MAX_NODES);
    expect(leafCount(t)).toBeGreaterThan(MAX_LEAVES * 0.9);
    const start = performance.now();
    advance(t, 720);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
