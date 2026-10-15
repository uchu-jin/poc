import type { SatelliteId } from '../../../shared/contract';
import type { ViewerImage } from './latestClient';

export interface ViewerState {
  satelliteId: SatelliteId;
  image: ViewerImage | null;
  status: 'loading' | 'ok' | 'error';
  requestId: number;
}

export function initialState(satelliteId: SatelliteId): ViewerState {
  return { satelliteId, image: null, status: 'loading', requestId: 0 };
}

export function select(state: ViewerState, satelliteId: SatelliteId): ViewerState {
  if (state.satelliteId === satelliteId) return state;
  return { satelliteId, image: null, status: 'loading', requestId: state.requestId + 1 };
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
