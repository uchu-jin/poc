import { HOSTS } from '../../../shared/contract';
import { z } from 'zod';
import { fetchJson } from '../fetchSource';
import { SourceError, type SourceDeps } from '../types';
import { utcFromMatch } from '../utc';

export const CIRA_HOST = HOSTS.cira;
export const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const MAX_TIMESTAMPS = 1000;

const latestTimesSchema = z.object({
  timestamps_int: z.array(z.number()).min(1).max(MAX_TIMESTAMPS),
});

export function parseCiraTimestamp(value: number): Date | null {
  if (!Number.isSafeInteger(value)) return null;
  return utcFromMatch(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value)));
}

export { ciraStamp as toCiraTimestamp } from '../../../shared/contract';

export async function fetchCiraTimes(sliderSat: string, deps: SourceDeps): Promise<Date[]> {
  const url = `https://${CIRA_HOST}/data/json/${sliderSat}/full_disk/geocolor/latest_times.json`;
  const parsed = latestTimesSchema.safeParse(await fetchJson(url, deps));
  if (!parsed.success) throw new SourceError('invalid', 'unexpected latest_times shape');
  const latestAllowed = deps.now.getTime() + MAX_FUTURE_SKEW_MS;
  const unique = new Set<number>();
  for (const value of parsed.data.timestamps_int) {
    const ms = parseCiraTimestamp(value)?.getTime();
    if (ms !== undefined && ms <= latestAllowed) unique.add(ms);
  }
  const times = [...unique].sort((a, b) => b - a).map((ms) => new Date(ms));
  if (times.length === 0) throw new SourceError('invalid', 'no valid timestamps');
  return times;
}
