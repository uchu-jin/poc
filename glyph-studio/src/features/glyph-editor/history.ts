// パラメータの取り消し・やり直しの履歴（FR-021）。パラメータ 7 つだけを積む
import type { Params } from '../glyph-engine/types';

export const HISTORY_LIMIT = 100;

export type History = { past: Params[]; present: Params; future: Params[] };

const sameParams = (a: Params, b: Params) =>
  a.weight === b.weight &&
  a.hWeight === b.hWeight &&
  a.width === b.width &&
  a.slant === b.slant &&
  a.xHeight === b.xHeight &&
  a.terminal === b.terminal &&
  a.join === b.join;

export const createHistory = (present: Params): History => ({ past: [], present, future: [] });

/** 新しい値を 1 手として積む。値が変わらないときは積まない。やり直しの履歴は消える */
export function pushHistory(h: History, next: Params): History {
  if (sameParams(h.present, next)) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1]!,
    future: [h.present, ...h.future],
  };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}

export { sameParams };
