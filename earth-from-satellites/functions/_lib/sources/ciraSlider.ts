import type { SatelliteConfig, SatelliteId } from '../satellites';
import { SourceError, type LatestImage, type SourceDeps } from '../types';
import { ciraImageryBase, ciraTiles } from './ciraTiles';
import { fetchCiraTimes } from './ciraTimes';

export async function resolveCiraSlider(
  id: SatelliteId,
  sat: SatelliteConfig,
  deps: SourceDeps,
): Promise<LatestImage> {
  if (sat.source !== 'cira-slider') throw new SourceError('invalid', 'not a CIRA satellite');
  const [latest] = await fetchCiraTimes(sat.sliderSat, deps);
  // fetchCiraTimes は1件以上を保証する
  const capturedAt = latest as Date;
  return {
    satelliteId: id,
    satelliteName: sat.name,
    capturedAt: capturedAt.toISOString(),
    images: [
      {
        url: `${ciraImageryBase(sat.sliderSat, capturedAt)}00/000_000.png`,
        width: sat.tileSize,
      },
    ],
    credit: sat.credit,
    tiles: ciraTiles(sat.sliderSat, capturedAt, sat.tileSize),
  };
}
