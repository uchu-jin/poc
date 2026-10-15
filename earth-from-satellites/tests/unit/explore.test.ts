import { describe, expect, it } from 'vitest';
import { SOURCE_TRAITS } from '../../src/features/viewer/sources';
import { staleNotice } from '../../src/features/viewer/freshness';
import {
  failed,
  initialState,
  loaded,
  refreshStarted,
  select,
  selectRegion,
  setViewport,
} from '../../src/features/viewer/state';
import { FULL_VIEW, regionView } from '../../src/features/viewer/viewport';
import { REGIONS } from '../../src/features/viewer/regions';
import { GEOSTATIONARY } from '../../shared/contract';
import { loadSatellite, saveSatellite } from '../../src/features/viewer/storage';
import { fetchLatest, type ViewerImage } from '../../src/features/viewer/latestClient';

const minutesBefore = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe('SOURCE_TRAITS', () => {
  it('静止衛星は地域を持ち保存でき、epic は地域を持たず保存しない', () => {
    expect(SOURCE_TRAITS.himawari9).toMatchObject({ hasRegions: true, persist: true, note: null });
    expect(SOURCE_TRAITS['goes-east'].hasRegions).toBe(true);
    expect(SOURCE_TRAITS.epic).toMatchObject({
      hasRegions: false,
      persist: false,
      note: '公開まで1〜2日かかります',
    });
  });
});

describe('staleNotice', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it.each([
    ['himawari9', 59, null],
    ['himawari9', 60, '60分前の画像です'],
    ['goes-west', 61, '61分前の画像です'],
    ['epic', 61, null],
    ['epic', 72 * 60 - 1, null],
    ['epic', 72 * 60, '3日前の画像です'],
    ['epic', 100 * 60, '4日前の画像です'],
  ] as const)('%s で %s 分前なら %s', (sat, minutes, expected) => {
    expect(staleNotice(minutesBefore(now, minutes), now, SOURCE_TRAITS[sat].stale)).toBe(expected);
  });

  it('読めない日時や未来の日時なら null', () => {
    expect(staleNotice('x', now, SOURCE_TRAITS.himawari9.stale)).toBeNull();
    expect(staleNotice(minutesBefore(now, -5), now, SOURCE_TRAITS.epic.stale)).toBeNull();
  });
});

const img = (capturedAt: string): ViewerImage => ({
  satelliteId: 'himawari9',
  satelliteName: 'ひまわり9号',
  capturedAt,
  images: [{ url: 'https://slider.cira.colostate.edu/a.png', width: 688 }],
  credit: { text: 'x', linkUrl: null },
});

describe('state：地域と表示範囲', () => {
  const japan = REGIONS.himawari9[0]!;

  it('selectRegion(地域) で、その地域の表示範囲になる', () => {
    const s = selectRegion(initialState('himawari9'), 'japan');
    expect(s.regionId).toBe('japan');
    expect(s.viewport).toEqual(regionView(japan, GEOSTATIONARY.himawari9));
  });

  it('selectRegion(null) で全体に戻る（選択中でも）', () => {
    const s = selectRegion(selectRegion(initialState('himawari9'), 'japan'), null);
    expect(s.regionId).toBeNull();
    expect(s.viewport).toEqual(FULL_VIEW);
    const zoomed = setViewport(s, { cx: 0.4, cy: 0.4, zoom: 1 });
    expect(selectRegion(zoomed, null).viewport).toEqual(FULL_VIEW);
  });

  it('その衛星にない地域や、地域を持たない衛星では何も変わらない', () => {
    const h = initialState('himawari9');
    expect(selectRegion(h, 'hawaii')).toBe(h);
    const e = initialState('epic');
    expect(selectRegion(e, 'japan')).toBe(e);
  });

  it('setViewport で表示範囲が替わり、地域の選択が外れる', () => {
    const s = setViewport(selectRegion(initialState('himawari9'), 'japan'), {
      cx: 0.3,
      cy: 0.3,
      zoom: 2,
    });
    expect(s.regionId).toBeNull();
    expect(s.viewport).toEqual({ cx: 0.3, cy: 0.3, zoom: 2 });
  });

  it('衛星を切り替えると、地域も表示範囲も全体に戻る', () => {
    const s = select(selectRegion(initialState('himawari9'), 'japan'), 'goes-east');
    expect(s.regionId).toBeNull();
    expect(s.viewport).toEqual(FULL_VIEW);
  });

  it('loaded・failed は、地域と表示範囲を変えない', () => {
    let s = selectRegion(initialState('himawari9'), 'japan');
    s = loaded(s, s.requestId, img('2026-10-15T11:00:00Z'));
    s = refreshStarted(s);
    s = failed(s, s.requestId);
    expect(s.regionId).toBe('japan');
    expect(s.viewport).toEqual(regionView(japan, GEOSTATIONARY.himawari9));
  });
});

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('storage と epic', () => {
  it('epic は保存しない（前の選択が残る）', () => {
    const s = memory();
    saveSatellite(() => s, 'goes-east');
    saveSatellite(() => s, 'epic');
    expect(loadSatellite(() => s)).toBe('goes-east');
  });

  it('保存された値が epic なら himawari9 で始める', () => {
    const s = memory();
    s.setItem('earth-from-satellites:satellite', 'epic');
    expect(loadSatellite(() => s)).toBe('himawari9');
  });
});

describe('fetchLatest：tiles と epic', () => {
  const baseUrl =
    'https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/20261014110000/';
  const himawari = {
    satelliteId: 'himawari9',
    satelliteName: 'ひまわり9号',
    capturedAt: '2026-10-14T11:00:00.000Z',
    images: [{ url: `${baseUrl}00/000_000.png`, width: 688 }],
    credit: { text: 'CSU/CIRA & JMA', url: 'https://satlib.cira.colostate.edu/credit-media' },
    tiles: { baseUrl, tileSize: 688, maxZoom: 4 },
  };
  const respond = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  const ok = async (id: 'himawari9' | 'epic', body: unknown) =>
    (await fetchLatest(id, { fetch: respond(body) })).ok;

  it('tiles 付きの応答を受け入れ、そのまま返す', async () => {
    const r = await fetchLatest('himawari9', { fetch: respond(himawari) });
    expect(r.ok && r.image.tiles).toEqual(himawari.tiles);
  });

  it('tiles がなくても ok', async () => {
    expect(await ok('himawari9', { ...himawari, tiles: undefined })).toBe(true);
  });

  it.each([
    ['http', { baseUrl: baseUrl.replace('https', 'http') }],
    ['許可外のホスト', { baseUrl: baseUrl.replace('slider.cira.colostate.edu', 'evil.example') }],
    ['# 付き', { baseUrl: `${baseUrl}#/` }],
    ['時刻が capturedAt と違う', { baseUrl: baseUrl.replace('110000', '105000') }],
    ['tileSize 599', { tileSize: 599 }],
    ['tileSize 701', { tileSize: 701 }],
    ['tileSize 688.5', { tileSize: 688.5 }],
    ['maxZoom 5', { maxZoom: 5 }],
    ['maxZoom −1', { maxZoom: -1 }],
  ])('tiles が %s なら ok: false', async (_label, over) => {
    expect(await ok('himawari9', { ...himawari, tiles: { ...himawari.tiles, ...over } })).toBe(
      false,
    );
  });

  it('tileSize 600・700、maxZoom 0 は ok', async () => {
    for (const over of [{ tileSize: 600 }, { tileSize: 700 }, { maxZoom: 0 }]) {
      expect(await ok('himawari9', { ...himawari, tiles: { ...himawari.tiles, ...over } })).toBe(
        true,
      );
    }
  });

  it('epic の応答を受け入れる。ひまわりの応答に EPIC の画像があれば ok: false', async () => {
    const epicImage = {
      url: 'https://epic.gsfc.nasa.gov/archive/natural/2026/10/13/jpg/epic_1b_20261013221304.jpg',
      width: 1080,
    };
    expect(
      await ok('epic', {
        satelliteId: 'epic',
        satelliteName: 'DSCOVR（EPIC）',
        capturedAt: '2026-10-13T22:08:15.000Z',
        images: [epicImage],
        credit: { text: 'NASA EPIC Team', url: 'https://epic.gsfc.nasa.gov/' },
      }),
    ).toBe(true);
    expect(await ok('himawari9', { ...himawari, images: [epicImage] })).toBe(false);
  });
});

describe('fetchLatest：capturedAt が読めず tiles があるとき', () => {
  it('例外にならず ok: false', async () => {
    const body = {
      satelliteId: 'himawari9',
      satelliteName: 'ひまわり9号',
      capturedAt: 'not-a-date',
      images: [{ url: 'https://slider.cira.colostate.edu/a.png', width: 688 }],
      credit: { text: 'x', url: 'https://satlib.cira.colostate.edu/' },
      tiles: {
        baseUrl:
          'https://slider.cira.colostate.edu/data/imagery/2026/10/14/himawari---full_disk/geocolor/20261014110000/',
        tileSize: 688,
        maxZoom: 4,
      },
    };
    const fetchFn = (async () => new Response(JSON.stringify(body))) as typeof fetch;
    await expect(fetchLatest('himawari9', { fetch: fetchFn })).resolves.toEqual({ ok: false });
  });
});
