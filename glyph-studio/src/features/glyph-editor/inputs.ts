// 入力の読み取り（x ハイトの数値欄）と、ショートカットを受けるかの判定
import { PARAM_LIMITS } from '../glyph-engine/params';

/** 前後の空白を除いた全体が 10 進の数値として読めるか（`12px`・16 進などは読めない扱い。仮置き） */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * x ハイトの数値欄を確定するときの値。全角の数字・記号は半角にしてから読む（日本語入力のため）。
 * 読めなければ直前の値、読めれば範囲で止めて整数に丸める
 */
export function parseXHeight(text: string, previous: number): number {
  const t = text.normalize('NFKC').trim();
  if (!DECIMAL.test(t)) return previous;
  const [min, max] = PARAM_LIMITS.xHeight;
  return Math.round(Math.min(max, Math.max(min, Number(t))));
}

export type ShortcutKey = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
};

/** フォーカスのある要素（タグ名・input の type・contenteditable） */
export type FocusTarget = { tag: string; type?: string; isContentEditable: boolean };

/** 文字を打たない input（ここにフォーカスがあってもショートカットを受ける） */
const NON_TEXT_INPUTS = new Set([
  'range',
  'radio',
  'checkbox',
  'button',
  'submit',
  'reset',
  'color',
  'file',
]);

/** 文字を打つ欄か（ブラウザ自身の文字の取り消しと重なる所） */
function isTextEntry(t: FocusTarget): boolean {
  const tag = t.tag.toLowerCase();
  if (t.isContentEditable || tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  return !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase());
}

/**
 * 取り消し・やり直しのショートカットとして受けるか。文字を打つ欄にフォーカスがあるとき・日本語入力の変換中・
 * Alt 付き・押し続け（キーリピート）は受けない
 */
export function shouldHandleShortcut(e: ShortcutKey, focused: FocusTarget): 'undo' | 'redo' | null {
  if (isTextEntry(focused) || e.isComposing || e.altKey || e.repeat) return null;
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.key.toLowerCase() !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
}
