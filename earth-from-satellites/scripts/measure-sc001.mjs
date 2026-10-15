// SC-001 の手動計測：4G 相当の回線（WebPageTest「4G」：下り 9Mbps・往復 170ms）で、
// 初回の画像表示が終わるまでの時間を測る。実際の配信元を使うので、手動スモークでだけ実行する。
// 使い方: node scripts/measure-sc001.mjs [URL] [回数]
/* global document, HTMLImageElement -- page.evaluate の中はブラウザで動く */
import { chromium, devices } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:8789/';
const runs = Number(process.argv[3] ?? 3);
const KBPS = 9000;

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < runs; i++) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 170,
    downloadThroughput: (KBPS * 1000) / 8,
    uploadThroughput: (KBPS * 1000) / 8,
  });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const start = Date.now();
  await page.goto(url);
  await page.waitForFunction(
    () => {
      const img = document.querySelector('picture img');
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  const ms = Date.now() - start;
  const src = await page.evaluate(() => document.querySelector('picture img')?.currentSrc ?? '');
  results.push(ms);
  console.log(`run ${i + 1}: ${ms} ms  ${src.split('/').pop()}`);
  await context.close();
}
await browser.close();
const sorted = [...results].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`median: ${median} ms → ${median <= 3000 ? '合格（3秒以内）' : '不合格（3秒超）'}`);
