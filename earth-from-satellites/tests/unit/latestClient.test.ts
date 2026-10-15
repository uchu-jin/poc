import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatest } from '../../src/features/viewer/latestClient';

const valid = {
  satelliteId: 'goes-east',
  satelliteName: 'GOES-East',
  capturedAt: '2026-10-14T14:30:20.000Z',
  images: [
    { url: 'https://cdn.star.nesdis.noaa.gov/GOES19/a-339x339.jpg', width: 339 },
    { url: 'https://cdn.star.nesdis.noaa.gov/GOES19/a-678x678.jpg', width: 678 },
  ],
  credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
};

function fetchReturning(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchLatest', () => {
  it('正常な応答のとき ok と画像を返し、no-cache で要求する', async () => {
    const { fn, calls } = fetchReturning(valid);
    const result = await fetchLatest('goes-east', { fetch: fn });
    expect(result).toEqual({
      ok: true,
      image: {
        ...valid,
        credit: { text: valid.credit.text, linkUrl: 'https://www.star.nesdis.noaa.gov/GOES/' },
      },
    });
    expect(calls[0]?.url).toBe('/api/latest?satellite=goes-east');
    expect(calls[0]?.init?.cache).toBe('no-cache');
  });

  it.each([
    ['非2xx', () => fetchReturning({ code: 'upstream_error' }, 502).fn],
    [
      '通信エラー',
      () =>
        (async () => {
          throw new TypeError('offline');
        }) as typeof fetch,
    ],
    ['JSON でない', () => fetchReturning('<html>').fn],
    ['必須項目がない', () => fetchReturning({ ...valid, capturedAt: undefined }).fn],
    ['capturedAt が日時でない', () => fetchReturning({ ...valid, capturedAt: 'not-a-date' }).fn],
    ['satelliteId が要求と違う', () => fetchReturning({ ...valid, satelliteId: 'himawari9' }).fn],
    [
      '画像の URL が http',
      () =>
        fetchReturning({
          ...valid,
          images: [{ url: 'http://cdn.star.nesdis.noaa.gov/a.jpg', width: 678 }],
        }).fn,
    ],
    [
      '画像の URL が許可外のホスト',
      () =>
        fetchReturning({ ...valid, images: [{ url: 'https://evil.example/a.jpg', width: 678 }] })
          .fn,
    ],
    [
      'width が 2001',
      () =>
        fetchReturning({
          ...valid,
          images: [{ url: 'https://cdn.star.nesdis.noaa.gov/a.jpg', width: 2001 }],
        }).fn,
    ],
    ['images が空', () => fetchReturning({ ...valid, images: [] }).fn],
  ])('%s のとき ok: false', async (_label, makeFetch) => {
    expect(await fetchLatest('goes-east', { fetch: makeFetch() })).toEqual({ ok: false });
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['許可外のホスト', 'https://evil.example/'],
  ])('credit.url が %s のとき ok だがリンクにしない', async (_label, url) => {
    const { fn } = fetchReturning({ ...valid, credit: { ...valid.credit, url } });
    const result = await fetchLatest('goes-east', { fetch: fn });
    expect(result.ok && result.image.credit.linkUrl).toBeNull();
  });

  function delayed(ms: number) {
    return (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(JSON.stringify(valid))), ms);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as typeof fetch;
  }

  it('7.9秒で応答があれば ok', async () => {
    vi.useFakeTimers();
    const p = fetchLatest('goes-east', { fetch: delayed(7900) });
    await vi.advanceTimersByTimeAsync(7900);
    expect((await p).ok).toBe(true);
  });

  it('8秒たっても応答がなければ ok: false', async () => {
    vi.useFakeTimers();
    const p = fetchLatest('goes-east', { fetch: delayed(60_000) });
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toEqual({ ok: false });
  });
});

describe('fetchLatest：境界値（レビュー指摘への対応）', () => {
  const star = (w: number) => ({ url: `https://cdn.star.nesdis.noaa.gov/a-${w}.jpg`, width: w });
  it.each([
    ['width が 2000（上限ちょうど）', { images: [star(2000)] }, true],
    ['width が 1', { images: [star(1)] }, true],
    ['width が 0', { images: [star(0)] }, false],
    ['width が 678.5', { images: [{ ...star(678), width: 678.5 }] }, false],
    ['images が5件', { images: [1, 2, 3, 4, 5].map((i) => star(i * 100)) }, true],
    ['images が6件', { images: [1, 2, 3, 4, 5, 6].map((i) => star(i * 100)) }, false],
    ['文字列が 2048 文字', { satelliteName: 'a'.repeat(2048) }, true],
    ['文字列が 2049 文字', { satelliteName: 'a'.repeat(2049) }, false],
    ['credit がない', { credit: undefined }, false],
    ['credit.url が 2049 文字', { credit: { text: 'x', url: 'a'.repeat(2049) } }, false],
    ['capturedAt が "2026"（ISO 8601 でない）', { capturedAt: '2026' }, false],
    ['capturedAt が "Oct 14"', { capturedAt: 'Oct 14' }, false],
    ['capturedAt がオフセット付きの ISO', { capturedAt: '2026-10-14T23:30:20+09:00' }, true],
  ])('%s のとき ok は %s', async (_label, over, expected) => {
    const { fn } = fetchReturning({ ...valid, ...over });
    expect((await fetchLatest('goes-east', { fetch: fn })).ok).toBe(expected);
  });
});
