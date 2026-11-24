// 入力の読み取り（x ハイトの数値欄）と、ショートカットを受けるかの判定
import { PARAM_LIMITS } from '../glyph-engine/params';

/** 前後の空白を除いた全体が 10 進の数値として読めるか（`12px`・16 進などは読めない扱い。仮置き） */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/** x ハイトの数値欄を確定するときの値。読めなければ直前の値、読めれば範囲で止めて整数に丸める */
export function parseXHeight(text: string, previous: number): number {
  const t = text.trim();
  if (!DECIMAL.test(t)) return previous;
  const [min, max] = PARAM_LIMITS.xHeight;
  return Math.round(Math.min(max, Math.max(min, Number(t))));
}

export type ShortcutKey = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean };

/**
 * 取り消し・やり直しのショートカットとして受けるか。入力欄にフォーカスがあるときは受けない
 * （ブラウザ自身の文字の取り消しと重ならないように）
 */
export function shouldHandleShortcut(e: ShortcutKey, focusedTag: string): 'undo' | 'redo' | null {
  const tag = focusedTag.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return null;
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.key.toLowerCase() !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
}
