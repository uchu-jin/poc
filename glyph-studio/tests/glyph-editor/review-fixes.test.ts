// 実装レビュー（2026-11-24）の P1・P2 への対応
import { describe, expect, it } from 'vitest';
import {
  createEditorReducer,
  initEditorState,
  type EditorAction,
  type EditorState,
} from '../../src/features/glyph-editor/editorReducer';
import { dragTo, keyStep } from '../../src/features/glyph-editor/handles';
import { parseXHeight, shouldHandleShortcut } from '../../src/features/glyph-editor/inputs';
import { sampleLayout, MISSING_GLYPH_WIDTH } from '../../src/features/glyph-editor/sampleLayout';
import { snapValue } from '../../src/features/glyph-editor/snap';
import { routeOf } from '../../src/route';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import type { BuildResult } from '../../src/features/glyph-engine/types';

const reducer = createEditorReducer();
const run = (s: EditorState, ...a: EditorAction[]) => a.reduce(reducer, s);
const steps = (s: EditorState) => s.history.past.length;
const key = (
  k: string,
  mod: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    repeat: boolean;
    isComposing: boolean;
  }> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  ...mod,
});
const el = (tag: string, type?: string, isContentEditable = false) => ({
  tag,
  type,
  isContentEditable,
});

describe('ショートカットの効く範囲（P1-1・P2）', () => {
  it('文字を打たない入力欄（range・radio・checkbox・button）にフォーカスがあっても ⌘Z が効く', () => {
    for (const type of ['range', 'radio', 'checkbox', 'button'])
      expect(shouldHandleShortcut(key('z', { metaKey: true }), el('INPUT', type))).toBe('undo');
  });
  it('文字を打つ欄（text・number・search、textarea、select、contenteditable）では受けない', () => {
    for (const t of [
      el('INPUT', 'text'),
      el('INPUT', 'number'),
      el('INPUT', 'search'),
      el('INPUT'),
      el('TEXTAREA'),
      el('SELECT'),
      el('DIV', undefined, true),
    ])
      expect(shouldHandleShortcut(key('z', { metaKey: true }), t)).toBeNull();
  });
  it('Alt 付き・キーの押し続け（repeat）・日本語入力の変換中は受けない', () => {
    expect(shouldHandleShortcut(key('z', { ctrlKey: true, altKey: true }), el('BODY'))).toBeNull();
    expect(shouldHandleShortcut(key('z', { metaKey: true, repeat: true }), el('BODY'))).toBeNull();
    expect(
      shouldHandleShortcut(key('z', { metaKey: true, isComposing: true }), el('BODY')),
    ).toBeNull();
  });
});

describe('x ハイトの欄の全角数字（P1-2）', () => {
  it('全角数字・全角のピリオドも読む', () => {
    expect(parseXHeight('５２０', 500)).toBe(520);
    expect(parseXHeight('　４８０．６　', 500)).toBe(481);
  });
});

describe('ドラッグ中の操作（P1-3・P2）', () => {
  it('ドラッグ中にもう 1 本のドラッグが始まっても無視する（2 本目のポインター）', () => {
    let s = run(
      initEditorState(),
      { type: 'dragStart', handle: 'hWeight', at: [0, 0] },
      { type: 'dragMove', at: [0, 20] },
    );
    s = run(s, { type: 'dragStart', handle: 'width', at: [100, 0] });
    expect(s.drag?.handle).toBe('hWeight');
    s = run(s, { type: 'dragCancel' });
    expect(s.live).toEqual(DEFAULT_PARAMS);
  });

  it('ドラッグ中の「既定値に戻す」・ボタン・矢印キーは、ドラッグを取り消してから行い、次の dragMove で消えない', () => {
    for (const a of [
      { type: 'reset' },
      { type: 'set', patch: { terminal: 'round' }, commit: true },
      { type: 'key', handle: 'hWeight', key: 'ArrowUp' },
    ] as EditorAction[]) {
      let s = run(initEditorState(), { type: 'set', patch: { weight: 140 }, commit: true });
      s = run(
        s,
        { type: 'dragStart', handle: 'width', at: [0, 0] },
        { type: 'dragMove', at: [50, 0] },
        a,
      );
      const after = s.live;
      expect(s.drag).toBeNull();
      s = run(s, { type: 'dragMove', at: [100, 0] }, { type: 'dragEnd' });
      expect(s.live).toEqual(after);
      expect(s.live.width).toBe(1);
    }
  });

  it('ドラッグを取り消すと、ドラッグ前の値（確定前のスライダーの値を含む）に戻る', () => {
    let s = run(initEditorState(), { type: 'set', patch: { xHeight: 540 }, commit: false });
    s = run(
      s,
      { type: 'dragStart', handle: 'width', at: [0, 0] },
      { type: 'dragMove', at: [50, 0] },
      { type: 'dragCancel' },
    );
    expect(s.live.xHeight).toBe(540);
    expect(s.live.width).toBe(1);
  });

  it('確定前のスライダーの値は、ドラッグの前に 1 手として確定し、ドラッグとまとめない', () => {
    let s = run(initEditorState(), { type: 'set', patch: { xHeight: 540 }, commit: false });
    s = run(
      s,
      { type: 'dragStart', handle: 'width', at: [0, 0] },
      { type: 'dragMove', at: [50, 0] },
      { type: 'dragEnd' },
    );
    expect(steps(s)).toBe(2);
    s = run(s, { type: 'undo' });
    expect(s.live.xHeight).toBe(540);
    expect(s.live.width).toBe(1);
  });

  it('確定前のスライダーの値があるとき、取り消すとそのスライダーの変更が戻る', () => {
    const s = run(
      initEditorState(),
      { type: 'set', patch: { xHeight: 540 }, commit: false },
      { type: 'undo' },
    );
    expect(s.live.xHeight).toBe(500);
  });
});

describe('端数がたまらない（P2）', () => {
  it('傾き：→ キーのあと ← キーで、ちょうど 0 に戻る（グリッド 25・10）', () => {
    for (const grid of [25, 10]) {
      let p = DEFAULT_PARAMS;
      for (let i = 0; i < 5; i++) p = keyStep('slant', 'ArrowRight', p, grid, true);
      for (let i = 0; i < 5; i++) p = keyStep('slant', 'ArrowLeft', p, grid, true);
      expect(p.slant).toBe(0);
    }
  });
  it('傾きを往復したあと「既定値に戻す」で手数が増えない', () => {
    let s = run(
      initEditorState(),
      { type: 'key', handle: 'slant', key: 'ArrowRight' },
      { type: 'key', handle: 'slant', key: 'ArrowLeft' },
    );
    const n = steps(s);
    s = run(s, { type: 'reset' });
    expect(steps(s)).toBe(n);
  });
  it('幅：→ キーを押し続けても端数が出ない（1.05・1.1・1.15・1.2・1.25）', () => {
    let p = DEFAULT_PARAMS;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push((p = keyStep('width', 'ArrowRight', p, 25, true)).width);
    expect(seen).toEqual([1.05, 1.1, 1.15, 1.2, 1.25]);
    expect(dragTo('width', { ...DEFAULT_PARAMS, width: 1.1 }, [25, 0], 25, true).width).toBe(1.15);
  });
  it('ちょうど半分は、値でも距離でも大きい側に丸める（112.5 → 125）', () => {
    expect(snapValue(112.5, 25, 20, 150, true)).toBe(125);
    expect(dragTo('hWeight', DEFAULT_PARAMS, [0, 11.25], 25, true).hWeight).toBe(125);
  });
});

describe('見本の行で組めなかった文字（P2）', () => {
  it('幅 0 で詰めず、決まった幅を取って失敗の印を付ける', () => {
    const fail: BuildResult = { ok: false, reason: 'union-failed', message: 'x' };
    const ok: BuildResult = { ok: true, outline: [], advanceWidth: 600, bounds: null, shiftX: 0 };
    const l = sampleLayout('AB', (ch) => (ch === 'A' ? fail : ok));
    expect(l.items.map((i) => i.x)).toEqual([0, MISSING_GLYPH_WIDTH]);
    expect(l.items[0]!.missing).toBe(true);
    expect(l.items[1]!.missing).toBe(false);
    expect(l.width).toBe(MISSING_GLYPH_WIDTH + 600);
  });
});

describe('画面の切り替え（P2）', () => {
  it.each([
    ['#preview', 'preview'],
    ['#PREVIEW', 'preview'],
    ['#/preview', 'preview'],
    ['#preview?x=1', 'preview'],
    ['', 'editor'],
    ['#', 'editor'],
    ['#previews', 'editor'],
    ['#something', 'editor'],
  ])('%j → %s', (hash, route) => {
    expect(routeOf(hash)).toBe(route);
  });
});
