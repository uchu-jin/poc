// 1 文字の組み立て：検査 → x ハイト → 幅 → 折れ線 → 膨らませ＋端・角 → 傾き → 合成 → 余白と文字幅
import { boundsOf } from './geometry';
import { SIDE_BEARING, SPACE_WIDTH } from './metrics';
import { clampParams } from './params';
import { shapesOf } from './shapes';
import { DEFAULT_SKELETONS } from './skeletons';
import { mapSkeletonPoints } from './transformSkeleton';
import { defaultMakeClipper, unionPolys, type MakeClipper } from './union';
import { validateSkeleton } from './validateSkeleton';
import { remapSkeleton } from './verticalRemap';
import type { BuildResult, Outline, Params, Vec } from './types';

export type BuildOptions = {
  /** 既定の骨格の代わりに使う骨格（個別に直した骨格。基準の座標のまま渡す。FR-011） */
  skeleton?: unknown;
  makeClipper?: MakeClipper;
};

const isLowercase = (ch: string) => /^[a-z]$/.test(ch);

const round1 = (x: number) => Math.round(x * 10) / 10;

export function buildGlyph(ch: string, params: Params, options: BuildOptions = {}): BuildResult {
  try {
    return buildGlyphUnsafe(ch, params, options);
  } catch (e) {
    // 想定外の例外も外に出さない（1 文字の失敗が他の文字や画面を止めないように。実装レビュー P1-1）
    return {
      ok: false,
      reason: 'union-failed',
      message: `組み立て中に想定外のエラー: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function buildGlyphUnsafe(ch: string, params: Params, options: BuildOptions): BuildResult {
  if (ch === ' ')
    return { ok: true, outline: [], advanceWidth: SPACE_WIDTH, bounds: null, shiftX: 0 };
  const source = options.skeleton !== undefined ? options.skeleton : DEFAULT_SKELETONS[ch];
  if (source === undefined)
    return { ok: false, reason: 'invalid-skeleton', message: `「${ch}」の骨格がない` };
  const checked = validateSkeleton(source);
  if (!checked.ok) return { ok: false, reason: 'invalid-skeleton', message: checked.message };

  const p = clampParams(params);
  let skeleton = checked.skeleton;
  if (isLowercase(ch)) skeleton = remapSkeleton(skeleton, p.xHeight);
  skeleton = mapSkeletonPoints(skeleton, (pt) => ({ ...pt, x: pt.x * p.width }));

  const tan = Math.tan((p.slant * Math.PI) / 180);
  const polys = shapesOf(skeleton, p).map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [x + y * tan, y] as Vec)),
  );

  if (polys.length === 0)
    return { ok: false, reason: 'empty-outline', message: `「${ch}」の輪郭が空` };
  const merged = unionPolys(polys, options.makeClipper ?? defaultMakeClipper);
  if (!merged.ok) return { ok: false, reason: 'union-failed', message: merged.message };
  if (merged.outline.length === 0)
    return { ok: false, reason: 'empty-outline', message: `「${ch}」の輪郭が空` };

  const b = boundsOf(merged.outline)!;
  const dx = SIDE_BEARING - b.minX;
  const outline: Outline = merged.outline.map((r) => r.map(([x, y]) => [round1(x + dx), y]));
  const bounds = boundsOf(outline)!;
  return {
    ok: true,
    outline,
    advanceWidth: round1(bounds.maxX - bounds.minX + SIDE_BEARING * 2),
    bounds,
    shiftX: dx,
  };
}
