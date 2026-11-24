// A の変形画面の状態を変える純粋な関数（reducer）。React のフック（useEditorState）はこれを包むだけ
import { buildGlyph } from '../glyph-engine/buildGlyph';
import { DEFAULT_PARAMS } from '../glyph-engine/params';
import type { Outline, Params, Vec } from '../glyph-engine/types';
import type { MakeClipper } from '../glyph-engine/union';
import { dragTo, keyStep, type HandleId } from './handles';
import { createHistory, pushHistory, redo, sameParams, undo, type History } from './history';
import { parseXHeight } from './inputs';

export type GridSize = 10 | 25 | 50;

/** 最後に組めた A（ハンドルを同じ座標に置くため shiftX も持つ） */
export type GlyphView = { outline: Outline; shiftX: number; advanceWidth: number };

export type EditorState = {
  /** 確定したパラメータの履歴（取り消し・やり直し。FR-021） */
  history: History;
  /** 画面に出しているパラメータ（ドラッグ中・スライダーを動かしている途中は history.present と違う） */
  live: Params;
  grid: GridSize;
  snap: boolean;
  drag: { handle: HandleId; from: Params; origin: Vec } | null;
  view: GlyphView | null;
  /** A が組めなかったときの理由（表示は直前の view のまま） */
  error: string | null;
};

export type EditorAction =
  | { type: 'dragStart'; handle: HandleId; at: Vec }
  | { type: 'dragMove'; at: Vec }
  | { type: 'dragEnd' }
  | { type: 'dragCancel' }
  | { type: 'key'; handle: HandleId; key: string }
  | { type: 'set'; patch: Partial<Params>; commit: boolean }
  | { type: 'commit' }
  | { type: 'xHeightText'; text: string }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'grid'; grid: GridSize }
  | { type: 'snap'; snap: boolean };

function withLive(s: EditorState, live: Params, makeClipper?: MakeClipper): EditorState {
  if (live === s.live && s.view) return s;
  const r = buildGlyph('A', live, { makeClipper });
  if (!r.ok) return { ...s, live, error: r.message };
  return {
    ...s,
    live,
    view: { outline: r.outline, shiftX: r.shiftX, advanceWidth: r.advanceWidth },
    error: null,
  };
}

/** 新しい値を確定して 1 手積む（値が変わらなければ積まない） */
function commitParams(s: EditorState, next: Params, makeClipper?: MakeClipper): EditorState {
  const history = pushHistory(s.history, next);
  return withLive({ ...s, history }, history.present, makeClipper);
}

export function initEditorState(makeClipper?: MakeClipper): EditorState {
  const base: EditorState = {
    history: createHistory(DEFAULT_PARAMS),
    live: DEFAULT_PARAMS,
    grid: 25,
    snap: true,
    drag: null,
    view: null,
    error: null,
  };
  return withLive(base, DEFAULT_PARAMS, makeClipper);
}

export function createEditorReducer(makeClipper?: MakeClipper) {
  /** ドラッグ中なら取り消して、ドラッグ前の値に戻す */
  const cancelDrag = (s: EditorState): EditorState =>
    s.drag ? withLive({ ...s, drag: null }, s.drag.from, makeClipper) : s;
  /** 確定していない値（スライダーを動かした途中など）があれば、先に 1 手として確定する */
  const settle = (s: EditorState): EditorState =>
    !s.drag && !sameParams(s.live, s.history.present) ? commitParams(s, s.live, makeClipper) : s;
  /** ドラッグ以外の操作の前に：ドラッグを取り消し、確定前の値を確定する（実装レビュー P2） */
  const before = (s: EditorState) => settle(cancelDrag(s));

  return function editorReducer(s: EditorState, a: EditorAction): EditorState {
    switch (a.type) {
      case 'dragStart': {
        // ドラッグ中の 2 本目（マルチタッチなど）は無視する（実装レビュー P1）
        if (s.drag) return s;
        const t = settle(s);
        return { ...t, drag: { handle: a.handle, from: t.live, origin: a.at } };
      }
      case 'dragMove': {
        if (!s.drag) return s;
        const d: Vec = [a.at[0] - s.drag.origin[0], a.at[1] - s.drag.origin[1]];
        const next = dragTo(s.drag.handle, s.drag.from, d, s.grid, s.snap, makeClipper);
        return withLive(s, next, makeClipper);
      }
      case 'dragEnd':
        if (!s.drag) return s;
        return commitParams({ ...s, drag: null }, s.live, makeClipper);
      case 'dragCancel':
        return cancelDrag(s);
      case 'key': {
        const t = before(s);
        return commitParams(t, keyStep(a.handle, a.key, t.live, t.grid, t.snap), makeClipper);
      }
      case 'set': {
        if (!a.commit) {
          const t = cancelDrag(s);
          return withLive(t, { ...t.live, ...a.patch }, makeClipper);
        }
        const t = before(s);
        return commitParams(t, { ...t.live, ...a.patch }, makeClipper);
      }
      case 'commit':
        return before(s);
      case 'xHeightText': {
        const t = before(s);
        const xHeight = parseXHeight(a.text, t.live.xHeight);
        return commitParams(t, { ...t.live, xHeight }, makeClipper);
      }
      case 'reset':
        return commitParams(before(s), DEFAULT_PARAMS, makeClipper);
      case 'undo': {
        // 確定前の値があれば、それを 1 手として確定してから戻す（スライダーの変更が戻る）
        const t = before(s);
        const history = undo(t.history);
        return withLive({ ...t, history }, history.present, makeClipper);
      }
      case 'redo': {
        // 確定前の値は捨てて、やり直す（確定するとやり直しの履歴が消えるため）
        const t = cancelDrag(s);
        const history = redo(t.history);
        return withLive({ ...t, history }, history.present, makeClipper);
      }
      case 'grid':
        return { ...s, grid: a.grid };
      case 'snap':
        return { ...s, snap: a.snap };
    }
  };
}
