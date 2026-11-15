import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeArticles, parseFeed } from '../src/lib/parseFeed';
import type { Article, Source } from '../src/types';

const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name), 'utf8');

const uiux: Source = {
  id: 'ex',
  name: 'Example',
  category: 'uiux',
  aiCategory: 'ai-design',
  url: 'https://example.com/feed',
};

describe('parseFeed (RSS)', () => {
  const items = parseFeed(fixture('rss.xml'), uiux);

  it('タイトルのない記事は捨てる', () => {
    expect(items.map((a) => a.link)).toEqual([
      'https://example.com/a?utm_source=rss',
      'https://example.com/b',
    ]);
  });

  it('id はクエリを除いたリンクで、HTML の文字参照も読める', () => {
    expect(items[0]).toMatchObject({
      id: 'https://example.com/a',
      title: 'Designing with Claude agents',
      date: '2026-10-31T10:00:00.000Z',
      lang: 'en',
    });
  });

  it('本文の img と media:thumbnail から画像を拾い、定型の末尾を要約から消す', () => {
    expect(items[0]?.image).toBe('https://example.com/a.png');
    expect(items[0]?.summary).toBe('Body text.');
    expect(items[1]?.image).toBe('https://example.com/b.jpg');
    expect(items[1]?.summary).toBe('Plain & simple.');
  });

  it('aiCategory があれば AI の記事だけ振り替える', () => {
    expect(items.map((a) => a.category)).toEqual(['ai-design', 'uiux']);
  });
});

describe('parseFeed (Atom)', () => {
  const jp: Source = {
    id: 'jp',
    name: 'JP',
    category: 'branding',
    lang: 'ja',
    url: 'https://example.jp/feed',
    match: /ロゴ|アイデンティティ/,
    exclude: /求人/,
  };
  const items = parseFeed(fixture('atom.xml'), jp);

  it('match と exclude で絞り込み、rel=alternate のリンクを使う', () => {
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      link: 'https://example.jp/logo',
      date: '2026-10-29T00:00:00.000Z',
      lang: 'ja',
      category: 'branding',
    });
  });
});

describe('mergeArticles', () => {
  const article = (id: string, category: Article['category'], date: string): Article => ({
    id,
    title: id,
    link: id,
    summary: '',
    image: '',
    date,
    source: '',
    sourceId: '',
    category,
    lang: 'en',
  });

  it('同じ記事は専門カテゴリを残し、新しい順に並べる', () => {
    const merged = mergeArticles(
      [article('a', 'ai-design', '2026-10-01'), article('b', 'uiux', '2026-10-03')],
      [article('a', 'uiux', '2026-10-01'), article('c', 'branding', '2026-10-02')],
    );
    expect(merged.map((a) => [a.id, a.category])).toEqual([
      ['b', 'uiux'],
      ['c', 'branding'],
      ['a', 'ai-design'],
    ]);
  });
});
