// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { attachGestures } from '../../src/features/viewer/gestures';
import { FULL_VIEW, type Viewport } from '../../src/features/viewer/viewport';

let el: HTMLElement;
let vp: Viewport;
let changes: Viewport[];

function pointer(type: string, id: number, x: number, y: number) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerId', { value: id });
  el.dispatchEvent(e);
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
  vp = FULL_VIEW;
  changes = [];
  attachGestures(el, {
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
