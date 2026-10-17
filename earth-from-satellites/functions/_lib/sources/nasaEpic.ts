import { HOSTS } from '../../../shared/contract';
import { z } from 'zod';
import { fetchJson } from '../fetchSource';
import type { SatelliteConfig, SatelliteId } from '../satellites';
import { SourceError, type LatestImage, type SourceDeps } from '../types';
import { MAX_FUTURE_SKEW_MS } from './ciraTimes';
import { utcFromMatch } from '../utc';

export const EPIC_HOST = HOSTS.epic;
const EPIC_MAX_BYTES = 64 * 1024;
const EPIC_WIDTH = 1080;
const MAX_ENTRIES = 40;

const listSchema = z
  .array(
    z.object({
      image: z.string().regex(/^epic_1b_\d{14}$/),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    }),
  )
  .min(1)
  .max(MAX_ENTRIES);

/** EPIC の date（UTC の 'YYYY-MM-DD HH:MM:SS'）を読む。存在しない日時なら null */
export function parseEpicDate(value: string): Date | null {
  return utcFromMatch(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value));
}

export async function resolveNasaEpic(
  id: SatelliteId,
  sat: SatelliteConfig,
  deps: SourceDeps,
): Promise<LatestImage> {
  if (sat.source !== 'nasa-epic') throw new SourceError('invalid', 'not an EPIC source');
  const parsed = listSchema.safeParse(
    await fetchJson(`https://${EPIC_HOST}/api/natural`, deps, EPIC_MAX_BYTES),
  );
  if (!parsed.success) throw new SourceError('invalid', 'unexpected EPIC list shape');

  const latestAllowed = deps.now.getTime() + MAX_FUTURE_SKEW_MS;
  let best: { image: string; date: Date } | null = null;
  for (const item of parsed.data) {
    const date = parseEpicDate(item.date);
    if (!date) throw new SourceError('invalid', 'unreadable EPIC date');
    if (date.getTime() > latestAllowed) continue;
    if (!best || date > best.date) best = { image: item.image, date };
  }
  if (!best) throw new SourceError('invalid', 'no EPIC image in the past');

  // アーカイブは画像名の日付で並ぶ（date と数十秒ずれ、日をまたぐことがある）
  const stamp = best.image.slice('epic_1b_'.length);
  const stampDate = parseEpicDate(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`,
  );
  if (!stampDate) throw new SourceError('invalid', 'unreadable EPIC image name');
  const day = `${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${stamp.slice(6, 8)}`;
  return {
    satelliteId: id,
    satelliteName: sat.name,
    capturedAt: best.date.toISOString(),
    images: [
      {
        url: `https://${EPIC_HOST}/archive/natural/${day}/jpg/${best.image}.jpg`,
        width: EPIC_WIDTH,
      },
    ],
    credit: sat.credit,
  };
}
