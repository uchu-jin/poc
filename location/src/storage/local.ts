import type { AppLocation, LatLng, Message } from '../domain/types';

const PREFIX = 'michisugara:v1:';
export const MESSAGE_LIMIT = 100;
const DROP_CHUNK = 20;

const KEYS = {
  messages: 'messages',
  lastLocation: 'lastLocation',
  queue: 'queue',
  lastGreetingAt: 'lastGreetingAt',
  lastGreetingLocation: 'lastGreetingLocation',
} as const;

type KeyName = (typeof KEYS)[keyof typeof KEYS];

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

interface Backend {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  keys(): string[];
}

function wrapStorage(s: Storage): Backend {
  return {
    getItem: (k) => s.getItem(k),
    setItem: (k, v) => s.setItem(k, v),
    removeItem: (k) => s.removeItem(k),
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: unknown; code?: unknown };
  return err.name === 'QuotaExceededError' || err.code === 22;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isMessageArray = (v: unknown): v is Message[] =>
  Array.isArray(v) &&
  v.every((m) => isObj(m) && typeof m.id === 'string' && typeof m.text === 'string');
const isLatLng = (v: unknown): v is LatLng =>
  isObj(v) && typeof v.lat === 'number' && typeof v.lng === 'number';
const isAppLocation = (v: unknown): v is AppLocation => isLatLng(v);

export function createStorage(backend?: Storage | null, now: () => number = () => Date.now()) {
  let store: Backend;
  try {
    if (!backend) throw new Error('no backend');
    const wrapped = wrapStorage(backend);
    wrapped.getItem(`${PREFIX}probe`);
    store = wrapped;
  } catch {
    store = new MemoryStorage();
  }

  const k = (name: KeyName): string => PREFIX + name;

  function safeSet(name: KeyName, value: string): boolean {
    try {
      store.setItem(k(name), value);
      return true;
    } catch {
      return false;
    }
  }

  function readRaw(name: KeyName): string | null {
    try {
      return store.getItem(k(name));
    } catch {
      return null;
    }
  }

  function quarantine(name: KeyName, raw: string): void {
    try {
      store.setItem(`${PREFIX}corrupt-${now()}`, raw);
    } catch {
      // ignore
    }
    try {
      store.removeItem(k(name));
    } catch {
      // ignore
    }
  }

  function load<T>(name: KeyName, valid: (v: unknown) => v is T, fallback: T): T {
    const raw = readRaw(name);
    if (raw === null) return fallback;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed)) return parsed;
    } catch {
      // fall through
    }
    quarantine(name, raw);
    return fallback;
  }

  function saveMessageArray(name: KeyName, messages: Message[]): void {
    let list = messages.slice(-MESSAGE_LIMIT);
    for (;;) {
      try {
        store.setItem(k(name), JSON.stringify(list));
        return;
      } catch (e) {
        if (!isQuotaError(e) || list.length === 0) return;
        list = list.slice(DROP_CHUNK);
      }
    }
  }

  const isString = (v: unknown): v is string => typeof v === 'string';

  return {
    loadMessages: (): Message[] => load(KEYS.messages, isMessageArray, []),
    saveMessages: (m: Message[]): void => saveMessageArray(KEYS.messages, m),
    loadLastLocation: (): AppLocation | null =>
      load<AppLocation | null>(KEYS.lastLocation, isAppLocation, null),
    saveLastLocation: (l: AppLocation): void => {
      safeSet(KEYS.lastLocation, JSON.stringify(l));
    },
    loadQueue: (): Message[] => load(KEYS.queue, isMessageArray, []),
    saveQueue: (q: Message[]): void => {
      safeSet(KEYS.queue, JSON.stringify(q));
    },
    loadLastGreeting: (): { at: string; location: LatLng } | null => {
      const at = load<string | null>(KEYS.lastGreetingAt, isString, null);
      const location = load<LatLng | null>(KEYS.lastGreetingLocation, isLatLng, null);
      return at !== null && location !== null ? { at, location } : null;
    },
    saveLastGreeting: (g: { at: string; location: LatLng }): void => {
      safeSet(KEYS.lastGreetingAt, JSON.stringify(g.at));
      safeSet(
        KEYS.lastGreetingLocation,
        JSON.stringify({ lat: g.location.lat, lng: g.location.lng }),
      );
    },
    clearAll: (): void => {
      try {
        for (const key of store.keys()) {
          if (key.startsWith(PREFIX)) store.removeItem(key);
        }
      } catch {
        // ignore
      }
    },
  };
}
