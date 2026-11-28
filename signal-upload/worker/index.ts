// Cloudflare Worker：public/api/*.php の代わり。
// /api/ で始まる URL だけここに来る（wrangler.jsonc の run_worker_first）。それ以外の画面は dist/ をそのまま配信する
//   /api/feed.php  RSS の中継（10分キャッシュ。取得に失敗したら古いキャッシュを返す）
//   /api/ogp.php   デザイン会社のサイトの <head> のタグ（1日キャッシュ）
//   /api/sync.php  同期コードごとの保存（Workers KV の SYNC）
import feeds from '../public/api/feeds.json';
import {
  MAX_CREATES_PER_DAY,
  MAX_SYNC_BODY_BYTES,
  MAX_URL_LENGTH,
  USER_AGENT,
  checkPublicUrl,
  cleanData,
  detectCharset,
  discoverFeed,
  headTags,
  isFeed,
  isValidCode,
  newCode,
} from './lib';

interface Env {
  ASSETS: Fetcher;
  SYNC: KVNamespace;
}

const FEED_TTL = 600;
const OGP_TTL = 86400;
const TIMEOUT_MS = 15000;
const MAX_BYTES = 3 * 1024 * 1024;
const registeredFeeds = feeds as Record<string, string>;
// Accept がないと断るサイトがあるので、curl と同じく付けて送る
const FETCH_HEADERS = { 'User-Agent': USER_AGENT, Accept: '*/*' };

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/api/feed.php':
          return await handleFeed(url, ctx);
        case '/api/ogp.php':
          return await handleOgp(url, ctx);
        case '/api/sync.php':
          return await handleSync(request, url, env);
      }
    } catch {
      return text(502, 'fetch failed');
    }
    // feeds.json などの静的ファイルはそのまま返す。PHP の中身は見せない
    if (url.pathname.endsWith('.php')) return text(404, 'not found');
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function text(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---- 外部サイトの取得 ----

interface Fetched {
  bytes: Uint8Array;
  url: string;
  contentType: string | null;
}

// 大きすぎる本文は途中で打ち切る
async function readLimited(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// 利用者が指定した URL を取る。リダイレクト先も1つずつ確かめる（_lib.php の fetch_public と同じ）
async function fetchPublic(raw: string): Promise<Fetched | string> {
  let current = raw;
  for (let hop = 0; hop <= 5; hop++) {
    const checked = checkPublicUrl(current);
    if (typeof checked === 'string') return checked;
    const res = await fetch(checked.href, {
      headers: FETCH_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, checked).href;
      continue;
    }
    if (res.status >= 400) return `upstream ${res.status}`;
    return {
      bytes: await readLimited(res),
      url: checked.href,
      contentType: res.headers.get('Content-Type'),
    };
  }
  return 'too many redirects';
}

// feeds.json に登録した媒体は、決まった URL なのでリダイレクトもそのままたどる
async function fetchRegistered(target: string): Promise<Fetched | string> {
  const res = await fetch(target, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status >= 400) return `upstream ${res.status}`;
  return {
    bytes: await readLimited(res),
    url: target,
    contentType: res.headers.get('Content-Type'),
  };
}

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes.slice(0, 8192));

function decode(bytes: Uint8Array, charset: string | undefined) {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    // 知らない文字コード名なら UTF-8 として読む
    return new TextDecoder().decode(bytes);
  }
}

// ---- /api/feed.php ----

async function fetchFeedOrSite(target: string): Promise<Fetched | string> {
  const page = await fetchPublic(target);
  if (typeof page === 'string') return page;
  if (isFeed(latin1(page.bytes))) return page;
  const html = decode(page.bytes, detectCharset(page.contentType, latin1(page.bytes)));
  const feedUrl = discoverFeed(html, page.url);
  if (!feedUrl) return 'no feed';
  const feed = await fetchPublic(feedUrl);
  if (typeof feed === 'string') return feed;
  return isFeed(latin1(feed.bytes)) ? feed : 'no feed';
}

async function handleFeed(url: URL, ctx: ExecutionContext) {
  const target = url.searchParams.get('url');
  let fetcher: () => Promise<Fetched | string>;
  let cacheKey: string;
  if (target !== null) {
    if (target.length > MAX_URL_LENGTH) return text(400, 'bad url');
    fetcher = () => fetchFeedOrSite(target);
    cacheKey = `u-${await sha(target, 'SHA-1')}`;
  } else {
    const id = url.searchParams.get('id') ?? '';
    const registered = /^[a-z0-9-]+$/.test(id) ? registeredFeeds[id] : undefined;
    if (!registered) return text(404, 'unknown feed');
    fetcher = () => fetchRegistered(registered);
    cacheKey = id;
  }

  // Cloudflare のキャッシュに1日置き、取った時刻（X-Fetched-At）で10分を過ぎたら取り直す
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/feed/${cacheKey}`);
  const cached = await cache.match(key);
  const fetchedAt = Number(cached?.headers.get('X-Fetched-At') ?? 0);
  if (cached && Date.now() / 1000 - fetchedAt < FEED_TTL) return feedResponse(cached);

  const result = await fetcher().catch(() => 'fetch failed');
  if (typeof result === 'string') {
    // 取得に失敗したら、古くても保存済みのものがあれば返す
    if (cached) return feedResponse(cached);
    return text(result === 'no feed' || result === 'bad url' ? 422 : 502, result);
  }

  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    // 制御文字はヘッダーに入れられないので除く
    // eslint-disable-next-line no-control-regex
    'X-Feed-Url': result.url.replace(/[\x00-\x1f\x7f]/g, ''),
  };
  ctx.waitUntil(
    cache.put(
      key,
      new Response(result.bytes, {
        headers: {
          ...headers,
          'X-Fetched-At': String(Math.floor(Date.now() / 1000)),
          'Cache-Control': 'public, max-age=86400',
        },
      }),
    ),
  );
  return new Response(result.bytes, { headers });
}

function feedResponse(cached: Response) {
  return new Response(cached.body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Feed-Url': cached.headers.get('X-Feed-Url') ?? '',
    },
  });
}

// ---- /api/ogp.php ----

async function handleOgp(url: URL, ctx: ExecutionContext) {
  const target = url.searchParams.get('url') ?? '';
  if (target === '' || target.length > MAX_URL_LENGTH) return text(400, 'bad url');

  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/ogp/${await sha(target, 'SHA-1')}`);
  const cached = await cache.match(key);
  if (cached)
    return new Response(cached.body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  const page = await fetchPublic(target);
  if (typeof page === 'string') return text(page === 'bad url' ? 422 : 502, page);
  const html = decode(page.bytes, detectCharset(page.contentType, latin1(page.bytes)));
  const tags = headTags(html);
  if (tags === null) return text(422, 'not html');

  const body = JSON.stringify({ url: page.url, tags });
  ctx.waitUntil(
    cache.put(
      key,
      new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${OGP_TTL}`,
        },
      }),
    ),
  );
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

// ---- /api/sync.php ----

async function sha(value: string, algorithm: 'SHA-1' | 'SHA-256') {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// 保存のキーはコードそのものではなくハッシュにする
const syncKey = async (code: string) => `sync:${await sha(code, 'SHA-256')}`;

async function save(env: Env, code: string, data: unknown) {
  const record = { data, updatedAt: Math.floor(Date.now() / 1000) };
  await env.SYNC.put(await syncKey(code), JSON.stringify(record));
  return record;
}

// 1つの IP から1日に作れるコードの数を絞る（保存先を埋められないように）
async function allowCreate(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const day = new Date().toISOString().slice(0, 10);
  const key = `rate:${await sha(ip + day, 'SHA-1')}`;
  const count = Number((await env.SYNC.get(key)) ?? 0);
  if (count >= MAX_CREATES_PER_DAY) return false;
  await env.SYNC.put(key, String(count + 1), { expirationTtl: 2 * 86400 });
  return true;
}

function parseJson(raw: string): { code?: unknown; data?: unknown } | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? value : null;
  } catch {
    return null;
  }
}

async function handleSync(request: Request, url: URL, env: Env) {
  const method = request.method;

  if (method === 'GET' || method === 'DELETE') {
    const code = url.searchParams.get('code') ?? '';
    if (!isValidCode(code)) return json(400, { error: 'bad code' });
    const key = await syncKey(code);
    const record = await env.SYNC.get(key);
    if (record === null) return json(404, { error: 'not found' });
    if (method === 'DELETE') {
      await env.SYNC.delete(key);
      return json(204);
    }
    return new Response(record, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (method !== 'POST') return json(405, { error: 'method not allowed' });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_BODY_BYTES) {
    return json(413, { error: 'too large' });
  }
  const body = parseJson(raw);
  const data = cleanData(body?.data);
  if (!body || data === null) return json(400, { error: 'bad data' });

  if (body.code !== undefined && body.code !== null) {
    // 上書きは、すでにあるコードだけ（コードを作る数の制限をすり抜けられないように）
    if (!isValidCode(body.code)) return json(400, { error: 'bad code' });
    if ((await env.SYNC.get(await syncKey(body.code))) === null) {
      return json(404, { error: 'not found' });
    }
    const record = await save(env, body.code, data);
    return json(200, { code: body.code, updatedAt: record.updatedAt });
  }

  if (!(await allowCreate(request, env))) return json(429, { error: 'too many codes' });
  let code: string;
  do {
    code = newCode(crypto.getRandomValues(new Uint8Array(16)));
  } while ((await env.SYNC.get(await syncKey(code))) !== null);
  const record = await save(env, code, data);
  return json(201, { code, updatedAt: record.updatedAt });
}
