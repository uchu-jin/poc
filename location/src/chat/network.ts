type NetEvent = 'online' | 'offline';

export interface NetworkMonitor {
  isOnline(): boolean;
  markUnreachable(): void;
  onChange(cb: (online: boolean) => void): () => void;
  dispose(): void;
}

export function createNetworkMonitor(opts: {
  navigator: { onLine: boolean };
  target: {
    addEventListener(type: NetEvent, cb: () => void): void;
    removeEventListener(type: NetEvent, cb: () => void): void;
  };
}): NetworkMonitor {
  let unreachable = false;
  const listeners = new Set<(online: boolean) => void>();
  const current = (): boolean => opts.navigator.onLine && !unreachable;
  let last = current();

  const update = (): void => {
    const now = current();
    if (now === last) return;
    last = now;
    for (const cb of [...listeners]) cb(now);
  };

  const onOnline = (): void => {
    unreachable = false;
    update();
  };
  const onOffline = (): void => update();

  opts.target.addEventListener('online', onOnline);
  opts.target.addEventListener('offline', onOffline);

  return {
    isOnline: current,
    markUnreachable() {
      unreachable = true;
      update();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      opts.target.removeEventListener('online', onOnline);
      opts.target.removeEventListener('offline', onOffline);
      listeners.clear();
    },
  };
}
