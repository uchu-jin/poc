import { describe, expect, it } from 'vitest';
import { buildGlyph, buildGlyphs } from '../../src/features/glyph-engine/buildGlyph';
import { boundsOf, crossSection, holeCount } from '../../src/features/glyph-engine/geometry';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import { SIDE_BEARING, SPACE_WIDTH } from '../../src/features/glyph-engine/metrics';
import { ellipse, glyph, line, path } from '../../src/features/glyph-engine/skeletons/build';
import type { MakeClipper } from '../../src/features/glyph-engine/union';
import type { BuildResult, Params } from '../../src/features/glyph-engine/types';

// このファイルでは仮の骨格を使う（既定の 62 字は skeletons.test.ts で確かめる）
const A = glyph(
  line([300, 700], [60, 0]),
  line([300, 700], [540, 0]),
  line([142, 240], [458, 240]),
);
const H = glyph(
  line([100, 0], [100, 700]),
  line([500, 0], [500, 700]),
  line([100, 350], [500, 350]),
);
const O = glyph(ellipse(320, 350, 260, 350));
const n = glyph(
  line([100, 0], [100, 500]),
  path(
    [100, 380],
    [
      [160, 470],
      [230, 500],
      [300, 500],
    ],
    [
      [400, 500],
      [460, 440],
      [460, 340],
    ],
    [460, 0],
  ),
);
const I = glyph(line([100, 0], [100, 700]));
const one = glyph(line([300, 0], [300, 700]), line([300, 700], [150, 580]));

const P = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, ...p });
const okOf = (r: BuildResult) => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  return r;
};
const build = (ch: string, sk: unknown, p: Partial<Params> = {}) =>
  okOf(buildGlyph(ch, P(p), { skeleton: sk }));

describe('buildGlyph（仮の骨格）', () => {
  it('A：成功し、穴が 1 つ', () => {
    expect(holeCount(build('A', A).outline)).toBe(1);
  });

  it('尖った角：A の頂点は外側の辺を延長した交点まで（切れ込みがない）', () => {
    const r = build('A', A, { join: 'miter' });
    const half = Math.atan(240 / 700);
    expect(r.bounds!.maxY).toBeCloseTo(700 + 45 / Math.sin(half), 0);
  });

  it('丸い角：A の頂点は丸い（頂点から太さの半分まで）', () => {
    const r = build('A', A, { join: 'round' });
    expect(r.bounds!.maxY).toBeCloseTo(745, 0);
  });

  it('スラブ：横棒の端（他の線の上にある端）と頂点（つながる端）には付かず、足だけに付く', () => {
    const flat = build('A', A);
    const slab = build('A', A, { terminal: 'slab' });
    expect(slab.bounds!.maxY).toBeCloseTo(flat.bounds!.maxY, 0);
    // 足のスラブの分だけ横に広がる（張り出し 90 × 1.4 ＝ 126）
    expect(slab.advanceWidth).toBeGreaterThan(flat.advanceWidth + 100);
    expect(holeCount(slab.outline)).toBe(1);
  });

  it('文字幅 ＝ 輪郭の幅 ＋ 余白 × 2、輪郭の左端 ＝ 余白、bounds は輪郭の最小・最大', () => {
    const r = build('O', O);
    const b = boundsOf(r.outline)!;
    expect(r.bounds).toEqual(b);
    expect(b.minX).toBeCloseTo(SIDE_BEARING, 6);
    expect(r.advanceWidth).toBeCloseTo(b.maxX - b.minX + SIDE_BEARING * 2, 6);
  });

  it('返す座標は 1000 単位で、10 倍すると整数になる', () => {
    const r = build('O', O, { slant: 7 });
    expect(r.bounds!.maxY).toBeGreaterThan(690);
    expect(r.bounds!.maxY).toBeLessThan(800);
    for (const [x, y] of r.outline.flat()) {
      expect(Math.abs(x * 10 - Math.round(x * 10))).toBeLessThan(1e-6);
      expect(Math.abs(y * 10 - Math.round(y * 10))).toBeLessThan(1e-6);
    }
  });

  it('傾き 12°：y は変わらず、x だけずれる', () => {
    const up = build('H', H);
    const it12 = build('H', H, { slant: 12 });
    const tan = Math.tan((12 * Math.PI) / 180);
    expect(it12.bounds!.minY).toBeCloseTo(up.bounds!.minY, 0);
    expect(it12.bounds!.maxY).toBeCloseTo(up.bounds!.maxY, 0);
    const deslanted = boundsOf(it12.outline.map((r) => r.map(([x, y]) => [x - y * tan, y])))!;
    expect(deslanted.maxX - deslanted.minX).toBeCloseTo(up.bounds!.maxX - up.bounds!.minX, 0);
  });

  it('幅 1.25：H の縦線の太さは 90 のまま、2 本の縦線の中心の間隔が 1.25 倍', () => {
    const spans = (w: number) => crossSection(build('H', H, { width: w }).outline, 150);
    const base = spans(1);
    const wide = spans(1.25);
    expect(wide).toHaveLength(2);
    for (const [a, b] of wide) expect(b - a).toBeCloseTo(90, 0);
    const gap = (s: [number, number][]) => (s[1]![0] + s[1]![1]) / 2 - (s[0]![0] + s[0]![1]) / 2;
    expect(gap(wide) / gap(base)).toBeCloseTo(1.25, 2);
  });

  it('x ハイト：小文字の高さが変わり、大文字・数字は変わらない（FR-019）', () => {
    // 弧の中心線が x ハイトにあり、輪郭はその上に横線の太さの半分（45）出る。x ハイトの差だけ上下する
    const top = (xh: number) => build('n', n, { xHeight: xh }).bounds!.maxY;
    expect(top(500)).toBeCloseTo(545, 0);
    expect(top(580) - top(500)).toBeCloseTo(80, 0);
    expect(top(500) - top(420)).toBeCloseTo(80, 0);
    expect(build('H', H, { xHeight: 580 }).bounds!.maxY).toBeCloseTo(build('H', H).bounds!.maxY, 6);
    expect(build('1', one, { xHeight: 420 }).bounds!.maxY).toBeCloseTo(
      build('1', one).bounds!.maxY,
      6,
    );
  });

  it('差し替えた骨格が使われ、太さも効く（FR-011）。小文字には x ハイトも効く', () => {
    const r = build('I', I, { weight: 150, hWeight: 150 });
    const [span] = crossSection(r.outline, 300);
    expect(span![1] - span![0]).toBeCloseTo(150, 0);
    const lower = build('l', I, { xHeight: 580 });
    // 700 は 500〜750 の区間なので 580 ＋（700 − 500）×（750 − 580）÷ 250 ＝ 716 へ動く
    expect(lower.bounds!.maxY).toBeCloseTo(716, 0);
    expect(build('L', I, { xHeight: 580 }).bounds!.maxY).toBeCloseTo(700, 0);
  });

  it.each([
    [
      '座標が NaN',
      {
        strokes: [
          {
            start: { id: 'a', x: NaN, y: 0 },
            segments: [{ kind: 'line', to: { id: 'b', x: 0, y: 1 } }],
          },
        ],
      },
    ],
    ['線が 0 本', { strokes: [] }],
    ['点が 1 つの線', { strokes: [{ start: { id: 'a', x: 0, y: 0 }, segments: [] }] }],
    ['null', null],
  ])('不正な骨格（%s）→ 骨格データが不正。例外は投げない', (_, sk) => {
    const r = buildGlyph('A', P(), { skeleton: sk });
    expect(r).toMatchObject({ ok: false, reason: 'invalid-skeleton' });
  });

  it('骨格のない文字 → 骨格データが不正', () => {
    expect(buildGlyph('あ', P())).toMatchObject({ ok: false, reason: 'invalid-skeleton' });
  });

  it('空の結果を返すクリッパー → スペース以外は「輪郭が空」、スペースは成功のまま', () => {
    const empty: MakeClipper = () => ({ AddPaths: () => true, Execute: () => true });
    expect(buildGlyph('A', P(), { skeleton: A, makeClipper: empty })).toMatchObject({
      ok: false,
      reason: 'empty-outline',
    });
    expect(buildGlyph(' ', P(), { makeClipper: empty }).ok).toBe(true);
  });

  it('失敗するクリッパー → 合成に失敗', () => {
    const failing: MakeClipper = () => ({ AddPaths: () => true, Execute: () => false });
    expect(buildGlyph('A', P(), { skeleton: A, makeClipper: failing })).toMatchObject({
      ok: false,
      reason: 'union-failed',
    });
  });

  it('範囲外のパラメータは上限・下限に丸めて組み立てる', () => {
    const over = buildGlyph('I', { ...P(), weight: 500, hWeight: 500 }, { skeleton: I });
    const max = build('I', I, { weight: 200, hWeight: 200 });
    expect(okOf(over).outline).toEqual(max.outline);
  });

  it('スペース → 成功、輪郭は空、文字幅はスペースの幅', () => {
    expect(buildGlyph(' ', P())).toEqual({
      ok: true,
      outline: [],
      advanceWidth: SPACE_WIDTH,
      bounds: null,
    });
  });
});

describe('buildGlyphs', () => {
  it('62 字＋スペースの 63 文字を返し、1 文字が失敗しても他は組み立てられる', () => {
    const all = buildGlyphs(P(), { overrides: { A, B: { strokes: [] } } });
    expect(Object.keys(all)).toHaveLength(63);
    expect(all.B).toMatchObject({ ok: false, reason: 'invalid-skeleton' });
    expect(all.A!.ok).toBe(true);
    expect(all[' ']!.ok).toBe(true);
  });
});
