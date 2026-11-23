// 実装レビュー（2026-11-23）の P1 への対応：壊れた入力・重い入力・潰れた形
import { describe, expect, it } from 'vitest';
import { buildGlyph } from '../../src/features/glyph-engine/buildGlyph';
import { buildGlyphs } from '../../src/features/glyph-engine/buildGlyphs';
import { boundsOf, crossSection } from '../../src/features/glyph-engine/geometry';
import { MAX_FLAT_POINTS } from '../../src/features/glyph-engine/metrics';
import { DEFAULT_PARAMS, clampParams } from '../../src/features/glyph-engine/params';
import {
  glyph,
  line,
  path,
  type P as Pt,
  type Seg,
} from '../../src/features/glyph-engine/skeletons/build';
import { validateSkeleton } from '../../src/features/glyph-engine/validateSkeleton';
import type { Params } from '../../src/features/glyph-engine/types';

const P = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, ...p });

describe('パラメータが null（P1-3）', () => {
  it('clampParams(null) は既定値', () => {
    expect(clampParams(null)).toEqual(DEFAULT_PARAMS);
  });
  it('buildGlyph・buildGlyphs は null のパラメータでも例外を投げず、既定値で組み立てる', () => {
    expect(() => buildGlyph('I', null as never)).not.toThrow();
    expect(buildGlyph('I', null as never)).toEqual(buildGlyph('I', P()));
    expect(() => buildGlyphs(null as never)).not.toThrow();
  });
});

describe('潰れた形（P1-4）', () => {
  const p = (id: string, x: number, y: number) => ({ id, x, y });
  it.each([
    [
      '長さ 0 の直線',
      { strokes: [{ start: p('a', 100, 0), segments: [{ kind: 'line', to: p('b', 100, 0) }] }] },
    ],
    [
      '4 点が同じ 3 次ベジェ',
      {
        strokes: [
          {
            start: p('a', 100, 0),
            segments: [
              { kind: 'cubic', c1: p('b', 100, 0), c2: p('c', 100, 0), to: p('d', 100, 0) },
            ],
          },
        ],
      },
    ],
    [
      '1 区間で始点に戻るだけの閉じた線',
      {
        strokes: [
          { closed: true, start: p('a', 100, 0), segments: [{ kind: 'line', to: p('b', 100, 0) }] },
        ],
      },
    ],
  ])('%s → 輪郭が空（合成に失敗ではない）', (_, sk) => {
    expect(buildGlyph('I', P(), { skeleton: sk })).toMatchObject({
      ok: false,
      reason: 'empty-outline',
    });
  });
});

describe('重なった線・引き返す線でも端の形が付く（P1-5）', () => {
  const one = glyph(line([100, 0], [100, 700]));
  const twice = glyph(line([100, 0], [100, 700]), line([100, 0], [100, 700]));
  const reversed = glyph(line([100, 0], [100, 700]), line([100, 700], [100, 0]));
  const retrace = glyph(path([100, 0], [100, 700], [100, 0]));
  it.each([
    ['同じ向きに 2 本', twice],
    ['逆向きに 2 本', reversed],
    ['同じ道を引き返す 1 本', retrace],
  ])('%s：丸い端は 1 本のときと同じ高さ、スラブも 1 本のときと同じ幅', (_, sk) => {
    const round1 = buildGlyph('I', P({ terminal: 'round' }), { skeleton: one });
    const roundN = buildGlyph('I', P({ terminal: 'round' }), { skeleton: sk });
    expect(roundN.ok && round1.ok && roundN.bounds!.maxY).toBeCloseTo(
      round1.ok ? round1.bounds!.maxY : 0,
      0,
    );
    expect(roundN.ok && roundN.bounds!.minY).toBeCloseTo(-45, 0);
    const slab1 = buildGlyph('I', P({ terminal: 'slab' }), { skeleton: one });
    const slabN = buildGlyph('I', P({ terminal: 'slab' }), { skeleton: sk });
    expect(slabN.ok && slabN.advanceWidth).toBeCloseTo(slab1.ok ? slab1.advanceWidth : 0, 0);
  });
});

describe('重い骨格（P1-1・P1-2）', () => {
  it(`折れ線にした点の数が 1 文字 ${MAX_FLAT_POINTS} を超える骨格は不正`, () => {
    // 3 次ベジェ 1 区間 ＝ 16 点。線 1 本の骨格の点は 64 個までなので、線を分けて数を合わせる
    const wave = (y: number, n: number) =>
      path(
        [0, y],
        ...Array.from(
          { length: n },
          (_, i) =>
            [
              [i * 10 + 3, y + 100],
              [i * 10 + 6, y - 100],
              [i * 10 + 10, y],
            ] as [Pt, Pt, Pt],
        ),
      );
    // 4 本 × (1 ＋ 6 × 16) ＝ 388 点 → 合格、5 本 × (1 ＋ 5 × 16) ＝ 405 点 → 不正
    expect(validateSkeleton(glyph(...[0, 1, 2, 3].map((k) => wave(k * 200, 6)))).ok).toBe(true);
    expect(validateSkeleton(glyph(...[0, 1, 2, 3, 4].map((k) => wave(k * 150, 5)))).ok).toBe(false);
  });

  it('2 点の間を何度も往復する線（上限の中）でも例外を投げず、すぐ終わる', () => {
    const zig = Array.from({ length: 63 }, (_, i) => (i % 2 ? [100, 0] : [500, 600]) as Pt);
    const sk = glyph(...Array.from({ length: 6 }, () => path([100, 0], ...zig)));
    for (const join of ['miter', 'round'] as const) {
      const t = performance.now();
      expect(() => buildGlyph('I', P({ join }), { skeleton: sk })).not.toThrow();
      expect(performance.now() - t).toBeLessThan(500);
    }
  });

  it(`交差の多い曲線で上限の近く（388 点 ≦ ${MAX_FLAT_POINTS}）でも 1 文字 500ms 未満`, () => {
    // 4 本 × 6 区間の 3 次ベジェ ＝ 4 × (1 ＋ 96) ＝ 388 点
    const wave = (y: number, n: number): Seg[] =>
      Array.from(
        { length: n },
        (_, i) =>
          [
            [i * 150 + 50, y + 300],
            [i * 150 + 100, y - 300],
            [i * 150 + 150, y],
          ] as [Pt, Pt, Pt],
      );
    const sk = glyph(...[100, 250, 400, 550].map((y) => path([0, y], ...wave(y, 6))));
    expect(validateSkeleton(sk).ok).toBe(true);
    const t = performance.now();
    buildGlyph('I', P({ weight: 150, hWeight: 150 }), { skeleton: sk });
    expect(performance.now() - t).toBeLessThan(500);
  });

  it('組み立ての途中で想定外の例外が出ても、結果で返し、他の文字は組み立てられる', () => {
    const throwing = () => ({
      AddPaths: () => {
        throw new Error('boom');
      },
      Execute: () => true,
    });
    const all = buildGlyphs(P(), { makeClipper: throwing });
    expect(all.A).toMatchObject({ ok: false, reason: 'union-failed' });
    expect(all[' ']!.ok).toBe(true);
  });
});

describe('1 本の線の中の鋭い折れ（20° 超）は角として扱う（P1-7）', () => {
  // L を 1 本の線で書く：縦線を下りて、そのまま右へ
  const L1 = glyph(path([100, 700], [100, 45], [460, 45]));
  it('尖った角：外側の角が四角く埋まる（角の左下まで塗られている）', () => {
    const r = buildGlyph('L', P({ join: 'miter' }), { skeleton: L1 });
    if (!r.ok) throw new Error(r.message);
    const b = boundsOf(r.outline)!;
    const [span] = crossSection(r.outline, b.minY + 1);
    expect(span![0]).toBeCloseTo(b.minX, 0);
  });
  it('丸い角：外側の角が丸くなる（角の左下は塗られない）', () => {
    const r = buildGlyph('L', P({ join: 'round' }), { skeleton: L1 });
    if (!r.ok) throw new Error(r.message);
    const b = boundsOf(r.outline)!;
    const [span] = crossSection(r.outline, b.minY + 1);
    expect(span![0]).toBeGreaterThan(b.minX + 20);
  });
  it('なめらかにつながる線（U）は分けない：角の図形が付かず、丸い角でも同じ輪郭', () => {
    const miter = buildGlyph('U', P({ join: 'miter' }));
    const round = buildGlyph('U', P({ join: 'round' }));
    expect(miter.ok && round.ok && miter.outline).toEqual(round.ok ? round.outline : null);
  });
});

describe('他の線の上にある端（T 字）には、丸い端も付けない（P1-8）', () => {
  // 細い横線（横線の太さ 20）の上に、太い縦線（太さ 150）の端が乗る
  const T = glyph(line([0, 300], [600, 300]), line([300, 700], [300, 300]));
  it('丸い端の円が横線の下へはみ出さない', () => {
    const r = buildGlyph('T', P({ weight: 150, hWeight: 20, terminal: 'round' }), { skeleton: T });
    if (!r.ok) throw new Error(r.message);
    expect(r.bounds!.minY).toBeCloseTo(290, 0);
  });
});
