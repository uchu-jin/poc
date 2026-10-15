import { panBy, zoomAt, type Viewport } from './viewport';

export interface GestureOptions {
  getViewport(): Viewport;
  getRect(): { left: number; top: number; width: number };
  onChange(next: Viewport): void;
  /** 拡大できない表示（EPIC など）では false */
  isEnabled?(): boolean;
}

export interface Gestures {
  /** 表示範囲が外から変わったときに、touch-action を合わせる */
  sync(): void;
  /** 進行中のドラッグ・ピンチをやめる（衛星の切り替えなど） */
  cancel(): void;
  detach(): void;
}

const WHEEL_STEP = 0.002;
const PINCH_WHEEL_STEP = 0.01;

export function attachGestures(el: HTMLElement, opts: GestureOptions): Gestures {
  const enabled = () => opts.isEnabled?.() ?? true;
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; vp: Viewport } | null = null;
  let pinch: { dist: number; fx: number; fy: number; vp: Viewport } | null = null;

  const sync = () => {
    // 全体表示では縦のスクロールをページに任せ、ピンチだけを拾う
    el.style.touchAction = enabled() && opts.getViewport().zoom > 0 ? 'none' : 'pan-y';
  };
  const change = (next: Viewport) => {
    opts.onChange(next);
    sync();
  };
  const focusOf = (x: number, y: number) => {
    const r = opts.getRect();
    return { fx: (x - r.left) / r.width, fy: (y - r.top) / r.width };
  };
  const restart = () => {
    const pts = [...pointers.values()];
    drag = null;
    pinch = null;
    if (pts.length === 1) drag = { ...pts[0]!, vp: opts.getViewport() };
    if (pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        ...focusOf((a.x + b.x) / 2, (a.y + b.y) / 2),
        vp: opts.getViewport(),
      };
    }
  };

  // ＋／−などのボタンの上の操作は、ボタンに任せる
  const onButton = (e: Event) => e.target instanceof Element && e.target.closest('button') !== null;
  const isMouse = (p: PointerEvent) => p.pointerType !== 'touch' && p.pointerType !== 'pen';

  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    if (!enabled() || onButton(e)) return;
    if (isMouse(p) && p.button !== 0) return;
    pointers.set(p.pointerId, { x: p.clientX, y: p.clientY });
    try {
      el.setPointerCapture?.(p.pointerId);
    } catch {
      // 捕捉できなくても、buttons の確認で後片付けできる
    }
    restart();
  };
  const onMove = (e: Event) => {
    const p = e as PointerEvent;
    if (!pointers.has(p.pointerId)) return;
    // 枠の外でボタンを離した（pointerup が届かなかった）
    if (isMouse(p) && p.buttons === 0) {
      pointers.delete(p.pointerId);
      restart();
      return;
    }
    pointers.set(p.pointerId, { x: p.clientX, y: p.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.dist > 0 && dist > 0) {
        change(zoomAt(pinch.vp, Math.log2(dist / pinch.dist), pinch));
      }
      return;
    }
    if (drag && drag.vp.zoom > 0) {
      change(panBy(drag.vp, p.clientX - drag.x, p.clientY - drag.y, opts.getRect().width));
    }
  };
  const onUp = (e: Event) => {
    pointers.delete((e as PointerEvent).pointerId);
    restart();
  };
  const onDblClick = (e: Event) => {
    if (!enabled() || onButton(e)) return;
    const m = e as MouseEvent;
    change(zoomAt(opts.getViewport(), 1, focusOf(m.clientX, m.clientY)));
  };
  const onWheel = (e: Event) => {
    const w = e as WheelEvent;
    const vp = opts.getViewport();
    // 全体表示で Ctrl なしのホイールは、ページのスクロールに任せる
    if (!enabled() || (vp.zoom === 0 && !w.ctrlKey)) return;
    w.preventDefault();
    const step = w.ctrlKey ? PINCH_WHEEL_STEP : WHEEL_STEP;
    change(zoomAt(vp, -w.deltaY * step, focusOf(w.clientX, w.clientY)));
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('dblclick', onDblClick);
  el.addEventListener('wheel', onWheel, { passive: false });
  sync();

  return {
    sync,
    cancel() {
      pointers.clear();
      drag = null;
      pinch = null;
    },
    detach() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('wheel', onWheel);
    },
  };
}
