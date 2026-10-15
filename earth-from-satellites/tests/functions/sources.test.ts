import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCiraTimes } from '../../functions/_lib/sources/ciraTimes';
import { resolveCiraSlider } from '../../functions/_lib/sources/ciraSlider';
import { resolveNoaaStar } from '../../functions/_lib/sources/noaaStar';
import { fetchJson, headOk, withTimeout } from '../../functions/_lib/fetchSource';
import { SATELLITES } from '../../functions/_lib/satellites';
import { SourceError, type SourceDeps } from '../../functions/_lib/types';

interface Call {
  url: string;
  method: string;
  redirect?: RequestInit['redirect'];
}

function fakeFetch(handler: (url: string, method: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, redirect: init?.redirect });
    return handler(url, method);
  }) as typeof fetch;
  return { fn, calls };
}

const NOW = new Date('2026-10-14T14:40:00Z');

function deps(fn: typeof fetch): SourceDeps {
  return { fetch: fn, signal: new AbortController().signal, now: NOW };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

async function expectKind(p: Promise<unknown>, kind: SourceError['kind']) {
  await expect(p).rejects.toSatisfy((e) => e instanceof SourceError && e.kind === kind);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchJson', () => {
  it('2xx の JSON のとき中身を返す', async () => {
    const { fn } = fakeFetch(() => json({ a: 1 }));
    await expect(fetchJson('https://x.example/a.json', deps(fn))).resolves.toEqual({ a: 1 });
  });

  it('非2xx のとき upstream になる', async () => {
    const { fn } = fakeFetch(() => new Response('ng', { status: 500 }));
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'upstream');
  });

  it('通信エラーのとき upstream になる', async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError('network');
    });
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'upstream');
  });

  it('JSON でないとき invalid になる', async () => {
    const { fn } = fakeFetch(() => new Response('<html>', { status: 200 }));
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'invalid');
  });

  it('本文がちょうど 16KB のときは読める', async () => {
    const body = JSON.stringify('x'.repeat(16 * 1024 - 2));
    const { fn } = fakeFetch(() => new Response(body, { status: 200 }));
    await expect(fetchJson('https://x.example/a.json', deps(fn))).resolves.toHaveLength(
      16 * 1024 - 2,
    );
  });

  it('本文が 16KB を超えたとき invalid になる', async () => {
    const body = JSON.stringify('x'.repeat(16 * 1024 - 1));
    const { fn } = fakeFetch(() => new Response(body, { status: 200 }));
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'invalid');
  });
});

describe('headOk', () => {
  it('200 のとき true、404 のとき false、HEAD で問い合わせる', async () => {
    const { fn, calls } = fakeFetch(
      (url) => new Response(null, { status: url.endsWith('ok') ? 200 : 404 }),
    );
    await expect(headOk('https://x.example/ok', deps(fn))).resolves.toBe(true);
    await expect(headOk('https://x.example/missing', deps(fn))).resolves.toBe(false);
    expect(calls.every((c) => c.method === 'HEAD')).toBe(true);
  });

  it('404 以外のエラーのとき upstream になる', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 503 }));
    await expectKind(headOk('https://x.example/x', deps(fn)), 'upstream');
  });
});

describe('withTimeout', () => {
  it('5秒たっても応答がないとき timeout になる', async () => {
    vi.useFakeTimers();
    const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as typeof fetch;
    const p = withTimeout((signal) =>
      fetchJson('https://x.example/a.json', { fetch: hanging, signal, now: NOW }),
    );
    const assertion = expectKind(p, 'timeout');
    await vi.advanceTimersByTimeAsync(4999);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it('5秒以内に応答があれば結果を返す', async () => {
    const { fn } = fakeFetch(() => json({ ok: true }));
    await expect(
      withTimeout((signal) =>
        fetchJson('https://x.example/a.json', { fetch: fn, signal, now: NOW }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});

describe('fetchCiraTimes', () => {
  it('CIRA の latest_times.json を取り、新しい順の日時を返す', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({ timestamps_int: [20261014142020, 20261014143020] }),
    );
    const times = await fetchCiraTimes('goes-19', deps(fn));
    expect(times.map((t) => t.toISOString())).toEqual([
      '2026-10-14T14:30:20.000Z',
      '2026-10-14T14:20:20.000Z',
    ]);
    expect(calls[0]?.url).toBe(
      'https://slider.cira.colostate.edu/data/json/goes-19/full_disk/geocolor/latest_times.json',
    );
  });

  it.each([
    ['空配列', { timestamps_int: [] }],
    ['型違い', { timestamps_int: ['20261014143020'] }],
    ['キーなし', { times: [20261014143020] }],
    ['日時として不正なものだけ', { timestamps_int: [20261314143020] }],
  ])('%s のとき invalid になる', async (_label, body) => {
    const { fn } = fakeFetch(() => json(body));
    await expectKind(fetchCiraTimes('himawari', deps(fn)), 'invalid');
  });
});

describe('resolveCiraSlider', () => {
  it('最新の時刻から 688px の画像 URL と撮影日時を返す', async () => {
    const { fn } = fakeFetch(() => json({ timestamps_int: [20261014141000, 20261014140000] }));
    const result = await resolveCiraSlider('himawari9', SATELLITES.himawari9, deps(fn));
    expect(result).toEqual({
      satelliteId: 'himawari9',
      satelliteName: 'ひまわり9号',
      capturedAt: '2026-10-14T14:10:00.000Z',
      images: [
        {
          url: 'https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/20261014141000/00/000_000.png',
          width: 688,
        },
      ],
      credit: SATELLITES.himawari9.credit,
    });
  });
});

describe('resolveNoaaStar', () => {
  const times = {
    timestamps_int: [20261014143020, 20261014142020, 20261014141020, 20261014140020],
  };
  const star = (ts: string, w: number) =>
    `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/${ts}_GOES19-ABI-FD-GEOCOLOR-${w}x${w}.jpg`;

  it('最新の時刻の画像があれば、3サイズの URL を幅の昇順で返す', async () => {
    const { fn, calls } = fakeFetch((_url, method) =>
      method === 'GET' ? json(times) : new Response(null, { status: 200 }),
    );
    const result = await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(result.capturedAt).toBe('2026-10-14T14:30:20.000Z');
    expect(result.images).toEqual([
      { url: star('20262871430', 339), width: 339 },
      { url: star('20262871430', 678), width: 678 },
      { url: star('20262871430', 1808), width: 1808 },
    ]);
    expect(result.satelliteName).toBe('GOES-East');
    expect(calls.filter((c) => c.method === 'HEAD').map((c) => c.url)).toEqual([
      star('20262871430', 678),
      star('20262871430', 339),
      star('20262871430', 1808),
    ]);
  });

  it('最新の画像がまだ無いとき、2番目の時刻を返す', async () => {
    const { fn } = fakeFetch((url, method) => {
      if (method === 'GET') return json(times);
      return new Response(null, { status: url.includes('20262871430') ? 404 : 200 });
    });
    const result = await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(result.capturedAt).toBe('2026-10-14T14:20:20.000Z');
    expect(result.images[1]?.url).toBe(star('20262871420', 678));
  });

  it('3つの時刻とも画像が無いとき upstream になり、HEAD は3回で止まる', async () => {
    const { fn, calls } = fakeFetch((_url, method) =>
      method === 'GET' ? json(times) : new Response(null, { status: 404 }),
    );
    await expectKind(resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn)), 'upstream');
    expect(calls.filter((c) => c.method === 'HEAD')).toHaveLength(3);
    expect(calls).toHaveLength(4);
  });
});

describe('レビュー指摘への対応', () => {
  it('配信元への問い合わせはリダイレクトを追わない（GET・HEAD とも）', async () => {
    const times = { timestamps_int: [20261014143020] };
    const { fn, calls } = fakeFetch((_url, method) =>
      method === 'GET' ? json(times) : new Response(null, { status: 200 }),
    );
    await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.redirect === 'manual')).toBe(true);
  });

  it('GET が 3xx のとき upstream になる', async () => {
    const { fn } = fakeFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
    );
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'upstream');
  });

  it.each([
    ['302', 302],
    ['403', 403],
  ])('HEAD が %s のとき「無い」とみなし、次の時刻を試す', async (_label, status) => {
    const times = { timestamps_int: [20261014143020, 20261014142020] };
    const { fn } = fakeFetch((url, method) => {
      if (method === 'GET') return json(times);
      return new Response(null, { status: url.includes('20262871430') ? status : 200 });
    });
    const result = await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(result.capturedAt).toBe('2026-10-14T14:20:20.000Z');
  });

  it('HEAD が 405 のとき upstream になる', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 405 }));
    await expectKind(headOk('https://x.example/x', deps(fn)), 'upstream');
  });

  it('1808px がまだ無いとき、その URL を返さない', async () => {
    const times = { timestamps_int: [20261014143020] };
    const { fn } = fakeFetch((url, method) => {
      if (method === 'GET') return json(times);
      return new Response(null, { status: url.includes('1808x1808') ? 404 : 200 });
    });
    const result = await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(result.images.map((i) => i.width)).toEqual([339, 678]);
  });

  it('未来の時刻（now+10分より先）が混じるとき、それを除いた最新の時刻を返す', async () => {
    const { fn } = fakeFetch(() =>
      json({ timestamps_int: [20991231000000, 20261014145000, 20261014141000] }),
    );
    const times = await fetchCiraTimes('himawari', deps(fn));
    expect(times[0]?.toISOString()).toBe('2026-10-14T14:50:00.000Z');
    expect(times).toHaveLength(2);
  });

  it('now+10分を1秒でも超える時刻は除く', async () => {
    const { fn } = fakeFetch(() => json({ timestamps_int: [20261014145001, 20261014141000] }));
    const times = await fetchCiraTimes('himawari', deps(fn));
    expect(times[0]?.toISOString()).toBe('2026-10-14T14:10:00.000Z');
  });

  it('すべて未来の時刻のとき invalid になる', async () => {
    const { fn } = fakeFetch(() => json({ timestamps_int: [20991231000000] }));
    await expectKind(fetchCiraTimes('himawari', deps(fn)), 'invalid');
  });

  it('同じ時刻が重なっていても、HEAD の試行枠を無駄にしない', async () => {
    const times = {
      timestamps_int: [20261014143020, 20261014143020, 20261014142020, 20261014141020],
    };
    const { fn } = fakeFetch((url, method) => {
      if (method === 'GET') return json(times);
      const missing = url.includes('20262871430') || url.includes('20262871420');
      return new Response(null, { status: missing ? 404 : 200 });
    });
    const result = await resolveNoaaStar('goes-east', SATELLITES['goes-east'], deps(fn));
    expect(result.capturedAt).toBe('2026-10-14T14:10:20.000Z');
  });

  it('時刻が1000件を超えるとき invalid になる', async () => {
    const many = Array.from({ length: 1001 }, () => 20261014141000);
    const { fn } = fakeFetch(() => json({ timestamps_int: many }));
    await expectKind(fetchCiraTimes('himawari', deps(fn)), 'invalid');
  });

  it('fetchCiraTimes：JSON でないとき invalid になる', async () => {
    const { fn } = fakeFetch(() => new Response('<html>', { status: 200 }));
    await expectKind(fetchCiraTimes('himawari', deps(fn)), 'invalid');
  });

  it('本文が空のとき invalid になる', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 200 }));
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'invalid');
  });

  it('複数チャンクの合計が 16KB を超えたとき invalid になる', async () => {
    // 全体では正しい JSON（約18KB）なので、上限がなければ読めてしまう
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('"' + 'x'.repeat(6 * 1024)));
        c.enqueue(enc.encode('x'.repeat(6 * 1024)));
        c.enqueue(enc.encode('x'.repeat(6 * 1024) + '"'));
        c.close();
      },
    });
    const { fn } = fakeFetch(() => new Response(stream, { status: 200 }));
    await expectKind(fetchJson('https://x.example/a.json', deps(fn)), 'invalid');
  });

  it('本文の読み込み中に止まったまま5秒たったとき timeout になる', async () => {
    vi.useFakeTimers();
    const stalled = (async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => {});
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    const p = withTimeout((signal) =>
      fetchJson('https://x.example/a.json', { fetch: stalled, signal, now: NOW }),
    );
    const assertion = expectKind(p, 'timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('signal を無視する fetch でも、5秒で timeout になる', async () => {
    vi.useFakeTimers();
    const deaf = (async () => new Promise<Response>(() => {})) as typeof fetch;
    const p = withTimeout((signal) =>
      fetchJson('https://x.example/a.json', { fetch: deaf, signal, now: NOW }),
    );
    const assertion = expectKind(p, 'timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
