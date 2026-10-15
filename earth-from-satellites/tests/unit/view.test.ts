// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createView } from '../../src/features/viewer/view';
import type { ViewerImage } from '../../src/features/viewer/latestClient';
import type { ViewerState } from '../../src/features/viewer/state';
import { FULL_VIEW } from '../../src/features/viewer/viewport';

const NOW = new Date('2026-10-14T15:00:00Z');

function image(over: Partial<ViewerImage> = {}): ViewerImage {
  return {
    satelliteId: 'goes-east',
    satelliteName: 'GOES-East',
    capturedAt: '2026-10-14T14:30:00.000Z',
    images: [
      { url: 'https://cdn.star.nesdis.noaa.gov/a-339x339.jpg', width: 339 },
      { url: 'https://cdn.star.nesdis.noaa.gov/a-678x678.jpg', width: 678 },
      { url: 'https://cdn.star.nesdis.noaa.gov/a-1808x1808.jpg', width: 1808 },
    ],
    credit: {
      text: 'NOAA/NESDIS/STAR, CSU/CIRA',
      linkUrl: 'https://www.star.nesdis.noaa.gov/GOES/',
    },
    ...over,
  };
}

function state(over: Partial<ViewerState> = {}): ViewerState {
  return {
    satelliteId: 'goes-east',
    image: image(),
    status: 'ok',
    requestId: 1,
    regionId: null,
    viewport: FULL_VIEW,
    ...over,
  };
}

let root: HTMLElement;
let selected: string[];

function render(s: ViewerState, now = NOW) {
  const view = createView(root, { onSelect: (id) => selected.push(id) });
  view.render(s, now, 'Asia/Tokyo');
  return view;
}

const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
const statusText = () => q('[role="status"]')?.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
  selected = [];
});

describe('view', () => {
  it('ok のとき、衛星名・撮影日時・クレジット・srcset が入る', () => {
    render(state());
    expect(q('[data-role="name"]')?.textContent).toBe('GOES-East');
    const time = q<HTMLTimeElement>('time');
    expect(time?.getAttribute('datetime')).toBe('2026-10-14T14:30:00.000Z');
    expect(time?.textContent).toBe('2026/10/14 23:30 JST');
    const link = q<HTMLAnchorElement>('[data-role="credit"] a');
    expect(link?.textContent).toBe('NOAA/NESDIS/STAR, CSU/CIRA');
    expect(link?.getAttribute('href')).toBe('https://www.star.nesdis.noaa.gov/GOES/');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    const img = q<HTMLImageElement>('picture img');
    expect(img?.getAttribute('srcset')).toBe(
      'https://cdn.star.nesdis.noaa.gov/a-339x339.jpg 339w, https://cdn.star.nesdis.noaa.gov/a-678x678.jpg 678w, https://cdn.star.nesdis.noaa.gov/a-1808x1808.jpg 1808w',
    );
    expect(img?.getAttribute('alt')).toBe('GOES-East が撮影した地球');
    expect(q('picture')?.hidden).toBe(false);
  });

  it('スマホ用の source には幅 700 以下の候補だけが入る', () => {
    render(state());
    const source = q<HTMLSourceElement>('picture source');
    expect(source?.getAttribute('media')).toBe('(max-width: 720px)');
    expect(source?.getAttribute('srcset')).toBe(
      'https://cdn.star.nesdis.noaa.gov/a-339x339.jpg 339w, https://cdn.star.nesdis.noaa.gov/a-678x678.jpg 678w',
    );
  });

  it('ボタンは4つで、選択中だけ aria-pressed が true、押すと onSelect が呼ばれる', () => {
    render(state());
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[data-satellite]')];
    expect(buttons.map((b) => b.textContent)).toEqual([
      'ひまわり9号',
      'GOES-East',
      'GOES-West',
      '宇宙から',
    ]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    buttons[2]?.click();
    expect(selected).toEqual(['goes-west']);
  });

  it('loading で画像がないとき、「読み込み中…」を出し画像を隠す', () => {
    render(state({ status: 'loading', image: null }));
    expect(statusText()).toBe('読み込み中…');
    expect(q('picture')?.hidden).toBe(true);
    expect(q<HTMLImageElement>('picture img')?.getAttribute('srcset')).toBeNull();
  });

  it('error で画像があるとき「更新できませんでした…」を出し、画像は残す', () => {
    render(state({ status: 'error' }));
    expect(statusText()).toBe('更新できませんでした（10分後に自動で再試行します）');
    expect(q('picture')?.hidden).toBe(false);
  });

  it('error で画像がないとき「取得できませんでした…」と選んだ衛星名を出す', () => {
    render(state({ status: 'error', image: null, satelliteId: 'goes-west' }));
    expect(statusText()).toBe('取得できませんでした（10分後に自動で再試行します）');
    expect(q('[data-role="name"]')?.textContent).toBe('GOES-West');
    expect(q('picture')?.hidden).toBe(true);
  });

  it('ok のとき、状態のメッセージは空', () => {
    render(state());
    expect(statusText()).toBe('');
  });

  it('撮影日時が60分前なら「60分前の画像です」を出し、59分前なら出さない', () => {
    const view = render(state(), new Date('2026-10-14T15:30:00Z'));
    expect(q('[data-role="stale"]')?.textContent).toBe('60分前の画像です');
    view.render(state(), new Date('2026-10-14T15:29:59Z'), 'Asia/Tokyo');
    expect(q('[data-role="stale"]')?.textContent).toBe('');
    expect(q('[data-role="stale"]')?.hidden).toBe(true);
  });

  it('衛星名とクレジットに <b> を含む値を渡しても要素にならない', () => {
    render(
      state({
        image: image({
          satelliteName: '<b>x</b>',
          credit: { text: '<b>y</b>', linkUrl: 'https://www.star.nesdis.noaa.gov/' },
        }),
      }),
    );
    expect(root.querySelector('b')).toBeNull();
    expect(q('[data-role="name"]')?.textContent).toBe('<b>x</b>');
  });

  it('linkUrl が null のとき、クレジットは文字だけでリンクにならない', () => {
    render(state({ image: image({ credit: { text: 'CSU/CIRA & JMA', linkUrl: null } }) }));
    expect(q('[data-role="credit"] a')).toBeNull();
    expect(q('[data-role="credit"]')?.textContent).toContain('CSU/CIRA & JMA');
  });
});

describe('view：再描画（レビュー指摘への対応）', () => {
  it('同じ状態で2回描画しても、リンクと状態のメッセージを作り直さない', () => {
    const view = render(state({ status: 'error' }));
    const link = q('[data-role="credit"] a');
    const textNode = q('[role="status"]')?.firstChild;
    view.render(state({ status: 'error' }), new Date(NOW.getTime() + 60_000), 'Asia/Tokyo');
    expect(q('[data-role="credit"] a')).toBe(link);
    expect(q('[role="status"]')?.firstChild).toBe(textNode);
  });
});

describe('view：地域・拡大・宇宙から', () => {
  const regionLabels = () =>
    [...root.querySelectorAll<HTMLButtonElement>('button[data-region]')]
      .filter((b) => !b.closest('[hidden]'))
      .map((b) => b.textContent);
  const zoomButtonsShown = () =>
    [...root.querySelectorAll<HTMLButtonElement>('button[data-zoom]')].filter(
      (b) => !b.closest('[hidden]'),
    ).length;
  const calls: string[] = [];

  function renderWith(s: ViewerState) {
    const view = createView(root, {
      onSelect: (id) => calls.push(`select:${id}`),
      onRegion: (id) => calls.push(`region:${id}`),
      onZoom: (d) => calls.push(`zoom:${d}`),
      onViewportChange: () => calls.push('viewport'),
    });
    view.render(s, NOW, 'Asia/Tokyo', { framePx: 600, dpr: 1 });
    return view;
  }

  beforeEach(() => {
    calls.length = 0;
  });

  it.each([
    ['himawari9', ['全球', '日本', 'オーストラリア']],
    ['goes-east', ['全球', '北米', '南米']],
    ['goes-west', ['全球', '北米西部', 'ハワイ']],
    ['epic', []],
  ] as const)('%s の地域の選択は %j', (sat, labels) => {
    renderWith(state({ satelliteId: sat, image: null, status: 'loading' }));
    expect(regionLabels()).toEqual([...labels]);
  });

  it('epic では拡大・縮小のボタンを出さず、静止衛星では出す', () => {
    renderWith(state({ satelliteId: 'epic', image: null, status: 'loading' }));
    expect(zoomButtonsShown()).toBe(0);
    renderWith(state({ satelliteId: 'himawari9', image: null, status: 'loading' }));
    expect(zoomButtonsShown()).toBe(2);
  });

  it('地域・全球・拡大のボタンを押すと、それぞれの handler が呼ばれる', () => {
    renderWith(state({ satelliteId: 'himawari9' }));
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === label || b.getAttribute('aria-label') === label,
      )!;
    button('日本').click();
    button('全球').click();
    button('拡大').click();
    button('縮小').click();
    expect(calls).toEqual(['region:japan', 'region:null', 'zoom:1', 'zoom:-1']);
  });

  it('EPIC の注記・alt・古さの注意（日単位）を出す', () => {
    renderWith(
      state({
        satelliteId: 'epic',
        image: image({
          satelliteId: 'epic',
          satelliteName: 'DSCOVR（EPIC）',
          capturedAt: new Date(NOW.getTime() - 72 * 3600_000).toISOString(),
        }),
      }),
    );
    expect(q('[data-role="note"]')?.textContent).toBe('公開まで1〜2日かかります');
    expect(q('[data-role="stale"]')?.textContent).toBe('3日前の画像です');
    expect(q<HTMLImageElement>('picture img')?.getAttribute('alt')).toBe(
      'DSCOVR（EPIC） が撮影した地球',
    );
  });

  it('静止衛星では注記を出さない', () => {
    renderWith(state());
    expect(q('[data-role="note"]')?.hidden).toBe(true);
  });

  it('全体の表示なら picture を、地域ならタイルの層を表示する', () => {
    const tiles = {
      baseUrl:
        'https://slider.cira.colostate.edu/data/imagery/2026/10/14/goes-19---full_disk/geocolor/20261014143000/',
      tileSize: 678,
      maxZoom: 4,
    };
    const view = renderWith(state({ image: image({ tiles }) }));
    expect(q('picture')?.hidden).toBe(false);
    expect(q('[data-role="tiles"]')?.hidden).toBe(true);
    view.render(
      state({
        image: image({ tiles }),
        regionId: 'north-america',
        viewport: { cx: 0.4, cy: 0.3, zoom: 1.6 },
      }),
      NOW,
      'Asia/Tokyo',
      { framePx: 600, dpr: 1 },
    );
    expect(q('picture')?.hidden).toBe(true);
    expect(q('[data-role="tiles"]')?.hidden).toBe(false);
    expect(root.querySelectorAll('img[data-tile]').length).toBeGreaterThan(0);
  });

  it('拡大していても tiles がない応答なら、picture を表示する', () => {
    renderWith(state({ viewport: { cx: 0.4, cy: 0.4, zoom: 1 } }));
    expect(q('picture')?.hidden).toBe(false);
  });
});
