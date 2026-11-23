import { describe, expect, it } from 'vitest';
import { buildGlyphs } from '../../src/features/glyph-engine/buildGlyph';
import { holeCount, signedArea } from '../../src/features/glyph-engine/geometry';
import { PARAM_LIMITS } from '../../src/features/glyph-engine/params';
import { EXPECTED_HOLES, GLYPH_CHARS } from '../../src/features/glyph-engine/skeletons';
import type { Join, Params, Terminal } from '../../src/features/glyph-engine/types';

// 上限・下限の組み合わせ：数値 5 つの上限・下限の 32 通り × 端と角の 6 通り × 62 字（未確定事項 #4）
const KEYS = ['weight', 'hWeight', 'width', 'slant', 'xHeight'] as const;
const STYLES: [Terminal, Join][] = [
  ['flat', 'miter'],
  ['flat', 'round'],
  ['round', 'miter'],
  ['round', 'round'],
  ['slab', 'miter'],
  ['slab', 'round'],
];

function combos(): Params[] {
  const out: Params[] = [];
  for (let mask = 0; mask < 32; mask++)
    for (const [terminal, join] of STYLES) {
      const p = { terminal, join } as Params;
      KEYS.forEach((k, i) => {
        p[k] = PARAM_LIMITS[k][(mask >> i) & 1]!;
      });
      out.push(p);
    }
  return out;
}

describe('上限・下限の組み合わせ（FR-005）', () => {
  it('すべての組み合わせで 62 字が成功し、閉じた輪郭で、穴の数が想定どおり', () => {
    const problems: string[] = [];
    for (const p of combos()) {
      const all = buildGlyphs(p);
      for (const ch of GLYPH_CHARS) {
        const r = all[ch]!;
        const tag = `${ch} ${KEYS.map((k) => `${k}=${p[k]}`).join(' ')} ${p.terminal}/${p.join}`;
        if (!r.ok) {
          problems.push(`${tag}: ${r.reason}`);
          continue;
        }
        const closed = r.outline.every((ring) => ring.length >= 3 && signedArea(ring) !== 0);
        if (!closed) problems.push(`${tag}: 閉じていない輪郭`);
        const holes = holeCount(r.outline);
        if (holes !== EXPECTED_HOLES[ch])
          problems.push(`${tag}: 穴 ${holes}（想定 ${EXPECTED_HOLES[ch]}）`);
      }
    }
    expect(problems.slice(0, 20), `${problems.length} 件`).toEqual([]);
  });
});
