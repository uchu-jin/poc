import { describe, expect, it } from 'vitest';
import { parseXHeight, shouldHandleShortcut } from '../../src/features/glyph-editor/inputs';

describe('parseXHeight（x ハイトの数値欄。範囲 420〜580）', () => {
  it.each([
    ['480', 480],
    [' 480 ', 480],
    ['480.6', 481],
    ['419', 420],
    ['420', 420],
    ['580', 580],
    ['581', 580],
    ['1e9', 580],
    ['-5', 420],
  ])('%j → %s', (t, e) => {
    expect(parseXHeight(t, 500)).toBe(e);
  });
  it.each(['', 'abc', '  ', '12px', '0x1F4'])('%j → 直前の値', (t) => {
    expect(parseXHeight(t, 470)).toBe(470);
  });
});

describe('shouldHandleShortcut', () => {
  const k = (
    key: string,
    mod: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {},
  ) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...mod,
  });
  it('⌘Z・Ctrl+Z → 取り消し、⌘⇧Z・Ctrl+Shift+Z → やり直し（大文字の Z でも）', () => {
    expect(shouldHandleShortcut(k('z', { metaKey: true }), 'svg')).toBe('undo');
    expect(shouldHandleShortcut(k('z', { ctrlKey: true }), 'body')).toBe('undo');
    expect(shouldHandleShortcut(k('z', { metaKey: true, shiftKey: true }), 'body')).toBe('redo');
    expect(shouldHandleShortcut(k('Z', { ctrlKey: true, shiftKey: true }), 'body')).toBe('redo');
  });
  it('修飾キーのない z・Z 以外・入力欄にフォーカス → 何もしない', () => {
    expect(shouldHandleShortcut(k('z'), 'body')).toBeNull();
    expect(shouldHandleShortcut(k('y', { metaKey: true }), 'body')).toBeNull();
    expect(shouldHandleShortcut(k('z', { metaKey: true }), 'INPUT')).toBeNull();
    expect(shouldHandleShortcut(k('z', { ctrlKey: true }), 'textarea')).toBeNull();
  });
});
