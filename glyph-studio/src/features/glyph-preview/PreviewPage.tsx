// 確認用の一覧ページ（操作なし）。既定値と、上限・下限の代表的な組み合わせで 62 字＋スペースを並べる。
// 外部のフォントや CDN は読み込まない。A の変形画面ができたら置き換える
import { useMemo } from 'react';
import { buildGlyphs } from '../glyph-engine/buildGlyph';
import { holeCount } from '../glyph-engine/geometry';
import { DEFAULT_PARAMS, PARAM_LIMITS } from '../glyph-engine/params';
import { EXPECTED_HOLES, GLYPH_CHARS } from '../glyph-engine/skeletons';
import type { BuildResult, Outline, Params } from '../glyph-engine/types';

type Variant = { label: string; params: Params };

const lim = PARAM_LIMITS;
const VARIANTS: Variant[] = [
  { label: '既定値', params: DEFAULT_PARAMS },
  {
    label: `太さ・横線の太さ ${lim.weight[0]}（下限）`,
    params: { ...DEFAULT_PARAMS, weight: lim.weight[0], hWeight: lim.hWeight[0] },
  },
  {
    label: `太さ・横線の太さ ${lim.weight[1]}（上限）`,
    params: { ...DEFAULT_PARAMS, weight: lim.weight[1], hWeight: lim.hWeight[1] },
  },
  {
    label: 'コントラスト（太さ 120・横線 40）',
    params: { ...DEFAULT_PARAMS, weight: 120, hWeight: 40 },
  },
  {
    label: '逆コントラスト（太さ 40・横線 150）',
    params: { ...DEFAULT_PARAMS, weight: 40, hWeight: 150 },
  },
  { label: '丸い端・丸い角', params: { ...DEFAULT_PARAMS, terminal: 'round', join: 'round' } },
  { label: 'スラブ・尖った角', params: { ...DEFAULT_PARAMS, terminal: 'slab' } },
  {
    label: `幅 ${lim.width[0]}・x ハイト ${lim.xHeight[0]}`,
    params: { ...DEFAULT_PARAMS, width: lim.width[0], xHeight: lim.xHeight[0] },
  },
  {
    label: `幅 ${lim.width[1]}・x ハイト ${lim.xHeight[1]}・傾き ${lim.slant[1]}°`,
    params: {
      ...DEFAULT_PARAMS,
      width: lim.width[1],
      xHeight: lim.xHeight[1],
      slant: lim.slant[1],
    },
  },
  {
    label: '数値をすべて上限（太さ・横線・幅・傾き・x ハイト）',
    params: {
      ...DEFAULT_PARAMS,
      weight: lim.weight[1],
      hWeight: lim.hWeight[1],
      width: lim.width[1],
      slant: lim.slant[1],
      xHeight: lim.xHeight[1],
    },
  },
  {
    label: '太さ上限・幅と x ハイトは下限（穴が潰れやすい組み合わせ）',
    params: {
      ...DEFAULT_PARAMS,
      weight: lim.weight[1],
      hWeight: lim.hWeight[1],
      width: lim.width[0],
      xHeight: lim.xHeight[0],
    },
  },
];

const BASELINE = 920;
const VIEW_H = 1200;

function pathOf(outline: Outline): string {
  return outline.map((ring) => 'M' + ring.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join('');
}

function GlyphCell({ ch, result }: { ch: string; result: BuildResult }) {
  if (!result.ok)
    return (
      <figure className="cell cell--failed" title={result.message}>
        <div className="cell__failed">失敗</div>
        <figcaption>
          {ch} <span className="badge">{result.reason}</span>
        </figcaption>
      </figure>
    );
  const holes = holeCount(result.outline);
  const expected = EXPECTED_HOLES[ch];
  const mismatch = ch !== ' ' && expected !== undefined && holes !== expected;
  return (
    <figure className={mismatch ? 'cell cell--warn' : 'cell'}>
      <svg
        viewBox={`0 0 ${result.advanceWidth} ${VIEW_H}`}
        role="img"
        aria-label={ch === ' ' ? 'スペース' : ch}
      >
        <line className="guide" x1={0} x2={result.advanceWidth} y1={BASELINE} y2={BASELINE} />
        <line
          className="guide"
          x1={0}
          x2={result.advanceWidth}
          y1={BASELINE - 700}
          y2={BASELINE - 700}
        />
        <path transform={`translate(0 ${BASELINE}) scale(1 -1)`} d={pathOf(result.outline)} />
      </svg>
      <figcaption>
        {ch === ' ' ? '␣' : ch}
        {mismatch && (
          <span className="badge">
            穴 {holes}（想定 {expected}）
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function VariantSection({ variant }: { variant: Variant }) {
  const results = useMemo(() => buildGlyphs(variant.params), [variant.params]);
  const chars = [...GLYPH_CHARS, ' '];
  const failed = chars.filter((c) => !results[c]!.ok).length;
  const warned = chars.filter((c) => {
    const r = results[c]!;
    return c !== ' ' && r.ok && holeCount(r.outline) !== EXPECTED_HOLES[c];
  }).length;
  return (
    <section className="variant">
      <h2>
        {variant.label}
        {(failed > 0 || warned > 0) && (
          <span className="badge">
            失敗 {failed}・穴の数の違い {warned}
          </span>
        )}
      </h2>
      <div className="grid">
        {chars.map((c) => (
          <GlyphCell key={c} ch={c} result={results[c]!} />
        ))}
      </div>
    </section>
  );
}

export default function PreviewPage() {
  return (
    <main className="preview">
      <header>
        <h1>glyph-studio 確認用の一覧</h1>
        <p>
          既定の骨格 62 字とスペースを、パラメータの組み合わせごとに並べています。操作はできません。
          線は y＝0（ベースライン）と
          y＝700（キャップハイト）。赤い枠は失敗、黄色い枠は想定と穴の数が違う文字です。
        </p>
      </header>
      {VARIANTS.map((v) => (
        <VariantSection key={v.label} variant={v} />
      ))}
    </main>
  );
}
