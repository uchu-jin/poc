// 見本の行（FR-024）。今のパラメータで「Hamburgefontsiv 0123」を組んで並べる（操作なし）
import { useDeferredValue, useMemo } from 'react';
import { buildGlyph } from '../glyph-engine/buildGlyph';
import type { Params } from '../glyph-engine/types';
import { outlinePath } from './svgPath';
import { SAMPLE_TEXT, sampleLayout } from './sampleLayout';

export default function SampleLine({ params }: { params: Params }) {
  // ドラッグ中は A の描き直しを先にし、見本の行は後回しでよい（1 フレームの仕事を減らす。実装レビュー P2）
  const deferred = useDeferredValue(params);
  const layout = useMemo(
    () => sampleLayout(SAMPLE_TEXT, (ch) => buildGlyph(ch, deferred)),
    [deferred],
  );
  const missing = layout.items.filter((i) => i.missing).map((i) => i.ch);
  return (
    <figure className="sample">
      <svg viewBox={`0 -950 ${Math.max(layout.width, 1)} 1250`} role="img" aria-label={SAMPLE_TEXT}>
        {layout.items.map((item, i) =>
          item.result.ok ? (
            <path key={i} d={outlinePath(item.result.outline, item.x)} />
          ) : (
            // 組めなかった文字は、詰めずに失敗の印（枠）を出す
            <rect
              key={i}
              className="sample__missing"
              x={item.x + 40}
              y={-700}
              width={item.width - 80}
              height={700}
            />
          ),
        )}
      </svg>
      <figcaption>
        見本（今のパラメータ）
        {missing.length > 0 && (
          <span className="sample__error">組めなかった文字：{missing.join(' ')}</span>
        )}
      </figcaption>
    </figure>
  );
}
