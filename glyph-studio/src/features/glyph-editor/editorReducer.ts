// A の変形画面の状態を変える純粋な関数（reducer）。React のフック（useEditorState）はこれを包むだけ
import { buildGlyph } from '../glyph-engine/buildGlyph';
import { DEFAULT_PARAMS } from '../glyph-engine/params';
import type { Outline, Params, Vec } from '../glyph-engine/types';
import type { MakeClipper } from '../glyph-engine/union';
import { dragTo, keyStep, type HandleId } from './handles';
import { createHistory, pushHistory, redo, undo, type History } from './history';
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
  return function editorReducer(s: EditorState, a: EditorAction): EditorState {
    switch (a.type) {
      case 'dragStart':
        return { ...s, drag: { handle: a.handle, from: s.live, origin: a.at } };
      case 'dragMove': {
        if (!s.drag) return s;
        const d: Vec = [a.at[0] - s.drag.origin[0], a.at[1] - s.drag.origin[1]];
        return withLive(s, dragTo(s.drag.handle, s.drag.from, d, s.grid, s.snap), makeClipper);
      }
      case 'dragEnd':
        if (!s.drag) return s;
        return commitParams({ ...s, drag: null }, s.live, makeClipper);
      case 'dragCancel':
        if (!s.drag) return s;
        return withLive({ ...s, drag: null }, s.history.present, makeClipper);
      case 'key':
        return commitParams(s, keyStep(a.handle, a.key, s.live, s.grid, s.snap), makeClipper);
      case 'set': {
        const next = { ...s.live, ...a.patch };
        return a.commit ? commitParams(s, next, makeClipper) : withLive(s, next, makeClipper);
      }
      case 'commit':
        return commitParams(s, s.live, makeClipper);
      case 'xHeightText': {
        const xHeight = parseXHeight(a.text, s.live.xHeight);
        return commitParams(s, { ...s.live, xHeight }, makeClipper);
      }
      case 'reset':
        return commitParams(s, DEFAULT_PARAMS, makeClipper);
      case 'undo': {
        const history = undo(s.history);
        return withLive({ ...s, history, drag: null }, history.present, makeClipper);
      }
      case 'redo': {
        const history = redo(s.history);
        return withLive({ ...s, history, drag: null }, history.present, makeClipper);
      }
      case 'grid':
        return { ...s, grid: a.grid };
      case 'snap':
        return { ...s, snap: a.snap };
    }
  };
}
