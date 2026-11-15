import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 開発中は PHP がないので、public/api/feed.php と同じ中継をここで行う(キャッシュなし)
function feedProxy(): Plugin {
  return {
    name: 'feed-proxy',
    configureServer(server) {
      server.middlewares.use('/api/feed.php', async (req, res) => {
        const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
        const feeds: Record<string, string> = JSON.parse(
          readFileSync(new URL('./public/api/feeds.json', import.meta.url), 'utf8'),
        );
        const url = /^[a-z0-9-]+$/.test(id) ? feeds[id] : undefined;
        if (!url) {
          res.statusCode = 404;
          res.end('unknown feed');
          return;
        }
        try {
          const upstream = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (NewsCurator)' },
            signal: AbortSignal.timeout(15000),
          });
          if (!upstream.ok) throw new Error(String(upstream.status));
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(await upstream.text());
        } catch (e) {
          res.statusCode = 502;
          res.end(`upstream ${e instanceof Error ? e.message : ''}`);
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
