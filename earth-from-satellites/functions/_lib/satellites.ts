import { SATELLITE_IDS, SATELLITE_NAMES, type SatelliteId } from '../../shared/contract';
import type { Credit } from './types';

export { SATELLITE_IDS, type SatelliteId };

// 機体が交代したら（例：GOES-East が GOES-19 から次の機体へ）、ここだけを直す
export type SatelliteConfig =
  | { source: 'cira-slider'; name: string; sliderSat: string; credit: Credit }
  | { source: 'noaa-star'; name: string; sliderSat: string; starSat: string; credit: Credit };

const CIRA_CREDIT_URL = 'https://satlib.cira.colostate.edu/credit-media';

// 【要確認】クレジット表記は仮置き。公開前に作者が利用条件を確認する
export const SATELLITES: Record<SatelliteId, SatelliteConfig> = {
  himawari9: {
    source: 'cira-slider',
    name: SATELLITE_NAMES.himawari9,
    sliderSat: 'himawari',
    credit: { text: 'CSU/CIRA & JMA', url: CIRA_CREDIT_URL },
  },
  'goes-east': {
    source: 'noaa-star',
    name: SATELLITE_NAMES['goes-east'],
    sliderSat: 'goes-19',
    starSat: 'GOES19',
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
  },
  'goes-west': {
    source: 'noaa-star',
    name: SATELLITE_NAMES['goes-west'],
    sliderSat: 'goes-18',
    starSat: 'GOES18',
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
  },
};
