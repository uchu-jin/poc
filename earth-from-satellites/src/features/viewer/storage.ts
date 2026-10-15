import { DEFAULT_SATELLITE, isSatelliteId, type SatelliteId } from '../../../shared/contract';
import { SOURCE_TRAITS } from './sources';

const KEY = 'earth-from-satellites:satellite';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

// localStorage は、取得するだけで例外を投げるブラウザ設定があるので、関数で受け取る
export function loadSatellite(getStorage: () => KeyValueStore): SatelliteId {
  try {
    const value = getStorage().getItem(KEY);
    return isSatelliteId(value) && SOURCE_TRAITS[value].persist ? value : DEFAULT_SATELLITE;
  } catch {
    return DEFAULT_SATELLITE;
  }
}

export function saveSatellite(getStorage: () => KeyValueStore, id: SatelliteId): void {
  if (!SOURCE_TRAITS[id].persist) return;
  try {
    getStorage().setItem(KEY, id);
  } catch {
    // 保存できなくても、表示は続ける
  }
}
