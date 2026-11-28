import { describe, expect, it } from 'vitest';
import { guessSiteName, parseOgp } from '../src/lib/ogp';
import { activeStudios, sanitizeStudios } from '../src/lib/sources';
import type { Studio } from '../src/types';

const tags = `
<title>Global Brand Consultancy &mdash; Example &amp; Co</title>
<meta charset="utf-8">
<meta property="og:title" content="Example &amp; Co: brand studio">
<meta name="description" content='A   brand
 studio.'>
<meta property="og:image" content="/images/share.png">
<link rel="icon" href="/favicon-32.png">
<link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
`;

describe('parseOgp', () => {
  it('og: の値を優先し、相対 URL を絶対 URL にし、apple-touch-icon を選ぶ', () => {
    expect(parseOgp(tags, 'https://example.com/en/')).toEqual({
      title: 'Example & Co: brand studio',
      description: 'A brand studio.',
      image: 'https://example.com/images/share.png',
      icon: 'https://cdn.example.com/touch.png',
      siteName: '',
    });
  });

  it('タグがなければ <title> と /favicon.ico を使い、http(s) 以外の画像は捨てる', () => {
    const ogp = parseOgp(
      '<title>Studio X</title><meta property="og:image" content="javascript:alert(1)">',
      'https://x.example/',
    );
    expect(ogp).toMatchObject({
      title: 'Studio X',
      image: '',
      icon: 'https://x.example/favicon.ico',
    });
  });
});

describe('guessSiteName', () => {
  it('og:site_name があればそれを使う', () => {
    expect(
      guessSiteName({ siteName: 'Koto', title: 'Koto, an agency' }, 'https://koto.studio'),
    ).toBe('Koto');
  });

  it('タイトルを区切り、ドメイン名に近い部分を選ぶ', () => {
    expect(
      guessSiteName(
        { title: 'Global Brand Consultancy — Wolff Olins' },
        'https://www.wolffolins.com',
      ),
    ).toBe('Wolff Olins');
    expect(guessSiteName({ title: 'Design Bridge | Home' }, 'https://unrelated.example')).toBe(
      'Design Bridge',
    );
  });
});

describe('studios', () => {
  const builtIn: Studio[] = [
    { name: 'A', url: 'https://a.example', lang: 'en', ogp: {} },
    { name: 'B', url: 'https://b.example', lang: 'ja', ogp: {} },
  ];

  it('削除した初期の会社を URL で除き、追加した会社を後ろにつなげる', () => {
    const custom: Studio[] = [{ name: 'C', url: 'https://c.example', lang: 'en', ogp: {} }];
    expect(
      activeStudios(builtIn, custom, ['https://a.example']).map((s) => [s.name, !!s.custom]),
    ).toEqual([
      ['B', false],
      ['C', true],
    ]);
  });

  it('保存内容から、形の合わないものと http(s) 以外の URL を捨てる', () => {
    const raw = [
      { name: 'C', url: 'https://c.example', lang: 'ja', ogp: { title: 'C', image: 3 } },
      { name: 'D', url: 'javascript:alert(1)', lang: 'en', ogp: {} },
      { name: 4, url: 'https://e.example' },
    ];
    expect(sanitizeStudios(raw)).toEqual([
      {
        name: 'C',
        url: 'https://c.example',
        lang: 'ja',
        ogp: { title: 'C', description: '', image: '', icon: '', siteName: '' },
        custom: true,
      },
    ]);
  });
});
