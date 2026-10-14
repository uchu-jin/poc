import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSendScheduler, type DispatchResult } from '../../src/chat/queue';
import type { Message } from '../../src/domain/types';

const msg = (id: string): Message => ({
  id,
  role: 'user',
  text: id,
  ts: '2026-01-01T00:00:00.000Z',
  status: 'queued',
});

function memStorage(initial: Message[] = []) {
  let q = initial;
  return {
    loadQueue: () => q.slice(),
    saveQueue: (n: Message[]) => {
      q = n.slice();
    },
    get stored() {
      return q;
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ids = (b: Message[]) => b.map((m) => m.id);

describe('send scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('U-q-1 offline enqueue persists and does not dispatch', () => {
    const storage = memStorage();
    const dispatch = vi.fn(async (): Promise<DispatchResult> => 'sent');
    const s = createSendScheduler({ storage, isOnline: () => false, dispatch });
    s.enqueue(msg('a'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(ids(storage.stored)).toEqual(['a']);
    expect(s.pending()[0]?.status).toBe('queued');
  });

  it('U-q-2 concurrent flush after going online -> exactly one dispatch with all, in order', async () => {
    let online = false;
    const storage = memStorage();
    const batches: string[][] = [];
    const dispatch = vi.fn(async (b: Message[]): Promise<DispatchResult> => {
      batches.push(ids(b));
      return 'sent';
    });
    const s = createSendScheduler({ storage, isOnline: () => online, dispatch });
    s.enqueue(msg('a'));
    s.enqueue(msg('b'));
    s.enqueue(msg('c'));
    online = true;
    await Promise.all([s.flush(), s.flush()]);
    expect(batches).toEqual([['a', 'b', 'c']]);
    expect(s.pending()).toEqual([]);
    expect(storage.stored).toEqual([]);
  });

  it('U-q-3 message enqueued during in-flight dispatch goes in a second batch', async () => {
    const d = deferred<DispatchResult>();
    const batches: string[][] = [];
    let first = true;
    const dispatch = async (b: Message[]): Promise<DispatchResult> => {
      batches.push(ids(b));
      if (first) {
        first = false;
        return d.promise;
      }
      return 'sent';
    };
    const s = createSendScheduler({ storage: memStorage(), isOnline: () => true, dispatch });
    s.enqueue(msg('a'));
    expect(s.isBusy()).toBe(true);
    s.enqueue(msg('b'));
    d.resolve('sent');
    await vi.waitFor(() => expect(s.pending()).toEqual([]));
    expect(batches).toEqual([['a'], ['b']]);
    expect(s.isBusy()).toBe(false);
  });

  it('U-q-3 message enqueued during runExclusive is dispatched afterwards', async () => {
    const d = deferred<string>();
    const batches: string[][] = [];
    const dispatch = async (b: Message[]): Promise<DispatchResult> => {
      batches.push(ids(b));
      return 'sent';
    };
    const s = createSendScheduler({ storage: memStorage(), isOnline: () => true, dispatch });
    const run = s.runExclusive(() => d.promise);
    s.enqueue(msg('a'));
    expect(batches).toEqual([]);
    d.resolve('greeting');
    expect(await run).toBe('greeting');
    await vi.waitFor(() => expect(batches).toEqual([['a']]));
  });

  it('runExclusive calls run one at a time', async () => {
    const order: string[] = [];
    const d = deferred<void>();
    const s = createSendScheduler({
      storage: memStorage(),
      isOnline: () => true,
      dispatch: async () => 'sent',
    });
    const p1 = s.runExclusive(async () => {
      order.push('1s');
      await d.promise;
      order.push('1e');
    });
    const p2 = s.runExclusive(async () => {
      order.push('2s');
    });
    await Promise.resolve();
    expect(order).toEqual(['1s']);
    d.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['1s', '1e', '2s']);
  });

  it('U-q-4 new scheduler restores the queue and flushes when online', async () => {
    const storage = memStorage();
    createSendScheduler({ storage, isOnline: () => false, dispatch: async () => 'sent' }).enqueue(
      msg('a'),
    );
    const batches: string[][] = [];
    const s2 = createSendScheduler({
      storage,
      isOnline: () => true,
      dispatch: async (b) => {
        batches.push(ids(b));
        return 'sent';
      },
    });
    expect(ids(s2.pending())).toEqual(['a']);
    await s2.flush();
    expect(batches).toEqual([['a']]);
    expect(storage.stored).toEqual([]);
  });

  it('requeue keeps messages and retries after retryMs', async () => {
    const results: DispatchResult[] = ['requeue', 'sent'];
    const dispatch = vi.fn(async (): Promise<DispatchResult> => results.shift() ?? 'sent');
    const storage = memStorage();
    const s = createSendScheduler({ storage, isOnline: () => true, dispatch, retryMs: 5000 });
    s.enqueue(msg('a'));
    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(ids(storage.stored)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(4999);
    expect(dispatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(s.pending()).toEqual([]);
  });

  it('no retry timer while offline', async () => {
    let online = true;
    const dispatch = vi.fn(async (): Promise<DispatchResult> => {
      online = false;
      return 'requeue';
    });
    const s = createSendScheduler({
      storage: memStorage(),
      isOnline: () => online,
      dispatch,
      retryMs: 1000,
    });
    s.enqueue(msg('a'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(s.pending()).toHaveLength(1);
  });

  it('a thrown dispatch counts as requeue', async () => {
    const dispatch = vi.fn(async (): Promise<DispatchResult> => {
      throw new Error('x');
    });
    const s = createSendScheduler({
      storage: memStorage(),
      isOnline: () => true,
      dispatch,
      retryMs: 1000,
    });
    s.enqueue(msg('a'));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.pending()).toHaveLength(1);
    expect(s.isBusy()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('drop removes only the dispatched messages', async () => {
    const d = deferred<DispatchResult>();
    const storage = memStorage();
    let first = true;
    const dispatch = vi.fn(async (): Promise<DispatchResult> => {
      if (first) {
        first = false;
        return d.promise;
      }
      return 'requeue';
    });
    const s = createSendScheduler({ storage, isOnline: () => true, dispatch, retryMs: 1000 });
    s.enqueue(msg('a'));
    s.enqueue(msg('b'));
    d.resolve('drop');
    await vi.advanceTimersByTimeAsync(0);
    expect(ids(storage.stored)).toEqual(['b']);
  });

  it('clear empties queue, storage and retry timer', async () => {
    const storage = memStorage();
    const s = createSendScheduler({
      storage,
      isOnline: () => true,
      dispatch: async () => 'requeue',
      retryMs: 1000,
    });
    s.enqueue(msg('a'));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    s.clear();
    expect(s.pending()).toEqual([]);
    expect(storage.stored).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
