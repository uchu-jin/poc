import { tileUrl, type SatelliteId } from '../../../shared/contract';
import { fetchLatest, type ViewerImage } from './latestClient';
import { createScheduler, type Clock, type Visibility } from './scheduler';
import {
  failed,
  initialState,
  loaded,
  refreshStarted,
  select,
  selectRegion,
  setViewport,
  shouldReplace,
  type ViewerState,
} from './state';
import { loadSatellite, saveSatellite } from './storage';
import { createView, type Layout } from './view';
import { isFull, visibleTiles, zoomAt } from './viewport';

const REFRESH_MS = 10 * 60_000;
const MIN_GAP_MS = 60_000;
const RERENDER_MS = 60_000;
export const PRELOAD_TIMEOUT_MS = 20_000;

export interface AppDeps {
  fetch: typeof fetch;
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  clock: Clock;
  visibility: Visibility;
  /** 画像を読み込み終えるまで待つ。失敗したら reject する */
  preload: (image: ViewerImage) => Promise<void>;
  /** タイル表示のときの先読み。すべて読み込み終えるまで待つ */
  preloadUrls: (urls: string[]) => Promise<void>;
  /** 画像の枠の大きさ（CSS px）と dpr */
  frame: () => Layout;
  timeZone?: string;
}

export function startApp(root: HTMLElement, deps: AppDeps): () => void {
  let state: ViewerState = initialState(loadSatellite(deps.storage));
  const view = createView(
    root,
    {
      onSelect,
      onRegion: (regionId) => {
        state = selectRegion(state, regionId);
        render();
      },
      onZoom: (delta) => {
        state = setViewport(state, zoomAt(state.viewport, delta, { fx: 0.5, fy: 0.5 }));
        render();
      },
      onViewportChange: (viewport) => {
        state = setViewport(state, viewport);
        render();
      },
    },
    { clock: deps.clock, loadImage: (url) => deps.preloadUrls([url]) },
  );
  const render = () => view.render(state, new Date(deps.clock.now()), deps.timeZone, deps.frame());

  // 画像の接続が止まったままでも、「読み込み中…」に留まらないよう打ち切る
  function withPreloadTimeout(work: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = deps.clock.setTimeout(
        () => reject(new Error('preload timeout')),
        PRELOAD_TIMEOUT_MS,
      );
      work.then(
        () => {
          deps.clock.clearTimeout(timer);
          resolve();
        },
        (e: unknown) => {
          deps.clock.clearTimeout(timer);
          reject(e instanceof Error ? e : new Error('preload failed'));
        },
      );
    });
  }

  // 表示しているもの（全体の画像か、見えているタイルか）を先読みする
  function preloadFor(image: ViewerImage): Promise<void> {
    const tiles = image.tiles;
    if (!tiles || isFull(state.viewport)) return deps.preload(image);
    const { framePx, dpr } = deps.frame();
    const spots = visibleTiles(framePx, state.viewport, tiles.tileSize, tiles.maxZoom, dpr);
    return deps.preloadUrls(spots.map((s) => tileUrl(tiles.baseUrl, s.z, s.row, s.col)));
  }

  async function fetchCurrent(): Promise<void> {
    const requestId = state.requestId;
    const satelliteId = state.satelliteId;
    render();
    const result = await fetchLatest(satelliteId, { fetch: deps.fetch });
    if (requestId !== state.requestId) return;
    if (!result.ok) {
      state = failed(state, requestId);
      render();
      return;
    }
    if (shouldReplace(state, result.image)) {
      try {
        await withPreloadTimeout(preloadFor(result.image));
      } catch {
        if (requestId !== state.requestId) return;
        state = failed(state, requestId);
        render();
        return;
      }
    }
    if (requestId !== state.requestId) return;
    state = loaded(state, requestId, result.image);
    render();
  }

  function onSelect(id: SatelliteId) {
    if (id === state.satelliteId) return;
    saveSatellite(deps.storage, id);
    state = select(state, id);
    // 「10分後に自動で再試行します」と合うよう、周期を切り替えた時点から数え直す
    refresher.reset();
    void fetchCurrent();
  }

  const refresher = createScheduler({
    intervalMs: REFRESH_MS,
    minGapMs: MIN_GAP_MS,
    clock: deps.clock,
    visibility: deps.visibility,
    onTick: () => {
      state = refreshStarted(state);
      void fetchCurrent();
    },
  });
  const rerender = createScheduler({
    intervalMs: RERENDER_MS,
    clock: deps.clock,
    visibility: deps.visibility,
    onTick: render,
  });

  render();
  refresher.start();
  rerender.start();
  return () => {
    refresher.stop();
    rerender.stop();
  };
}
