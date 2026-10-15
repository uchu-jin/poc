import { describe, expect, it } from 'vitest';
import {
  FULL_VIEW,
  isFull,
  MAX_TILES,
  panBy,
  regionView,
  tileLevel,
  visibleTiles,
  zoomAt,
  type Viewport,
} from '../../src/features/viewer/viewport';
import { GEOSTATIONARY } from '../../shared/contract';
import { REGIONS } from '../../src/features/viewer/regions';
import { projectGeostationary } from '../../src/features/viewer/geo';

/** 枠の中の点（0〜1）に写っている、画像上の点（0〜1） */
function imagePointAt(vp: Viewport, fx: number, fy: number) {
  const scale = 2 ** vp.zoom;
  return { x: vp.cx + (fx - 0.5) / scale, y: vp.cy + (fy - 0.5) / scale };
}

describe('viewport', () => {
  it('FULL_VIEW は (0.5, 0.5, 0) で、isFull は一致のときだけ真', () => {
    expect(FULL_VIEW).toEqual({ cx: 0.5, cy: 0.5, zoom: 0 });
    expect(isFull(FULL_VIEW)).toBe(true);
    expect(isFull({ cx: 0.5, cy: 0.5, zoom: 0.01 })).toBe(false);
  });

  it('zoomAt：注目した点が画面の同じ位置に残る', () => {
    const vp: Viewport = { cx: 0.4, cy: 0.45, zoom: 1.5 };
    const before = imagePointAt(vp, 0.3, 0.6);
    const next = zoomAt(vp, 0.7, { fx: 0.3, fy: 0.6 });
    const after = imagePointAt(next, 0.3, 0.6);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBeCloseTo(2.2, 9);
  });

  it.each([
    [0.5, -0.51, 0],
    [3.99, 0.02, 4],
    [0, -0.01, 0],
    [4, 0.01, 4],
  ])('zoomAt：zoom %s に %s 足すと %s に収まる', (z, d, expected) => {
    expect(zoomAt({ cx: 0.5, cy: 0.5, zoom: z }, d, { fx: 0.5, fy: 0.5 }).zoom).toBe(expected);
  });

  it('zoomAt で zoom 0 に戻ると、中心も (0.5, 0.5) に戻る', () => {
    const vp = zoomAt({ cx: 0.3, cy: 0.3, zoom: 1 }, -1, { fx: 0.2, fy: 0.2 });
    expect(isFull(vp)).toBe(true);
  });

  it('panBy：zoom 0 では動かない', () => {
    expect(panBy(FULL_VIEW, 100, -50, 720)).toEqual(FULL_VIEW);
  });

  it('panBy：上限ちょうどまでは動き、超えた分は止まる', () => {
    // zoom 1 では中心は 0.25〜0.75。枠 720px・表示 1440px なので、0.25 動かすには 360px
    const vp: Viewport = { cx: 0.5, cy: 0.5, zoom: 1 };
    expect(panBy(vp, 360, 0, 720).cx).toBeCloseTo(0.25, 9);
    expect(panBy(vp, 500, 0, 720).cx).toBeCloseTo(0.25, 9);
    expect(panBy(vp, 0, -360, 720).cy).toBeCloseTo(0.75, 9);
  });

  it('regionView：地域の中心と倍率になる', () => {
    const japan = REGIONS.himawari9[0]!;
    const vp = regionView(japan, GEOSTATIONARY.himawari9);
    const p = projectGeostationary(japan.lat, japan.lon, GEOSTATIONARY.himawari9)!;
    expect(vp.zoom).toBe(japan.zoom);
    expect(vp.cx).toBeCloseTo(p.x, 9);
    expect(vp.cy).toBeCloseTo(p.y, 9);
  });
});

describe('tileLevel', () => {
  it('688・dpr 1・zoom 0 で、枠 917px は z0、918px は z1', () => {
    expect(tileLevel(917, FULL_VIEW, 688, 4, 1)).toBe(0);
    expect(tileLevel(918, FULL_VIEW, 688, 4, 1)).toBe(1);
  });

  it('dpr 3 は 2 として計算する', () => {
    expect(tileLevel(400, FULL_VIEW, 688, 4, 3)).toBe(tileLevel(400, FULL_VIEW, 688, 4, 2));
  });

  it('必要な段が上限を超えても maxZoom に留まる', () => {
    expect(tileLevel(2000, { cx: 0.5, cy: 0.5, zoom: 4 }, 688, 4, 2)).toBe(4);
    expect(tileLevel(2000, { cx: 0.5, cy: 0.5, zoom: 4 }, 688, 2, 2)).toBe(2);
  });
});

describe('visibleTiles', () => {
  it('枠 720px・dpr 1・全体は z0 の1枚で、枠いっぱい', () => {
    expect(visibleTiles(720, FULL_VIEW, 688, 4, 1)).toEqual([
      { z: 0, row: 0, col: 0, left: 0, top: 0, size: 720 },
    ]);
  });

  it('右下の隅を表示したとき、行・列 2^z−1 は返し、2^z は返さない', () => {
    const vp: Viewport = { cx: 0.75, cy: 0.75, zoom: 1 };
    const tiles = visibleTiles(720, vp, 688, 4, 1);
    const n = 2 ** tiles[0]!.z;
    expect(tiles.some((t) => t.row === n - 1 && t.col === n - 1)).toBe(true);
    expect(tiles.every((t) => t.row < n && t.col < n && t.row >= 0 && t.col >= 0)).toBe(true);
  });

  it('zoom 2.6 の位置と大きさが計算どおり', () => {
    const vp: Viewport = { cx: 0.4, cy: 0.3, zoom: 2.6 };
    const frame = 600;
    const tiles = visibleTiles(frame, vp, 688, 4, 1);
    const image = frame * 2 ** 2.6;
    const n = 2 ** tiles[0]!.z;
    for (const t of tiles) {
      expect(t.size).toBeCloseTo(image / n, 6);
      expect(t.left).toBeCloseTo(frame / 2 - vp.cx * image + t.col * (image / n), 6);
      expect(t.top).toBeCloseTo(frame / 2 - vp.cy * image + t.row * (image / n), 6);
      expect(t.left + t.size).toBeGreaterThan(0);
      expect(t.left).toBeLessThan(frame);
      expect(Number.isInteger(t.row) && Number.isInteger(t.col)).toBe(true);
    }
  });

  it('枠 375px・dpr 3・日本では z3 で、9枚以下', () => {
    const vp = regionView(REGIONS.himawari9[0]!, GEOSTATIONARY.himawari9);
    const tiles = visibleTiles(375, vp, 688, 4, 3);
    expect(tiles[0]!.z).toBe(3);
    expect(tiles.length).toBeLessThanOrEqual(9);
  });

  it.each([0.3, 0.5, 1, 1.5, 2, 2.6, 3, 4])('枠 1440px・dpr 2・zoom %s でも16枚以下', (zoom) => {
    const tiles = visibleTiles(1440, { cx: 0.5, cy: 0.5, zoom }, 678, 4, 2);
    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(tiles.length).toBeGreaterThan(0);
  });
});
