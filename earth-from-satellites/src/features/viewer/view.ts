import { SATELLITE_IDS, SATELLITE_LABELS, type SatelliteId } from '../../../shared/contract';
import {
  buildSrcset,
  canExplore,
  DESKTOP_SIZES,
  MOBILE_MAX_WIDTH,
  MOBILE_MEDIA,
  MOBILE_SIZES,
  showsTiles,
  underlayUrl,
  type Layout,
} from './display';
import { el, setText } from './dom';
import { attachGestures } from './gestures';
import { MESSAGES } from './messages';
import { createMetaPanel } from './metaPanel';
import { createRegionBar } from './regionBar';
import type { Clock } from './scheduler';
import { SOURCE_TRAITS } from './sources';
import type { ViewerState } from './state';
import { createTileLayer } from './tileLayer';
import type { Viewport } from './viewport';

export {
  buildSrcset,
  canExplore,
  DESKTOP_SIZES,
  MOBILE_MAX_WIDTH,
  MOBILE_MEDIA,
  MOBILE_SIZES,
  showsTiles,
  underlayUrl,
  type Layout,
} from './display';

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

function statusText(state: ViewerState): string {
  if (state.status === 'loading') return MESSAGES.loading;
  if (state.status === 'error') return state.image ? MESSAGES.refreshFailed : MESSAGES.loadFailed;
  return '';
}

export function createView(root: HTMLElement, handlers: ViewHandlers, deps: ViewDeps = {}): View {
  root.replaceChildren();
  let current: ViewerState | null = null;
  let lastSatellite: SatelliteId | null = null;

  const group = el('div', { role: 'group', 'aria-label': MESSAGES.satelliteGroup, class: 'sats' });
  const buttons = SATELLITE_IDS.map((id) => {
    const button = el('button', { type: 'button', 'data-satellite': id });
    button.textContent = SATELLITE_LABELS[id];
    button.addEventListener('click', () => handlers.onSelect(id));
    group.append(button);
    return button;
  });

  const regionBar = createRegionBar((regionId) => handlers.onRegion?.(regionId));

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
    isEnabled: () => Boolean(current && canExplore(current)),
  });

  const meta = createMetaPanel();

  root.append(group, regionBar.element, frame, meta.element);

  function renderPicture(state: ViewerState, layout: Layout) {
    const image = state.image;
    const tiles = showsTiles(state);
    picture.hidden = !image || tiles;
    tileLayer.element.hidden = !tiles;
    if (!image) {
      tileLayer.render(null);
      source.removeAttribute('srcset');
      img.removeAttribute('srcset');
      img.removeAttribute('src');
      img.setAttribute('alt', '');
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
  }

  return {
    render(state, now, timeZone, layout = DEFAULT_LAYOUT) {
      current = state;
      // 宇宙の背景ごと見せる画像（EPIC）は、丸く切り抜かない
      frame.dataset.shape = SOURCE_TRAITS[state.satelliteId].hasRegions ? 'disk' : 'square';
      buttons.forEach((b, i) =>
        b.setAttribute('aria-pressed', String(SATELLITE_IDS[i] === state.satelliteId)),
      );
      if (lastSatellite !== state.satelliteId) {
        // 前の衛星で始めたドラッグを、切り替え先に持ち込まない
        gestures.cancel();
        lastSatellite = state.satelliteId;
      }
      regionBar.render(state);
      zoom.hidden = !canExplore(state);
      gestures.sync();
      setText(status, statusText(state));
      renderPicture(state, layout);
      meta.render(state, now, timeZone);
    },
  };
}
