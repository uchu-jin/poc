// 小文字の x ハイトを区間ごとに伸び縮みさせる（FR-019）
import { ASCENDER, BASE_X_HEIGHT } from './metrics';
import { mapSkeletonPoints } from './transformSkeleton';
import type { Skeleton } from './types';

/**
 * 0〜基準の x ハイト を 0〜xHeight へ、基準の x ハイト〜アセンダー を xHeight〜アセンダー へ直線で写す。
 * ディセンダー側（y < 0）とアセンダーより上は動かさない（750 より上は仮置き。プラン skeleton-outline）
 */
export function remapY(y: number, xHeight: number): number {
  if (y < 0 || y > ASCENDER) return y;
  if (y <= BASE_X_HEIGHT) return (y * xHeight) / BASE_X_HEIGHT;
  return xHeight + ((y - BASE_X_HEIGHT) * (ASCENDER - xHeight)) / (ASCENDER - BASE_X_HEIGHT);
}

/** 骨格のすべての点（制御点を含む）の y を写した写しを返す */
export function remapSkeleton(skeleton: Skeleton, xHeight: number): Skeleton {
  return mapSkeletonPoints(skeleton, (p) => ({ ...p, y: remapY(p.y, xHeight) }));
}
