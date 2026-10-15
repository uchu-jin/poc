// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { attachGestures } from '../../src/features/viewer/gestures';
import { FULL_VIEW, type Viewport } from '../../src/features/viewer/viewport';

let el: HTMLElement;
let vp: Viewport;
let changes: Viewport[];

function pointer(
  type: string,
  id: number,
  x: number,
  y: number,
  opts: { buttons?: number; button?: number; target?: Element; pointerType?: string } = {},
) {
  const buttons = opts.buttons ?? (type === 'pointerup' ? 0 : 1);
  const e = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    buttons,
    button: opts.button ?? 0,
  });
  Object.defineProperty(e, 'pointerId', { value: id });
  Object.defineProperty(e, 'pointerType', { value: opts.pointerType ?? 'mouse' });
  (opts.target ?? el).dispatchEvent(e);
}

let gestures: ReturnType<typeof attachGestures>;

beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
  vp = FULL_VIEW;
  changes = [];
  gestures = attachGestures(el, {
    getViewport: () => vp,
    getRect: () => ({ left: 0, top: 0, width: 400 }),
    onChange: (next) => {
      changes.push(next);
      vp = next;
    },
  });
});

describe('gestures', () => {
  it('ダブルクリックで、その点を中心に1段拡大する', () => {
    el.dispatchEvent(new MouseEvent('dblclick', { clientX: 100, clientY: 100, bubbles: true }));
    expect(vp.zoom).toBe(1);
    expect(vp.cx).toBeLessThan(0.5);
  });

  it('拡大中のホイール：deltaY が負なら拡大、正なら縮小', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 200 }));
    expect(vp.zoom).toBeGreaterThan(1);
    const z = vp.zoom;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 200, clientY: 200 }));
    expect(vp.zoom).toBeLessThan(z);
  });

  it('全体表示のとき、Ctrl なしのホイールでは何もしない（ページのスクロールに任せる）', () => {
    const e = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    el.dispatchEvent(e);
    expect(changes).toHaveLength(0);
    expect(e.defaultPrevented).toBe(false);
  });

  it('全体表示でも、Ctrl を押したホイール（トラックパッドのピンチ）なら拡大する', () => {
    const e = new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, cancelable: true });
    el.dispatchEvent(e);
    expect(vp.zoom).toBeGreaterThan(0);
    expect(e.defaultPrevented).toBe(true);
  });

  it('拡大中は1本指のドラッグで動く。全体表示では動かない', () => {
    pointer('pointerdown', 1, 200, 200);
    pointer('pointermove', 1, 150, 200);
    pointer('pointerup', 1, 150, 200);
    expect(changes).toHaveLength(0);
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    pointer('pointerdown', 1, 200, 200);
    pointer('pointermove', 1, 150, 200);
    pointer('pointerup', 1, 150, 200);
    expect(vp.cx).toBeGreaterThan(0.5);
  });

  it('2本指の間隔が2倍になると、zoom が1上がる', () => {
    pointer('pointerdown', 1, 150, 200);
    pointer('pointerdown', 2, 250, 200);
    // 間隔 100px → 150px → 200px
    pointer('pointermove', 2, 300, 200);
    pointer('pointermove', 1, 100, 200);
    expect(vp.zoom).toBeCloseTo(1, 6);
  });

  it('touch-action は、全体表示では pan-y、拡大中は none', () => {
    expect(el.style.touchAction).toBe('pan-y');
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    el.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 200, bubbles: true }));
    expect(el.style.touchAction).toBe('none');
  });
});

describe('gestures：レビュー指摘への対応', () => {
  it('pointerup が来ないまま、ボタンを離した状態の move が来ても動かない', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    pointer('pointerdown', 1, 200, 200);
    pointer('pointermove', 1, 150, 200);
    const n = changes.length;
    pointer('pointermove', 1, 100, 200, { buttons: 0 });
    pointer('pointermove', 1, 50, 200, { buttons: 0 });
    expect(changes).toHaveLength(n);
  });

  it('左以外のボタンではドラッグを始めない', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    pointer('pointerdown', 1, 200, 200, { button: 2, buttons: 2 });
    pointer('pointermove', 1, 100, 200, { buttons: 2 });
    expect(changes).toHaveLength(0);
  });

  it('ボタンの上の pointerdown・dblclick では、移動も拡大もしない', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    const button = document.createElement('button');
    el.append(button);
    pointer('pointerdown', 1, 200, 200, { target: button });
    pointer('pointermove', 1, 100, 200, { target: button });
    button.dispatchEvent(new MouseEvent('dblclick', { clientX: 380, clientY: 20, bubbles: true }));
    expect(changes).toHaveLength(0);
  });

  it('cancel のあとは、押したままの move でも動かない（衛星の切り替えなど）', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    pointer('pointerdown', 1, 200, 200);
    gestures.cancel();
    pointer('pointermove', 1, 100, 200);
    expect(changes).toHaveLength(0);
  });

  it('タッチは buttons を見ずにドラッグできる', () => {
    vp = { cx: 0.5, cy: 0.5, zoom: 1 };
    pointer('pointerdown', 1, 200, 200, { pointerType: 'touch', buttons: 0 });
    pointer('pointermove', 1, 150, 200, { pointerType: 'touch', buttons: 0 });
    expect(changes.length).toBeGreaterThan(0);
  });
});
