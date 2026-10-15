import type { Geometry } from '../../../shared/contract';
import { projectGeostationary } from './geo';
import type { Region } from './regions';

/** cx・cy は表示の中心（画像上の 0〜1）、zoom は 0〜4 の連続値（2 の何乗倍か） */
export interface Viewport {
  cx: number;
  cy: number;
  zoom: number;
}

export interface TileSpot {
  z: number;
  row: number;
  col: number;
  /** 枠の左上からの位置と大きさ（CSS px） */
  left: number;
  top: number;
  size: number;
}

export const FULL_VIEW: Viewport = { cx: 0.5, cy: 0.5, zoom: 0 };
export const MIN_ZOOM = 0;
export const MAX_VIEW_ZOOM = 4;
/** 1回の表示で読み込むタイルの上限 */
export const MAX_TILES = 16;
/** 段を決めるときの dpr の上限（通信量を抑えるため） */
const MAX_DPR = 2;
/** 拡大して見せてよい割合（表示の画素数の 0.75 倍の解像度があればよい） */
const SHARPNESS = 0.75;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 枠が画像の外に出ないように中心を収める */
function settle(vp: Viewport): Viewport {
  const zoom = clamp(vp.zoom, MIN_ZOOM, MAX_VIEW_ZOOM);
  const half = 0.5 / 2 ** zoom;
  return { cx: clamp(vp.cx, half, 1 - half), cy: clamp(vp.cy, half, 1 - half), zoom };
}

export function isFull(vp: Viewport): boolean {
  return vp.zoom === 0 && vp.cx === 0.5 && vp.cy === 0.5;
}

export function regionView(region: Region, geometry: Geometry): Viewport {
  const p = projectGeostationary(region.lat, region.lon, geometry);
  if (!p) return FULL_VIEW;
  return settle({ cx: p.x, cy: p.y, zoom: region.zoom });
}

/** focus は枠の中の点（0〜1）。その点に写っている場所が動かないように拡大・縮小する */
export function zoomAt(vp: Viewport, delta: number, focus: { fx: number; fy: number }): Viewport {
  const zoom = clamp(vp.zoom + delta, MIN_ZOOM, MAX_VIEW_ZOOM);
  const before = 2 ** vp.zoom;
  const after = 2 ** zoom;
  const px = vp.cx + (focus.fx - 0.5) / before;
  const py = vp.cy + (focus.fy - 0.5) / before;
  return settle({ cx: px - (focus.fx - 0.5) / after, cy: py - (focus.fy - 0.5) / after, zoom });
}

export function panBy(vp: Viewport, dxPx: number, dyPx: number, framePx: number): Viewport {
  const image = framePx * 2 ** vp.zoom;
  return settle({ cx: vp.cx - dxPx / image, cy: vp.cy - dyPx / image, zoom: vp.zoom });
}

export function tileLevel(
  framePx: number,
  vp: Viewport,
  tileSize: number,
  maxZoom: number,
  dpr: number,
): number {
  const need = framePx * 2 ** vp.zoom * Math.min(Math.max(dpr, 1), MAX_DPR) * SHARPNESS;
  let z = 0;
  while (z < maxZoom && tileSize * 2 ** z < need) z++;
  return z;
}

function tilesAt(framePx: number, vp: Viewport, z: number): TileSpot[] {
  const n = 2 ** z;
  const image = framePx * 2 ** vp.zoom;
  const size = image / n;
  const originX = framePx / 2 - vp.cx * image;
  const originY = framePx / 2 - vp.cy * image;
  const range = (origin: number) => {
    const first = clamp(Math.floor(-origin / size), 0, n - 1);
    const last = clamp(Math.ceil((framePx - origin) / size) - 1, 0, n - 1);
    return [first, last] as const;
  };
  const [c0, c1] = range(originX);
  const [r0, r1] = range(originY);
  const spots: TileSpot[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      spots.push({ z, row, col, left: originX + col * size, top: originY + row * size, size });
    }
  }
  return spots;
}

/** 表示範囲に入るタイル。枚数が上限を超えるときは段を下げる */
export function visibleTiles(
  framePx: number,
  vp: Viewport,
  tileSize: number,
  maxZoom: number,
  dpr: number,
): TileSpot[] {
  let z = tileLevel(framePx, vp, tileSize, maxZoom, dpr);
  let spots = tilesAt(framePx, vp, z);
  while (spots.length > MAX_TILES && z > 0) {
    z--;
    spots = tilesAt(framePx, vp, z);
  }
  return spots;
}
