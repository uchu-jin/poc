import { AI_PATTERN } from '../data/sources';
import type { Article, Source } from '../types';

const MAX_ENTRIES = 150;
const MAX_PER_SOURCE = 30;
const SUMMARY_LENGTH = 220;

const firstByTag = (el: Element | Document, tag: string) =>
  el.getElementsByTagNameNS('*', tag)[0] || el.getElementsByTagName(tag)[0];

const textOf = (el: Element, tag: string) => firstByTag(el, tag)?.textContent?.trim() || '';

const htmlToText = (html: string) =>
  new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html').body
    .textContent || '';

function plainText(html: string) {
  return htmlToText(html).replace(/\s+/g, ' ').trim();
}

function firstImgSrc(html: string) {
  const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? '';
}

function findImage(entry: Element, html: string) {
  for (const tag of ['thumbnail', 'content']) {
    for (const el of entry.getElementsByTagNameNS('*', tag)) {
      const url = el.getAttribute('url');
      if (
        url &&
        (tag === 'thumbnail' ||
          /image/.test(el.getAttribute('medium') || el.getAttribute('type') || 'image'))
      )
        return url;
    }
  }
  const enclosure = entry.getElementsByTagName('enclosure')[0];
  const url = enclosure?.getAttribute('url') || '';
  return enclosure &&
    (/image/.test(enclosure.getAttribute('type') || '') ||
      /\.(png|jpe?g|gif|webp|avif)(\?|$)|\/image\/upload\//i.test(url))
    ? url
    : firstImgSrc(html);
}

// XML パーサは HTML の名前付き文字参照(&nbsp; など)や、&amp; になっていない & で止まってしまう。
// 先に文字参照を文字へ置き換え、裸の & は &amp; にする
const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
const entityCache = new Map<string, string>();

function decodeHtmlEntities(xml: string) {
  return xml
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (ref, name: string) => {
      if (XML_ENTITIES.has(name)) return ref;
      if (!entityCache.has(name)) {
        const decoded = htmlToText(ref);
        entityCache.set(name, decoded === ref ? '' : decoded);
      }
      return entityCache.get(name)!;
    })
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

const parseXml = (xml: string) =>
  new DOMParser().parseFromString(decodeHtmlEntities(xml), 'application/xml');

export function feedTitle(xml: string) {
  const el = parseXml(xml).querySelector('channel > title, feed > title');
  return plainText(el?.textContent || '');
}

export function parseFeed(xml: string, source: Source): Article[] {
  const doc = parseXml(xml);
  const isAtom = !!doc.getElementsByTagName('feed')[0] && !doc.getElementsByTagName('rss')[0];

  return [...doc.getElementsByTagName(isAtom ? 'entry' : 'item')]
    .slice(0, MAX_ENTRIES)
    .map((entry): Article => {
      let link: string | null | undefined;
      if (isAtom) {
        const links = [...entry.getElementsByTagName('link')];
        link = (
          links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate') || links[0]
        )?.getAttribute('href');
      } else link = textOf(entry, 'link');

      const html =
        textOf(entry, 'encoded') ||
        textOf(entry, 'content') ||
        textOf(entry, 'description') ||
        textOf(entry, 'summary');
      const dateText =
        textOf(entry, 'pubDate') ||
        textOf(entry, 'published') ||
        textOf(entry, 'updated') ||
        textOf(entry, 'date');
      const date = dateText ? new Date(dateText) : null;
      const summary = plainText(html)
        .replace(/Continue reading on .*$/i, '')
        .replace(/The post .* appeared first on .*$/i, '')
        .trim()
        .slice(0, SUMMARY_LENGTH);

      return {
        id: (link || '').split(/[?#]/)[0] ?? '',
        title: plainText(textOf(entry, 'title')),
        link: link || '',
        summary,
        image: findImage(entry, html),
        date: date && !isNaN(date.getTime()) ? date.toISOString() : null,
        source: source.name,
        sourceId: source.id,
        category: source.category,
        lang: source.lang || 'en',
      };
    })
    .filter((a) => a.title && a.link)
    .filter((a) => !source.match || source.match.test(`${a.title} ${a.summary}`))
    .filter((a) => !source.exclude || !source.exclude.test(a.title))
    .map((a) =>
      source.aiCategory && AI_PATTERN.test(`${a.title} ${a.summary}`)
        ? { ...a, category: source.aiCategory }
        : a,
    )
    .slice(0, MAX_PER_SOURCE);
}

// 同じ記事が複数のフィードに出たら、UI/UX より専門カテゴリ(AI×デザインなど)の方を残す
export function mergeArticles(current: Article[], incoming: Article[]): Article[] {
  const byId = new Map(current.map((a) => [a.id, a]));
  for (const a of incoming) {
    const existing = byId.get(a.id);
    if (existing && existing.category !== 'uiux' && a.category === 'uiux') continue;
    byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
