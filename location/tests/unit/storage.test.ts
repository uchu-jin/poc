import { describe, expect, it } from 'vitest';
import { createStorage, MESSAGE_LIMIT } from '../../src/storage/local';
import type { AppLocation, Message } from '../../src/domain/types';

class FakeStorage implements Storage {
  map = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    let total = v.length;
    for (const [key, val] of this.map) if (key !== k) total += key.length + val.length;
    if (total + k.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(k, v);
  }
}

const P = 'michisugara:v1:';
const mk = (i: number, text = `m${i}`): Message => ({
  id: `id${i}`,
  role: i % 2 === 0 ? 'user' : 'assistant',
  text,
  ts: '2026-10-13T00:00:00.000Z',
  status: 'sent',
});
const many = (count: number, text?: string) => Array.from({ length: count }, (_, i) => mk(i, text));

describe('storage', () => {
  it('U-st-1: roundtrip for all keys', () => {
    const s = createStorage(new FakeStorage());
    const loc: AppLocation = { lat: 35.1, lng: 139.2, source: 'gps', accuracy: 12, at: 'x' };
    s.saveMessages(many(3));
    s.saveLastLocation(loc);
    s.saveQueue([mk(9)]);
    s.saveLastGreeting({ at: '2026-10-13T00:00:00.000Z', location: { lat: 1, lng: 2 } });
    expect(s.loadMessages()).toEqual(many(3));
    expect(s.loadLastLocation()).toEqual(loc);
    expect(s.loadQueue()).toEqual([mk(9)]);
    expect(s.loadLastGreeting()).toEqual({
      at: '2026-10-13T00:00:00.000Z',
      location: { lat: 1, lng: 2 },
    });
  });

  it('defaults when empty', () => {
    const s = createStorage(new FakeStorage());
    expect(s.loadMessages()).toEqual([]);
    expect(s.loadLastLocation()).toBeNull();
    expect(s.loadQueue()).toEqual([]);
    expect(s.loadLastGreeting()).toBeNull();
  });

  it('U-st-2: corrupt JSON is backed up and defaulted', () => {
    const fake = new FakeStorage();
    fake.setItem(`${P}messages`, '{not json');
    fake.setItem(`${P}lastLocation`, '{"lat":"x","lng":1}');
    const s = createStorage(fake, () => 1234);
    expect(s.loadMessages()).toEqual([]);
    expect(fake.getItem(`${P}corrupt-1234`)).toBe('{not json');
    expect(fake.getItem(`${P}messages`)).toBeNull();
    expect(s.loadLastLocation()).toBeNull();
    expect(fake.getItem(`${P}lastLocation`)).toBeNull();
  });

  it('U-st-3: quota drops oldest in chunks of 20 and keeps what fits', () => {
    const fake = new FakeStorage(6000);
    const s = createStorage(fake);
    s.saveMessages(many(100, 'x'.repeat(100)));
    const loaded = s.loadMessages();
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.length).toBeLessThan(100);
    expect((100 - loaded.length) % 20).toBe(0);
    expect(loaded[loaded.length - 1]?.id).toBe('id99');
  });

  it('quota never throws, even when nothing fits', () => {
    const s = createStorage(new FakeStorage(10));
    expect(() => s.saveMessages(many(5))).not.toThrow();
    expect(() => s.saveLastLocation({ lat: 1, lng: 2, source: 'gps', at: 'x' })).not.toThrow();
  });

  it('U-st-4: keeps 100, drops oldest at 101', () => {
    const s = createStorage(new FakeStorage());
    s.saveMessages(many(MESSAGE_LIMIT));
    expect(s.loadMessages()).toHaveLength(100);
    s.saveMessages(many(101));
    const loaded = s.loadMessages();
    expect(loaded).toHaveLength(100);
    expect(loaded[0]?.id).toBe('id1');
    expect(loaded[99]?.id).toBe('id100');
  });

  it('U-st-5: throwing or null backend falls back to memory', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    for (const backend of [bad, null, undefined]) {
      const s = createStorage(backend);
      s.saveMessages(many(2));
      expect(s.loadMessages()).toEqual(many(2));
    }
  });

  it('clearAll removes prefixed keys only', () => {
    const fake = new FakeStorage();
    fake.setItem('other', '1');
    fake.setItem(`${P}corrupt-1`, 'x');
    const s = createStorage(fake);
    s.saveMessages(many(2));
    s.saveQueue([]);
    s.clearAll();
    expect([...fake.map.keys()]).toEqual(['other']);
  });
});
