// 62 字とスペースをまとめて組み立てる
import { buildGlyph, type BuildOptions } from './buildGlyph';
import { GLYPH_CHARS } from './skeletons';
import type { MakeClipper } from './union';
import type { BuildResult, Params } from './types';

export type BuildAllOptions = { overrides?: Record<string, unknown>; makeClipper?: MakeClipper };

/** 62 字とスペースをまとめて組み立てる。1 文字の失敗は他の文字に影響しない */
export function buildGlyphs(
  params: Params,
  options: BuildAllOptions = {},
): Record<string, BuildResult> {
  const result: Record<string, BuildResult> = {};
  for (const ch of [...GLYPH_CHARS, ' ']) {
    const opts: BuildOptions = { makeClipper: options.makeClipper };
    if (options.overrides && ch in options.overrides) opts.skeleton = options.overrides[ch];
    result[ch] = buildGlyph(ch, params, opts);
  }
  return result;
}
