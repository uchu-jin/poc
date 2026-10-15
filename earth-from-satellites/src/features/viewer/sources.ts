import type { SatelliteId } from '../../../shared/contract';
import { MESSAGES } from './messages';

export interface StaleRule {
  /** この時間（分）以上たっていたら注意を出す */
  afterMinutes: number;
  unit: 'minutes' | 'days';
}

export interface SourceTraits {
  /** 地域の選択と拡大ができるか */
  hasRegions: boolean;
  /** 画像の下に添える注記 */
  note: string | null;
  stale: StaleRule;
  /** 選んだことを次回まで覚えてよいか */
  persist: boolean;
}

const GEOSTATIONARY_TRAITS: SourceTraits = {
  hasRegions: true,
  note: null,
  stale: { afterMinutes: 60, unit: 'minutes' },
  persist: true,
};

// 【要確認】EPIC のしきい値72時間は仮置き（要件定義の未確定事項 #13）
export const SOURCE_TRAITS: Record<SatelliteId, SourceTraits> = {
  himawari9: GEOSTATIONARY_TRAITS,
  'goes-east': GEOSTATIONARY_TRAITS,
  'goes-west': GEOSTATIONARY_TRAITS,
  epic: {
    hasRegions: false,
    note: MESSAGES.epicNote,
    stale: { afterMinutes: 72 * 60, unit: 'days' },
    // EPIC で起動すると初回表示が重くなるので覚えない
    persist: false,
  },
};
