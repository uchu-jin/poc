// Worker（worker/index.ts）で使う、外の環境に依存しない処理。tests/worker.test.ts で確かめる
// 中身は public/api/*.php と同じ決まりにそろえている

export const USER_AGENT = 'Mozilla/5.0 (NewsCurator)';
export const MAX_URL_LENGTH = 2048;

// RSS / Atom の本文かどうか（HTML のページは除く）
export function isFeed(head: string) {
  const top = head.slice(0, 8192);
  return !/<html[\s>]/i.test(top) && /<(rss|feed|rdf:RDF)[\s>]/i.test(top);
}

// サイトの HTML から <link rel="alternate" type="application/rss+xml"> の場所を探す
export function discoverFeed(html: string, base: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    // href は引用符なし（href=https://...）で書くサイトもある
    const m = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/i);
    const href = m?.[1] ?? m?.[2] ?? m?.[3];
    if (
      href &&
      /\brel=["']?alternate\b/i.test(tag) &&
      /\btype=["']?application\/(rss|atom)\+xml/i.test(tag)
    ) {
      try {
        return new URL(decodeEntities(href), base).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// <head> の中から <title>・<meta>・<link> だけを抜き出す（ogp.php と同じ）。HTML でなければ null
export function headTags(html: string, maxLength = 65536) {
  const end = html.search(/<\/head>/i);
  const head = end === -1 ? html.slice(0, 512 * 1024) : html.slice(0, end);
  if (!/<(html|head|title|meta)[\s>]/i.test(head)) return null;
  const tags = head.match(/<title\b[^>]*>[^<]*<\/title>|<meta\b[^>]*>|<link\b[^>]*>/gi) ?? [];
  return tags.join('\n').slice(0, maxLength);
}

// Content-Type か HTML の先頭から文字コードを読む（Shift_JIS などのページのため）
export function detectCharset(contentType: string | null, head: string) {
  return (contentType?.match(/charset=["']?([\w-]+)/i) ??
    head.match(/charset=["']?([\w-]+)/i))?.[1];
}

// 社内網やサーバー自身を取りに行かせないため、http/https・ポート 80/443・公開ホストだけを通す。
// Worker からは名前解決の結果を確かめられないので、ホスト名と IP アドレスの書き方で判定する
// （Cloudflare の Worker はもともと私設ネットワークには届かない）
export function checkPublicUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'bad url';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'bad url';
  if (url.username || url.password) return 'bad url';
  if (url.port && url.port !== '80' && url.port !== '443') return 'bad port';
  if (isBlockedHost(url.hostname)) return 'blocked host';
  return url;
}

export function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost') return true;
  if (/\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return true;
  // IPv6 のアドレスを直接書いたものは通さない（RSS の配信元でまず使われないため）
  if (host.startsWith('[') || host.includes(':')) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return /^\d+$/.test(host) || /^0x/i.test(host); // 10進・16進1つだけの書き方も通さない
  const [a, b] = v4.slice(1).map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

// ---- 同期（sync.php と同じ決まり） ----

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SYNC_BODY_BYTES = 65536;
export const MAX_CREATES_PER_DAY = 20;
const DATA_KEYS = ['customSources', 'removedSources', 'customStudios', 'removedStudios'] as const;

export type SyncData = Record<(typeof DATA_KEYS)[number], unknown[]>;

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-HJ-NP-Z2-9]{16}$/.test(code);
}

export function newCode(random: Uint8Array) {
  return Array.from(random.slice(0, 16), (b) => CODE_ALPHABET[b % 32]).join('');
}

// 決まった4つのキーの配列だけを保存する。中身の細かい確認は画面側で読むときに行う
export function cleanData(data: unknown): SyncData | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const source = data as Record<string, unknown>;
  const clean = {} as SyncData;
  for (const key of DATA_KEYS) {
    const value = source[key] ?? [];
    if (!Array.isArray(value)) return null;
    clean[key] = value;
  }
  return clean;
}
