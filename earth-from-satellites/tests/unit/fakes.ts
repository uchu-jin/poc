import type { Clock } from '../../src/features/viewer/scheduler';

export function fakeClock() {
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
  return { clock, advance, pending: () => timers.size, setNow: (t: number) => (now = t) };
}

export function fakeVisibility(initial = true) {
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
