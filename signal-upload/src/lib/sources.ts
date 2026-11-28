import type { ArticleCategory, Lang, Ogp, Source, Studio } from '../types';

export const ARTICLE_CATEGORIES: ArticleCategory[] = ['ai-design', 'ai-dev', 'uiux', 'branding'];

// 初期の媒体から削除したものを除き、利用者が追加したサイトを後ろにつなげる
export function activeSources(builtIn: Source[], custom: Source[], removed: string[]): Source[] {
  return [
    ...builtIn.filter((s) => !removed.includes(s.id)),
    ...custom.map((s) => ({ ...s, custom: true })),
  ];
}

// localStorage の中身は壊れていることもあるので、形の合うものだけ使う
export function sanitizeCustom(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s): Source[] => {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof s.id !== 'string' ||
      typeof s.name !== 'string' ||
      typeof s.url !== 'string' ||
      !ARTICLE_CATEGORIES.includes(s.category)
    )
      return [];
    return [
      {
        id: s.id,
        name: s.name,
        url: s.url,
        category: s.category,
        lang: s.lang === 'ja' ? 'ja' : 'en',
        custom: true,
      },
    ];
  });
}

export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// http/https、www の有無、末尾のスラッシュの違いでは別のサイトとみなさない
const sameUrlKey = (url: string) =>
  url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

export function findByUrl<T extends { url: string }>(items: T[], ...urls: string[]) {
  const keys = urls.map(sameUrlKey);
  return items.find((s) => keys.includes(sameUrlKey(s.url)));
}

export function activeStudios(builtIn: Studio[], custom: Studio[], removed: string[]): Studio[] {
  return [
    ...builtIn.filter((s) => !removed.includes(s.url)),
    ...custom.map((s) => ({ ...s, custom: true })),
  ];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function sanitizeStudios(raw: unknown): Studio[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s): Studio[] => {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof s.name !== 'string' ||
      typeof s.url !== 'string' ||
      !/^https?:\/\//i.test(s.url)
    )
      return [];
    const ogp: Record<string, unknown> = typeof s.ogp === 'object' && s.ogp !== null ? s.ogp : {};
    const cleanOgp: Ogp = {
      title: str(ogp.title),
      description: str(ogp.description),
      image: str(ogp.image),
      icon: str(ogp.icon),
      siteName: str(ogp.siteName),
    };
    return [
      {
        name: s.name,
        url: s.url,
        lang: s.lang === 'ja' ? 'ja' : 'en',
        ogp: cleanOgp,
        custom: true,
      },
    ];
  });
}

export function detectLang(text: string): Lang {
  return /[ぁ-んァ-ヶ]/.test(text) ? 'ja' : 'en';
}

export function newSourceId() {
  return `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
