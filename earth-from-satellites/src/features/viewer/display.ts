import type { ViewerImage } from './latestClient';
import { SOURCE_TRAITS } from './sources';
import type { ViewerState } from './state';
import { isFull } from './viewport';

/** 画像の枠の大きさ（CSS px）と dpr */
export interface Layout {
  framePx: number;
  dpr: number;
}

export const MOBILE_MEDIA = '(max-width: 720px)';
export const MOBILE_MAX_WIDTH = 700;
export const DESKTOP_SIZES = '720px';
export const MOBILE_SIZES = '100vw';

export function buildSrcset(image: ViewerImage, maxWidth = Infinity): string {
  return image.images
    .filter((i) => i.width <= maxWidth)
    .map((i) => `${new URL(i.url).href} ${i.width}w`)
    .join(', ');
}

/** タイル表示のとき、すぐ見えるように下に敷く全球画像 */
export function underlayUrl(image: ViewerImage): string {
  const smallest = [...image.images].sort((a, b) => a.width - b.width)[0];
  return smallest ? new URL(smallest.url).href : '';
}

/** 地域の選択と拡大ができるか。読み込み中は衛星の性質で、読み込んだあとは tiles の有無で決める */
export function canExplore(state: ViewerState): boolean {
  if (!SOURCE_TRAITS[state.satelliteId].hasRegions) return false;
  return state.image === null || Boolean(state.image.tiles);
}

/** タイルを表示するか（全体表示でなく、タイルの情報があるとき） */
export function showsTiles(state: ViewerState): boolean {
  return Boolean(state.image?.tiles) && !isFull(state.viewport);
}
