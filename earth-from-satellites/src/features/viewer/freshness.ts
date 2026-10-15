import { MESSAGES } from './messages';
import type { StaleRule } from './sources';

/** 規則に照らして古ければ、画面に出す注意の文を返す */
export function staleNotice(capturedAt: string, now: Date, rule: StaleRule): string | null {
  const captured = Date.parse(capturedAt);
  if (Number.isNaN(captured)) return null;
  const minutes = Math.floor((now.getTime() - captured) / 60_000);
  if (minutes < rule.afterMinutes) return null;
  return rule.unit === 'days'
    ? MESSAGES.staleDays(Math.floor(minutes / (24 * 60)))
    : MESSAGES.stale(minutes);
}
