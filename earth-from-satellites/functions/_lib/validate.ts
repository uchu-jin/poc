import { checkTiles, isAllowedImageUrl, MAX_IMAGE_WIDTH } from '../../shared/contract';
import { MAX_FUTURE_SKEW_MS, toCiraTimestamp } from './sources/ciraTimes';
import { SourceError, type LatestImage } from './types';

export function validateLatestImage(image: LatestImage, now: Date): void {
  if (image.images.length === 0) throw new SourceError('invalid', 'no images');
  for (const { url, width } of image.images) {
    if (!isAllowedImageUrl(image.satelliteId, url)) {
      throw new SourceError('invalid', 'image host not allowed');
    }
    if (!Number.isInteger(width) || width <= 0 || width > MAX_IMAGE_WIDTH) {
      throw new SourceError('invalid', 'image width out of range');
    }
  }
  const captured = Date.parse(image.capturedAt);
  if (Number.isNaN(captured)) throw new SourceError('invalid', 'capturedAt unreadable');
  if (captured > now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw new SourceError('invalid', 'capturedAt in the future');
  }
  if (image.tiles) {
    const stamp = checkTiles(image.tiles);
    if (!stamp || stamp !== toCiraTimestamp(new Date(captured))) {
      throw new SourceError('invalid', 'tiles do not match the contract');
    }
  }
}
