// 土の色（水分で変わる）。Three.js に依存しない。

export const SOIL_DRY: readonly [number, number, number] = [0.74, 0.69, 0.62];
export const SOIL_WET: readonly [number, number, number] = [0.35, 0.31, 0.27];

/** 水分 0〜100 を 0〜1 の RGB に。範囲外は端にそろえる。 */
export function soilColor(water: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, water / 100));
  return [
    SOIL_DRY[0] + (SOIL_WET[0] - SOIL_DRY[0]) * t,
    SOIL_DRY[1] + (SOIL_WET[1] - SOIL_DRY[1]) * t,
    SOIL_DRY[2] + (SOIL_WET[2] - SOIL_DRY[2]) * t,
  ];
}
