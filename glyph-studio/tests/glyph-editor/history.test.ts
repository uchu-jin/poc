import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from '../../src/features/glyph-editor/history';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import type { Params } from '../../src/features/glyph-engine/types';

const p = (weight: number): Params => ({ ...DEFAULT_PARAMS, weight });

describe('history（取り消し・やり直し。FR-021）', () => {
  it('積む → 取り消す → 前の値、やり直す → 積んだ値', () => {
    let h = createHistory(p(90));
    h = pushHistory(h, p(100));
    expect(h.present.weight).toBe(100);
    h = undo(h);
    expect(h.present.weight).toBe(90);
    h = redo(h);
    expect(h.present.weight).toBe(100);
  });
  it('取り消したあとに新しく積むと、やり直しの履歴が消える', () => {
    let h = pushHistory(pushHistory(createHistory(p(90)), p(100)), p(110));
    h = undo(h);
    h = pushHistory(h, p(120));
    expect(canRedo(h)).toBe(false);
    expect(redo(h).present.weight).toBe(120);
  });
  it('最初の状態で取り消す・最後の状態でやり直す → 何も変わらない', () => {
    const h = createHistory(p(90));
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
  it('101 手積むと、いちばん古いものが捨てられて 100 手。100 回取り消せて 101 回目は変わらない', () => {
    let h = createHistory(p(0));
    for (let i = 1; i <= 101; i++) h = pushHistory(h, p(i));
    expect(h.past).toHaveLength(100);
    for (let i = 0; i < 100; i++) h = undo(h);
    expect(h.present.weight).toBe(1);
    expect(canUndo(h)).toBe(false);
    expect(undo(h).present.weight).toBe(1);
  });
  it('100 手ちょうどなら最初の状態まで戻れる', () => {
    let h = createHistory(p(0));
    for (let i = 1; i <= 100; i++) h = pushHistory(h, p(i));
    for (let i = 0; i < 100; i++) h = undo(h);
    expect(h.present.weight).toBe(0);
  });
  it('同じ値を積んでも、手数は増えない', () => {
    const h = createHistory(p(90));
    expect(pushHistory(h, p(90))).toBe(h);
  });
});
