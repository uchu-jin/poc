import type { Credit } from './types';

export const SATELLITE_IDS = ['himawari9', 'goes-east', 'goes-west'] as const;
export type SatelliteId = (typeof SATELLITE_IDS)[number];

// 機体が交代したら（例：GOES-East が GOES-19 から次の機体へ）、ここだけを直す
export type SatelliteConfig =
  | { source: 'cira-slider'; name: string; sliderSat: string; credit: Credit }
  | { source: 'noaa-star'; name: string; sliderSat: string; starSat: string; credit: Credit };

const CIRA_CREDIT_URL = 'https://satlib.cira.colostate.edu/credit-media';

// 【要確認】クレジット表記は仮置き。公開前に作者が利用条件を確認する
export const SATELLITES: Record<SatelliteId, SatelliteConfig> = {
  himawari9: {
    source: 'cira-slider',
    name: 'ひまわり9号',
    sliderSat: 'himawari',
    credit: { text: 'CSU/CIRA & JMA', url: CIRA_CREDIT_URL },
  },
  'goes-east': {
    source: 'noaa-star',
    name: 'GOES-East',
    sliderSat: 'goes-19',
    starSat: 'GOES19',
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
  },
  'goes-west': {
    source: 'noaa-star',
    name: 'GOES-West',
    sliderSat: 'goes-18',
    starSat: 'GOES18',
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
  },
};
