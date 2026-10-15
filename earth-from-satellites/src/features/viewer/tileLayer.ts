import { tileUrl, type Tiles } from '../../../shared/contract';
import type { Clock } from './scheduler';
import { visibleTiles, type Viewport } from './viewport';

/** 段が変わる操作の途中は、新しい段のタイルを置くのをこれだけ待つ */
export const TILE_SETTLE_MS = 150;

export interface TileLayerInput {
  satelliteId: string;
  tiles: Tiles;
  /** 下に敷く全球画像 */
  underlayUrl: string;
  viewport: Viewport;
  framePx: number;
  dpr: number;
}

export interface TileLayerDeps {
  clock: Clock;
  /** 画像を読み込み終えるまで待つ。失敗したら reject する */
  load: (url: string) => Promise<void>;
}

export interface TileLayer {
  element: HTMLElement;
  render(input: TileLayerInput | null): void;
}

interface Entry {
  img: HTMLImageElement;
  z: number;
  row: number;
  col: number;
  url: string;
}

function place(img: HTMLImageElement, left: number, top: number, size: number) {
  img.style.left = `${left}px`;
  img.style.top = `${top}px`;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
}

export function createTileLayer(deps: TileLayerDeps): TileLayer {
  const element = document.createElement('div');
  element.dataset.role = 'tiles';
  element.className = 'tiles';
  const underlay = document.createElement('img');
  underlay.dataset.role = 'underlay';
  underlay.alt = '';
  element.append(underlay);

  const entries = new Map<string, Entry>();
  let satelliteId: string | null = null;
  let baseUrl: string | null = null;
  let committedZ: number | null = null;
  let settleTimer: unknown = null;
  let last: TileLayerInput | null = null;

  const origin = (input: TileLayerInput) => {
    const image = input.framePx * 2 ** input.viewport.zoom;
    return {
      image,
      x: input.framePx / 2 - input.viewport.cx * image,
      y: input.framePx / 2 - input.viewport.cy * image,
    };
  };

  function remove(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    // src を外して読み込みを止める
    entry.img.removeAttribute('src');
    entry.img.remove();
    entries.delete(key);
  }

  function clearAll() {
    for (const key of [...entries.keys()]) remove(key);
    committedZ = null;
  }

  function cancelSettle() {
    if (settleTimer !== null) deps.clock.clearTimeout(settleTimer);
    settleTimer = null;
  }

  function repositionAll(input: TileLayerInput) {
    const o = origin(input);
    place(underlay, o.x, o.y, o.image);
    for (const e of entries.values()) {
      const size = o.image / 2 ** e.z;
      place(e.img, o.x + e.col * size, o.y + e.row * size, size);
    }
  }

  function reconcile(input: TileLayerInput) {
    const spots = visibleTiles(
      input.framePx,
      input.viewport,
      input.tiles.tileSize,
      input.tiles.maxZoom,
      input.dpr,
    );
    committedZ = spots[0]?.z ?? null;
    const wanted = new Set(spots.map((s) => `${s.z}/${s.row}/${s.col}`));
    for (const key of [...entries.keys()]) if (!wanted.has(key)) remove(key);

    const generation = input.tiles.baseUrl;
    for (const s of spots) {
      const key = `${s.z}/${s.row}/${s.col}`;
      const url = tileUrl(generation, s.z, s.row, s.col);
      const existing = entries.get(key);
      if (!existing) {
        const img = document.createElement('img');
        img.dataset.tile = key;
        img.alt = '';
        img.decoding = 'async';
        // 初めて置くタイルが読めなければ、その場所は下の全球画像を見せる
        img.addEventListener('error', () => {
          img.hidden = true;
        });
        img.addEventListener('load', () => {
          img.hidden = false;
        });
        img.setAttribute('src', url);
        element.append(img);
        entries.set(key, { img, z: s.z, row: s.row, col: s.col, url });
      } else if (existing.url !== url) {
        // 新しい撮影時刻：読み込めたものから入れ替え、失敗したら前の画像を残す
        deps.load(url).then(
          () => {
            if (baseUrl !== generation || entries.get(key) !== existing) return;
            existing.img.setAttribute('src', url);
            existing.img.hidden = false;
            existing.url = url;
          },
          () => undefined,
        );
      }
    }
    repositionAll(input);
  }

  return {
    element,
    render(input) {
      last = input;
      if (!input) {
        cancelSettle();
        clearAll();
        underlay.removeAttribute('src');
        satelliteId = null;
        baseUrl = null;
        return;
      }
      if (input.satelliteId !== satelliteId) {
        cancelSettle();
        clearAll();
        satelliteId = input.satelliteId;
      }
      baseUrl = input.tiles.baseUrl;
      if (underlay.getAttribute('src') !== input.underlayUrl) {
        underlay.setAttribute('src', input.underlayUrl);
      }

      const z = visibleTiles(
        input.framePx,
        input.viewport,
        input.tiles.tileSize,
        input.tiles.maxZoom,
        input.dpr,
      )[0]?.z;
      if (committedZ !== null && z !== committedZ && entries.size > 0) {
        // 操作の途中：今のタイルを動かすだけにして、落ち着いたら新しい段に替える
        repositionAll(input);
        cancelSettle();
        settleTimer = deps.clock.setTimeout(() => {
          settleTimer = null;
          if (last) reconcile(last);
        }, TILE_SETTLE_MS);
        return;
      }
      cancelSettle();
      reconcile(input);
    },
  };
}
