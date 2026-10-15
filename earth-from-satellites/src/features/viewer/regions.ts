import type { GeostationaryId } from '../../../shared/contract';

export interface Region {
  id: string;
  label: string;
  lat: number;
  lon: number;
  /** 0〜4 の倍率（2 の何乗倍か） */
  zoom: number;
}

// 【要確認】地域の一覧と中心・倍率は仮置き（要件定義の未確定事項 #13）
export const REGIONS: Record<GeostationaryId, readonly Region[]> = {
  himawari9: [
    { id: 'japan', label: '日本', lat: 36, lon: 138, zoom: 2.6 },
    { id: 'australia', label: 'オーストラリア', lat: -25, lon: 134, zoom: 1.6 },
  ],
  'goes-east': [
    { id: 'north-america', label: '北米', lat: 38, lon: -95, zoom: 1.6 },
    { id: 'south-america', label: '南米', lat: -15, lon: -60, zoom: 1.3 },
  ],
  'goes-west': [
    { id: 'west-north-america', label: '北米西部', lat: 42, lon: -120, zoom: 2.0 },
    { id: 'hawaii', label: 'ハワイ', lat: 20.5, lon: -157, zoom: 3.0 },
  ],
};
