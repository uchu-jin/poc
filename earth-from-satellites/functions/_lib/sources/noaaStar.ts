import { headOk } from '../fetchSource';
import type { SatelliteConfig, SatelliteId } from '../satellites';
import { SourceError, type LatestImage, type SourceDeps } from '../types';
import { fetchCiraTimes } from './ciraTimes';

export const STAR_HOST = 'cdn.star.nesdis.noaa.gov';
const WIDTHS = [339, 678, 1808] as const;
const PROBE_WIDTH = 678;
const MAX_PROBES = 3;

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function toStarTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return `${year}${pad(dayOfYear, 3)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}`;
}

function starUrl(starSat: string, ts: string, width: number): string {
  return `https://${STAR_HOST}/${starSat}/ABI/FD/GEOCOLOR/${ts}_${starSat}-ABI-FD-GEOCOLOR-${width}x${width}.jpg`;
}

export async function resolveNoaaStar(
  id: SatelliteId,
  sat: SatelliteConfig,
  deps: SourceDeps,
): Promise<LatestImage> {
  if (sat.source !== 'noaa-star') throw new SourceError('invalid', 'not a STAR satellite');
  const times = await fetchCiraTimes(sat.sliderSat, deps);
  for (const time of times.slice(0, MAX_PROBES)) {
    const ts = toStarTimestamp(time);
    if (!(await headOk(starUrl(sat.starSat, ts, PROBE_WIDTH), deps))) continue;
    return {
      satelliteId: id,
      satelliteName: sat.name,
      capturedAt: time.toISOString(),
      images: WIDTHS.map((width) => ({ url: starUrl(sat.starSat, ts, width), width })),
      credit: sat.credit,
    };
  }
  throw new SourceError('upstream', 'no published STAR image for recent timestamps');
}
