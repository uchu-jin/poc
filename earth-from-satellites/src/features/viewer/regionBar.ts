import type { GeostationaryId, SatelliteId } from '../../../shared/contract';
import { canExplore } from './display';
import { el } from './dom';
import { MESSAGES } from './messages';
import { REGIONS, type Region } from './regions';
import { SOURCE_TRAITS } from './sources';
import type { ViewerState } from './state';
import { isFull } from './viewport';

/** 「全球」と衛星ごとの地域を並べた選択の列 */
export function createRegionBar(onRegion: (regionId: string | null) => void) {
  const element = el('div', {
    role: 'group',
    'aria-label': MESSAGES.regionGroup,
    class: 'regions',
  });
  let builtFor: SatelliteId | null = null;

  function build(id: SatelliteId) {
    builtFor = id;
    const list: readonly Region[] = SOURCE_TRAITS[id].hasRegions
      ? REGIONS[id as GeostationaryId]
      : [];
    const full = el('button', { type: 'button', 'data-region': '' });
    full.textContent = MESSAGES.fullDisk;
    full.addEventListener('click', () => onRegion(null));
    const chips = list.map((r) => {
      const b = el('button', { type: 'button', 'data-region': r.id });
      b.textContent = r.label;
      b.addEventListener('click', () => onRegion(r.id));
      return b;
    });
    element.replaceChildren(full, ...chips);
  }

  return {
    element,
    render(state: ViewerState) {
      if (builtFor !== state.satelliteId) build(state.satelliteId);
      element.hidden = !canExplore(state);
      for (const b of element.querySelectorAll<HTMLButtonElement>('button[data-region]')) {
        const id = b.dataset.region || null;
        const on =
          id === null ? state.regionId === null && isFull(state.viewport) : id === state.regionId;
        b.setAttribute('aria-pressed', String(on));
      }
    },
  };
}
