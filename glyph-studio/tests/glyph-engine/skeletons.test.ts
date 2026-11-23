import { describe, expect, it } from 'vitest';
import { buildGlyph } from '../../src/features/glyph-engine/buildGlyph';
import { buildGlyphs } from '../../src/features/glyph-engine/buildGlyphs';
import { crossSection, holeCount, signedArea } from '../../src/features/glyph-engine/geometry';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import {
  DEFAULT_SKELETONS,
  EXPECTED_HOLES,
  GLYPH_CHARS,
} from '../../src/features/glyph-engine/skeletons';
import { validateSkeleton } from '../../src/features/glyph-engine/validateSkeleton';
import type { BuildResult, Outline, Params } from '../../src/features/glyph-engine/types';

const P = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, ...p });

/** 閉じた多角形として扱える：リングが 3 点以上・面積が 0 でない・同じ点が続かない */
function expectClosedRings(outline: Outline, label: string) {
  for (const ring of outline) {
    expect(ring.length, label).toBeGreaterThanOrEqual(3);
    expect(Math.abs(signedArea(ring)), label).toBeGreaterThan(0);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      expect(a[0] === b[0] && a[1] === b[1], label).toBe(false);
    }
  }
}
const okOf = (r: BuildResult | undefined, label: string) => {
  expect(r?.ok, `${label}: ${r && !r.ok ? r.message : ''}`).toBe(true);
  if (!r || !r.ok) throw new Error(label);
  return r;
};

describe('既定の骨格データ', () => {
  it('キーがちょうど A-Z・a-z・0-9 の 62 個で、すべて検査に合格する', () => {
    expect(Object.keys(DEFAULT_SKELETONS).sort()).toEqual([...GLYPH_CHARS].sort());
    expect(GLYPH_CHARS).toHaveLength(62);
    for (const ch of GLYPH_CHARS) expect(validateSkeleton(DEFAULT_SKELETONS[ch]).ok, ch).toBe(true);
  });

  it('想定される穴の数が 62 字ぶんある', () => {
    expect(Object.keys(EXPECTED_HOLES).sort()).toEqual([...GLYPH_CHARS].sort());
  });

  it('62 字すべてが既定値で成功し、閉じた輪郭で、穴の数が想定どおり', () => {
    const all = buildGlyphs(P());
    for (const ch of GLYPH_CHARS) {
      const r = okOf(all[ch], ch);
      expectClosedRings(r.outline, ch);
      expect(holeCount(r.outline), `${ch} の穴の数`).toBe(EXPECTED_HOLES[ch]);
    }
  });

  it.each([
    ['round', 'round'],
    ['slab', 'miter'],
    ['slab', 'round'],
    ['flat', 'round'],
    ['round', 'miter'],
  ] as const)('端 %s・角 %s でも 62 字が成功し、穴の数が想定どおり', (terminal, join) => {
    const all = buildGlyphs(P({ terminal, join }));
    for (const ch of GLYPH_CHARS) {
      const r = okOf(all[ch], ch);
      expect(holeCount(r.outline), `${ch} の穴の数`).toBe(EXPECTED_HOLES[ch]);
    }
  });
});

describe('スラブは空いている幅に縮める（2026-11-23 作者が決定）', () => {
  it('a の右の縦線の足は、右だけに張り出し、左（丸の側）へは張り出さない', () => {
    const flat = okOf(buildGlyph('a', P()), 'a');
    const slab = okOf(buildGlyph('a', P({ terminal: 'slab' })), 'a');
    // 足の高さ（y 0〜10）で切ると、縦線の左端は平らなときと同じ位置
    const footFlat = crossSection(flat.outline, 5);
    const footSlab = crossSection(slab.outline, 5);
    const stemLeft = (s: [number, number][]) => s[s.length - 1]![0];
    expect(stemLeft(footSlab)).toBeCloseTo(stemLeft(footFlat), 0);
    expect(footSlab[footSlab.length - 1]![1]).toBeGreaterThan(
      footFlat[footFlat.length - 1]![1] + 50,
    );
  });

  it('1 本の線の両端が向かい合う U でも、上の 2 つのスラブはくっつかない（幅 0.8・太さ 140）', () => {
    const u = okOf(
      buildGlyph('U', P({ weight: 140, hWeight: 140, width: 0.8, terminal: 'slab' })),
      'U',
    );
    expect(crossSection(u.outline, 695)).toHaveLength(2);
    expect(holeCount(u.outline)).toBe(0);
  });

  it('H の 2 本の足のスラブは、太さの上限 150 でもくっつかない', () => {
    const h = okOf(buildGlyph('H', P({ weight: 150, hWeight: 150, terminal: 'slab' })), 'H');
    expect(crossSection(h.outline, 5)).toHaveLength(2);
    expect(holeCount(h.outline)).toBe(0);
  });
});

describe('きついカーブの内側に小さな穴を作らない（膨らませを三角形に分ける）', () => {
  it.each([
    ['t', { weight: 140, hWeight: 140, width: 1.25, xHeight: 420 }],
    ['s', { weight: 140, hWeight: 140, width: 0.8, slant: 15, xHeight: 420 }],
  ] as const)('%s（実装順 11 の組み合わせテストで見つかった条件）は穴が 0', (ch, p) => {
    const r = okOf(buildGlyph(ch, P(p)), ch);
    expect(holeCount(r.outline)).toBe(0);
  });
});

describe('全文字に同じ値が効く（FR-007、ストーリー2 シナリオ1）', () => {
  it.each([
    [150, 150],
    [90, 90],
  ])('太さ %s のとき、I・l・1 の縦線の太さがどれも %s', (w, expected) => {
    const all = buildGlyphs(P({ weight: w, hWeight: w }));
    for (const ch of ['I', 'l', '1']) {
      const r = okOf(all[ch], ch);
      const spans = crossSection(r.outline, 300);
      expect(spans, ch).toHaveLength(1);
      expect(spans[0]![1] - spans[0]![0], ch).toBeCloseTo(expected, 0);
    }
  });
});

describe('逆コントラスト（作者が「許す」と決定）', () => {
  it('太さ 40・横線の太さ 150（上限）：H の横棒が 150、縦線が 40 で、62 字すべて成功', () => {
    const p = P({ weight: 40, hWeight: 150 });
    const all = buildGlyphs(p);
    for (const ch of GLYPH_CHARS) okOf(all[ch], ch);
    const h = okOf(all.H, 'H');
    const stems = crossSection(h.outline, 150);
    for (const [a, b] of stems) expect(b - a).toBeCloseTo(40, 0);
    // 縦に切る：x と y を入れ替えて、H の中央の x で切る
    const midX = (h.bounds!.minX + h.bounds!.maxX) / 2;
    const swapped = h.outline.map((r) => r.map(([x, y]) => [y, x] as [number, number]));
    const bars = crossSection(swapped, midX);
    expect(bars).toHaveLength(1);
    expect(bars[0]![1] - bars[0]![0]).toBeCloseTo(150, 0);
  });
});

describe('速さ（SC-001、ADR-0001 V-16）', () => {
  it('A 1 文字は 200 回の中央値で 16ms 未満、62 字まとめて 250ms 未満', () => {
    for (let i = 0; i < 20; i++) buildGlyph('A', P());
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t = performance.now();
      buildGlyph('A', P({ weight: 40 + (i % 120) }));
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[100]!).toBeLessThan(16);
    const t = performance.now();
    buildGlyphs(P());
    expect(performance.now() - t).toBeLessThan(250);
  });
});
