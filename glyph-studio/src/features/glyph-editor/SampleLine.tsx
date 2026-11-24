// 見本の行（FR-024）。今のパラメータで「Hamburgefontsiv 0123」を組んで並べる（操作なし）
import { useMemo } from 'react';
import { buildGlyph } from '../glyph-engine/buildGlyph';
import type { Params } from '../glyph-engine/types';
import { outlinePath } from './GlyphCanvas';
import { SAMPLE_TEXT, sampleLayout } from './sampleLayout';

export default function SampleLine({ params }: { params: Params }) {
  const layout = useMemo(() => sampleLayout(SAMPLE_TEXT, (ch) => buildGlyph(ch, params)), [params]);
  return (
    <figure className="sample">
      <svg viewBox={`0 -950 ${Math.max(layout.width, 1)} 1250`} role="img" aria-label={SAMPLE_TEXT}>
        {layout.items.map((item, i) =>
          item.result.ok ? <path key={i} d={outlinePath(item.result.outline, item.x)} /> : null,
        )}
      </svg>
      <figcaption>見本（今のパラメータ）</figcaption>
    </figure>
  );
}
