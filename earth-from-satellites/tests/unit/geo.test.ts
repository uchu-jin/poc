import { describe, expect, it } from 'vitest';
import { GEOSTATIONARY } from '../../shared/contract';
import { projectGeostationary } from '../../src/features/viewer/geo';
import { REGIONS } from '../../src/features/viewer/regions';

const H = GEOSTATIONARY.himawari9;
const W = GEOSTATIONARY['goes-west'];

describe('projectGeostationary', () => {
  it('衛星直下の点は (0.5, 0.5)', () => {
    for (const g of Object.values(GEOSTATIONARY)) {
      const p = projectGeostationary(0, g.subLon, g);
      expect(p?.x).toBeCloseTo(0.5, 9);
      expect(p?.y).toBeCloseTo(0.5, 9);
    }
  });

  it('北の点は y < 0.5、東の点は x > 0.5', () => {
    expect(projectGeostationary(30, H.subLon, H)!.y).toBeLessThan(0.5);
    expect(projectGeostationary(0, H.subLon + 30, H)!.x).toBeGreaterThan(0.5);
    expect(projectGeostationary(-30, H.subLon, H)!.y).toBeGreaterThan(0.5);
    expect(projectGeostationary(0, H.subLon - 30, H)!.x).toBeLessThan(0.5);
  });

  it('直下から経度 80° は見え、90° は見えない', () => {
    expect(projectGeostationary(0, H.subLon + 80, H)).not.toBeNull();
    expect(projectGeostationary(0, H.subLon + 90, H)).toBeNull();
  });

  it('北極は見えない', () => {
    expect(projectGeostationary(90, H.subLon, H)).toBeNull();
  });

  it('経度 170° と −190° は同じ結果になる', () => {
    expect(projectGeostationary(10, 170, W)).toEqual(projectGeostationary(10, -190, W));
  });

  it('東京をひまわりで変換すると、x は 0.47〜0.5、y は 0.15〜0.3', () => {
    const p = projectGeostationary(35.7, 139.7, H)!;
    expect(p.x).toBeGreaterThan(0.47);
    expect(p.x).toBeLessThan(0.5);
    expect(p.y).toBeGreaterThan(0.15);
    expect(p.y).toBeLessThan(0.3);
  });
});

describe('REGIONS', () => {
  it('衛星ごとの地域の名前と並びが FR-013 の一覧と一致する', () => {
    expect(REGIONS.himawari9.map((r) => r.label)).toEqual(['日本', 'オーストラリア']);
    expect(REGIONS['goes-east'].map((r) => r.label)).toEqual(['北米', '南米']);
    expect(REGIONS['goes-west'].map((r) => r.label)).toEqual(['北米西部', 'ハワイ']);
  });

  it('すべての地域の中心がその衛星から見え、zoom は 0〜4 に入る', () => {
    for (const [sat, regions] of Object.entries(REGIONS)) {
      const g = GEOSTATIONARY[sat as keyof typeof GEOSTATIONARY];
      for (const r of regions) {
        expect(projectGeostationary(r.lat, r.lon, g), `${sat} ${r.label}`).not.toBeNull();
        expect(r.zoom).toBeGreaterThanOrEqual(0);
        expect(r.zoom).toBeLessThanOrEqual(4);
      }
    }
  });
});
