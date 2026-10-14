import { roundLatLng } from '../domain/geo';
import type { LatLng, Weather } from '../domain/types';
import { weatherLabel } from './wmoCodes';

export const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

export function buildWeatherUrl(p: LatLng): string {
  const r = roundLatLng(p);
  const params = [
    `latitude=${r.lat}`,
    `longitude=${r.lng}`,
    'current=temperature_2m,relative_humidity_2m,weather_code',
    'timezone=Asia%2FTokyo',
  ];
  return `https://api.open-meteo.com/v1/forecast?${params.join('&')}`;
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function parseWeather(json: unknown, fetchedAt: string): Weather | null {
  if (typeof json !== 'object' || json === null) return null;
  const current: unknown = (json as { current?: unknown }).current;
  if (typeof current !== 'object' || current === null) return null;
  const c = current as Record<string, unknown>;
  const tempC = finiteNumber(c['temperature_2m']);
  const humidity = finiteNumber(c['relative_humidity_2m']);
  const code = finiteNumber(c['weather_code']);
  if (tempC === null || humidity === null || code === null) return null;
  return { tempC, humidity, code, label: weatherLabel(code), fetchedAt };
}

export interface WeatherClientOptions {
  fetch: typeof fetch;
  now?: () => number;
}

export interface WeatherClient {
  get(p: LatLng): Promise<Weather | null>;
}

export function createWeatherClient(opts: WeatherClientOptions): WeatherClient {
  const now = opts.now ?? (() => Date.now());
  const cache = new Map<string, { value: Weather; cachedAt: number }>();

  return {
    async get(p: LatLng): Promise<Weather | null> {
      const r = roundLatLng(p);
      const key = `${r.lat},${r.lng}`;
      const t = now();
      const hit = cache.get(key);
      if (hit && t - hit.cachedAt < WEATHER_CACHE_TTL_MS) return hit.value;

      let res: Response;
      try {
        res = await opts.fetch(buildWeatherUrl(r));
      } catch {
        return null;
      }
      if (!res.ok) return null;

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return null;
      }

      const weather = parseWeather(json, new Date(t).toISOString());
      if (weather === null) return null;
      cache.set(key, { value: weather, cachedAt: t });
      return weather;
    },
  };
}
