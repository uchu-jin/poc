import type { Bearing8, LatLng } from './types';

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const SECTORS: Bearing8[] = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

export function bearing8(from: LatLng, to: LatLng): Bearing8 {
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const index = Math.floor((deg + 22.5) / 45) % 8;
  return SECTORS[index] ?? '北';
}

export function roundCoord(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

export function roundLatLng(p: LatLng, digits = 3): LatLng {
  return { lat: roundCoord(p.lat, digits), lng: roundCoord(p.lng, digits) };
}
