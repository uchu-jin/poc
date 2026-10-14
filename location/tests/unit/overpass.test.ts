import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatLng } from '../../src/domain/types';
import { classify } from '../../src/poi/categories';
import {
  CACHE_TTL_MS,
  OverpassError,
  buildQuery,
  createPoiSearcher,
  fetchOverpass,
  parseElements,
  selectPois,
  type RawPoi,
} from '../../src/poi/overpass';

const ORIGIN: LatLng = { lat: 35.681236, lng: 139.767125 };
const ROUNDED: LatLng = { lat: 35.681, lng: 139.767 };

const M_PER_DEG_LAT = (6371008.8 * Math.PI) / 180;
const north = (m: number): { lat: number; lon: number } => ({
  lat: ORIGIN.lat + m / M_PER_DEG_LAT,
  lon: ORIGIN.lng,
});

let seq = 0;
function node(tags: Record<string, string>, m = 100) {
  seq += 1;
  return { type: 'node', id: seq, ...north(m), tags };
}
const restaurant = (m = 100, name = 'R') => node({ amenity: 'restaurant', name }, m);
const museum = (m = 100, name = 'M') => node({ tourism: 'museum', name }, m);

function okResponse(elements: unknown[]): Response {
  return new Response(JSON.stringify({ elements }), { status: 200 });
}

function fakeFetch(...responses: Array<Response | Error | 'hang'>) {
  const queue = [...responses];
  const fn = vi.fn((_url: unknown, init?: RequestInit): Promise<Response> => {
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error('no more responses'));
    if (next === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return fn;
}
const asFetch = (f: ReturnType<typeof fakeFetch>): typeof fetch => f as unknown as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
});

describe('overpass', () => {
  it('U-op-1: buildQuery snapshot for 1 km and 5 km', () => {
    const f = (c: string) => `${c}["name"];\nout center ${limitOf}`;
    let limitOf = 0;
    const body = (r: number, limit: number) => {
      limitOf = limit;
      return [
        f(
          `nwr(around:${r},35.681,139.767)["amenity"="place_of_worship"]["religion"~"^(buddhist|shinto)$"]`,
        ),
        f(`nwr(around:${r},35.681,139.767)["tourism"="museum"]`),
        f(`nwr(around:${r},35.681,139.767)["tourism"="viewpoint"]`),
        f(`nwr(around:${r},35.681,139.767)["amenity"="restaurant"]`),
      ]
        .map((line) => `${line};`)
        .join('\n');
    };
    expect(buildQuery(ROUNDED, 1000)).toBe(`[out:json][timeout:8];\n${body(1150, 40)}`);
    expect(buildQuery(ROUNDED, 5000)).toBe(`[out:json][timeout:8];\n${body(5150, 25)}`);
    // 各カテゴリの直後に out があること（最後のカテゴリしか返らない不具合の回帰防止）
    expect(buildQuery(ROUNDED, 1000).match(/out center 40;/g)).toHaveLength(4);
  });

  it('U-op-1: the around center is the rounded coordinate, never the raw one', async () => {
    const fetchMock = fakeFetch(okResponse([restaurant()]));
    await createPoiSearcher({ fetch: asFetch(fetchMock) }).search(ORIGIN);
    const init = fetchMock.mock.calls[0]?.[1];
    const body = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
    expect(body).toContain('around:1150,35.681,139.767)');
    expect(body).not.toContain('35.681236');
    expect(body).not.toContain('139.767125');
  });

  it('U-op-2: parses node, way(center) and relation(center)', () => {
    const raw = parseElements({
      elements: [
        { type: 'node', id: 1, lat: 35.1, lon: 139.1, tags: { amenity: 'restaurant', name: 'A' } },
        {
          type: 'way',
          id: 2,
          center: { lat: 35.2, lon: 139.2 },
          tags: { tourism: 'museum', name: 'B' },
        },
        {
          type: 'relation',
          id: 3,
          center: { lat: 35.3, lon: 139.3 },
          tags: { tourism: 'viewpoint', name: 'C' },
        },
        { type: 'node', id: 1, lat: 35.1, lon: 139.1, tags: { amenity: 'restaurant', name: 'A' } },
      ],
    });
    expect(raw).toEqual([
      { id: 'node/1', name: 'A', category: 'restaurant', lat: 35.1, lng: 139.1 },
      { id: 'way/2', name: 'B', category: 'museum', lat: 35.2, lng: 139.2 },
      { id: 'relation/3', name: 'C', category: 'viewpoint', lat: 35.3, lng: 139.3 },
    ]);
    expect(() => parseElements({ nope: 1 })).toThrow(OverpassError);
    expect(() => parseElements(null)).toThrow();
  });

  it('U-op-3: elements without a name or coordinates are excluded', () => {
    const raw = parseElements({
      elements: [
        { type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'restaurant' } },
        { type: 'node', id: 2, tags: { amenity: 'restaurant', name: 'X' } },
        { type: 'way', id: 3, tags: { amenity: 'restaurant', name: 'Y' } },
      ],
    });
    expect(raw).toEqual([]);
  });

  it('U-op-4: only buddhist and shinto places of worship are included', () => {
    const w = (religion: string) => ({ amenity: 'place_of_worship', religion });
    expect(classify(w('buddhist'))).toBe('shrine_temple');
    expect(classify(w('shinto'))).toBe('shrine_temple');
    expect(classify(w('christian'))).toBeNull();
    expect(classify({ amenity: 'place_of_worship' })).toBeNull();
    const raw = parseElements({
      elements: [
        { type: 'node', id: 1, lat: 1, lon: 1, tags: { ...w('christian'), name: 'Church' } },
        { type: 'node', id: 2, lat: 1, lon: 1, tags: { ...w('shinto'), name: 'Jinja' } },
      ],
    });
    expect(raw.map((r) => r.name)).toEqual(['Jinja']);
  });

  it('U-op-5: keeps 5 per category and at most 20 in total', () => {
    const mk = (category: RawPoi['category'], i: number): RawPoi => ({
      id: `node/${category}${i}`,
      name: `${category}${i}`,
      category,
      ...{ lat: ORIGIN.lat + (10 * (i + 1)) / M_PER_DEG_LAT, lng: ORIGIN.lng },
    });
    const only = Array.from({ length: 6 }, (_, i) => mk('restaurant', i));
    const picked = selectPois(only, ORIGIN, 1000);
    expect(picked).toHaveLength(5);
    expect(picked.map((p) => p.name)).not.toContain('restaurant5');

    const cats = ['shrine_temple', 'museum', 'viewpoint', 'restaurant'] as const;
    const all = cats.flatMap((c) => Array.from({ length: 6 }, (_, i) => mk(c, i)));
    const result = selectPois(all, ORIGIN, 1000);
    expect(result).toHaveLength(20);
    for (const c of cats) expect(result.filter((p) => p.category === c)).toHaveLength(5);
    const dists = result.map((p) => p.distanceM);
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
  });

  it('U-op-6: radius filter uses the true origin (rounding correction)', () => {
    const mk = (id: string, m: number): RawPoi => ({
      id,
      name: id,
      category: 'restaurant',
      lat: north(m).lat,
      lng: ORIGIN.lng,
    });
    const picked = selectPois([mk('far', 1050), mk('near', 990)], ORIGIN, 1000);
    expect(picked.map((p) => p.id)).toEqual(['near']);
    expect(picked[0]?.distanceM).toBe(990);
    expect(picked[0]?.bearing).toBe('北');
  });

  it('U-op-7: falls back to the mirror on 429', async () => {
    const f = fakeFetch(new Response('', { status: 429 }), okResponse([restaurant()]));
    const json = await fetchOverpass('q', { fetch: asFetch(f) });
    expect(json).toEqual({ elements: [expect.anything()] });
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]);
    const init = f.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('data=q');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
  });

  it('U-op-7: falls back to the mirror when the first endpoint times out', async () => {
    vi.useFakeTimers();
    const f = fakeFetch('hang', okResponse([restaurant()]));
    const p = fetchOverpass('q', { fetch: asFetch(f) });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('U-op-7: 5xx, network error and invalid JSON also move to the next endpoint', async () => {
    for (const bad of [
      new Response('', { status: 503 }),
      new Error('net'),
      new Response('not json', { status: 200 }),
    ]) {
      const f = fakeFetch(bad, okResponse([]));
      await expect(fetchOverpass('q', { fetch: asFetch(f) })).resolves.toEqual({ elements: [] });
      expect(f).toHaveBeenCalledTimes(2);
    }
  });

  it('U-op-8: both endpoints failing gives error and never queries 5 km', async () => {
    const f = fakeFetch(new Response('', { status: 500 }), new Error('net'));
    const phases: string[] = [];
    const r = await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN, (p) => phases.push(p));
    expect(r).toEqual({ kind: 'error' });
    expect(f).toHaveBeenCalledTimes(2);
    expect(phases).toEqual(['search1km']);
    await expect(
      fetchOverpass('q', { fetch: asFetch(fakeFetch(new Error('a'), new Error('b'))) }),
    ).rejects.toBeInstanceOf(OverpassError);
  });

  it('U-op-9: a single restaurant within 1 km does not trigger a 5 km search', async () => {
    const f = fakeFetch(okResponse([restaurant(200, 'Solo')]));
    const phases: string[] = [];
    const r = await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN, (p) => phases.push(p));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.radius).toBe(1000);
      expect(r.pois.map((p) => p.name)).toEqual(['Solo']);
    }
    expect(f).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(['search1km']);
  });

  it('U-op-10: empty 1 km proceeds to 5 km', async () => {
    const f = fakeFetch(okResponse([]), okResponse([museum(3000, 'Far')]));
    const phases: string[] = [];
    const r = await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN, (p) => phases.push(p));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.radius).toBe(5000);
    expect(phases).toEqual(['search1km', 'search5km']);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('U-op-10: results only outside 1 km (after correction) also proceed to 5 km', async () => {
    const f = fakeFetch(okResponse([restaurant(1050)]), okResponse([restaurant(1050)]));
    const r = await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN);
    expect(r).toMatchObject({ kind: 'ok', radius: 5000 });
  });

  it('U-op-10: empty at both radii gives empty', async () => {
    const f = fakeFetch(okResponse([]), okResponse([]));
    expect(await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN)).toEqual({
      kind: 'empty',
    });
  });

  it('U-op-10: empty 1 km and failing 5 km gives error', async () => {
    const f = fakeFetch(okResponse([]), new Error('a'), new Error('b'));
    expect(await createPoiSearcher({ fetch: asFetch(f) }).search(ORIGIN)).toEqual({
      kind: 'error',
    });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('cache: reuses within 10 min, refetches after, and never caches errors', async () => {
    let t = 1_000;
    const f = fakeFetch(okResponse([restaurant()]), okResponse([restaurant()]));
    const s = createPoiSearcher({ fetch: asFetch(f), now: () => t });
    await s.search(ORIGIN);
    t += CACHE_TTL_MS - 1;
    await s.search({ lat: 35.6811, lng: 139.7669 });
    expect(f).toHaveBeenCalledTimes(1);
    t += 2;
    await s.search(ORIGIN);
    expect(f).toHaveBeenCalledTimes(2);

    const g = fakeFetch(new Error('a'), new Error('b'), okResponse([restaurant()]));
    const s2 = createPoiSearcher({ fetch: asFetch(g), now: () => t });
    expect((await s2.search(ORIGIN)).kind).toBe('error');
    expect((await s2.search(ORIGIN)).kind).toBe('ok');
    expect(g).toHaveBeenCalledTimes(3);
  });
});
