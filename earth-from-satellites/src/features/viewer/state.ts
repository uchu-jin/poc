import { GEOSTATIONARY, type SatelliteId } from '../../../shared/contract';
import type { ViewerImage } from './latestClient';
import { REGIONS } from './regions';
import { FULL_VIEW, regionView, type Viewport } from './viewport';

export interface ViewerState {
  satelliteId: SatelliteId;
  image: ViewerImage | null;
  status: 'loading' | 'ok' | 'error';
  requestId: number;
  /** 選んでいる地域。全球や、利用者が動かしたあとは null */
  regionId: string | null;
  viewport: Viewport;
}

export function initialState(satelliteId: SatelliteId): ViewerState {
  return {
    satelliteId,
    image: null,
    status: 'loading',
    requestId: 0,
    regionId: null,
    viewport: FULL_VIEW,
  };
}

export function select(state: ViewerState, satelliteId: SatelliteId): ViewerState {
  if (state.satelliteId === satelliteId) return state;
  return {
    satelliteId,
    image: null,
    status: 'loading',
    requestId: state.requestId + 1,
    regionId: null,
    viewport: FULL_VIEW,
  };
}

/** null なら全体に戻す（選択中でも、押せば戻す） */
export function selectRegion(state: ViewerState, regionId: string | null): ViewerState {
  if (state.satelliteId === 'epic') return state;
  if (regionId === null) return { ...state, regionId: null, viewport: FULL_VIEW };
  const region = REGIONS[state.satelliteId].find((r) => r.id === regionId);
  if (!region) return state;
  return {
    ...state,
    regionId,
    viewport: regionView(region, GEOSTATIONARY[state.satelliteId]),
  };
}

/** 利用者が動かした。地域の選択は外す */
export function setViewport(state: ViewerState, viewport: Viewport): ViewerState {
  return { ...state, regionId: null, viewport };
}

// 最新の要求の結果だけを反映するため、更新のたびに requestId を進める
export function refreshStarted(state: ViewerState): ViewerState {
  return { ...state, requestId: state.requestId + 1 };
}

export function shouldReplace(state: ViewerState, image: ViewerImage): boolean {
  if (!state.image) return true;
  return Date.parse(image.capturedAt) > Date.parse(state.image.capturedAt);
}

export function loaded(state: ViewerState, requestId: number, image: ViewerImage): ViewerState {
  if (requestId !== state.requestId) return state;
  return { ...state, status: 'ok', image: shouldReplace(state, image) ? image : state.image };
}

export function failed(state: ViewerState, requestId: number): ViewerState {
  if (requestId !== state.requestId) return state;
  return { ...state, status: 'error' };
}
