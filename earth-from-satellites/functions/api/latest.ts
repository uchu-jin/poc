import { z } from 'zod';
import { withTimeout } from '../_lib/fetchSource';
import { SATELLITE_IDS, SATELLITES, type SatelliteId } from '../_lib/satellites';
import { resolveCiraSlider } from '../_lib/sources/ciraSlider';
import { resolveNoaaStar } from '../_lib/sources/noaaStar';
import { SourceError, type LatestImage, type SourceDeps } from '../_lib/types';
import { validateLatestImage } from '../_lib/validate';

export const CACHE_MAX_AGE_SECONDS = 300;

export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface LatestDeps {
  fetch: typeof fetch;
  now: () => Date;
  cache: CacheLike;
}

const satelliteSchema = z.enum(SATELLITE_IDS);

function json(status: number, body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  });
}

function parseSatellite(request: Request): SatelliteId | null {
  const values = new URL(request.url).searchParams.getAll('satellite');
  if (values.length !== 1) return null;
  const parsed = satelliteSchema.safeParse(values[0]);
  return parsed.success ? parsed.data : null;
}

function resolve(id: SatelliteId, deps: SourceDeps): Promise<LatestImage> {
  const sat = SATELLITES[id];
  return sat.source === 'noaa-star'
    ? resolveNoaaStar(id, sat, deps)
    : resolveCiraSlider(id, sat, deps);
}

export async function handleLatest(request: Request, deps: LatestDeps): Promise<Response> {
  const id = parseSatellite(request);
  if (!id) return json(400, { code: 'invalid_satellite' }, 'no-store');

  const cacheKey = `https://cache.internal/api/latest?satellite=${id}`;
  // キャッシュは補助なので、壊れていても配信元から取って返す
  const cached = await deps.cache.match(cacheKey).catch(() => undefined);
  if (cached) return cached;

  try {
    const now = deps.now();
    const image = await withTimeout((signal) => resolve(id, { fetch: deps.fetch, signal, now }));
    validateLatestImage(image, now);
    const res = json(200, image, `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
    await deps.cache.put(cacheKey, res.clone()).catch(() => undefined);
    return res;
  } catch (e) {
    if (e instanceof SourceError && e.kind === 'timeout') {
      return json(504, { code: 'upstream_timeout' }, 'no-store');
    }
    return json(502, { code: 'upstream_error' }, 'no-store');
  }
}

export const onRequestGet: PagesFunction = async ({ request }) =>
  handleLatest(request, {
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    cache: caches.default,
  });
