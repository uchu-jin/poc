import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const USER_AGENT = 'Mozilla/5.0 (NewsCurator)';

const isFeed = (body: string) => {
  const head = body.slice(0, 8192);
  return !/<html[\s>]/i.test(head) && /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
};

function discoverFeed(html: string, base: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    // href は引用符なし（href=https://...）で書くサイトもある（worker/lib.ts と同じ）
    const m = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/i);
    const href = m?.[1] ?? m?.[2] ?? m?.[3];
    if (
      href &&
      /\brel=["']?alternate\b/i.test(tag) &&
      /\btype=["']?application\/(rss|atom)\+xml/i.test(tag)
    )
      return new URL(href.replace(/&amp;/g, '&'), base).href;
  }
  return null;
}

async function get(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error('bad url');
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return {
    body: decodeBody(await res.arrayBuffer(), res.headers.get('content-type')),
    url: res.url,
  };
}

// ogp.php と同じく、Shift_JIS などのページも UTF-8 の文字列にする
function decodeBody(buf: ArrayBuffer, contentType: string | null) {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
  const charset = (contentType?.match(/charset=["']?([\w-]+)/i) ??
    head.match(/charset=["']?([\w-]+)/i))?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder().decode(buf);
  }
}

// public/api/ogp.php と同じく、<head> の <title>・<meta>・<link> だけを抜き出す
function headTags(html: string) {
  const end = html.search(/<\/head>/i);
  const head = end === -1 ? html.slice(0, 512 * 1024) : html.slice(0, end);
  return (head.match(/<title\b[^>]*>[^<]*<\/title>|<meta\b[^>]*>|<link\b[^>]*>/gi) ?? []).join(
    '\n',
  );
}

// public/api/sync.php の代わり。保存内容はメモリに置くので、開発サーバーを止めると消える
const syncStore = new Map<string, { data: unknown; updatedAt: number }>();
const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readBody(req: import('node:http').IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// 開発中は PHP がないので、public/api/feed.php・ogp.php・sync.php と同じ処理をここで行う。
// キャッシュと、社内網へのアクセスを防ぐ確認、コードを作る数の制限は省いている(本番の PHP にはある)
function feedProxy(): Plugin {
  return {
    name: 'feed-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sync.php', async (req, res) => {
        const send = (status: number, body?: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body === undefined ? '' : JSON.stringify(body));
        };
        const valid = (code: unknown): code is string =>
          typeof code === 'string' && /^[A-HJ-NP-Z2-9]{16}$/.test(code);
        if (req.method === 'GET' || req.method === 'DELETE') {
          const code = new URL(req.url ?? '', 'http://localhost').searchParams.get('code');
          if (!valid(code)) return send(400, { error: 'bad code' });
          const record = syncStore.get(code);
          if (!record) return send(404, { error: 'not found' });
          if (req.method === 'DELETE') {
            syncStore.delete(code);
            return send(204);
          }
          return send(200, record);
        }
        if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
        const body = JSON.parse((await readBody(req)) || '{}') as {
          code?: unknown;
          data?: unknown;
        };
        if (typeof body.data !== 'object' || body.data === null)
          return send(400, { error: 'bad data' });
        let code = body.code;
        if (code !== undefined) {
          if (!valid(code)) return send(400, { error: 'bad code' });
          if (!syncStore.has(code)) return send(404, { error: 'not found' });
        } else {
          code = Array.from(
            crypto.getRandomValues(new Uint8Array(16)),
            (b) => SYNC_ALPHABET[b % 32],
          ).join('');
        }
        const record = { data: body.data, updatedAt: Math.floor(Date.now() / 1000) };
        syncStore.set(code as string, record);
        send(body.code ? 200 : 201, { code, updatedAt: record.updatedAt });
      });
      server.middlewares.use('/api/ogp.php', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('url') ?? '';
        try {
          const page = await get(target);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ url: page.url, tags: headTags(page.body) }));
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          res.statusCode = message === 'bad url' ? 422 : 502;
          res.end(message);
        }
      });
      server.middlewares.use('/api/feed.php', async (req, res) => {
        const params = new URL(req.url ?? '', 'http://localhost').searchParams;
        const id = params.get('id') ?? '';
        const target = params.get('url');
        const feeds: Record<string, string> = JSON.parse(
          readFileSync(new URL('./public/api/feeds.json', import.meta.url), 'utf8'),
        );
        const registered = /^[a-z0-9-]+$/.test(id) ? feeds[id] : undefined;
        if (!target && !registered) {
          res.statusCode = 404;
          res.end('unknown feed');
          return;
        }
        try {
          let page = await get(target ?? registered!);
          if (target && !isFeed(page.body)) {
            const feedUrl = discoverFeed(page.body, page.url);
            if (!feedUrl) throw new Error('no feed');
            page = await get(feedUrl);
            if (!isFeed(page.body)) throw new Error('no feed');
          }
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.setHeader('X-Feed-Url', page.url);
          res.end(page.body);
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          res.statusCode = message === 'no feed' || message === 'bad url' ? 422 : 502;
          res.end(message);
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), feedProxy()],
  build: { outDir: 'dist' },
});
