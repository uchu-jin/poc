import { SATELLITE_IDS, SATELLITE_NAMES, type SatelliteId } from '../../../shared/contract';
import { formatCapturedAt } from './format';
import { staleMinutes } from './freshness';
import type { ViewerImage } from './latestClient';
import { MESSAGES } from './messages';
import type { ViewerState } from './state';

export const MOBILE_MEDIA = '(max-width: 720px)';
export const MOBILE_MAX_WIDTH = 700;
export const DESKTOP_SIZES = '720px';
export const MOBILE_SIZES = '100vw';

export interface ViewHandlers {
  onSelect(id: SatelliteId): void;
}

export interface View {
  render(state: ViewerState, now: Date, timeZone?: string): void;
}

export function buildSrcset(image: ViewerImage, maxWidth = Infinity): string {
  return image.images
    .filter((i) => i.width <= maxWidth)
    .map((i) => `${new URL(i.url).href} ${i.width}w`)
    .join(', ');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createView(root: HTMLElement, handlers: ViewHandlers): View {
  root.replaceChildren();

  const group = el('div', { role: 'group', 'aria-label': MESSAGES.satelliteGroup, class: 'sats' });
  const buttons = SATELLITE_IDS.map((id) => {
    const button = el('button', { type: 'button', 'data-satellite': id });
    button.textContent = SATELLITE_NAMES[id];
    button.addEventListener('click', () => handlers.onSelect(id));
    group.append(button);
    return button;
  });

  const frame = el('figure', { class: 'frame' });
  const picture = el('picture');
  const source = el('source', { media: MOBILE_MEDIA, sizes: MOBILE_SIZES });
  const img = el('img', { sizes: DESKTOP_SIZES, fetchpriority: 'high', decoding: 'async' });
  picture.append(source, img);
  const status = el('p', { role: 'status', class: 'status' });
  frame.append(picture, status);

  const meta = el('div', { class: 'meta' });
  const name = el('p', { 'data-role': 'name', class: 'name' });
  const time = el('time');
  const stale = el('p', { 'data-role': 'stale', class: 'stale' });
  const credit = el('p', { 'data-role': 'credit', class: 'credit' });
  meta.append(name, time, stale, credit);

  root.append(group, frame, meta);

  return {
    render(state, now, timeZone) {
      buttons.forEach((b, i) =>
        b.setAttribute('aria-pressed', String(SATELLITE_IDS[i] === state.satelliteId)),
      );

      const image = state.image;
      name.textContent = image ? image.satelliteName : SATELLITE_NAMES[state.satelliteId];
      status.textContent =
        state.status === 'loading'
          ? MESSAGES.loading
          : state.status === 'error'
            ? image
              ? MESSAGES.refreshFailed
              : MESSAGES.loadFailed
            : '';

      picture.hidden = !image;
      time.hidden = !image;
      credit.hidden = !image;
      if (!image) {
        source.removeAttribute('srcset');
        img.removeAttribute('srcset');
        img.removeAttribute('src');
        img.setAttribute('alt', '');
        time.removeAttribute('datetime');
        time.textContent = '';
        stale.textContent = '';
        stale.hidden = true;
        credit.replaceChildren();
        return;
      }

      const mobileSet = buildSrcset(image, MOBILE_MAX_WIDTH) || buildSrcset(image);
      const fullSet = buildSrcset(image);
      if (source.getAttribute('srcset') !== mobileSet) source.setAttribute('srcset', mobileSet);
      if (img.getAttribute('srcset') !== fullSet) img.setAttribute('srcset', fullSet);
      img.setAttribute('alt', `${image.satelliteName} が撮影した地球`);

      time.setAttribute('datetime', image.capturedAt);
      time.textContent = formatCapturedAt(image.capturedAt, timeZone);

      const minutes = staleMinutes(image.capturedAt, now);
      stale.textContent = minutes === null ? '' : MESSAGES.stale(minutes);
      stale.hidden = minutes === null;

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
