import { describe, expect, it } from 'vitest';
import { backupBroken, load, parseSave, save, type StorageLike } from '../../src/core/store';
import {
  BROKEN_KEY_PREFIX,
  SAVE_KEY,
  SAVE_KEY_SPEED,
  SAVE_LIMIT_LEAVES,
  SAVE_LIMIT_NODES,
  TIME_CEIL,
  TIME_FLOOR,
  UINT32_MAX,
} from '../../src/core/constants';
import type { SaveData } from '../../src/core/types';

/** 偽の storage。setItem の回数を数え、例外を投げさせられる */
class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  setCalls = 0;
  throwOnGet = false;
  throwOnSet: ((key: string) => boolean) | null = null;
  getItem(key: string): string | null {
    if (this.throwOnGet) throw new Error('get denied');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.throwOnSet?.(key)) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
}

/** 型どおりの小さな保存データ（根元＋子1つ） */
function makeValid(): SaveData {
  return {
    version: 1,
    seed: 42,
    rngState: 7,
    createdAt: TIME_FLOOR + 1000,
    lastTickAt: TIME_FLOOR + 2000,
    age: 3,
    water: 80,
    traits: { straightness: 0.5, branchiness: 0.5, spread: 0.5, leafSize: 0.5 },
    nextId: 2,
    nodes: [
      {
        id: 0,
        parent: -1,
        pos: [0, 0, 0],
        dir: [0, 1, 0],
        length: 0.01,
        radius: 0.005,
        bornAge: 0,
        bud: false,
        boostUntil: null,
        wire: null,
        leaves: [],
      },
      {
        id: 1,
        parent: 0,
        pos: [0, 0.01, 0],
        dir: [0, 1, 0],
        length: 0.01,
        radius: 0.004,
        bornAge: 1,
        bud: true,
        boostUntil: null,
        wire: null,
        leaves: [{ size: 1, regrowAt: null }],
      },
    ],
  };
}

// 壊すための入れ物なので any を許す
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mutable = Record<string, any>;

/** 正しいデータを1か所だけ壊して文字列にする */
function broken(mutate: (d: Mutable) => void): string {
  const d = makeValid() as unknown as Mutable;
  mutate(d);
  return JSON.stringify(d);
}

function isOk(text: string): boolean {
  return parseSave(text).kind === 'ok';
}

describe('parseSave: 正しいデータ', () => {
  it('型どおりのデータのとき、ok で同じ値が返る', () => {
    const r = parseSave(JSON.stringify(makeValid()));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.data).toEqual(makeValid());
  });

  it('lastTickAt が createdAt より前のとき、ok となる（大小は見ない）', () => {
    expect(
      isOk(
        broken((d) => {
          d.createdAt = TIME_FLOOR + 5000;
          d.lastTickAt = TIME_FLOOR;
        }),
      ),
    ).toBe(true);
  });

  it('未知の項目があるとき、ok だが返る値には含まれない', () => {
    const r = parseSave(
      broken((d) => {
        d.extra = 'x';
      }),
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect('extra' in r.data).toBe(false);
  });
});

describe('parseSave: 壊れた入力', () => {
  it('壊れた JSON のとき、invalid となる', () => {
    const r = parseSave('{not json');
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.reason.length).toBeGreaterThan(0);
  });

  it('空文字列のとき、invalid となる', () => {
    expect(parseSave('').kind).toBe('invalid');
  });

  it.each([['null'], ['[]'], ['123'], ['"x"']])('直下が %s のとき、invalid となる', (t) => {
    expect(parseSave(t).kind).toBe('invalid');
  });

  it('version が 2 のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.version = 2;
        }),
      ),
    ).toBe(false);
  });

  it('nextId がないとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          delete d.nextId;
        }),
      ),
    ).toBe(false);
  });

  it('age が文字列のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.age = '1';
        }),
      ),
    ).toBe(false);
  });

  it('nodes が空のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes = [];
        }),
      ),
    ).toBe(false);
  });

  it('先頭が根元でない（parent が −1 でない）とき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[0].parent = 0;
        }),
      ),
    ).toBe(false);
  });

  it('根元が2つあるとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].parent = -1;
        }),
      ),
    ).toBe(false);
  });

  it('id が小さい順でないとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[0].id = 5;
          d.nodes[1].parent = 5;
          d.nextId = 6;
        }),
      ),
    ).toBe(false);
  });

  it('id が重複しているとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].id = 0;
        }),
      ),
    ).toBe(false);
  });

  it('parent が存在しない id を指すとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].parent = 99;
        }),
      ),
    ).toBe(false);
  });

  it('parent が後ろの節を指すとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes.push({ ...d.nodes[1], id: 2, parent: 3 });
          d.nextId = 3;
        }),
      ),
    ).toBe(false);
  });

  it('parent が自分自身を指すとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].parent = 1;
        }),
      ),
    ).toBe(false);
  });

  it('bornAge が age より大きいとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].bornAge = 4;
        }),
      ),
    ).toBe(false);
  });

  it('bornAge がちょうど age のとき、ok となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].bornAge = 3;
        }),
      ),
    ).toBe(true);
  });

  it('bud が真偽値でないとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].bud = 1;
        }),
      ),
    ).toBe(false);
  });

  it('dir の長さが 0 のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].dir = [0, 0, 0];
        }),
      ),
    ).toBe(false);
  });

  it('pos の要素が 3 つでないとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].pos = [0, 0];
        }),
      ),
    ).toBe(false);
  });
});

describe('parseSave: 有限でない数', () => {
  const finite = JSON.stringify(makeValid());
  it.each([
    ['1e999', '"pos":[0,0.01,0]', '"pos":[1e999,0,0]'],
    ['-1e999', '"pos":[0,0.01,0]', '"pos":[-1e999,0,0]'],
    [
      'dir',
      '"dir":[0,1,0],"length":0.01,"radius":0.004',
      '"dir":[1e999,1,0],"length":0.01,"radius":0.004',
    ],
    ['length', '"length":0.01,"radius":0.004', '"length":1e999,"radius":0.004'],
    ['water', '"water":80', '"water":1e999'],
    ['age', '"age":3', '"age":1e999'],
  ])('%s のように Infinity になる書き方のとき、invalid となる', (_n, from, to) => {
    expect(finite).toContain(from);
    const text = finite.replace(from, to);
    expect(JSON.parse(text)).toBeDefined();
    expect(parseSave(text).kind).toBe('invalid');
  });
});

describe('parseSave: 範囲の境界', () => {
  const cases: Array<[string, (d: Mutable, v: number) => void, number[], number[]]> = [
    [
      'water',
      (d, v) => {
        d.water = v;
      },
      [0, 100],
      [-1, 101],
    ],
    [
      'water が整数でない',
      (d, v) => {
        d.water = v;
      },
      [],
      [50.5],
    ],
    [
      'traits.straightness',
      (d, v) => {
        d.traits.straightness = v;
      },
      [0, 1],
      [-0.0001, 1.0001],
    ],
    [
      'traits.branchiness',
      (d, v) => {
        d.traits.branchiness = v;
      },
      [0, 1],
      [-0.0001, 1.0001],
    ],
    [
      'traits.spread',
      (d, v) => {
        d.traits.spread = v;
      },
      [0, 1],
      [-0.0001, 1.0001],
    ],
    [
      'traits.leafSize',
      (d, v) => {
        d.traits.leafSize = v;
      },
      [0, 1],
      [-0.0001, 1.0001],
    ],
    [
      'age',
      (d, v) => {
        d.age = v;
      },
      [3, 4],
      [-1, 1.5],
    ],
    [
      'seed',
      (d, v) => {
        d.seed = v;
      },
      [0, UINT32_MAX],
      [-1, UINT32_MAX + 1],
    ],
    [
      'rngState',
      (d, v) => {
        d.rngState = v;
      },
      [0, UINT32_MAX],
      [-1, UINT32_MAX + 1],
    ],
    [
      'createdAt',
      (d, v) => {
        d.createdAt = v;
      },
      [TIME_FLOOR, TIME_CEIL],
      [TIME_FLOOR - 1, TIME_CEIL + 1],
    ],
    [
      'lastTickAt',
      (d, v) => {
        d.lastTickAt = v;
      },
      [TIME_FLOOR, TIME_CEIL],
      [TIME_FLOOR - 1, TIME_CEIL + 1],
    ],
    [
      'lastTickAt が小数',
      (d, v) => {
        d.lastTickAt = v;
      },
      [],
      [TIME_FLOOR + 0.5],
    ],
    [
      'length',
      (d, v) => {
        d.nodes[1].length = v;
      },
      [0],
      [-1e-9],
    ],
    [
      'radius',
      (d, v) => {
        d.nodes[1].radius = v;
      },
      [0.0001],
      [0, -0.001],
    ],
    [
      'boostUntil',
      (d, v) => {
        d.nodes[1].boostUntil = v;
      },
      [0],
      [-1, 1.5],
    ],
    [
      '葉の size',
      (d, v) => {
        d.nodes[1].leaves[0].size = v;
      },
      [2],
      [0, 2.0001],
    ],
    [
      '葉の regrowAt',
      (d, v) => {
        d.nodes[1].leaves[0].regrowAt = v;
      },
      [0],
      [-1, 1.5],
    ],
    [
      'nextId',
      (d, v) => {
        d.nextId = v;
      },
      [2],
      [1, 0],
    ],
  ];
  for (const [name, set, oks, ngs] of cases) {
    for (const v of oks) {
      it(`${name} が ${v} のとき、ok となる`, () => {
        expect(isOk(broken((d) => set(d, v)))).toBe(true);
      });
    }
    for (const v of ngs) {
      it(`${name} が ${v} のとき、invalid となる`, () => {
        expect(isOk(broken((d) => set(d, v)))).toBe(false);
      });
    }
  }

  it('boostUntil と regrowAt が null のとき、ok となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].boostUntil = null;
          d.nodes[1].leaves[0].regrowAt = null;
        }),
      ),
    ).toBe(true);
  });

  it('nextId が最大の id+1 より大きいとき、ok となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nextId = 100;
        }),
      ),
    ).toBe(true);
  });

  const wire = (axis: number[], angle: number) => ({ until: 10, axis, angle });
  it('wire.angle が π のとき、ok となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = wire([0, 1, 0], Math.PI);
        }),
      ),
    ).toBe(true);
  });
  it('wire.angle が π+1e-9 のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = wire([0, 1, 0], Math.PI + 1e-9);
        }),
      ),
    ).toBe(false);
  });
  it('wire.angle が負のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = wire([0, 1, 0], -0.1);
        }),
      ),
    ).toBe(false);
  });
  it('wire.axis の長さが 1+1e-7 のとき、ok となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = wire([0, 1 + 1e-7, 0], 1);
        }),
      ),
    ).toBe(true);
  });
  it('wire.axis の長さが 1+1e-5 のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = wire([0, 1 + 1e-5, 0], 1);
        }),
      ),
    ).toBe(false);
  });
  it('wire.until が負のとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          d.nodes[1].wire = { until: -1, axis: [0, 1, 0], angle: 1 };
        }),
      ),
    ).toBe(false);
  });

  function withNodes(count: number): string {
    return broken((d) => {
      d.nodes = [d.nodes[0]];
      for (let i = 1; i < count; i++) d.nodes.push({ ...d.nodes[0], id: i, parent: 0, bornAge: 0 });
      d.nextId = count;
    });
  }
  it('節が 3,001 個のとき、ok となる（成長の上限を超えても読める）', () => {
    expect(isOk(withNodes(3001))).toBe(true);
  });
  it('節が SAVE_LIMIT_NODES 個のとき、ok となる', () => {
    expect(isOk(withNodes(SAVE_LIMIT_NODES))).toBe(true);
  });
  it('節が SAVE_LIMIT_NODES+1 個のとき、invalid となる', () => {
    expect(isOk(withNodes(SAVE_LIMIT_NODES + 1))).toBe(false);
  });

  function withLeaves(total: number): string {
    return broken((d) => {
      d.nodes[0].leaves = Array.from({ length: total }, () => ({ size: 1, regrowAt: null }));
      d.nodes[1].leaves = [];
    });
  }
  it('葉が SAVE_LIMIT_LEAVES 枚のとき、ok となる', () => {
    expect(isOk(withLeaves(SAVE_LIMIT_LEAVES))).toBe(true);
  });
  it('葉が SAVE_LIMIT_LEAVES+1 枚のとき、invalid となる', () => {
    expect(isOk(withLeaves(SAVE_LIMIT_LEAVES + 1))).toBe(false);
  });
  it('葉が複数の節にまたがって合計で上限を超えるとき、invalid となる', () => {
    expect(
      isOk(
        broken((d) => {
          const half = SAVE_LIMIT_LEAVES / 2 + 1;
          d.nodes[0].leaves = Array.from({ length: half }, () => ({ size: 1, regrowAt: null }));
          d.nodes[1].leaves = Array.from({ length: half }, () => ({ size: 1, regrowAt: null }));
        }),
      ),
    ).toBe(false);
  });
});

describe('load', () => {
  it('未保存のとき、empty となる', () => {
    expect(load(new FakeStorage(), SAVE_KEY)).toEqual({ kind: 'empty' });
  });

  it('保存したものを読むとき、同じ値が返る', () => {
    const s = new FakeStorage();
    expect(save(s, SAVE_KEY, makeValid())).toEqual({ ok: true });
    const r = load(s, SAVE_KEY);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.data).toEqual(makeValid());
  });

  it('壊れた JSON のとき、invalid で raw に元の文字列が入り、setItem を呼ばない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, '{oops');
    const r = load(s, SAVE_KEY);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') {
      expect(r.raw).toBe('{oops');
      expect(r.reason.length).toBeGreaterThan(0);
    }
    expect(s.setCalls).toBe(0);
  });

  it('version が 2 のとき、invalid で raw に元の文字列が入り、setItem を呼ばない', () => {
    const s = new FakeStorage();
    const text = broken((d) => {
      d.version = 2;
    });
    s.map.set(SAVE_KEY, text);
    const r = load(s, SAVE_KEY);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.raw).toBe(text);
    expect(s.setCalls).toBe(0);
    expect(s.map.get(SAVE_KEY)).toBe(text);
  });

  it('getItem が例外を出すとき、load は例外をそのまま投げる', () => {
    const s = new FakeStorage();
    s.throwOnGet = true;
    expect(() => load(s, SAVE_KEY)).toThrow('get denied');
  });

  it('通常のキーと speed のキーが混ざらない', () => {
    const s = new FakeStorage();
    const normal = makeValid();
    const speed = { ...makeValid(), age: 99 };
    save(s, SAVE_KEY, normal);
    save(s, SAVE_KEY_SPEED, speed);
    const a = load(s, SAVE_KEY);
    const b = load(s, SAVE_KEY_SPEED);
    expect(a.kind === 'ok' && a.data.age).toBe(3);
    expect(b.kind === 'ok' && b.data.age).toBe(99);
  });
});

describe('save', () => {
  it('setItem が例外を出すとき、ok:false と reason を返し、例外を外に出さない', () => {
    const s = new FakeStorage();
    s.throwOnSet = () => true;
    const r = save(s, SAVE_KEY, makeValid());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});

describe('backupBroken', () => {
  it('成功のとき、プレフィックス+now のキーに元の文字列をそのまま書き、元のキーには触らない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, 'original');
    const raw = '<img src=x onerror="window.__xss=1">';
    const r = backupBroken(s, raw, 1234567890123);
    expect(r).toEqual({ ok: true, key: BROKEN_KEY_PREFIX + 1234567890123 });
    expect(s.map.get(BROKEN_KEY_PREFIX + 1234567890123)).toBe(raw);
    expect(s.map.get(SAVE_KEY)).toBe('original');
    expect(s.setCalls).toBe(1);
  });

  it('書き込みが失敗するとき、ok:false と reason を返し、元のキーは変わらない', () => {
    const s = new FakeStorage();
    s.map.set(SAVE_KEY, 'original');
    s.throwOnSet = (k) => k.startsWith(BROKEN_KEY_PREFIX);
    const r = backupBroken(s, 'original', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    expect(s.map.get(SAVE_KEY)).toBe('original');
    expect([...s.map.keys()]).toEqual([SAVE_KEY]);
  });
});

describe('parseSave: 値の大きさの上限（実装レビュー P1-①②）', () => {
  it.each([
    [
      'pos の絶対値',
      (d: Mutable) => (d.nodes[1].pos = [1000, 0, 0]),
      (d: Mutable) => (d.nodes[1].pos = [1000.001, 0, 0]),
    ],
    [
      'pos の負の絶対値',
      (d: Mutable) => (d.nodes[1].pos = [0, -1000, 0]),
      (d: Mutable) => (d.nodes[1].pos = [0, -1000.001, 0]),
    ],
    [
      'length',
      (d: Mutable) => (d.nodes[1].length = 10),
      (d: Mutable) => (d.nodes[1].length = 10.001),
    ],
    [
      'radius',
      (d: Mutable) => (d.nodes[1].radius = 10),
      (d: Mutable) => (d.nodes[1].radius = 10.001),
    ],
    ['age', (d: Mutable) => (d.age = 1e9), (d: Mutable) => (d.age = 1e9 + 1)],
    ['nextId', (d: Mutable) => (d.nextId = 1e9), (d: Mutable) => (d.nextId = 1e9 + 1)],
    [
      'boostUntil',
      (d: Mutable) => (d.nodes[1].boostUntil = 1e9),
      (d: Mutable) => (d.nodes[1].boostUntil = 1e9 + 1),
    ],
    [
      'regrowAt',
      (d: Mutable) => (d.nodes[1].leaves[0].regrowAt = 1e9),
      (d: Mutable) => (d.nodes[1].leaves[0].regrowAt = 1e9 + 1),
    ],
  ])('%s：上限ちょうどは ok、超えると invalid になる', (_name, okMut, ngMut) => {
    expect(isOk(broken(okMut))).toBe(true);
    expect(isOk(broken(ngMut))).toBe(false);
  });

  it('wire.until の上限ちょうどは ok、超えると invalid になる', () => {
    const wire = (until: number) => (d: Mutable) =>
      (d.nodes[1].wire = { until, axis: [0, 0, 1], angle: 0.3 });
    expect(isOk(broken(wire(1e9)))).toBe(true);
    expect(isOk(broken(wire(1e9 + 1)))).toBe(false);
  });

  it('dir の長さが 1 から 1e-6 以内なら ok、外れると invalid になる', () => {
    expect(isOk(broken((d) => (d.nodes[1].dir = [0, 1 + 1e-7, 0])))).toBe(true);
    expect(isOk(broken((d) => (d.nodes[1].dir = [0, 1 + 1e-5, 0])))).toBe(false);
    expect(isOk(broken((d) => (d.nodes[1].dir = [0, 0.5, 0])))).toBe(false);
  });

  it('id が負の数のとき invalid になる（根元が2つになるのを防ぐ）', () => {
    const text = JSON.stringify({
      ...makeValid(),
      nextId: 1,
      nodes: [
        { ...makeValid().nodes[0]!, id: -2, parent: -1 },
        { ...makeValid().nodes[1]!, id: -1, parent: -2 },
        { ...makeValid().nodes[1]!, id: 0, parent: -1 },
      ],
    });
    expect(isOk(text)).toBe(false);
    expect(isOk(broken((d) => (d.nodes[0].id = -1)))).toBe(false);
  });
});
