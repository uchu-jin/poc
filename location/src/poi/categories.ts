import type { PoiCategory } from '../domain/types';

export const CATEGORY_ORDER: PoiCategory[] = ['shrine_temple', 'museum', 'viewpoint', 'restaurant'];

export const CATEGORY_LABELS: Record<PoiCategory, string> = {
  shrine_temple: '寺社',
  museum: '博物館',
  viewpoint: '展望台',
  restaurant: 'レストラン',
};

export const CATEGORY_FILTERS: Record<PoiCategory, string> = {
  shrine_temple: '["amenity"="place_of_worship"]["religion"~"^(buddhist|shinto)$"]',
  museum: '["tourism"="museum"]',
  viewpoint: '["tourism"="viewpoint"]',
  restaurant: '["amenity"="restaurant"]',
};

export function classify(tags: Record<string, string>): PoiCategory | null {
  if (tags['amenity'] === 'place_of_worship') {
    return tags['religion'] === 'buddhist' || tags['religion'] === 'shinto'
      ? 'shrine_temple'
      : null;
  }
  if (tags['tourism'] === 'museum') return 'museum';
  if (tags['tourism'] === 'viewpoint') return 'viewpoint';
  if (tags['amenity'] === 'restaurant') return 'restaurant';
  return null;
}
