import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { feedTitle } from '../src/lib/parseFeed';
import {
  activeSources,
  detectLang,
  findByUrl,
  normalizeUrl,
  sanitizeCustom,
} from '../src/lib/sources';
import type { Source } from '../src/types';

const builtIn: Source[] = [
  { id: 'a', name: 'A', category: 'uiux', url: 'https://a.example/feed' },
  { id: 'b', name: 'B', category: 'branding', url: 'https://b.example/feed' },
];
const custom: Source[] = [
  { id: 'u-1', name: 'C', category: 'ai-dev', url: 'https://c.example/rss', lang: 'ja' },
];

describe('activeSources', () => {
  it('削除した初期の媒体を除き、追加したサイトを custom 付きで後ろにつなげる', () => {
    expect(activeSources(builtIn, custom, ['a']).map((s) => [s.id, !!s.custom])).toEqual([
      ['b', false],
      ['u-1', true],
    ]);
  });
});

describe('sanitizeCustom', () => {
  it('形の合わないものを捨て、地域は en か ja にそろえる', () => {
    const raw = [
      { id: 'u-1', name: 'C', url: 'https://c.example/rss', category: 'ai-dev', lang: 'ja' },
      { id: 'u-2', name: 'D', url: 'https://d.example/rss', category: 'uiux', lang: 'fr' },
      { id: 'u-3', name: 'E', url: 'https://e.example/rss', category: 'studios' },
      { id: 4, name: 'F', url: 'https://f.example/rss', category: 'uiux' },
      null,
    ];
    expect(sanitizeCustom(raw).map((s) => [s.id, s.lang])).toEqual([
      ['u-1', 'ja'],
      ['u-2', 'en'],
    ]);
    expect(sanitizeCustom('broken')).toEqual([]);
  });
});

describe('normalizeUrl', () => {
  it('スキームがなければ https を補い、http/https 以外は受け付けない', () => {
    expect(normalizeUrl(' example.com/blog ')).toBe('https://example.com/blog');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeUrl('ftp://example.com')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});

describe('findByUrl', () => {
  it('http/https と末尾のスラッシュの違いは同じサイトとみなす', () => {
    expect(findByUrl(builtIn, 'http://a.example/feed/')?.id).toBe('a');
    expect(findByUrl(builtIn, 'https://a.example/other')).toBeUndefined();
  });
});

describe('detectLang', () => {
  it('ひらがなかカタカナがあれば国内', () => {
    expect(detectLang('デザインの話')).toBe('ja');
    expect(detectLang('Design notes')).toBe('en');
  });
});

describe('feedTitle', () => {
  const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name), 'utf8');

  it('RSS と Atom のフィード名を読む', () => {
    expect(feedTitle(fixture('rss.xml'))).toBe('Example');
    expect(feedTitle(fixture('atom.xml'))).toBe('Example Atom');
  });
});
