import type { Message } from '../domain/types';

export type DispatchResult = 'sent' | 'requeue' | 'drop';

export interface SendScheduler {
  enqueue(m: Message): void;
  flush(): Promise<void>;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  pending(): Message[];
  isBusy(): boolean;
  clear(): void;
}

export function createSendScheduler(opts: {
  storage: { loadQueue(): Message[]; saveQueue(q: Message[]): void };
  isOnline: () => boolean;
  dispatch: (batch: Message[]) => Promise<DispatchResult>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  retryMs?: number;
}): SendScheduler {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const retryMs = opts.retryMs ?? 15_000;

  let queue: Message[] = opts.storage.loadQueue();
  let busy = false;
  let timer: unknown = null;
  const waiters: (() => void)[] = [];

  const persist = (): void => opts.storage.saveQueue(queue);

  const cancelRetry = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const release = (): void => {
    const next = waiters.shift();
    if (next) next();
    else busy = false;
  };

  const acquire = async (): Promise<void> => {
    if (!busy) {
      busy = true;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  };

  const flush = async (): Promise<void> => {
    if (busy || !opts.isOnline() || queue.length === 0) return;
    busy = true;
    cancelRetry();
    let again = false;
    try {
      const batch = queue.slice();
      let result: DispatchResult;
      try {
        result = await opts.dispatch(batch);
      } catch {
        result = 'requeue';
      }
      if (result === 'requeue') {
        if (queue.length > 0 && opts.isOnline()) {
          cancelRetry();
          timer = setTimer(() => {
            timer = null;
            void flush();
          }, retryMs);
        }
      } else {
        const ids = new Set(batch.map((m) => m.id));
        queue = queue.filter((m) => !ids.has(m.id));
        persist();
        again = queue.length > 0;
      }
    } finally {
      release();
    }
    if (again) await flush();
  };

  return {
    enqueue(m) {
      queue = [...queue, { ...m, status: 'queued' }];
      persist();
      void flush();
    },
    flush,
    async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
        void flush();
      }
    },
    pending: () => queue.slice(),
    isBusy: () => busy,
    clear() {
      cancelRetry();
      queue = [];
      persist();
    },
  };
}
