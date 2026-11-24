// 見本の行の並び（FR-024）。各文字の x ＝ それまでの文字の文字幅の合計
import type { BuildResult } from '../glyph-engine/types';

export const SAMPLE_TEXT = 'Hamburgefontsiv 0123';

export type SampleItem = { ch: string; x: number; result: BuildResult };

export function sampleLayout(
  text: string,
  build: (ch: string) => BuildResult,
): { items: SampleItem[]; width: number } {
  const items: SampleItem[] = [];
  let x = 0;
  for (const ch of text) {
    const result = build(ch);
    items.push({ ch, x, result });
    x += result.ok ? result.advanceWidth : 0;
  }
  return { items, width: x };
}
