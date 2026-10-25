import { describe, expect, it, vi } from 'vitest';
import { Game, parseMode, type Env } from '../../src/ui/app';
import { createTree, advance as advanceTree } from '../../src/core/tree';
import { load, type StorageLike } from '../../src/core/store';
import {
  BROKEN_KEY_PREFIX,
  GROWTH_STEP_MS,
  SAVE_KEY,
  SAVE_KEY_SPEED,
  UINT32_MAX,
} from '../../src/core/constants';
import type { SaveData } from '../../src/core/types';

const T = Date.UTC(2026, 9, 22, 9);
const HOUR = GROWTH_STEP_MS;

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  sets = 0;
  failSet: ((key: string) => boolean) | null = null;
  failGet = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('SecurityError');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.sets += 1;
    if (this.failSet?.(key)) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
}

function env(storage: FakeStorage, over: Partial<Env> = {}): Env {
  return {
    storage: () => storage,
    randomSeed: () => 4242,
    confirm: () => true,
    ...over,
  };
}

function stored(storage: FakeStorage, key = SAVE_KEY): SaveData {
  const r = load(storage, key);
  if (r.kind !== 'ok') throw new Error(`not ok: ${r.kind}`);
  return r.data;
}

function plantedStorage(now = T, key = SAVE_KEY): FakeStorage {
  const s = new FakeStorage();
  s.map.set(key, JSON.stringify(createTree(7, now)));
  return s;
}

describe('parseMode（?speed の解釈）', () => {
  it('?speed がないときは普段の木（速さ1・通常のキー）になる', () => {
    expect(parseMode('')).toEqual({ key: SAVE_KEY, speed: 1, isSpeed: false, notice: null });
  });

  it.each(['1', '3600', '86400'])('?speed=%s のときはその値で speed のキーになる', (v) => {
    expect(parseMode(`?speed=${v}`)).toEqual({
      key: SAVE_KEY_SPEED,
      speed: Number(v),
      isSpeed: true,
      notice: null,
    });
  });

  it.each(['0', '-1', 'abc', '1.5', 'Infinity', '86401'])(
    '?speed=%s のときは速さ1として知らせを出し、speed のキーを使う',
    (v) => {
      const m = parseMode(`?speed=${v}`);
      expect(m.speed).toBe(1);
      expect(m.key).toBe(SAVE_KEY_SPEED);
      expect(m.isSpeed).toBe(true);
      expect(m.notice).not.toBeNull();
    },
  );
});

describe('起動', () => {
  it('保存データがないときは「種をまく」の状態になり、何も書かない', () => {
    const s = new FakeStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    expect(g.status).toBe('needSeed');
    expect(s.sets).toBe(0);
  });

  it('種をまくと age 0 の木ができて保存される', () => {
    const s = new FakeStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.plant(T);
    expect(g.status).toBe('playing');
    expect(stored(s).age).toBe(0);
    expect(stored(s).seed).toBe(4242);
  });

  it('保存して6時間後に起動すると age が 6 増える（SC-003）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T + 6 * HOUR);
    expect(g.data!.age).toBe(6);
    expect(stored(s).age).toBe(6);
  });

  it('時計が種まきより前に戻っても、age は変わらず、次に開いても読める（SC-004・テストレビュー P0-2）', () => {
    const s = new FakeStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.plant(T);
    const g2 = new Game(parseMode(''), env(s));
    g2.boot(T - 24 * HOUR);
    expect(g2.status).toBe('playing');
    expect(g2.data!.age).toBe(0);
    g2.persist();
    const r = load(s, SAVE_KEY);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.data.age).toBe(0);
      expect(r.data.nodes).toEqual(createTree(4242, T).nodes);
      expect(r.data.water).toBe(createTree(4242, T).water);
    }
  });

  it('speed の木は、保存して24時間後に起動しても age は増えず、lastTickAt が今の時刻になる', () => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T + 24 * HOUR);
    expect(g.data!.age).toBe(0);
    expect(g.data!.lastTickAt).toBe(T + 24 * HOUR);
  });

  it('speed の起動は、通常のキーを読みも書きもしない（FR-013）', () => {
    const s = plantedStorage(T, SAVE_KEY);
    const before = s.map.get(SAVE_KEY);
    const getSpy = vi.spyOn(s, 'getItem');
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T + 6 * HOUR);
    g.plant(T + 6 * HOUR);
    g.tick(T + 6 * HOUR + 10_000);
    g.persist();
    expect(getSpy.mock.calls.every(([k]) => k !== SAVE_KEY)).toBe(true);
    expect(s.map.get(SAVE_KEY)).toBe(before);
  });
});

describe('毎フレームとタブの出入り', () => {
  it('ステップが進んだフレームのあとに保存される（FR-043）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    const sets = s.sets;
    expect(g.tick(T + HOUR - 1)).toBe(0);
    expect(s.sets).toBe(sets);
    expect(g.tick(T + HOUR)).toBe(1);
    expect(s.sets).toBe(sets + 1);
    expect(stored(s).age).toBe(1);
  });

  it('隠れたとき・閉じるとき（persist）に今の状態を書く（FR-043）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.data!.water = 50;
    g.persist();
    expect(stored(s).water).toBe(50);
  });

  it('普段の木が隠れて6時間たって戻ると age が 6 増える（FR-011）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.onVisible(T + 6 * HOUR);
    expect(g.data!.age).toBe(6);
  });

  it('speed の木が隠れて1時間たって戻ると age は変わらず、lastTickAt が今の時刻になる（FR-013）', () => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    g.onVisible(T + HOUR);
    expect(g.data!.age).toBe(0);
    expect(g.data!.lastTickAt).toBe(T + HOUR);
  });
});

describe('壊れた保存データ（FR-044）', () => {
  it('壊れていると broken になり、その後の persist・tick でも何も書かない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    expect(g.status).toBe('broken');
    expect(g.broken!.raw).toBe('{oops');
    g.tick(T + 10 * HOUR);
    g.persist();
    g.onVisible(T + 20 * HOUR);
    expect(s.sets).toBe(0);
    expect(s.map.get(SAVE_KEY)).toBe('{oops');
  });

  it('退避の確認を拒否すると、storage は変わらず、種まきの状態にならない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    const g = new Game(parseMode(''), env(s, { confirm: () => false }));
    g.boot(T);
    expect(g.backupAndRestart(T)).toBe(false);
    expect([...s.map.keys()]).toEqual([SAVE_KEY]);
    expect(s.map.get(SAVE_KEY)).toBe('{oops');
    expect(g.status).toBe('broken');
  });

  it('退避に同意すると、元の文字列が broken キーに写り、種まきの状態になる', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    expect(g.backupAndRestart(T)).toBe(true);
    expect(s.map.get(`${BROKEN_KEY_PREFIX}${T}`)).toBe('{oops');
    expect(s.map.get(SAVE_KEY)).toBe('{oops');
    expect(g.status).toBe('needSeed');
    g.plant(T);
    expect(stored(s).age).toBe(0);
  });

  it('退避の書き込みだけが失敗すると、元のキーはそのままで知らせが出て、種まきの状態にならない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    s.failSet = (k) => k.startsWith(BROKEN_KEY_PREFIX);
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    expect(g.backupAndRestart(T)).toBe(false);
    expect(s.map.get(SAVE_KEY)).toBe('{oops');
    expect(g.status).toBe('broken');
    expect(g.warning).not.toBeNull();
  });
});

describe('保存できないとき（FR-045）', () => {
  it('種まきの保存に失敗しても木は植わり、警告の状態になる', () => {
    const s = new FakeStorage();
    s.failSet = () => true;
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.plant(T);
    expect(g.status).toBe('playing');
    expect(g.warning).not.toBeNull();
  });

  it('localStorage を読むと例外が出るときは、起動はエラーにならず、以後一切書かない', () => {
    const s = new FakeStorage();
    s.failGet = true;
    const g = new Game(parseMode(''), env(s));
    expect(() => g.boot(T)).not.toThrow();
    expect(g.status).toBe('needSeed');
    expect(g.warning).not.toBeNull();
    g.plant(T);
    g.tick(T + 2 * HOUR);
    g.persist();
    expect(s.sets).toBe(0);
  });

  it('window.localStorage に触れること自体が例外を出すときも、起動はエラーにならない', () => {
    const g = new Game(parseMode(''), {
      ...env(new FakeStorage()),
      storage: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => g.boot(T)).not.toThrow();
    expect(g.warning).not.toBeNull();
    g.plant(T);
    expect(g.status).toBe('playing');
  });
});

describe('__bonsai.advance（advanceHours）', () => {
  function playing(): { g: Game; s: FakeStorage } {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    return { g, s };
  }

  it.each([-1, NaN, Infinity, 10001])('%s のときは何もしない', (h) => {
    const { g } = playing();
    expect(g.advanceHours(h)).toBeNull();
    expect(g.data!.age).toBe(0);
  });

  it('0 → 0 ステップ、1.5 → 1 ステップ。lastTickAt は変わらず、保存される', () => {
    const { g, s } = playing();
    expect(g.advanceHours(0)).toBe(0);
    expect(g.advanceHours(1.5)).toBe(1);
    expect(g.data!.age).toBe(1);
    expect(g.data!.lastTickAt).toBe(T);
    expect(stored(s).age).toBe(1);
  });

  it('10000 → 10,000 ステップ（上限ちょうど）', () => {
    const { g } = playing();
    const stepper = vi.fn();
    expect(g.advanceHours(10000, stepper)).toBe(10000);
    expect(stepper).toHaveBeenCalledTimes(10000);
  });
});

describe('__bonsai.plant（replant）', () => {
  it('普段の木では何もしない', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    advanceTree(g.data!, 3);
    expect(g.replant(T, 1)).toBe(false);
    expect(g.data!.age).toBe(3);
  });

  it.each([0, UINT32_MAX])('speed の木では seed %i で age 0 に植え直す', (seed) => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    g.advanceHours(5);
    expect(g.replant(T, seed)).toBe(true);
    expect(g.data!.age).toBe(0);
    expect(g.data!.seed).toBe(seed);
    expect(stored(s, SAVE_KEY_SPEED).seed).toBe(seed);
  });

  it.each([-1, UINT32_MAX + 1, 1.5])('seed %s では何もしない', (seed) => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    expect(g.replant(T, seed)).toBe(false);
    expect(g.data!.seed).toBe(7);
  });

  it('seed を省くと randomSeed で植え直す', () => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    expect(g.replant(T)).toBe(true);
    expect(g.data!.seed).toBe(4242);
  });
});

describe('実装レビューの P1 への対応', () => {
  it('③ speed の木で 1 フレームの間が 1 秒を超えたら、止まっていた扱いにして進めない', () => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=86400'), env(s));
    g.boot(T);
    g.tick(T + 500);
    const age = g.data!.age;
    expect(g.tick(T + 500 + HOUR)).toBe(0);
    expect(g.data!.age).toBe(age);
    expect(g.data!.lastTickAt).toBe(T + 500 + HOUR);
  });

  it('③ speed の木で 1 フレームの間が 1 秒以内なら、そのぶん進む', () => {
    const s = plantedStorage(T, SAVE_KEY_SPEED);
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    g.tick(T + 500);
    expect(g.tick(T + 1500)).toBe(1);
  });

  it('③ 普段の木は 1 フレームの間が長くても、そのぶん進む（FR-002）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.tick(T + 500);
    expect(g.tick(T + 500 + 3 * HOUR)).toBe(3);
  });

  it('④ 退避に一度失敗したあと成功したら、失敗の知らせは消える', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    let fail = true;
    s.failSet = (k) => k.startsWith(BROKEN_KEY_PREFIX) && fail;
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    expect(g.backupAndRestart(T)).toBe(false);
    expect(g.warning).not.toBeNull();
    fail = false;
    expect(g.backupAndRestart(T + 1)).toBe(true);
    g.plant(T + 1);
    expect(g.warning).toBeNull();
  });

  it('④ 保存に失敗したあと次の保存が成功したら、警告は消える（FR-045）', () => {
    const s = plantedStorage();
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    s.failSet = () => true;
    g.persist();
    expect(g.warning).not.toBeNull();
    s.failSet = null;
    g.persist();
    expect(g.warning).toBeNull();
  });

  it('⑤ 壊れた保存データのあと、plant・replant・advanceHours でも何も書かない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY_SPEED, '{oops');
    const g = new Game(parseMode('?speed=3600'), env(s));
    g.boot(T);
    expect(g.replant(T, 1)).toBe(false);
    expect(g.advanceHours(5)).toBeNull();
    g.plant(T);
    expect(g.status).toBe('broken');
    expect(s.sets).toBe(0);
    expect(s.map.get(SAVE_KEY_SPEED)).toBe('{oops');
  });

  it('⑤ 退避に失敗したあとに plant を呼んでも何も書かない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    s.failSet = (k) => k.startsWith(BROKEN_KEY_PREFIX);
    const g = new Game(parseMode(''), env(s));
    g.boot(T);
    g.backupAndRestart(T);
    const sets = s.sets;
    g.plant(T);
    expect(s.sets).toBe(sets);
    expect(s.map.get(SAVE_KEY)).toBe('{oops');
  });
});
