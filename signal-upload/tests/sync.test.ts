import { describe, expect, it } from 'vitest';
import { formatCode, normalizeCode, sanitizeSyncData } from '../src/lib/sync';

describe('同期コード', () => {
  it('区切りや小文字、空白を許して16文字にそろえる', () => {
    expect(normalizeCode(' abcd-efgh-jkmn-pq23 ')).toBe('ABCDEFGHJKMNPQ23');
  });

  it('読み間違えやすい I・O・0・1 を含むものや、長さの違うものは受け付けない', () => {
    expect(normalizeCode('ABCDEFGHJKMNPQ20')).toBeNull();
    expect(normalizeCode('ABCDEFGHIKMNPQ23')).toBeNull();
    expect(normalizeCode('ABCDEFGH')).toBeNull();
  });

  it('4文字ずつ区切って表示する', () => {
    expect(formatCode('ABCDEFGHJKMNPQ23')).toBe('ABCD-EFGH-JKMN-PQ23');
  });
});

describe('sanitizeSyncData', () => {
  it('サーバーの内容から、形の合うものだけを取り出す', () => {
    const data = sanitizeSyncData({
      customSources: [
        { id: 'u-1', name: 'A', url: 'https://a.example/feed', category: 'uiux', lang: 'ja' },
        { id: 'u-2', name: 'B', url: 'https://b.example/feed', category: 'nope' },
      ],
      removedSources: ['figma', 3],
      customStudios: 'broken',
      extra: 'ignored',
    });
    expect(data).toEqual({
      customSources: [
        {
          id: 'u-1',
          name: 'A',
          url: 'https://a.example/feed',
          category: 'uiux',
          lang: 'ja',
          custom: true,
        },
      ],
      removedSources: ['figma'],
      customStudios: [],
      removedStudios: [],
    });
  });

  it('中身がなければ空の一覧にする', () => {
    expect(sanitizeSyncData(null)).toEqual({
      customSources: [],
      removedSources: [],
      customStudios: [],
      removedStudios: [],
    });
  });
});
