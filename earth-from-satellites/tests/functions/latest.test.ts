import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLatest, type CacheLike, type LatestDeps } from '../../functions/api/latest';
import { validateLatestImage } from '../../functions/_lib/validate';
import { SourceError, type LatestImage } from '../../functions/_lib/types';

const NOW = new Date('2026-10-14T14:40:00Z');

function memoryCache() {
  const store = new Map<string, Response>();
  const puts: string[] = [];
  const cache: CacheLike = {
    async match(key) {
      const hit = store.get(String(key));
      return hit ? hit.clone() : undefined;
    },
    async put(key, res) {
      puts.push(String(key));
      store.set(String(key), res.clone());
    },
  };
  return { cache, store, puts };
}

const ciraTimes = { timestamps_int: [20261014143020, 20261014142020, 20261014141020] };

function sourceFetch(opts: { status?: number; hang?: boolean } = {}) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (opts.hang) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    if (opts.status) return new Response('ng', { status: opts.status });
    if (init?.method === 'HEAD') return new Response(null, { status: 200 });
    return new Response(JSON.stringify(ciraTimes), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

function setup(fetchOpts: Parameters<typeof sourceFetch>[0] = {}) {
  const f = sourceFetch(fetchOpts);
  const c = memoryCache();
  const deps: LatestDeps = { fetch: f.fn, now: () => NOW, cache: c.cache };
  return { deps, calls: f.calls, ...c };
}

const req = (qs: string) => new Request(`https://earth.example/api/latest${qs}`);

afterEach(() => {
  vi.useRealTimers();
});

describe('handleLatest：正常系（FR-009）', () => {
  it.each([
    ['himawari9', 'ひまわり9号', 1],
    ['goes-east', 'GOES-East', 3],
    ['goes-west', 'GOES-West', 3],
  ])('%s のとき 200 で最新画像の情報を返す', async (id, name, imageCount) => {
    const { deps } = setup();
    const res = await handleLatest(req(`?satellite=${id}`), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await res.json()) as LatestImage;
    expect(body.satelliteId).toBe(id);
    expect(body.satelliteName).toBe(name);
    expect(body.capturedAt).toBe('2026-10-14T14:30:20.000Z');
    expect(body.images).toHaveLength(imageCount);
    expect(body.credit.text.length).toBeGreaterThan(0);
  });

  it('GOES-West は GOES18 の画像 URL を返す', async () => {
    const { deps } = setup();
    const body = (await (
      await handleLatest(req('?satellite=goes-west'), deps)
    ).json()) as LatestImage;
    expect(body.images.every((i) => i.url.includes('/GOES18/'))).toBe(true);
  });
});

describe('handleLatest：不正な衛星 ID（FR-010）', () => {
  it.each([
    ['不明な ID', '?satellite=meteosat'],
    ['ID なし', ''],
    ['空文字', '?satellite='],
    ['重複指定', '?satellite=goes-east&satellite=x'],
    ['URL', '?satellite=https%3A%2F%2Fevil.example%2F'],
    ['大文字違い', '?satellite=GOES-EAST'],
  ])('%s のとき 400 を返し、配信元にもキャッシュにも触れない', async (_label, qs) => {
    const { deps, calls, puts } = setup();
    const res = await handleLatest(req(qs), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'invalid_satellite' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(calls).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });
});

describe('handleLatest：配信元の失敗（FR-011）', () => {
  it('配信元が 500 のとき 502 を返し、キャッシュに書かない', async () => {
    const { deps, puts } = setup({ status: 500 });
    const res = await handleLatest(req('?satellite=himawari9'), deps);
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code: 'upstream_error' });
    expect(text).not.toContain('cira');
    expect(puts).toHaveLength(0);
  });

  it('配信元が5秒応答しないとき 504 を返す', async () => {
    vi.useFakeTimers();
    const { deps, puts } = setup({ hang: true });
    const p = handleLatest(req('?satellite=goes-east'), deps);
    await vi.advanceTimersByTimeAsync(5000);
    const res = await p;
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ code: 'upstream_timeout' });
    expect(puts).toHaveLength(0);
  });

  it('配信元の応答が検証に通らないとき 502 を返す', async () => {
    const { deps } = setup();
    deps.now = () => new Date('2026-10-14T14:00:00Z'); // 撮影日時が30分以上未来に見える
    const res = await handleLatest(req('?satellite=himawari9'), deps);
    expect(res.status).toBe(502);
  });
});

describe('handleLatest：キャッシュ（FR-009）', () => {
  it('キャッシュに当たったとき配信元に問い合わせない', async () => {
    const { deps, calls } = setup();
    await handleLatest(req('?satellite=himawari9'), deps);
    const before = calls.length;
    const res = await handleLatest(req('?satellite=himawari9'), deps);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(before);
  });

  it('余計なクエリが付いても同じキーでキャッシュする', async () => {
    const { deps, puts } = setup();
    await handleLatest(req('?satellite=goes-east&_=123'), deps);
    await handleLatest(req('?satellite=goes-east'), deps);
    expect(puts).toEqual(['https://cache.internal/api/latest?satellite=goes-east']);
  });
});

describe('validateLatestImage', () => {
  const base: LatestImage = {
    satelliteId: 'goes-east',
    satelliteName: 'GOES-East',
    capturedAt: '2026-10-14T14:30:00.000Z',
    images: [{ url: 'https://cdn.star.nesdis.noaa.gov/GOES19/a.jpg', width: 678 }],
    credit: { text: 'x', url: 'https://example.org' },
  };
  const check =
    (over: Partial<LatestImage>, now = NOW) =>
    () =>
      validateLatestImage({ ...base, ...over }, now);
  const isInvalid = (e: unknown) => e instanceof SourceError && e.kind === 'invalid';

  it('正しい値のときそのまま通る', () => {
    expect(check({})).not.toThrow();
  });

  it.each([
    ['許可外のホスト', 'https://evil.example/a.jpg'],
    ['http', 'http://cdn.star.nesdis.noaa.gov/a.jpg'],
    ['ホスト名の後方一致', 'https://cdn.star.nesdis.noaa.gov.evil.example/a.jpg'],
    ['URL でない', 'not a url'],
  ])('%s の画像 URL のとき invalid になる', (_label, url) => {
    expect(check({ images: [{ url, width: 678 }] })).toThrow(expect.toSatisfy(isInvalid));
  });

  it('幅 2000 は通り、2001 は invalid になる', () => {
    const url = base.images[0]!.url;
    expect(check({ images: [{ url, width: 2000 }] })).not.toThrow();
    expect(check({ images: [{ url, width: 2001 }] })).toThrow(expect.toSatisfy(isInvalid));
  });

  it('画像が0件のとき invalid になる', () => {
    expect(check({ images: [] })).toThrow(expect.toSatisfy(isInvalid));
  });

  it('撮影日時が now+10分ちょうどなら通り、+10分1秒なら invalid になる', () => {
    expect(check({ capturedAt: '2026-10-14T14:50:00.000Z' })).not.toThrow();
    expect(check({ capturedAt: '2026-10-14T14:50:01.000Z' })).toThrow(expect.toSatisfy(isInvalid));
  });

  it('撮影日時が古くても通る（「○分前」の判定は画面側）', () => {
    expect(check({ capturedAt: '2026-10-13T00:00:00.000Z' })).not.toThrow();
  });

  it('撮影日時が日時として読めないとき invalid になる', () => {
    expect(check({ capturedAt: 'yesterday' })).toThrow(expect.toSatisfy(isInvalid));
  });
});

describe('handleLatest：レビュー指摘への対応', () => {
  it('キャッシュへの書き込みが失敗しても、200 で結果を返す', async () => {
    const { deps } = setup();
    deps.cache = {
      match: async () => undefined,
      put: async () => {
        throw new Error('quota');
      },
    };
    const res = await handleLatest(req('?satellite=himawari9'), deps);
    expect(res.status).toBe(200);
  });

  it('キャッシュの読み出しが失敗しても、配信元に問い合わせて 200 を返す', async () => {
    const { deps, calls } = setup();
    deps.cache = {
      match: async () => {
        throw new Error('broken');
      },
      put: async () => {},
    };
    const res = await handleLatest(req('?satellite=himawari9'), deps);
    expect(res.status).toBe(200);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('タイムアウトの 504 にも no-store が付く', async () => {
    vi.useFakeTimers();
    const { deps } = setup({ hang: true });
    const p = handleLatest(req('?satellite=goes-east'), deps);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await p).headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['200', '?satellite=himawari9'],
    ['400', '?satellite=bogus'],
  ])('%s の応答に nosniff が付く', async (_label, qs) => {
    const { deps } = setup();
    const res = await handleLatest(req(qs), deps);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
