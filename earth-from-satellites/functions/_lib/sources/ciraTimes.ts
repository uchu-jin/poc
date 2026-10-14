import { z } from 'zod';
import { fetchJson } from '../fetchSource';
import { SourceError, type SourceDeps } from '../types';

export const CIRA_HOST = 'slider.cira.colostate.edu';

const latestTimesSchema = z.object({ timestamps_int: z.array(z.number()).min(1) });

export function parseCiraTimestamp(value: number): Date | null {
  if (!Number.isSafeInteger(value)) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const roundTrips =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s;
  return roundTrips ? date : null;
}

export function toCiraTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 14);
}

export async function fetchCiraTimes(sliderSat: string, deps: SourceDeps): Promise<Date[]> {
  const url = `https://${CIRA_HOST}/data/json/${sliderSat}/full_disk/geocolor/latest_times.json`;
  const parsed = latestTimesSchema.safeParse(await fetchJson(url, deps));
  if (!parsed.success) throw new SourceError('invalid', 'unexpected latest_times shape');
  const times = parsed.data.timestamps_int
    .map(parseCiraTimestamp)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (times.length === 0) throw new SourceError('invalid', 'no valid timestamps');
  return times;
}
