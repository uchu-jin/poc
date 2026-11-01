// カメラの計算（Three.js・DOM に依存しない）。

export const ELEVATION_MIN_DEG = -10;
export const ELEVATION_MAX_DEG = 80;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;
/** 正面の向き。評価（FR-033）も使う。 */
export const FRONT_AZIMUTH = 0;
export const INITIAL_ELEVATION_DEG = 15;
/** 外接球に足す余白の倍率 */
export const FIT_MARGIN = 1.15;
/** 外接球の半径の下限（鉢の半径ぶん） */
export const MIN_FIT_RADIUS = 0.3;

export function clampElevation(deg: number): number {
  return Math.min(ELEVATION_MAX_DEG, Math.max(ELEVATION_MIN_DEG, deg));
}

export function clampDistance(d: number, fit: number): number {
  return Math.min(fit * ZOOM_MAX, Math.max(fit * ZOOM_MIN, d));
}

export function clampTargetY(y: number, treeHeight: number): number {
  return Math.min(Math.max(treeHeight, 0), Math.max(0, y));
}

export function wrapAzimuth(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w + 0; // -0 を 0 にする
}

/** 半径 radius の球が縦の画角 fovDeg に収まる距離（余白つき）。 */
export function fitDistance(radius: number, fovDeg: number): number {
  const r = Math.max(radius, MIN_FIT_RADIUS);
  return (r / Math.sin((fovDeg * Math.PI) / 360)) * FIT_MARGIN;
}
