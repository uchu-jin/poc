import { SATELLITE_NAMES } from '../../../shared/contract';
import { el, setText } from './dom';
import { formatCapturedAt } from './format';
import { staleNotice } from './freshness';
import { MESSAGES } from './messages';
import { SOURCE_TRAITS } from './sources';
import type { ViewerState } from './state';

/** 画像の下の説明：衛星名・撮影日時・古さの注意・注記・クレジット */
export function createMetaPanel() {
  const element = el('div', { class: 'meta' });
  const name = el('p', { 'data-role': 'name', class: 'name' });
  const time = el('time');
  const stale = el('p', { 'data-role': 'stale', class: 'stale' });
  const note = el('p', { 'data-role': 'note', class: 'note' });
  const credit = el('p', { 'data-role': 'credit', class: 'credit' });
  element.append(name, time, stale, note, credit);
  let creditKey = '';

  return {
    element,
    render(state: ViewerState, now: Date, timeZone?: string) {
      const traits = SOURCE_TRAITS[state.satelliteId];
      const image = state.image;
      setText(name, image ? image.satelliteName : SATELLITE_NAMES[state.satelliteId]);
      setText(note, traits.note ?? '');
      note.hidden = !traits.note;
      time.hidden = !image;
      credit.hidden = !image;

      if (!image) {
        time.removeAttribute('datetime');
        time.textContent = '';
        stale.textContent = '';
        stale.hidden = true;
        credit.replaceChildren();
        creditKey = '';
        return;
      }

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
