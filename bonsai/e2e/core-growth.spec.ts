// 土台と成長のコア（.claude/plans/core-growth.md 5章 E2E）。
// npm run build でできた dist/index.html を file:// で開き、遊ぶときと同じ形で確かめる。
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

/**
 * speed の木は、1 フレームの間が 1 秒を超えると止まっていた扱いになる（実装レビュー P1-③）。
 * そのため時計は 0.5 秒ずつ刻んで進め、刻むたびにフレームが走るようにする
 */
async function advanceInFrames(page: Page, ms: number): Promise<void> {
  for (let done = 0; done < ms; done += 500) {
    await page.clock.fastForward(Math.min(500, ms - done));
  }
}

const INDEX_URL = pathToFileURL(fileURLToPath(new URL('../dist/index.html', import.meta.url))).href;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 試験用の「種をまく時刻」。TIME_FLOOR（2026-01-01）より後 */
const T = Date.UTC(2026, 9, 22, 0, 0, 0);

const KEY = 'bonsai.save.v1';
const KEY_SPEED = 'bonsai.save.v1.speed';
const BROKEN_PREFIX = 'bonsai.save.v1.broken.';

/** pageerror を集める。各テストの最後に 0 件を確かめる */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function open(page: Page, search = ''): Promise<void> {
  await page.goto(INDEX_URL + search);
}

const seedButton = (page: Page) => page.locator('#seed-screen button');

async function plant(page: Page): Promise<void> {
  await seedButton(page).click();
  await expect(page.locator('#hud')).toBeVisible();
}

async function age(page: Page): Promise<number> {
  return Number(await page.locator('#hud').getAttribute('data-age'));
}

const getItem = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

const setItem = (page: Page, key: string, value: string) =>
  page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [key, value]);

const allKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).sort() as string[]);

const brokenKeys = async (page: Page) =>
  (await allKeys(page)).filter((k) => k.startsWith(BROKEN_PREFIX));

/** localStorage 全体の中身（キー → 値） */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(localStorage)) out[k] = localStorage.getItem(k) ?? '';
    return out;
  });

/** タブが隠れた状態を作る（visibilitychange と pagehide を起こす） */
async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
}

test('初回起動で「種をまく」を押すと bonsai.save.v1 ができ、age 0（SC-001 の保存部分）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await open(page);
  expect(await getItem(page, KEY)).toBeNull();
  await expect(seedButton(page)).toBeVisible();

  await seedButton(page).click();

  await expect(page.locator('#hud')).toBeVisible();
  const raw = await getItem(page, KEY);
  expect(raw).not.toBeNull();
  const saved = JSON.parse(raw ?? '');
  expect(saved.version).toBe(1);
  expect(saved.age).toBe(0);
  expect(saved.nodes).toHaveLength(1);
  expect(await age(page)).toBe(0);
  await expect(page.locator('.hud-stage')).toHaveText('種');
  await expect(seedButton(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('?speed=3600 で 168 秒進めると age 168 以上・成木、「早送り ×3600」が出る（SC-002）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.clock.install({ time: T });
  await open(page, '?speed=3600');
  await plant(page);
  await expect(page.locator('.hud-speed')).toHaveText('早送り ×3600');

  await advanceInFrames(page, 168 * 1000);

  await expect.poll(() => age(page)).toBeGreaterThanOrEqual(168);
  await expect(page.locator('.hud-stage')).toHaveText('成木');
  await expect(page.locator('.hud-speed')).toHaveText('早送り ×3600');
  // speed の木は speed のキーに保存される
  expect(await getItem(page, KEY_SPEED)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('普段の木があるとき、?speed=3600 で遊んでも bonsai.save.v1 は変わらない（FR-013）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.clock.install({ time: T });
  await open(page);
  await plant(page);
  const before = await getItem(page, KEY);
  expect(before).not.toBeNull();

  await open(page, '?speed=3600');
  // 普段の木とは別の木なので、種まきの画面になる
  await plant(page);
  await advanceInFrames(page, 100 * 1000);
  await expect.poll(() => age(page)).toBeGreaterThanOrEqual(100);
  await hideTab(page);

  expect(await getItem(page, KEY)).toBe(before);
  expect(await getItem(page, KEY_SPEED)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('時刻 T で種をまき、T+6時間で開き直すと 6 ステップ進んでいる（SC-003）', async ({ page }) => {
  const errors = trackErrors(page);
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  await open(page);
  await plant(page);
  expect(await age(page)).toBe(0);

  await page.clock.setFixedTime(T + 6 * HOUR);
  await page.reload();

  await expect(page.locator('#hud')).toBeVisible();
  expect(await age(page)).toBe(6);
  await expect(page.locator('.hud-stage')).toHaveText('芽');
  expect(errors).toEqual([]);
});

test('【P0】時計が種まきより前に戻っても、エラーなく age は変わらず、開き直しても読める（SC-004）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  await open(page);
  await plant(page);
  await page.clock.setFixedTime(T + 3 * HOUR);
  await page.reload();
  expect(await age(page)).toBe(3);

  // 時計が 1 日前に戻る
  await page.clock.setFixedTime(T - DAY);
  await page.reload();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#broken-screen')).toBeHidden();
  expect(await age(page)).toBe(3);

  // もう一度開き直しても読める
  await page.reload();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#broken-screen')).toBeHidden();
  expect(await age(page)).toBe(3);
  expect(errors).toEqual([]);
});

test('__bonsai.advance(30) のあと再読み込みしても、保存の文字列が完全に一致する（SC-011）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.clock.install({ time: T });
  await page.clock.setFixedTime(T);
  await open(page);
  await plant(page);

  await page.evaluate(() => window.__bonsai.advance(30));
  expect(await age(page)).toBe(30);
  const before = await getItem(page, KEY);
  expect(before).not.toBeNull();

  await page.reload();

  await expect(page.locator('#hud')).toBeVisible();
  expect(await age(page)).toBe(30);
  expect(await getItem(page, KEY)).toBe(before);
  expect(errors).toEqual([]);
});

test('壊れた JSON：知らせが出て保存は変わらず、退避に同意すると別キーに写って種まきの画面になる', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const broken = '{"version":1,"seed":';
  await open(page);
  await setItem(page, KEY, broken);
  await page.reload();

  await expect(page.locator('#broken-screen')).toBeVisible();
  await expect(page.locator('#broken-screen .broken-raw')).toHaveValue(broken);
  await expect(seedButton(page)).toBeHidden();
  const before = await snapshot(page);
  expect(before).toEqual({ [KEY]: broken });

  // タブを隠す・再読み込みしても変わらない
  await hideTab(page);
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await expect(page.locator('#broken-screen')).toBeVisible();
  expect(await snapshot(page)).toEqual(before);

  // 退避して新しく始める（確認に同意）
  const dialogs: string[] = [];
  page.once('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.getByRole('button', { name: '退避して新しく始める' }).click();

  await expect(page.locator('#broken-screen')).toBeHidden();
  await expect(seedButton(page)).toBeVisible();
  expect(dialogs).toHaveLength(1);
  const keys = await brokenKeys(page);
  expect(keys).toHaveLength(1);
  expect(await getItem(page, keys[0] ?? '')).toBe(broken);
  expect(keys[0]).toMatch(/^bonsai\.save\.v1\.broken\.\d+$/);
  expect(errors).toEqual([]);
});

test('【P0】壊れた JSON：確認を拒否すると何も変わらず、退避キーへの書き込みが失敗すると元のまま知らせが出る', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const broken = 'これはJSONではない';
  await open(page);
  await setItem(page, KEY, broken);
  await page.reload();
  await expect(page.locator('#broken-screen')).toBeVisible();
  const before = await snapshot(page);

  // 確認を拒否
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: '退避して新しく始める' }).click();
  await expect(page.locator('#broken-screen')).toBeVisible();
  await expect(seedButton(page)).toBeHidden();
  expect(await snapshot(page)).toEqual(before);

  // 退避のキーへの書き込みだけを失敗させて、同意する
  await page.evaluate((prefix) => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k.startsWith(prefix)) throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  }, BROKEN_PREFIX);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: '退避して新しく始める' }).click();

  await expect(page.locator('#notices .notice')).toBeVisible();
  await expect(page.locator('#broken-screen')).toBeVisible();
  await expect(seedButton(page)).toBeHidden();
  expect(await getItem(page, KEY)).toBe(broken);
  expect(await brokenKeys(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('【P0】書き込みが QuotaExceededError でも、警告を出して遊び続けられる（FR-045）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __setItemCalls: number };
    w.__setItemCalls = 0;
    Storage.prototype.setItem = function () {
      w.__setItemCalls += 1;
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await page.clock.install({ time: T });
  await open(page, '?speed=3600');
  await plant(page);

  await advanceInFrames(page, 10 * 1000);

  await expect(page.locator('#notices .notice').first()).toBeVisible();
  await expect.poll(() => age(page)).toBeGreaterThanOrEqual(10);
  const calls = await page.evaluate(
    () => (window as unknown as { __setItemCalls: number }).__setItemCalls,
  );
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('保存データが <img onerror> の文字列でも、そのまま文字として出て実行されない', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const evil = '<img src=x onerror="window.__xss=1">';
  await open(page);
  await setItem(page, KEY, evil);
  await page.reload();

  await expect(page.locator('#broken-screen')).toBeVisible();
  await expect(page.locator('#broken-screen .broken-raw')).toHaveValue(evil);
  // 画面のどこにも img 要素ができていない。onerror も走らない
  await expect(page.locator('img')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  expect(errors).toEqual([]);
});

test('?debug のときだけ 2D の canvas が出る', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await expect(page.locator('#debug canvas')).toHaveCount(0);

  await open(page, '?debug');
  await expect(page.locator('#debug canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
