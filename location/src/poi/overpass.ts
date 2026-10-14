import { bearing8, haversineMeters, roundLatLng } from '../domain/geo';
import type { LatLng, Poi, PoiCategory } from '../domain/types';
import { CATEGORY_FILTERS, CATEGORY_ORDER, classify } from './categories';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
export const ROUNDING_MARGIN_M = 150;
export const PER_CATEGORY_LIMIT = 5;
export const MAX_POIS = 20;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const ENDPOINT_TIMEOUT_MS = 10_000;

export type Radius = 1000 | 5000;

export interface RawPoi {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
}

export class OverpassError extends Error {
  constructor(message = 'Overpass request failed') {
    super(message);
    this.name = 'OverpassError';
  }
}

export function buildQuery(center: LatLng, radiusM: Radius): string {
  const limit = radiusM === 1000 ? 40 : 25;
  const around = radiusM + ROUNDING_MARGIN_M;
  // Overpass QL は文ごとに既定の集合を上書きするので、カテゴリごとに out する。
  const statements = CATEGORY_ORDER.map(
    (c) =>
      `nwr(around:${around},${center.lat},${center.lng})${CATEGORY_FILTERS[c]}["name"];\nout center ${limit};`,
  );
  return `[out:json][timeout:8];\n${statements.join('\n')}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseElements(json: unknown): RawPoi[] {
  if (!isRecord(json) || !Array.isArray(json['elements'])) {
    throw new OverpassError('invalid response shape');
  }
  const seen = new Set<string>();
  const out: RawPoi[] = [];
  for (const el of json['elements'] as unknown[]) {
    if (!isRecord(el)) continue;
    const type = el['type'];
    const rawId = el['id'];
    if (typeof type !== 'string' || (typeof rawId !== 'number' && typeof rawId !== 'string')) {
      continue;
    }
    const tagsRaw = el['tags'];
    if (!isRecord(tagsRaw)) continue;
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(tagsRaw)) if (typeof v === 'string') tags[k] = v;
    const name = tags['name'];
    if (!name) continue;
    const pos = type === 'node' ? el : el['center'];
    if (!isRecord(pos)) continue;
    const lat = pos['lat'];
    const lng = pos['lon'];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const category = classify(tags);
    if (!category) continue;
    const id = `${type}/${rawId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, category, lat, lng });
  }
  return out;
}

export function selectPois(raw: RawPoi[], origin: LatLng, radiusM: Radius): Poi[] {
  const withDist: Poi[] = raw
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      distanceM: Math.round(haversineMeters(origin, r)),
      bearing: bearing8(origin, r),
    }))
    .filter((p) => p.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
  const counts = new Map<PoiCategory, number>();
  const result: Poi[] = [];
  for (const p of withDist) {
    const n = counts.get(p.category) ?? 0;
    if (n >= PER_CATEGORY_LIMIT) continue;
    counts.set(p.category, n + 1);
    result.push(p);
  }
  return result.slice(0, MAX_POIS);
}

export async function fetchOverpass(
  query: string,
  opts: { fetch: typeof fetch },
): Promise<unknown> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new OverpassError('timeout'));
      }, ENDPOINT_TIMEOUT_MS);
    });
    try {
      const attempt = (async () => {
        const res = await opts.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!res.ok) throw new OverpassError(`HTTP ${res.status}`);
        return (await res.json()) as unknown;
      })();
      attempt.catch(() => undefined);
      return await Promise.race([attempt, timeout]);
    } catch {
      // try next endpoint
    } finally {
      clearTimeout(timer);
    }
  }
  throw new OverpassError('all endpoints failed');
}

export type PoiSearchResult =
  { kind: 'ok'; radius: Radius; pois: Poi[] } | { kind: 'empty' } | { kind: 'error' };

export type SearchPhase = 'search1km' | 'search5km';

export function createPoiSearcher(opts: { fetch: typeof fetch; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; raw: RawPoi[] }>();

  async function load(center: LatLng, radius: Radius): Promise<RawPoi[] | null> {
    const key = `${center.lat},${center.lng},${radius}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.raw;
    try {
      const json = await fetchOverpass(buildQuery(center, radius), { fetch: opts.fetch });
      const raw = parseElements(json);
      cache.set(key, { at: now(), raw });
      return raw;
    } catch {
      return null;
    }
  }

  async function search(
    origin: LatLng,
    onPhase?: (p: SearchPhase) => void,
  ): Promise<PoiSearchResult> {
    const center = roundLatLng(origin);
    onPhase?.('search1km');
    const raw1 = await load(center, 1000);
    if (!raw1) return { kind: 'error' };
    const pois1 = selectPois(raw1, origin, 1000);
    if (pois1.length > 0) return { kind: 'ok', radius: 1000, pois: pois1 };
    onPhase?.('search5km');
    const raw5 = await load(center, 5000);
    if (!raw5) return { kind: 'error' };
    const pois5 = selectPois(raw5, origin, 5000);
    return pois5.length > 0 ? { kind: 'ok', radius: 5000, pois: pois5 } : { kind: 'empty' };
  }

  return { search };
}
