import type { ViewerImage } from './latestClient';
import type { Clock, Visibility } from './scheduler';
import {
  buildSrcset,
  DESKTOP_SIZES,
  MOBILE_MAX_WIDTH,
  MOBILE_MEDIA,
  MOBILE_SIZES,
  type Layout,
} from './view';

export const browserClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

export const documentVisibility: Visibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe(cb) {
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
};

// 画面の <picture> と同じ条件で候補を選ばせ、読み込みを終えてから差し替える
export async function preloadImage(image: ViewerImage): Promise<void> {
  const mobile = window.matchMedia(MOBILE_MEDIA).matches;
  const img = new Image();
  img.sizes = mobile ? MOBILE_SIZES : DESKTOP_SIZES;
  img.srcset = mobile
    ? buildSrcset(image, MOBILE_MAX_WIDTH) || buildSrcset(image)
    : buildSrcset(image);
  await img.decode();
}

export async function preloadUrls(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map((url) => {
      const img = new Image();
      img.src = url;
      return img.decode();
    }),
  );
}

export function frameLayout(): Layout {
  const frame = document.querySelector<HTMLElement>('.frame');
  return { framePx: frame?.clientWidth || 600, dpr: window.devicePixelRatio || 1 };
}
