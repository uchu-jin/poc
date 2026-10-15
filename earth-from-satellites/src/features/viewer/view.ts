import {
  SATELLITE_IDS,
  SATELLITE_LABELS,
  SATELLITE_NAMES,
  type SatelliteId,
} from '../../../shared/contract';
import { formatCapturedAt } from './format';
import { staleNotice } from './freshness';
import { attachGestures } from './gestures';
import type { ViewerImage } from './latestClient';
import { MESSAGES } from './messages';
import { REGIONS, type Region } from './regions';
import type { Clock } from './scheduler';
import { SOURCE_TRAITS } from './sources';
import type { ViewerState } from './state';
import { createTileLayer } from './tileLayer';
import { isFull, type Viewport } from './viewport';

export const MOBILE_MEDIA = '(max-width: 720px)';
export const MOBILE_MAX_WIDTH = 700;
export const DESKTOP_SIZES = '720px';
export const MOBILE_SIZES = '100vw';

export interface Layout {
  framePx: number;
  dpr: number;
}
const DEFAULT_LAYOUT: Layout = { framePx: 600, dpr: 1 };

export interface ViewHandlers {
  onSelect(id: SatelliteId): void;
  onRegion?(regionId: string | null): void;
  onZoom?(delta: number): void;
  onViewportChange?(viewport: Viewport): void;
}

export interface ViewDeps {
  clock?: Clock;
  /** タイルの読み込み（差し替え用）。既定は <img> で読み込む */
  loadImage?: (url: string) => Promise<void>;
}

export interface View {
  render(state: ViewerState, now: Date, timeZone?: string, layout?: Layout): void;
}

export function buildSrcset(image: ViewerImage, maxWidth = Infinity): string {
  return image.images
    .filter((i) => i.width <= maxWidth)
    .map((i) => `${new URL(i.url).href} ${i.width}w`)
    .join(', ');
}

/** タイル表示のとき、すぐ見えるように下に敷く全球画像 */
export function underlayUrl(image: ViewerImage): string {
  const smallest = [...image.images].sort((a, b) => a.width - b.width)[0];
  return smallest ? new URL(smallest.url).href : '';
}

/** タイルを表示するか（全体表示でなく、タイルの情報があるとき） */
export function showsTiles(state: ViewerState): boolean {
  return Boolean(state.image?.tiles) && !isFull(state.viewport);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// 同じ値なら入れ直さない（フォーカスを保ち、読み上げソフトに同じ文を繰り返させない）
function setText(node: Node, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function loadWithImg(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode();
}

export function createView(root: HTMLElement, handlers: ViewHandlers, deps: ViewDeps = {}): View {
  root.replaceChildren();
  let creditKey = '';
  let regionsFor: SatelliteId | null = null;
  let current: ViewerState | null = null;

  const group = el('div', { role: 'group', 'aria-label': MESSAGES.satelliteGroup, class: 'sats' });
  const buttons = SATELLITE_IDS.map((id) => {
    const button = el('button', { type: 'button', 'data-satellite': id });
    button.textContent = SATELLITE_LABELS[id];
    button.addEventListener('click', () => handlers.onSelect(id));
    group.append(button);
    return button;
  });

  const regions = el('div', {
    role: 'group',
    'aria-label': MESSAGES.regionGroup,
    class: 'regions',
  });

  const frame = el('figure', { class: 'frame' });
  const picture = el('picture');
  const source = el('source', { media: MOBILE_MEDIA, sizes: MOBILE_SIZES });
  const img = el('img', { sizes: DESKTOP_SIZES, fetchpriority: 'high', decoding: 'async' });
  picture.append(source, img);
  const tileLayer = createTileLayer({
    clock: deps.clock ?? realClock,
    load: deps.loadImage ?? loadWithImg,
  });
  const zoom = el('div', { class: 'zoom' });
  const zoomIn = el('button', { type: 'button', 'data-zoom': 'in', 'aria-label': MESSAGES.zoomIn });
  zoomIn.textContent = '＋';
  zoomIn.addEventListener('click', () => handlers.onZoom?.(1));
  const zoomOut = el('button', {
    type: 'button',
    'data-zoom': 'out',
    'aria-label': MESSAGES.zoomOut,
  });
  zoomOut.textContent = '−';
  zoomOut.addEventListener('click', () => handlers.onZoom?.(-1));
  zoom.append(zoomIn, zoomOut);
  const status = el('p', { role: 'status', class: 'status' });
  frame.append(picture, tileLayer.element, zoom, status);

  const gestures = attachGestures(frame, {
    getViewport: () => current?.viewport ?? { cx: 0.5, cy: 0.5, zoom: 0 },
    getRect: () => {
      const r = frame.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width || 1 };
    },
    onChange: (vp) => handlers.onViewportChange?.(vp),
    isEnabled: () => Boolean(current && SOURCE_TRAITS[current.satelliteId].hasRegions),
  });

  const meta = el('div', { class: 'meta' });
  const name = el('p', { 'data-role': 'name', class: 'name' });
  const time = el('time');
  const stale = el('p', { 'data-role': 'stale', class: 'stale' });
  const note = el('p', { 'data-role': 'note', class: 'note' });
  const credit = el('p', { 'data-role': 'credit', class: 'credit' });
  meta.append(name, time, stale, note, credit);

  root.append(group, regions, frame, meta);

  function buildRegions(id: SatelliteId) {
    regionsFor = id;
    const list: readonly Region[] = id === 'epic' ? [] : REGIONS[id];
    const full = el('button', { type: 'button', 'data-region': '' });
    full.textContent = MESSAGES.fullDisk;
    full.addEventListener('click', () => handlers.onRegion?.(null));
    const chips = list.map((r) => {
      const b = el('button', { type: 'button', 'data-region': r.id });
      b.textContent = r.label;
      b.addEventListener('click', () => handlers.onRegion?.(r.id));
      return b;
    });
    regions.replaceChildren(full, ...chips);
  }

  return {
    render(state, now, timeZone, layout = DEFAULT_LAYOUT) {
      current = state;
      const traits = SOURCE_TRAITS[state.satelliteId];
      // 宇宙の背景ごと見せる画像（EPIC）は、丸く切り抜かない
      frame.dataset.shape = traits.hasRegions ? 'disk' : 'square';
      buttons.forEach((b, i) =>
        b.setAttribute('aria-pressed', String(SATELLITE_IDS[i] === state.satelliteId)),
      );

      if (regionsFor !== state.satelliteId) buildRegions(state.satelliteId);
      regions.hidden = !traits.hasRegions;
      zoom.hidden = !traits.hasRegions;
      for (const b of regions.querySelectorAll<HTMLButtonElement>('button[data-region]')) {
        const id = b.dataset.region || null;
        const on =
          id === null ? state.regionId === null && isFull(state.viewport) : id === state.regionId;
        b.setAttribute('aria-pressed', String(on));
      }
      gestures.sync();

      const image = state.image;
      setText(name, image ? image.satelliteName : SATELLITE_NAMES[state.satelliteId]);
      setText(
        status,
        state.status === 'loading'
          ? MESSAGES.loading
          : state.status === 'error'
            ? image
              ? MESSAGES.refreshFailed
              : MESSAGES.loadFailed
            : '',
      );
      setText(note, traits.note ?? '');
      note.hidden = !traits.note;

      const tiles = showsTiles(state);
      picture.hidden = !image || tiles;
      tileLayer.element.hidden = !tiles;
      time.hidden = !image;
      credit.hidden = !image;
      if (!image) {
        tileLayer.render(null);
        source.removeAttribute('srcset');
        img.removeAttribute('srcset');
        img.removeAttribute('src');
        img.setAttribute('alt', '');
        time.removeAttribute('datetime');
        time.textContent = '';
        stale.textContent = '';
        stale.hidden = true;
        credit.replaceChildren();
        creditKey = '';
        return;
      }

      tileLayer.render(
        tiles && image.tiles
          ? {
              satelliteId: state.satelliteId,
              tiles: image.tiles,
              underlayUrl: underlayUrl(image),
              viewport: state.viewport,
              framePx: layout.framePx,
              dpr: layout.dpr,
            }
          : null,
      );

      const mobileSet = buildSrcset(image, MOBILE_MAX_WIDTH) || buildSrcset(image);
      const fullSet = buildSrcset(image);
      if (source.getAttribute('srcset') !== mobileSet) source.setAttribute('srcset', mobileSet);
      if (img.getAttribute('srcset') !== fullSet) img.setAttribute('srcset', fullSet);
      img.setAttribute('alt', `${image.satelliteName} が撮影した地球`);

      time.setAttribute('datetime', image.capturedAt);
      setText(time, formatCapturedAt(image.capturedAt, timeZone));

      const warning = staleNotice(image.capturedAt, now, traits.stale);
      setText(stale, warning ?? '');
      stale.hidden = warning === null;

      const nextCreditKey = `${image.credit.text}\n${image.credit.linkUrl ?? ''}`;
      if (nextCreditKey === creditKey) return;
      creditKey = nextCreditKey;
      const label = document.createTextNode(MESSAGES.creditPrefix);
      if (image.credit.linkUrl) {
        const link = el('a', {
          href: image.credit.linkUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        });
        link.textContent = image.credit.text;
        credit.replaceChildren(label, link);
      } else {
        credit.replaceChildren(label, document.createTextNode(image.credit.text));
      }
    },
  };
}
