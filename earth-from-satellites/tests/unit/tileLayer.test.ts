// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createTileLayer, TILE_SETTLE_MS } from '../../src/features/viewer/tileLayer';
import { tileUrl, type Tiles } from '../../shared/contract';
import { visibleTiles, type Viewport } from '../../src/features/viewer/viewport';
import { fakeClock } from './fakes';

const base = (ts: string, sat = 'himawari') =>
  `https://slider.cira.colostate.edu/data/imagery/2026/10/14/${sat}---full_disk/geocolor/${ts}/`;
const A = base('20261014110000');
const B = base('20261014111000');
const tiles = (baseUrl: string): Tiles => ({ baseUrl, tileSize: 688, maxZoom: 4 });
const UNDERLAY = 'https://slider.cira.colostate.edu/under.png';
const VP: Viewport = { cx: 0.4, cy: 0.3, zoom: 1.2 };

interface Deferred {
  resolve(): void;
  reject(): void;
}

function setup() {
  const c = fakeClock();
  const loads = new Map<string, Deferred>();
  const layer = createTileLayer({
    clock: c.clock,
    load: (url) =>
      new Promise<void>((resolve, reject) => {
        loads.set(url, { resolve, reject: () => reject(new Error('404')) });
      }),
  });
  document.body.replaceChildren(layer.element);
  const imgs = () => [...layer.element.querySelectorAll<HTMLImageElement>('img[data-tile]')];
  const srcOf = (key: string) =>
    layer.element.querySelector<HTMLImageElement>(`img[data-tile="${key}"]`)?.getAttribute('src');
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { c, loads, layer, imgs, srcOf, flush };
}

const draw = (
  t: ReturnType<typeof setup>,
  over: Partial<Parameters<ReturnType<typeof createTileLayer>['render']>[0]> = {},
) =>
  t.layer.render({
    satelliteId: 'himawari9',
    tiles: tiles(A),
    underlayUrl: UNDERLAY,
    viewport: VP,
    framePx: 600,
    dpr: 1,
    ...over,
  });

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe('tileLayer', () => {
  it('表示範囲のタイルを、正しい URL と位置で並べる', () => {
    draw(t);
    const spots = visibleTiles(600, VP, 688, 4, 1);
    expect(t.imgs()).toHaveLength(spots.length);
    for (const s of spots) {
      const img = t.layer.element.querySelector<HTMLImageElement>(
        `img[data-tile="${s.z}/${s.row}/${s.col}"]`,
      )!;
      expect(img.getAttribute('src')).toBe(tileUrl(A, s.z, s.row, s.col));
      expect(parseFloat(img.style.left)).toBeCloseTo(s.left, 3);
      expect(parseFloat(img.style.top)).toBeCloseTo(s.top, 3);
      expect(parseFloat(img.style.width)).toBeCloseTo(s.size, 3);
    }
  });

  it('下に全球画像を、表示範囲に合わせて敷く', () => {
    draw(t);
    const under = t.layer.element.querySelector<HTMLImageElement>('img[data-role="underlay"]')!;
    const image = 600 * 2 ** VP.zoom;
    expect(under.getAttribute('src')).toBe(UNDERLAY);
    expect(parseFloat(under.style.width)).toBeCloseTo(image, 3);
    expect(parseFloat(under.style.left)).toBeCloseTo(300 - VP.cx * image, 3);
  });

  it('baseUrl が替わると、読み込めたタイルだけ入れ替え、失敗したタイルは前の URL のまま', async () => {
    draw(t);
    const [first, second] = visibleTiles(600, VP, 688, 4, 1);
    draw(t, { tiles: tiles(B) });
    const k1 = `${first!.z}/${first!.row}/${first!.col}`;
    const k2 = `${second!.z}/${second!.row}/${second!.col}`;
    t.loads.get(tileUrl(B, first!.z, first!.row, first!.col))!.resolve();
    t.loads.get(tileUrl(B, second!.z, second!.row, second!.col))!.reject();
    await t.flush();
    expect(t.srcOf(k1)).toBe(tileUrl(B, first!.z, first!.row, first!.col));
    expect(t.srcOf(k2)).toBe(tileUrl(A, second!.z, second!.row, second!.col));
  });

  it('baseUrl が A→B→A の順に替わっても、最後の分だけが反映される', async () => {
    draw(t);
    const [s] = visibleTiles(600, VP, 688, 4, 1);
    const key = `${s!.z}/${s!.row}/${s!.col}`;
    draw(t, { tiles: tiles(B) });
    draw(t, { tiles: tiles(A) });
    t.loads.get(tileUrl(B, s!.z, s!.row, s!.col))!.resolve();
    await t.flush();
    expect(t.srcOf(key)).toBe(tileUrl(A, s!.z, s!.row, s!.col));
  });

  it('衛星が替わったら、前の衛星のタイルは残らない', () => {
    draw(t);
    const goes = base('20261014110020', 'goes-19');
    draw(t, { satelliteId: 'goes-east', tiles: { baseUrl: goes, tileSize: 678, maxZoom: 4 } });
    expect(t.imgs().every((i) => i.getAttribute('src')!.startsWith(goes))).toBe(true);
  });

  it('見えなくなったタイルの img は取り除かれる', () => {
    draw(t, { viewport: { cx: 0.3, cy: 0.3, zoom: 2 } });
    const before = new Set(t.imgs().map((i) => i.dataset.tile));
    draw(t, { viewport: { cx: 0.7, cy: 0.7, zoom: 2 } });
    const after = t.imgs().map((i) => i.dataset.tile);
    expect(after.some((k) => before.has(k))).toBe(false);
  });

  it('段が変わるときは、新しい段のタイルを置くのを少し待つ', () => {
    draw(t, { viewport: { cx: 0.5, cy: 0.5, zoom: 1 } });
    const z1 = t.imgs()[0]!.dataset.tile!.split('/')[0];
    draw(t, { viewport: { cx: 0.5, cy: 0.5, zoom: 3 } });
    expect(t.imgs().every((i) => i.dataset.tile!.split('/')[0] === z1)).toBe(true);
    t.c.advance(TILE_SETTLE_MS);
    expect(t.imgs().every((i) => i.dataset.tile!.split('/')[0] !== z1)).toBe(true);
  });

  it('初めて置くタイルの読み込みが失敗したら、その場所は隠して下の全球画像を見せる', () => {
    draw(t);
    const img = t.imgs()[0]!;
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
  });

  it('null を渡すと、すべて取り除く', () => {
    draw(t);
    t.layer.render(null);
    expect(t.imgs()).toHaveLength(0);
  });
});
