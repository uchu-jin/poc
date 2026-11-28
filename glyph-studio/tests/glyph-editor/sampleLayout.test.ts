import { describe, expect, it } from 'vitest';
import { SAMPLE_TEXT, sampleLayout } from '../../src/features/glyph-editor/sampleLayout';
import { buildGlyph } from '../../src/features/glyph-engine/buildGlyph';
import { SPACE_WIDTH } from '../../src/features/glyph-engine/metrics';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import type { Params } from '../../src/features/glyph-engine/types';

const layout = (p: Params) => sampleLayout(SAMPLE_TEXT, (ch) => buildGlyph(ch, p));

describe('sampleLayout（見本の行。FR-024）', () => {
  it('見本の文字列は「Hamburgefontsiv 0123」', () => {
    expect(SAMPLE_TEXT).toBe('Hamburgefontsiv 0123');
  });
  it('各文字の x ＝ それまでの文字幅の合計。スペースは SPACE_WIDTH。全体の幅 ＝ 文字幅の合計', () => {
    const l = layout(DEFAULT_PARAMS);
    expect(l.items.map((i) => i.ch).join('')).toBe(SAMPLE_TEXT);
    let x = 0;
    for (const item of l.items) {
      expect(item.x).toBeCloseTo(x, 6);
      const w = item.ch === ' ' ? SPACE_WIDTH : item.result.ok ? item.result.advanceWidth : 0;
      if (item.ch === ' ') expect(item.result.ok && item.result.advanceWidth).toBe(SPACE_WIDTH);
      x += w;
    }
    expect(l.width).toBeCloseTo(x, 6);
  });
  it('パラメータを変えると並びも変わる（太さ 150 の行は太さ 20 の行より長い）', () => {
    const heavy = layout({ ...DEFAULT_PARAMS, weight: 150, hWeight: 150 });
    const light = layout({ ...DEFAULT_PARAMS, weight: 20, hWeight: 20 });
    expect(heavy.width).toBeGreaterThan(light.width);
  });
});
