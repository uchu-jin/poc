import type { Ogp } from '../types';

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const codePoint = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

function decode(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (ref, name: string) => NAMED[name.toLowerCase()] ?? ref)
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function absolute(url: string, base: string) {
  if (!url) return '';
  try {
    const resolved = new URL(url, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : '';
  } catch {
    return '';
  }
}

// ogp.php が返す <title>・<meta>・<link> のタグから、サイトの名前・説明・画像・アイコンを読む
export function parseOgp(tags: string, pageUrl: string): Ogp {
  const meta: Record<string, string> = {};
  for (const tag of tags.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase();
    const content = attr(tag, 'content');
    if (key && content && !(key in meta)) meta[key] = content;
  }

  // apple-touch-icon は大きくきれいなことが多いので、ふつうの icon より優先する
  let icon = '';
  let iconRank = 0;
  for (const tag of tags.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel').toLowerCase().split(' ');
    const rank = rel.includes('apple-touch-icon') ? 2 : rel.includes('icon') ? 1 : 0;
    const href = attr(tag, 'href');
    if (rank > iconRank && href) {
      icon = href;
      iconRank = rank;
    }
  }

  const title =
    meta['og:title'] || decode(tags.match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1] ?? '');
  return {
    title,
    description: meta['og:description'] || meta['description'] || '',
    image: absolute(meta['og:image'] || meta['twitter:image'] || '', pageUrl),
    icon: absolute(icon || '/favicon.ico', pageUrl),
    siteName: meta['og:site_name'] || '',
  };
}

const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// og:site_name がなければ、<title> を区切り記号で分け、ドメイン名に近いものを会社名とみなす
export function guessSiteName(ogp: Ogp, url: string) {
  if (ogp.siteName) return ogp.siteName;
  const parts = (ogp.title || '')
    .split(/\s[|｜–—:\-/]\s|\s?[|｜]\s?|:\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  let host = '';
  try {
    host = compact(new URL(url).hostname.replace(/^www\./, '').split('.')[0] ?? '');
  } catch {
    // URL が読めなければ、タイトルの先頭を使う
  }
  const match =
    host &&
    parts.find((p) => compact(p) && (host.includes(compact(p)) || compact(p).includes(host)));
  return match || parts[0] || '';
}
