import { describe, expect, it } from 'vitest';
import {
  WEATHER_CACHE_TTL_MS,
  buildWeatherUrl,
  createWeatherClient,
  parseWeather,
} from '../../src/weather/openMeteo';
import { WMO_LABELS, weatherLabel } from '../../src/weather/wmoCodes';

const WMO_TABLE: [number, string][] = [
  [0, '快晴'],
  [1, '晴れ'],
  [2, '晴れ時々くもり'],
  [3, 'くもり'],
  [45, '霧'],
  [48, '霧（着氷）'],
  [51, '弱い霧雨'],
  [53, '霧雨'],
  [55, '強い霧雨'],
  [56, '弱い着氷性の霧雨'],
  [57, '着氷性の霧雨'],
  [61, '弱い雨'],
  [63, '雨'],
  [65, '強い雨'],
  [66, '弱い着氷性の雨'],
  [67, '着氷性の雨'],
  [71, '弱い雪'],
  [73, '雪'],
  [75, '強い雪'],
  [77, '霧雪'],
  [80, '弱いにわか雨'],
  [81, 'にわか雨'],
  [82, '激しいにわか雨'],
  [85, '弱いにわか雪'],
  [86, '強いにわか雪'],
  [95, '雷雨'],
  [96, '雷雨（ひょう）'],
  [99, '激しい雷雨（ひょう）'],
];

const SAMPLE_JSON = {
  current: { temperature_2m: 18.4, relative_humidity_2m: 65, weather_code: 3 },
};

function makeFetch(respond: () => Response): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    urls.push(String(input));
    return respond();
  };
  return { fetch: fakeFetch, urls };
}

const okResponse = (): Response => new Response(JSON.stringify(SAMPLE_JSON), { status: 200 });

describe('weather', () => {
  it('U-wx-1: every listed WMO code maps to its Japanese label', () => {
    for (const [code, label] of WMO_TABLE) {
      expect(weatherLabel(code), `code ${code}`).toBe(label);
    }
    expect(Object.keys(WMO_LABELS)).toHaveLength(28);
    expect(WMO_TABLE).toHaveLength(28);
  });

  it('U-wx-2: unknown codes map to 不明', () => {
    expect(weatherLabel(4)).toBe('不明');
    expect(weatherLabel(100)).toBe('不明');
    expect(weatherLabel(-1)).toBe('不明');
  });

  it('U-wx-3: cache lasts under 15 minutes, refetches at exactly 15 minutes, and does not cache failures', async () => {
    let t = 0;
    let status = 200;
    const urls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      urls.push(String(input));
      return status === 200 ? okResponse() : new Response('server error', { status: 500 });
    };
    const client = createWeatherClient({ fetch: fakeFetch, now: () => t });
    const point = { lat: 35.681236, lng: 139.767125 };

    const first = await client.get(point);
    expect(first).not.toBeNull();
    expect(urls).toHaveLength(1);

    t = 14 * 60 * 1000 + 59 * 1000; // 14:59
    expect(await client.get(point)).toEqual(first);
    expect(urls).toHaveLength(1);

    t = WEATHER_CACHE_TTL_MS; // exactly 15:00
    expect(await client.get(point)).not.toBeNull();
    expect(urls).toHaveLength(2);

    // Failed fetch: returns null, is not cached, and the next call fetches again.
    const failing = createWeatherClient({ fetch: fakeFetch, now: () => t });
    status = 500;
    const before = urls.length;
    expect(await failing.get({ lat: 1, lng: 2 })).toBeNull();
    status = 200;
    expect(await failing.get({ lat: 1, lng: 2 })).not.toBeNull();
    expect(urls).toHaveLength(before + 2);
  });

  it('U-wx-4: parseWeather reads the current fields and rejects missing or non-numeric values', () => {
    const fetchedAt = '2026-10-14T00:00:00.000Z';
    expect(parseWeather(SAMPLE_JSON, fetchedAt)).toEqual({
      tempC: 18.4,
      humidity: 65,
      code: 3,
      label: 'くもり',
      fetchedAt,
    });
    expect(
      parseWeather({ current: { relative_humidity_2m: 65, weather_code: 3 } }, fetchedAt),
    ).toBeNull();
    expect(
      parseWeather(
        { current: { temperature_2m: '18.4', relative_humidity_2m: 65, weather_code: 3 } },
        fetchedAt,
      ),
    ).toBeNull();
    expect(parseWeather({}, fetchedAt)).toBeNull();
    expect(parseWeather(null, fetchedAt)).toBeNull();
  });

  it('URL: rounds coordinates to 3 decimals and requests Asia/Tokyo', () => {
    const url = buildWeatherUrl({ lat: 35.681236, lng: 139.767125 });
    expect(url).toContain('latitude=35.681&longitude=139.767');
    expect(url).not.toMatch(/\d\.\d{4,}/);
    expect(url).toContain('timezone=Asia%2FTokyo');
    expect(url).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=35.681&longitude=139.767&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FTokyo',
    );
  });

  it('network error returns null and is not cached', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network down');
      return okResponse();
    };
    const client = createWeatherClient({ fetch: fakeFetch, now: () => 0 });
    expect(await client.get({ lat: 1, lng: 2 })).toBeNull();
    expect(await client.get({ lat: 1, lng: 2 })).not.toBeNull();
    expect(calls).toBe(2);
  });

  it('uses the fake fetch only (URL is recorded by the fake)', async () => {
    const { fetch: fakeFetch, urls } = makeFetch(okResponse);
    const client = createWeatherClient({ fetch: fakeFetch, now: () => 0 });
    await client.get({ lat: 35.681236, lng: 139.767125 });
    expect(urls).toEqual([buildWeatherUrl({ lat: 35.681236, lng: 139.767125 })]);
  });
});
