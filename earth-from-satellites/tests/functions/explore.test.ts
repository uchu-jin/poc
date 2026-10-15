import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileUrl } from '../../shared/contract';
import { handleLatest, type CacheLike } from '../../functions/api/latest';
import { withTimeout } from '../../functions/_lib/fetchSource';
import { SATELLITES } from '../../functions/_lib/satellites';
import { resolveNasaEpic } from '../../functions/_lib/sources/nasaEpic';
import { resolveNoaaStar } from '../../functions/_lib/sources/noaaStar';
import { SourceError, type LatestImage, type SourceDeps } from '../../functions/_lib/types';
import { validateLatestImage } from '../../functions/_lib/validate';

const NOW = new Date('2026-10-14T12:00:00Z');
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function fetchFrom(handler: (url: string, method: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return handler(String(input), init?.method ?? 'GET');
  }) as typeof fetch;
  return { fn, calls };
}

const deps = (fn: typeof fetch, now = NOW): SourceDeps => ({
  fetch: fn,
  signal: new AbortController().signal,
  now,
});

async function expectKind(p: Promise<unknown>, kind: SourceError['kind']) {
  await expect(p).rejects.toSatisfy((e) => e instanceof SourceError && e.kind === kind);
}

const entry = (date: string, image = `epic_1b_${date.replace(/\D/g, '')}`) => ({
  identifier: image.slice(8),
  image,
  date,
  caption: 'x',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tileUrl', () => {
  const base =
    'https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/20261014141000/';
  it('段は2桁、行と列は3桁で組み立てる', () => {
    expect(tileUrl(base, 4, 10, 15)).toBe(`${base}04/010_015.png`);
    expect(tileUrl(base, 0, 0, 0)).toBe(`${base}00/000_000.png`);
  });
  it.each([
    ['段が 5', 5, 0, 0],
    ['段が −1', -1, 0, 0],
    ['行が −1', 2, -1, 0],
    ['行が 2^z', 2, 4, 0],
    ['列が 2^z', 2, 0, 4],
    ['小数', 2, 1.5, 0],
  ])('%s のとき例外', (_label, z, row, col) => {
    expect(() => tileUrl(base, z, row, col)).toThrow();
  });
});

describe('resolveNasaEpic', () => {
  it('最新の日時の画像 URL と撮影日時（UTC）を返し、tiles は付けない', async () => {
    const { fn, calls } = fetchFrom(() =>
      json([
        entry('2026-10-13 00:31:45', 'epic_1b_20261013003633'),
        entry('2026-10-13 22:08:15', 'epic_1b_20261013221304'),
        entry('2026-10-13 04:07:50', 'epic_1b_20261013040738'),
      ]),
    );
    const result = await resolveNasaEpic('epic', SATELLITES.epic, deps(fn));
    expect(result).toEqual({
      satelliteId: 'epic',
      satelliteName: 'DSCOVR（EPIC）',
      capturedAt: '2026-10-13T22:08:15.000Z',
      images: [
        {
          url: 'https://epic.gsfc.nasa.gov/archive/natural/2026/10/13/jpg/epic_1b_20261013221304.jpg',
          width: 1080,
        },
      ],
      credit: { text: 'NASA EPIC Team', url: 'https://epic.gsfc.nasa.gov/' },
    });
    expect(calls).toEqual(['GET https://epic.gsfc.nasa.gov/api/natural']);
  });

  it('画像 URL の日付は、日時ではなく画像名の日付から作る', async () => {
    const { fn } = fetchFrom(() => json([entry('2026-10-14 00:00:10', 'epic_1b_20261013235958')]));
    const result = await resolveNasaEpic('epic', SATELLITES.epic, deps(fn));
    expect(result.images[0]?.url).toContain('/archive/natural/2026/10/13/jpg/');
  });

  it.each([
    ['1件', 1, true],
    ['40件', 40, true],
    ['0件', 0, false],
    ['41件', 41, false],
  ])('%s のとき ok は %s', async (_label, count, ok) => {
    const list = Array.from({ length: count }, (_, i) =>
      entry(`2026-10-13 ${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00`),
    );
    const { fn } = fetchFrom(() => json(list));
    const p = resolveNasaEpic('epic', SATELLITES.epic, deps(fn));
    if (ok) await expect(p).resolves.toBeTruthy();
    else await expectKind(p, 'invalid');
  });

  it('now+10分ちょうどは採用し、+10分1秒は除く', async () => {
    const { fn } = fetchFrom(() =>
      json([
        entry('2026-10-14 12:10:01'),
        entry('2026-10-14 12:10:00'),
        entry('2026-10-14 11:00:00'),
      ]),
    );
    const result = await resolveNasaEpic('epic', SATELLITES.epic, deps(fn));
    expect(result.capturedAt).toBe('2026-10-14T12:10:00.000Z');
  });

  it('すべて未来の日時なら invalid', async () => {
    const { fn } = fetchFrom(() => json([entry('2026-10-15 00:00:00')]));
    await expectKind(resolveNasaEpic('epic', SATELLITES.epic, deps(fn)), 'invalid');
  });

  it.each([
    ['date の形が違う', [entry('2026/10/14 00:00:00', 'epic_1b_20261014000000')]],
    ['存在しない日付', [entry('2026-13-01 00:00:00', 'epic_1b_20261301000000')]],
    ['image の形が違う', [entry('2026-10-13 00:00:00', 'epic_1b_x')]],
    ['image にパスが入る', [entry('2026-10-13 00:00:00', '../../x')]],
    ['配列でない', { date: '2026-10-13 00:00:00' }],
  ])('%s のとき invalid', async (_label, body) => {
    const { fn } = fetchFrom(() => json(body));
    await expectKind(resolveNasaEpic('epic', SATELLITES.epic, deps(fn)), 'invalid');
  });

  it('本文が 64KB ちょうどなら読め、超えると invalid', async () => {
    const base = JSON.stringify([entry('2026-10-13 00:00:00')]);
    const pad = (n: number) => base.slice(0, -1) + ' '.repeat(n) + ']';
    const exact = pad(64 * 1024 - base.length);
    expect(exact.length).toBe(64 * 1024);
    const ok = fetchFrom(() => new Response(exact, { status: 200 }));
    await expect(resolveNasaEpic('epic', SATELLITES.epic, deps(ok.fn))).resolves.toBeTruthy();
    const over = fetchFrom(() => new Response(pad(64 * 1024 - base.length + 1), { status: 200 }));
    await expectKind(resolveNasaEpic('epic', SATELLITES.epic, deps(over.fn)), 'invalid');
  });

  it('非2xx・通信エラーなら upstream', async () => {
    const bad = fetchFrom(() => new Response('ng', { status: 503 }));
    await expectKind(resolveNasaEpic('epic', SATELLITES.epic, deps(bad.fn)), 'upstream');
    const down = fetchFrom(() => {
      throw new TypeError('offline');
    });
    await expectKind(resolveNasaEpic('epic', SATELLITES.epic, deps(down.fn)), 'upstream');
  });

  it('5秒たっても応答がないなら timeout', async () => {
    vi.useFakeTimers();
    const hang = (async () => new Promise<Response>(() => {})) as typeof fetch;
    const p = withTimeout((signal) =>
      resolveNasaEpic('epic', SATELLITES.epic, { fetch: hang, signal, now: NOW }),
    );
    const assertion = expectKind(p, 'timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});

describe('resolveNoaaStar の tiles', () => {
  it('HEAD で確かめた時刻の CIRA のタイル（678px）を返す', async () => {
    const times = { timestamps_int: [20261014143020, 20261014142020] };
    const { fn } = fetchFrom((url, method) => {
      if (method === 'GET') return json(times);
      return new Response(null, { status: url.includes('20262871430') ? 404 : 200 });
    });
    const result = await resolveNoaaStar(
      'goes-west',
      SATELLITES['goes-west'],
      deps(fn, new Date('2026-10-14T14:40:00Z')),
    );
    expect(result.tiles).toEqual({
      baseUrl:
        'https://slider.cira.colostate.edu/data/imagery/2026/10/14/goes-18---full_disk/geocolor/20261014142020/',
      tileSize: 678,
      maxZoom: 4,
    });
  });
});

describe('validateLatestImage の tiles と衛星ごとのホスト', () => {
  const baseUrl =
    'https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/20261014110000/';
  const himawari: LatestImage = {
    satelliteId: 'himawari9',
    satelliteName: 'ひまわり9号',
    capturedAt: '2026-10-14T11:00:00.000Z',
    images: [{ url: `${baseUrl}00/000_000.png`, width: 688 }],
    credit: { text: 'x', url: 'https://satlib.cira.colostate.edu/credit-media' },
    tiles: { baseUrl, tileSize: 688, maxZoom: 4 },
  };
  const check = (over: Partial<LatestImage>) => () =>
    validateLatestImage({ ...himawari, ...over }, NOW);
  const tiles = (over: Partial<NonNullable<LatestImage['tiles']>>) =>
    check({ tiles: { baseUrl, tileSize: 688, maxZoom: 4, ...over } });
  const invalid = expect.toSatisfy(
    (e: unknown) => e instanceof SourceError && e.kind === 'invalid',
  );

  it('正しい値は通る', () => {
    expect(check({})).not.toThrow();
    expect(check({ tiles: undefined })).not.toThrow();
  });

  it.each([
    ['http', baseUrl.replace('https', 'http')],
    ['許可外のホスト', baseUrl.replace('slider.cira.colostate.edu', 'evil.example')],
    ['ホスト名の後ろに別のドメイン', baseUrl.replace('colostate.edu', 'colostate.edu.evil.com')],
    ['user@ 付き', baseUrl.replace('https://', 'https://user@')],
    ['クエリ付き', `${baseUrl}?a=/`],
    ['# 付き', `${baseUrl}#/`],
    ['.. を含む', baseUrl.replace('/geocolor/', '/geocolor/../')],
    ['パスの形が違う', baseUrl.replace('/data/imagery/', '/data/other/')],
    ['/ で終わらない', baseUrl.slice(0, -1)],
    ['時刻が capturedAt と違う', baseUrl.replace('20261014110000', '20261014105000')],
  ])('baseUrl が %s なら invalid', (_label, url) => {
    expect(tiles({ baseUrl: url })).toThrow(invalid);
  });

  it.each([
    [600, true],
    [700, true],
    [599, false],
    [701, false],
    [688.5, false],
  ])('tileSize %s の ok は %s', (size, ok) => {
    if (ok) expect(tiles({ tileSize: size })).not.toThrow();
    else expect(tiles({ tileSize: size })).toThrow(invalid);
  });

  it.each([
    [0, true],
    [4, true],
    [-1, false],
    [5, false],
    [2.5, false],
  ])('maxZoom %s の ok は %s', (z, ok) => {
    if (ok) expect(tiles({ maxZoom: z })).not.toThrow();
    else expect(tiles({ maxZoom: z })).toThrow(invalid);
  });

  it('ひまわりの応答に EPIC のホストの画像があれば invalid', () => {
    expect(
      check({ images: [{ url: 'https://epic.gsfc.nasa.gov/archive/natural/a.jpg', width: 1080 }] }),
    ).toThrow(invalid);
  });

  it('EPIC の応答なら EPIC のホストの画像は通る', () => {
    expect(() =>
      validateLatestImage(
        {
          satelliteId: 'epic',
          satelliteName: 'DSCOVR（EPIC）',
          capturedAt: '2026-10-13T22:08:15.000Z',
          images: [{ url: 'https://epic.gsfc.nasa.gov/archive/natural/a.jpg', width: 1080 }],
          credit: { text: 'NASA EPIC Team', url: 'https://epic.gsfc.nasa.gov/' },
        },
        NOW,
      ),
    ).not.toThrow();
  });
});

describe('handleLatest：epic', () => {
  const cache: CacheLike = { match: async () => undefined, put: async () => {} };
  it('?satellite=epic で 200 を返し、tiles はない', async () => {
    const { fn } = fetchFrom(() => json([entry('2026-10-13 22:08:15', 'epic_1b_20261013221304')]));
    const res = await handleLatest(new Request('https://x.example/api/latest?satellite=epic'), {
      fetch: fn,
      now: () => NOW,
      cache,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LatestImage;
    expect(body.satelliteId).toBe('epic');
    expect(body.tiles).toBeUndefined();
  });

  it('EPIC の配信元が失敗したら 502', async () => {
    const { fn } = fetchFrom(() => new Response('ng', { status: 500 }));
    const res = await handleLatest(new Request('https://x.example/api/latest?satellite=epic'), {
      fetch: fn,
      now: () => NOW,
      cache,
    });
    expect(res.status).toBe(502);
  });
});
