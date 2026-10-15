// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { startApp, PRELOAD_TIMEOUT_MS } from '../../src/features/viewer/app';
import type { ViewerImage } from '../../src/features/viewer/latestClient';
import { fakeClock, fakeVisibility } from './fakes';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

function body(sat: string, capturedAt = '2026-10-14T14:00:00.000Z') {
  const host = sat === 'himawari9' ? 'slider.cira.colostate.edu' : 'cdn.star.nesdis.noaa.gov';
  return {
    satelliteId: sat,
    satelliteName: sat === 'himawari9' ? 'ひまわり9号' : 'GOES-East',
    capturedAt,
    images: [{ url: `https://${host}/${sat}-${capturedAt}.png`, width: 678 }],
    credit: { text: 'credit', url: 'https://www.star.nesdis.noaa.gov/' },
  };
}

function setup() {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const c = fakeClock();
  c.setNow(Date.parse('2026-10-14T14:05:00Z'));
  const v = fakeVisibility(true);
  const apiQueue = new Map<string, Deferred<Response>[]>();
  const apiCalls: string[] = [];
  const preloads: { image: ViewerImage; d: Deferred<void> }[] = [];
  const tilePreloads: { urls: string[]; d: Deferred<void> }[] = [];
  const store = new Map<string, string>();
  const fetchFn = (async (input: RequestInfo | URL) => {
    const sat = new URL(String(input), 'http://x').searchParams.get('satellite')!;
    apiCalls.push(sat);
    const d = deferred<Response>();
    apiQueue.set(sat, [...(apiQueue.get(sat) ?? []), d]);
    return d.promise;
  }) as typeof fetch;
  const stop = startApp(root, {
    fetch: fetchFn,
    storage: () => ({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, val) => void store.set(k, val),
    }),
    clock: c.clock,
    visibility: v.visibility,
    preload: (image) => {
      const d = deferred<void>();
      preloads.push({ image, d });
      return d.promise;
    },
    preloadUrls: (urls) => {
      const d = deferred<void>();
      tilePreloads.push({ urls, d });
      return d.promise;
    },
    frame: () => ({ framePx: 600, dpr: 1 }),
    timeZone: 'UTC',
  });
  const respond = async (sat: string, payload: unknown, status = 200) => {
    const d = apiQueue.get(sat)?.shift();
    d?.resolve(new Response(JSON.stringify(payload), { status }));
    await flush();
  };
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const click = (name: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === name || b.getAttribute('aria-label') === name)!
      .click();
  return { root, c, v, apiCalls, preloads, tilePreloads, respond, q, click, stop };
}

const statusText = (t: ReturnType<typeof setup>) => t.q('[role="status"]')?.textContent ?? '';
const shownSrcset = (t: ReturnType<typeof setup>) => t.q('picture img')?.getAttribute('srcset');

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t?.stop();
});

describe('app', () => {
  it('API の応答待ちの間に切り替えると、後から返った前の衛星の結果を反映しない', async () => {
    t = setup();
    expect(t.apiCalls).toEqual(['himawari9']);
    t.click('GOES-East');
    await t.respond('goes-east', body('goes-east'));
    t.preloads.at(-1)!.d.resolve();
    await flush();
    expect(shownSrcset(t)).toContain('goes-east');
    await t.respond('himawari9', body('himawari9', '2026-10-14T14:04:00.000Z'));
    expect(t.preloads).toHaveLength(1);
    expect(shownSrcset(t)).toContain('goes-east');
    expect(t.q('[data-role="name"]')?.textContent).toBe('GOES-East');
  });

  it('画像の読み込み待ちの間に切り替えると、前の衛星の読み込みの成功も失敗も反映しない', async () => {
    t = setup();
    await t.respond('himawari9', body('himawari9'));
    const oldPreload = t.preloads[0]!;
    t.click('GOES-East');
    oldPreload.d.resolve();
    await flush();
    expect(t.q('picture')?.hidden).toBe(true);
    expect(statusText(t)).toBe('読み込み中…');
    oldPreload.d.reject(new Error('late'));
    await flush();
    expect(statusText(t)).toBe('読み込み中…');
  });

  it('前の要求の読み込みが失敗しても、切り替え先の表示を「取得できませんでした」にしない', async () => {
    t = setup();
    await t.respond('himawari9', body('himawari9'));
    const oldPreload = t.preloads[0]!;
    t.click('GOES-East');
    oldPreload.d.reject(new Error('404'));
    await flush();
    expect(statusText(t)).toBe('読み込み中…');
    await t.respond('goes-east', body('goes-east'));
    t.preloads.at(-1)!.d.resolve();
    await flush();
    expect(statusText(t)).toBe('');
    expect(shownSrcset(t)).toContain('goes-east');
  });

  it(`画像の読み込みが ${PRELOAD_TIMEOUT_MS / 1000} 秒に届く前に終われば表示する`, async () => {
    t = setup();
    await t.respond('himawari9', body('himawari9'));
    t.c.advance(PRELOAD_TIMEOUT_MS - 1);
    t.preloads[0]!.d.resolve();
    await flush();
    expect(statusText(t)).toBe('');
    expect(t.q('picture')?.hidden).toBe(false);
  });

  it(`画像の読み込みが ${PRELOAD_TIMEOUT_MS / 1000} 秒たっても終わらなければ「取得できませんでした」にする`, async () => {
    t = setup();
    await t.respond('himawari9', body('himawari9'));
    t.c.advance(PRELOAD_TIMEOUT_MS);
    await flush();
    expect(statusText(t)).toContain('取得できませんでした');
  });

  it('切り替えると、次の自動更新は切り替えから10分後になる', async () => {
    t = setup();
    await t.respond('himawari9', body('himawari9'));
    t.preloads[0]!.d.resolve();
    await flush();
    t.c.advance(9 * 60_000);
    t.click('GOES-East');
    expect(t.apiCalls).toEqual(['himawari9', 'goes-east']);
    t.c.advance(60_000);
    expect(t.apiCalls).toHaveLength(2);
    t.c.advance(9 * 60_000);
    expect(t.apiCalls).toEqual(['himawari9', 'goes-east', 'goes-east']);
  });
});

const TILE_BASE = (ts: string) =>
  `https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/${ts}/`;

function himawari(capturedAt: string, withTiles = true) {
  const ts = capturedAt.replace(/\D/g, '').slice(0, 14);
  return {
    satelliteId: 'himawari9',
    satelliteName: 'ひまわり9号',
    capturedAt,
    images: [{ url: `${TILE_BASE(ts)}00/000_000.png`, width: 688 }],
    credit: { text: 'CSU/CIRA & JMA', url: 'https://satlib.cira.colostate.edu/credit-media' },
    ...(withTiles ? { tiles: { baseUrl: TILE_BASE(ts), tileSize: 688, maxZoom: 4 } } : {}),
  };
}

const T1 = '2026-10-14T14:00:00.000Z';
const T2 = '2026-10-14T14:10:00.000Z';

async function shownHimawari(t: ReturnType<typeof setup>) {
  await t.respond('himawari9', himawari(T1));
  t.preloads.at(-1)!.d.resolve();
  await flush();
}

const pressed = (t: ReturnType<typeof setup>, sel: string) =>
  [...t.root.querySelectorAll<HTMLButtonElement>(sel)]
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);
const tileSrcs = (t: ReturnType<typeof setup>) =>
  [...t.root.querySelectorAll<HTMLImageElement>('img[data-tile]')].map((i) =>
    i.getAttribute('src'),
  );

describe('app：地域と拡大', () => {
  it('地域を選んでも /api/latest を呼ばず、撮影日時の表示も変わらない。タイルを表示する', async () => {
    t = setup();
    await shownHimawari(t);
    const time = t.q('time')?.textContent;
    t.click('日本');
    await flush();
    expect(t.apiCalls).toEqual(['himawari9']);
    expect(t.q('time')?.textContent).toBe(time);
    expect(pressed(t, 'button[data-region]')).toEqual(['日本']);
    expect(t.q('picture')?.hidden).toBe(true);
    expect(tileSrcs(t).length).toBeGreaterThan(0);
    expect(tileSrcs(t).every((u) => u!.startsWith(TILE_BASE('20261014140000')))).toBe(true);
  });

  it('「全球」で全体の表示に戻る', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('日本');
    t.click('全球');
    expect(t.q('picture')?.hidden).toBe(false);
    expect(pressed(t, 'button[data-region]')).toEqual(['全球']);
  });

  it('衛星を切り替えると、全球に戻る', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('日本');
    t.click('GOES-East');
    expect(pressed(t, 'button[data-region]')).toEqual(['全球']);
  });

  it('拡大ボタンで拡大すると、地域の選択が外れてタイルを表示する', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('拡大');
    expect(pressed(t, 'button[data-region]')).toEqual([]);
    expect(t.q('picture')?.hidden).toBe(true);
  });

  it('タイル表示中の定期更新では、見えているタイルを先読みしてから入れ替え、地域を保つ', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('日本');
    t.c.advance(10 * 60_000);
    await t.respond('himawari9', himawari(T2));
    expect(t.preloads).toHaveLength(1);
    const pre = t.tilePreloads.at(-1)!;
    expect(pre.urls.length).toBeGreaterThan(0);
    expect(pre.urls.every((u) => u.startsWith(TILE_BASE('20261014141000')))).toBe(true);
    expect(t.q('time')?.getAttribute('datetime')).toBe(T1);
    pre.d.resolve();
    await flush();
    expect(t.q('time')?.getAttribute('datetime')).toBe(T2);
    expect(pressed(t, 'button[data-region]')).toEqual(['日本']);
  });

  it('タイルの先読みに失敗したら、画像と地域を保ったまま「更新できませんでした」', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('日本');
    t.c.advance(10 * 60_000);
    await t.respond('himawari9', himawari(T2));
    t.tilePreloads.at(-1)!.d.reject(new Error('404'));
    await flush();
    expect(statusText(t)).toContain('更新できませんでした');
    expect(t.q('time')?.getAttribute('datetime')).toBe(T1);
    expect(pressed(t, 'button[data-region]')).toEqual(['日本']);
  });

  it('定期更新で tiles がなくなったら、落ちずに全球の画像に戻る', async () => {
    t = setup();
    await shownHimawari(t);
    t.click('日本');
    t.c.advance(10 * 60_000);
    await t.respond('himawari9', himawari(T2, false));
    t.preloads.at(-1)?.d.resolve();
    t.tilePreloads.at(-1)?.d.resolve();
    await flush();
    expect(t.q('picture')?.hidden).toBe(false);
    expect(tileSrcs(t)).toHaveLength(0);
  });
});

describe('app：宇宙から', () => {
  const epic = (capturedAt: string) => ({
    satelliteId: 'epic',
    satelliteName: 'DSCOVR（EPIC）',
    capturedAt,
    images: [
      {
        url: `https://epic.gsfc.nasa.gov/archive/natural/2026/10/13/jpg/epic_1b_${capturedAt.replace(/\D/g, '').slice(0, 14)}.jpg`,
        width: 1080,
      },
    ],
    credit: { text: 'NASA EPIC Team', url: 'https://epic.gsfc.nasa.gov/' },
  });

  it('更新に失敗したら画像を残して「更新できませんでした」、次に成功したら消える', async () => {
    t = setup();
    t.click('宇宙から');
    await t.respond('epic', epic('2026-10-13T22:00:00.000Z'));
    t.preloads.at(-1)!.d.resolve();
    await flush();
    expect(t.q('[data-role="note"]')?.textContent).toBe('公開まで1〜2日かかります');
    t.c.advance(10 * 60_000);
    await t.respond('epic', { code: 'upstream_error' }, 502);
    expect(statusText(t)).toContain('更新できませんでした');
    expect(t.q('picture')?.hidden).toBe(false);
    t.c.advance(10 * 60_000);
    await t.respond('epic', epic('2026-10-13T22:00:00.000Z'));
    expect(statusText(t)).toBe('');
  });
});
