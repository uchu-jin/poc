import { describe, expect, it } from 'vitest';
import { createScheduler, type Clock } from '../../src/features/viewer/scheduler';

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (cb, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id as number);
    },
  };
  function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].cb();
    }
    now = end;
  }
  return { clock, advance, pending: () => timers.size };
}

function fakeVisibility(initial = true) {
  let visible = initial;
  const listeners = new Set<() => void>();
  return {
    visibility: {
      isVisible: () => visible,
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    set(v: boolean) {
      visible = v;
      listeners.forEach((cb) => cb());
    },
  };
}

const TEN_MIN = 600_000;

function setup(opts: { visible?: boolean; minGapMs?: number } = {}) {
  const c = fakeClock();
  const v = fakeVisibility(opts.visible ?? true);
  let ticks = 0;
  const s = createScheduler({
    intervalMs: TEN_MIN,
    minGapMs: opts.minGapMs ?? 0,
    clock: c.clock,
    visibility: v.visibility,
    onTick: () => {
      ticks++;
    },
  });
  return { ...c, ...v, s, ticks: () => ticks };
}

describe('scheduler', () => {
  it('開始時に表ならすぐ1回呼ぶ', () => {
    const t = setup();
    t.s.start();
    expect(t.ticks()).toBe(1);
  });

  it('開始時に裏なら呼ばない', () => {
    const t = setup({ visible: false });
    t.s.start();
    t.advance(TEN_MIN * 3);
    expect(t.ticks()).toBe(0);
  });

  it('9分59秒では2回目を呼ばず、10分ちょうどで呼ぶ', () => {
    const t = setup();
    t.s.start();
    t.advance(TEN_MIN - 1000);
    expect(t.ticks()).toBe(1);
    t.advance(1000);
    expect(t.ticks()).toBe(2);
  });

  it('裏に回ると止まる', () => {
    const t = setup();
    t.s.start();
    t.set(false);
    t.advance(TEN_MIN * 3);
    expect(t.ticks()).toBe(1);
  });

  it('表に戻るとすぐ呼び、そこから10分後にまた呼ぶ', () => {
    const t = setup({ minGapMs: 60_000 });
    t.s.start();
    t.set(false);
    t.advance(TEN_MIN * 2);
    t.set(true);
    expect(t.ticks()).toBe(2);
    t.advance(TEN_MIN - 1);
    expect(t.ticks()).toBe(2);
    t.advance(1);
    expect(t.ticks()).toBe(3);
  });

  it('表に戻ったのが前回から1分以内なら、すぐには呼ばず、前回から10分で呼ぶ', () => {
    const t = setup({ minGapMs: 60_000 });
    t.s.start();
    t.set(false);
    t.advance(59_999);
    t.set(true);
    expect(t.ticks()).toBe(1);
    t.advance(TEN_MIN - 59_999);
    expect(t.ticks()).toBe(2);
  });

  it('前回からちょうど1分で表に戻ったら、すぐ呼ぶ', () => {
    const t = setup({ minGapMs: 60_000 });
    t.s.start();
    t.set(false);
    t.advance(60_000);
    t.set(true);
    expect(t.ticks()).toBe(2);
  });

  it('表の通知が2回続いても、タイマーは二重にならない', () => {
    const t = setup();
    t.s.start();
    t.set(true);
    t.set(true);
    expect(t.pending()).toBe(1);
    t.advance(TEN_MIN);
    expect(t.ticks()).toBe(2);
  });

  it('stop で止まる', () => {
    const t = setup();
    t.s.start();
    t.s.stop();
    t.set(true);
    t.advance(TEN_MIN * 2);
    expect(t.ticks()).toBe(1);
    expect(t.pending()).toBe(0);
  });
});
