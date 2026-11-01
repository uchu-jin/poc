import { describe, expect, it } from 'vitest';
import { INDICES_PER_NODE, VERTS_PER_NODE, buildBranchArrays } from '../../src/render/branch-mesh';
import { advance, createTree } from '../../src/core/tree';
import { MAX_NODES } from '../../src/core/constants';
import { makeSyntheticTree } from './helpers';

const NOW = Date.UTC(2026, 9, 25);

describe('枝の形（branch-mesh.ts。FR-040）', () => {
  it('節 n 個のとき、頂点数は n × 1節あたりの頂点数、添字は n × 1節あたりの添字の数となる', () => {
    const t = createTree(9, NOW);
    advance(t, 60);
    const n = t.nodes.length;
    const a = buildBranchArrays(t);
    expect(a.position.length).toBe(n * VERTS_PER_NODE * 3);
    expect(a.born.length).toBe(n * VERTS_PER_NODE);
    expect(a.index.length).toBe(n * INDICES_PER_NODE);
    expect(Math.max(...a.index)).toBeLessThan(n * VERTS_PER_NODE);
  });

  it('節ごとの頂点に、その節の id と bornAge がそろって入る', () => {
    const t = createTree(9, NOW);
    advance(t, 30);
    const a = buildBranchArrays(t);
    t.nodes.forEach((node, i) => {
      for (let k = 0; k < VERTS_PER_NODE; k++) {
        const vi = i * VERTS_PER_NODE + k;
        expect(a.nodeId[vi]).toBe(node.id);
        expect(a.born[vi]).toBe(node.bornAge);
      }
    });
    expect(a.nodeIds).toEqual(t.nodes.map((x) => x.id));
  });

  it('長さ 0 の根元の節（種）でも NaN を出さない', () => {
    const t = createTree(9, NOW);
    expect(t.nodes[0]!.length).toBe(0);
    const a = buildBranchArrays(t);
    for (const arr of [a.position, a.normal, a.dir, a.len, a.ink, a.radius]) {
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('節 3,000 個（上限）の木でも作れる', () => {
    const t = makeSyntheticTree(MAX_NODES);
    const a = buildBranchArrays(t);
    expect(a.nodeIds).toHaveLength(MAX_NODES);
    expect(a.position.every((v) => Number.isFinite(v))).toBe(true);
  });
});
