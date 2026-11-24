import { describe, expect, it } from 'vitest';
import {
  createEditorReducer,
  initEditorState,
  type EditorAction,
  type EditorState,
} from '../../src/features/glyph-editor/editorReducer';
import { handlePosition, shiftXOf } from '../../src/features/glyph-editor/handles';
import { canRedo, canUndo } from '../../src/features/glyph-editor/history';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import type { MakeClipper } from '../../src/features/glyph-engine/union';

const reducer = createEditorReducer();
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(reducer, s);
const steps = (s: EditorState) => s.history.past.length;

describe('editorReducer（画面の状態）', () => {
  it('初期状態：既定値・グリッド 25・吸着 ON・取り消しもやり直しもできない（シナリオ1・FR-001）', () => {
    const s = initEditorState();
    expect(s.live).toEqual(DEFAULT_PARAMS);
    expect(s.history.present).toEqual(DEFAULT_PARAMS);
    expect(s.grid).toBe(25);
    expect(s.snap).toBe(true);
    expect(canUndo(s.history)).toBe(false);
    expect(canRedo(s.history)).toBe(false);
    expect(s.view).not.toBeNull();
    expect(s.error).toBeNull();
  });

  it('ドラッグは 1 手：開始 → 途中 3 回 → 離す で 1 手だけ増える。途中は履歴に積まない（FR-021・FR-006）', () => {
    let s = run(initEditorState(), { type: 'dragStart', handle: 'hWeight', at: [300, 245] });
    s = run(s, { type: 'dragMove', at: [300, 250] }, { type: 'dragMove', at: [300, 260] });
    expect(steps(s)).toBe(0);
    expect(s.live.hWeight).toBe(125);
    s = run(s, { type: 'dragMove', at: [300, 270] }, { type: 'dragEnd' });
    expect(steps(s)).toBe(1);
    expect(s.history.present.hWeight).toBe(150);
    expect(s.drag).toBeNull();
  });

  it('動かさずに離す → 増えない', () => {
    const s = run(
      initEditorState(),
      { type: 'dragStart', handle: 'weight', at: [0, 0] },
      { type: 'dragEnd' },
    );
    expect(steps(s)).toBe(0);
  });

  it('ドラッグが途中で切れたとき：ドラッグ前の値に戻り、手数は増えない', () => {
    const s = run(
      initEditorState(),
      { type: 'dragStart', handle: 'hWeight', at: [0, 0] },
      { type: 'dragMove', at: [0, 30] },
      { type: 'dragCancel' },
    );
    expect(s.live).toEqual(DEFAULT_PARAMS);
    expect(steps(s)).toBe(0);
    expect(s.drag).toBeNull();
  });

  it('グリッドを 50 → 10 にすると以後 10 刻み。グリッドを変えても履歴は増えない（シナリオ4・FR-004）', () => {
    let s = run(initEditorState(), { type: 'grid', grid: 50 }, { type: 'grid', grid: 10 });
    expect(steps(s)).toBe(0);
    const from = s.live;
    const start = handlePosition('weight', from, shiftXOf(from));
    const target = handlePosition(
      'weight',
      { ...from, weight: 103 },
      shiftXOf({ ...from, weight: 103 }),
    );
    s = run(
      s,
      { type: 'dragStart', handle: 'weight', at: start },
      { type: 'dragMove', at: [target[0], start[1]] },
      { type: 'dragEnd' },
    );
    expect(s.history.present.weight).toBe(100);
  });

  it('吸着を切り替えても履歴は増えない', () => {
    expect(steps(run(initEditorState(), { type: 'snap', snap: false }))).toBe(0);
  });

  it('既定値に戻す：7 つの値が既定値、1 手増える、グリッドは変わらない。既定値のときは増えない。取り消すと直前の値（FR-022）', () => {
    let s = run(
      initEditorState(),
      { type: 'grid', grid: 10 },
      { type: 'set', patch: { weight: 140, terminal: 'slab' }, commit: true },
    );
    const before = s.history.present;
    s = run(s, { type: 'reset' });
    expect(s.live).toEqual(DEFAULT_PARAMS);
    expect(s.grid).toBe(10);
    expect(steps(s)).toBe(2);
    expect(steps(run(s, { type: 'reset' }))).toBe(2);
    expect(run(s, { type: 'undo' }).live).toEqual(before);
  });

  it('端・角のボタン：違う値 → 1 手、同じ値 → 増えない', () => {
    let s = run(initEditorState(), { type: 'set', patch: { terminal: 'round' }, commit: true });
    expect(steps(s)).toBe(1);
    s = run(s, { type: 'set', patch: { terminal: 'round' }, commit: true });
    expect(steps(s)).toBe(1);
  });

  it('x ハイトのスライダー：動かしている途中は積まず、離したときに 1 手', () => {
    let s = run(
      initEditorState(),
      { type: 'set', patch: { xHeight: 450 }, commit: false },
      { type: 'set', patch: { xHeight: 460 }, commit: false },
    );
    expect(s.live.xHeight).toBe(460);
    expect(steps(s)).toBe(0);
    s = run(s, { type: 'commit' });
    expect(steps(s)).toBe(1);
    expect(s.history.present.xHeight).toBe(460);
  });

  it('x ハイトの数値欄：読めない値は確定しない、読める値は範囲で止めて 1 手', () => {
    let s = run(initEditorState(), { type: 'xHeightText', text: 'abc' });
    expect(steps(s)).toBe(0);
    s = run(s, { type: 'xHeightText', text: '1e9' });
    expect(s.live.xHeight).toBe(580);
    expect(steps(s)).toBe(1);
  });

  it('キー 1 回 → 1 手。取り消し・やり直し', () => {
    let s = run(initEditorState(), { type: 'key', handle: 'weight', key: 'ArrowRight' });
    expect(s.live.weight).toBe(115);
    expect(steps(s)).toBe(1);
    s = run(s, { type: 'undo' });
    expect(s.live.weight).toBe(90);
    s = run(s, { type: 'redo' });
    expect(s.live.weight).toBe(115);
  });

  it('A が組めなかったとき：表示する輪郭は直前のまま、理由を持つ。次に組めたら理由は消える', () => {
    let fail = false;
    const flaky: MakeClipper = () => ({
      AddPaths: () => true,
      Execute: (...args) => {
        const solution = args[1];
        if (fail) return false;
        solution.push([
          { X: 0, Y: 0 },
          { X: 1000, Y: 0 },
          { X: 1000, Y: 1000 },
        ]);
        return true;
      },
    });
    const r = createEditorReducer(flaky);
    let s = initEditorState(flaky);
    const view = s.view;
    fail = true;
    s = [{ type: 'key', handle: 'weight', key: 'ArrowRight' } as EditorAction].reduce(r, s);
    expect(s.view).toBe(view);
    expect(s.error).toMatch(/clipper-lib/);
    fail = false;
    s = [{ type: 'key', handle: 'weight', key: 'ArrowRight' } as EditorAction].reduce(r, s);
    expect(s.error).toBeNull();
  });
});
