import { IMAGE_HOSTS, MAX_IMAGE_WIDTH } from '../../shared/contract';
import { MAX_FUTURE_SKEW_MS } from './sources/ciraTimes';
import { SourceError, type LatestImage } from './types';

const ALLOWED_IMAGE_HOSTS: ReadonlySet<string> = new Set(IMAGE_HOSTS);

function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function validateLatestImage(image: LatestImage, now: Date): void {
  if (image.images.length === 0) throw new SourceError('invalid', 'no images');
  for (const { url, width } of image.images) {
    if (!isAllowedImageUrl(url)) throw new SourceError('invalid', 'image host not allowed');
    if (!Number.isInteger(width) || width <= 0 || width > MAX_IMAGE_WIDTH) {
      throw new SourceError('invalid', 'image width out of range');
    }
  }
  const captured = Date.parse(image.capturedAt);
  if (Number.isNaN(captured)) throw new SourceError('invalid', 'capturedAt unreadable');
  if (captured > now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw new SourceError('invalid', 'capturedAt in the future');
  }
}
