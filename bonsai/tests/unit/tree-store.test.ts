import { describe, expect, it } from 'vitest';
import { advance, createTree } from '../../src/core/tree';
import { parseSave } from '../../src/core/store';
import { MAX_NODES, UINT32_MAX } from '../../src/core/constants';
import type { SaveData } from '../../src/core/types';
import { makeSyntheticTree } from './helpers';

const NOW = Date.UTC(2026, 9, 22);

function roundTrip(t: SaveData): void {
  const r = parseSave(JSON.stringify(t));
  expect(r.kind, r.kind === 'invalid' ? r.reason : '').toBe('ok');
  if (r.kind === 'ok') expect(r.data).toEqual(t);
}

describe('成長で作った保存データは、必ず自分の検証を通る（テストレビュー P0-1）', () => {
  it.each([0, UINT32_MAX, 123456789])(
    'seed %i：種から成木までのどの時点でも parseSave が ok で、値が一致する',
    (seed) => {
      const t = createTree(seed, NOW);
      roundTrip(t);
      let done = 0;
      for (const at of [1, 48, 121, 168]) {
        advance(t, at - done);
        done = at;
        roundTrip(t);
      }
    },
  );

  it('節が上限に届いた木をさらに 100 ステップ進めても parseSave が ok になる', () => {
    const t = makeSyntheticTree(MAX_NODES);
    advance(t, 100);
    expect(t.nodes).toHaveLength(MAX_NODES);
    roundTrip(t);
  });
});
