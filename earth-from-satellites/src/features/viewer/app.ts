import type { SatelliteId } from '../../../shared/contract';
import { fetchLatest, type ViewerImage } from './latestClient';
import { createScheduler, type Clock, type Visibility } from './scheduler';
import {
  failed,
  initialState,
  loaded,
  refreshStarted,
  select,
  shouldReplace,
  type ViewerState,
} from './state';
import { loadSatellite, saveSatellite } from './storage';
import { createView } from './view';

const REFRESH_MS = 10 * 60_000;
const MIN_GAP_MS = 60_000;
const RERENDER_MS = 60_000;

export interface AppDeps {
  fetch: typeof fetch;
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  clock: Clock;
  visibility: Visibility;
  /** 画像を読み込み終えるまで待つ。失敗したら reject する */
  preload: (image: ViewerImage) => Promise<void>;
  timeZone?: string;
}

export function startApp(root: HTMLElement, deps: AppDeps): () => void {
  let state: ViewerState = initialState(loadSatellite(deps.storage));
  const view = createView(root, { onSelect });
  const render = () => view.render(state, new Date(deps.clock.now()), deps.timeZone);

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
        await deps.preload(result.image);
      } catch {
        state = failed(state, requestId);
        render();
        return;
      }
    }
    state = loaded(state, requestId, result.image);
    render();
  }

  function onSelect(id: SatelliteId) {
    if (id === state.satelliteId) return;
    saveSatellite(deps.storage, id);
    state = select(state, id);
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
