// 見本の行の並び（FR-024）。各文字の x ＝ それまでの文字の文字幅の合計
import type { BuildResult } from '../glyph-engine/types';

export const SAMPLE_TEXT = 'Hamburgefontsiv 0123';
/** 組めなかった文字に取る幅（詰めずに、失敗の印を出す場所を空ける） */
export const MISSING_GLYPH_WIDTH = 500;

export type SampleItem = {
  ch: string;
  x: number;
  width: number;
  missing: boolean;
  result: BuildResult;
};

export function sampleLayout(
  text: string,
  build: (ch: string) => BuildResult,
): { items: SampleItem[]; width: number } {
  const items: SampleItem[] = [];
  let x = 0;
  for (const ch of text) {
    const result = build(ch);
    const width = result.ok ? result.advanceWidth : MISSING_GLYPH_WIDTH;
    items.push({ ch, x, width, missing: !result.ok, result });
    x += width;
  }
  return { items, width: x };
}
