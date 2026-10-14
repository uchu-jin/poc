import { describe, expect, it } from 'vitest';
import { bearing8, haversineMeters, roundCoord, roundLatLng } from '../../src/domain/geo';
import type { LatLng } from '../../src/domain/types';

function reference(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const within = (actual: number, expected: number, ratio: number) =>
  Math.abs(actual - expected) / expected <= ratio;

describe('geo', () => {
  it('U-geo-1: Tokyo Station to Imperial Palace is about 1,370 m', () => {
    const a = { lat: 35.681236, lng: 139.767125 };
    const b = { lat: 35.685175, lng: 139.7528 };
    const d = haversineMeters(a, b);
    expect(within(d, reference(a, b), 0.01)).toBe(true);
    expect(within(d, 1370, 0.05)).toBe(true);
  });

  it('U-geo-2: bearing sector boundaries', () => {
    const o = { lat: 0, lng: 0 };
    const at = (deg: number): LatLng => {
      const r = (deg * Math.PI) / 180;
      return { lat: 0.01 * Math.cos(r), lng: 0.01 * Math.sin(r) };
    };
    expect(bearing8(o, at(22.4))).toBe('北');
    expect(bearing8(o, at(22.6))).toBe('北東');
    expect(bearing8(o, at(337.4))).toBe('北西');
    expect(bearing8(o, at(337.6))).toBe('北');
    const names = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    names.forEach((name, i) => {
      expect(bearing8(o, at(i * 45))).toBe(name);
    });
  });

  it('U-geo-3: roundCoord rounds to 3 digits without float noise', () => {
    expect(roundCoord(35.6812364)).toBe(35.681);
    const x = roundCoord(139.7675);
    expect((String(x).split('.')[1] ?? '').length).toBeLessThanOrEqual(3);
    expect(String(roundCoord(35.68100000001))).toBe('35.681');
    expect(roundLatLng({ lat: 35.6812364, lng: 139.7675123 })).toEqual({
      lat: 35.681,
      lng: 139.768,
    });
  });

  it('U-geo-4: Yonaguni to Minamitorishima is about 3,140 km', () => {
    const a = { lat: 24.4497, lng: 122.9346 };
    const b = { lat: 24.2867, lng: 153.9806 };
    const d = haversineMeters(a, b);
    expect(within(d, reference(a, b), 0.01)).toBe(true);
    expect(within(d, 3_140_000, 0.02)).toBe(true);
  });
});
