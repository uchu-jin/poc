import type { Geometry } from '../../../shared/contract';

// GRS80 と静止軌道（地球中心からの距離）。単位は km
const R_EQ = 6378.137;
const R_POL = 6356.752314;
const H = 42164.16;
const E2 = 1 - (R_POL * R_POL) / (R_EQ * R_EQ);
const DEG = Math.PI / 180;

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * 緯度・経度を、静止衛星の全球画像の正規化座標（0〜1。x は東、y は南が大きい）にする。
 * 衛星から見えない点は null。式は PROJ の geos に合わせる
 */
export function projectGeostationary(
  lat: number,
  lon: number,
  g: Geometry,
): { x: number; y: number } | null {
  const phi = lat * DEG;
  const dLambda = normalizeLon(lon - g.subLon) * DEG;
  const phiC = Math.atan(((R_POL * R_POL) / (R_EQ * R_EQ)) * Math.tan(phi));
  const cosC = Math.cos(phiC);
  const rc = R_POL / Math.sqrt(1 - E2 * cosC * cosC);
  const sx = H - rc * cosC * Math.cos(dLambda);
  const sy = -rc * cosC * Math.sin(dLambda);
  const sz = rc * Math.sin(phiC);

  // 地球の裏側（衛星から見て地平線の向こう）
  if (H * (H - sx) < sy * sy + ((R_EQ * R_EQ) / (R_POL * R_POL)) * sz * sz) return null;

  const norm = Math.sqrt(sx * sx + sy * sy + sz * sz);
  const [x, y] =
    g.sweep === 'x'
      ? [Math.asin(-sy / norm), Math.atan(sz / sx)]
      : [Math.atan(-sy / sx), Math.asin(sz / norm)];
  const ext = g.scanExtent;
  return { x: (x + ext) / (2 * ext), y: (ext - y) / (2 * ext) };
}
