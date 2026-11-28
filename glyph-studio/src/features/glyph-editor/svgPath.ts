import type { Outline } from '../glyph-engine/types';

/** 1000 単位（y 上向き）の輪郭を SVG のパス（y 下向き）にする */
export function outlinePath(outline: Outline, dx = 0): string {
  return outline
    .map(
      (r) => 'M' + r.map(([x, y]) => `${(x + dx).toFixed(1)} ${(-y).toFixed(1)}`).join('L') + 'Z',
    )
    .join('');
}
