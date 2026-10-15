// 画面とサーバーの両方が参照する取り決め。純粋な定数と型だけを置く

export const SATELLITE_IDS = ['himawari9', 'goes-east', 'goes-west'] as const;
export type SatelliteId = (typeof SATELLITE_IDS)[number];

export const DEFAULT_SATELLITE: SatelliteId = 'himawari9';

export const SATELLITE_NAMES: Record<SatelliteId, string> = {
  himawari9: 'ひまわり9号',
  'goes-east': 'GOES-East',
  'goes-west': 'GOES-West',
};

export const IMAGE_HOSTS: readonly string[] = [
  'cdn.star.nesdis.noaa.gov',
  'slider.cira.colostate.edu',
];
export const CREDIT_HOSTS: readonly string[] = [
  'satlib.cira.colostate.edu',
  'www.star.nesdis.noaa.gov',
];
export const MAX_IMAGE_WIDTH = 2000;

export interface ImageVariant {
  url: string;
  width: number;
}

export interface Credit {
  text: string;
  url: string;
}

export interface LatestImage {
  satelliteId: string;
  satelliteName: string;
  capturedAt: string;
  images: ImageVariant[];
  credit: Credit;
}

export function isSatelliteId(value: unknown): value is SatelliteId {
  return typeof value === 'string' && (SATELLITE_IDS as readonly string[]).includes(value);
}
