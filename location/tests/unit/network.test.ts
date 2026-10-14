import { describe, expect, it } from 'vitest';
import { createNetworkMonitor } from '../../src/chat/network';

function setup(onLine = true) {
  const nav = { onLine };
  const handlers = { online: new Set<() => void>(), offline: new Set<() => void>() };
  const target = {
    addEventListener: (t: 'online' | 'offline', cb: () => void) => void handlers[t].add(cb),
    removeEventListener: (t: 'online' | 'offline', cb: () => void) => void handlers[t].delete(cb),
  };
  const fire = (t: 'online' | 'offline') => {
    nav.onLine = t === 'online';
    [...handlers[t]].forEach((cb) => cb());
  };
  const mon = createNetworkMonitor({ navigator: nav, target });
  const calls: boolean[] = [];
  mon.onChange((o) => calls.push(o));
  return { mon, fire, calls, handlers };
}

describe('network monitor', () => {
  it('follows online/offline events', () => {
    const { mon, fire, calls } = setup();
    fire('offline');
    expect(mon.isOnline()).toBe(false);
    fire('online');
    expect(mon.isOnline()).toBe(true);
    expect(calls).toEqual([false, true]);
  });

  it('markUnreachable goes offline until an online event', () => {
    const { mon, fire, calls } = setup();
    mon.markUnreachable();
    expect(mon.isOnline()).toBe(false);
    fire('online');
    expect(mon.isOnline()).toBe(true);
    expect(calls).toEqual([false, true]);
  });

  it('does not notify duplicates', () => {
    const { mon, fire, calls } = setup();
    fire('offline');
    fire('offline');
    mon.markUnreachable();
    fire('online');
    fire('online');
    expect(calls).toEqual([false, true]);
  });

  it('unsubscribe and dispose', () => {
    const { mon, fire, calls, handlers } = setup();
    const calls2: boolean[] = [];
    const off = mon.onChange((o) => calls2.push(o));
    off();
    fire('offline');
    expect(calls2).toEqual([]);
    mon.dispose();
    expect(handlers.online.size + handlers.offline.size).toBe(0);
    fire('online');
    expect(calls).toEqual([false]);
  });
});
