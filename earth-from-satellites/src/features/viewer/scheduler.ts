export interface Clock {
  now(): number;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface Visibility {
  isVisible(): boolean;
  subscribe(cb: () => void): () => void;
}

export interface SchedulerOptions {
  intervalMs: number;
  /** 表に戻ったとき、前回からこの時間が経っていなければ、すぐには呼ばない */
  minGapMs?: number;
  clock: Clock;
  visibility: Visibility;
  onTick: () => void;
}

export interface Scheduler {
  start(): void;
  stop(): void;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const { intervalMs, minGapMs = 0, clock, visibility, onTick } = opts;
  let timer: unknown = null;
  let lastTick: number | null = null;
  let unsubscribe: (() => void) | null = null;

  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    timer = clock.setTimeout(tick, ms);
  };
  function tick() {
    timer = null;
    lastTick = clock.now();
    onTick();
    schedule(intervalMs);
  }
  const onVisibility = () => {
    if (!visibility.isVisible()) {
      clear();
      return;
    }
    if (timer !== null) return;
    const elapsed = lastTick === null ? Infinity : clock.now() - lastTick;
    if (elapsed >= minGapMs) tick();
    else schedule(Math.max(0, intervalMs - elapsed));
  };

  return {
    start() {
      unsubscribe = visibility.subscribe(onVisibility);
      onVisibility();
    },
    stop() {
      clear();
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
