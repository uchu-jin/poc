import type { SatelliteConfig, SatelliteId } from '../satellites';
import type { LatestImage, SourceDeps } from '../types';
import { CIRA_HOST, fetchCiraTimes, toCiraTimestamp } from './ciraTimes';

const TILE_WIDTH = 688;

export async function resolveCiraSlider(
  id: SatelliteId,
  sat: SatelliteConfig,
  deps: SourceDeps,
): Promise<LatestImage> {
  const [latest] = await fetchCiraTimes(sat.sliderSat, deps);
  // fetchCiraTimes は1件以上を保証する
  const capturedAt = latest as Date;
  const ts = toCiraTimestamp(capturedAt);
  const day = `${ts.slice(0, 4)}/${ts.slice(4, 6)}/${ts.slice(6, 8)}`;
  return {
    satelliteId: id,
    satelliteName: sat.name,
    capturedAt: capturedAt.toISOString(),
    images: [
      {
        url: `https://${CIRA_HOST}/data/imagery/${day}/${sat.sliderSat}---full_disk/geocolor/${ts}/00/000_000.png`,
        width: TILE_WIDTH,
      },
    ],
    credit: sat.credit,
  };
}
