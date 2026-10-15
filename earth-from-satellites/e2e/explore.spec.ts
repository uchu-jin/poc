import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const T0 = new Date('2026-10-14T15:00:00Z');
const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000).toISOString();
const stamp = (iso: string) => iso.replace(/\D/g, '').slice(0, 14);
const ciraBase = (sat: string, iso: string) =>
  `https://slider.cira.colostate.edu/data/imagery/2026/10/14/${sat}---full_disk/geocolor/${stamp(iso)}/`;

type Sat = 'himawari9' | 'goes-east' | 'goes-west' | 'epic';

function latest(sat: Sat, capturedAt: string) {
  if (sat === 'epic') {
    return {
      satelliteId: 'epic',
      satelliteName: 'DSCOVR（EPIC）',
      capturedAt,
      images: [
        {
          url: `https://epic.gsfc.nasa.gov/archive/natural/2026/10/13/jpg/epic_1b_${stamp(capturedAt)}.jpg`,
          width: 1080,
        },
      ],
      credit: { text: 'NASA EPIC Team', url: 'https://epic.gsfc.nasa.gov/' },
    };
  }
  if (sat === 'himawari9') {
    const base = ciraBase('himawari', capturedAt);
    return {
      satelliteId: sat,
      satelliteName: 'ひまわり9号',
      capturedAt,
      images: [{ url: `${base}00/000_000.png`, width: 688 }],
      credit: { text: 'CSU/CIRA & JMA', url: 'https://satlib.cira.colostate.edu/credit-media' },
      tiles: { baseUrl: base, tileSize: 688, maxZoom: 4 },
    };
  }
  const star = sat === 'goes-east' ? 'GOES19' : 'GOES18';
  return {
    satelliteId: sat,
    satelliteName: sat === 'goes-east' ? 'GOES-East' : 'GOES-West',
    capturedAt,
    images: [339, 678, 1808].map((w) => ({
      url: `https://cdn.star.nesdis.noaa.gov/${star}/${stamp(capturedAt)}-${w}x${w}.jpg`,
      width: w,
    })),
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
    tiles: {
      baseUrl: ciraBase(sat === 'goes-east' ? 'goes-19' : 'goes-18', capturedAt),
      tileSize: 678,
      maxZoom: 4,
    },
  };
}

interface Mock {
  api: (sat: Sat) => { status?: number; body?: unknown };
  apiCalls: string[];
  tileCalls: string[];
}

async function setup(page: Page, api: Mock['api']): Promise<Mock> {
  const mock: Mock = { api, apiCalls: [], tileCalls: [] };
  await page.clock.install({ time: T0 });
  await page.route('**/api/latest?*', async (route) => {
    const sat = new URL(route.request().url()).searchParams.get('satellite') as Sat;
    mock.apiCalls.push(sat);
    const reply = mock.api(sat);
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(reply.body ?? { code: 'upstream_error' }),
    });
  });
  for (const host of [
    'slider.cira.colostate.edu',
    'cdn.star.nesdis.noaa.gov',
    'epic.gsfc.nasa.gov',
  ]) {
    await page.route(`https://${host}/**`, async (route) => {
      const url = route.request().url();
      if (/\/\d{2}\/\d{3}_\d{3}\.png$/.test(url) && !url.endsWith('/00/000_000.png')) {
        mock.tileCalls.push(url);
      }
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
  }
  return mock;
}

const ok = (sat: Sat, capturedAt = minutesAgo(10)) => ({ body: latest(sat, capturedAt) });
const region = (page: Page, label: string) =>
  page.locator('button[data-region]').filter({ hasText: new RegExp(`^${label}$`) });
const tileImgs = (page: Page) => page.locator('img[data-tile]');
const levelOf = (url: string) => Number(/\/(\d{2})\/\d{3}_\d{3}\.png$/.exec(url)![1]);

test('ひまわりで「日本」を選ぶとタイルが読み込まれ、API は呼ばれず撮影日時も変わらない', async ({
  page,
}) => {
  const mock = await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await expect(page.locator('picture')).toBeVisible();
  const time = await page.locator('time').textContent();
  await region(page, '日本').click();
  await expect(tileImgs(page).first()).toBeAttached();
  await expect(page.locator('picture')).toBeHidden();
  await expect.poll(() => mock.tileCalls.length).toBeGreaterThan(0);
  expect(mock.tileCalls.every((u) => levelOf(u) >= 2)).toBe(true);
  expect(mock.apiCalls).toEqual(['himawari9']);
  await expect(page.locator('time')).toHaveText(time!);
});

test('「全球」で全体の画像に戻り、衛星を切り替えると全球になる', async ({ page }) => {
  await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await region(page, '日本').click();
  await region(page, '全球').click();
  await expect(page.locator('picture')).toBeVisible();
  await expect(page.locator('[data-role="tiles"]')).toBeHidden();
  await region(page, '日本').click();
  await page.getByRole('button', { name: 'GOES-East' }).click();
  await expect(region(page, '全球')).toHaveAttribute('aria-pressed', 'true');
  await expect(region(page, '北米')).toBeVisible();
});

test('＋で拡大すると高い段のタイルを読み、ドラッグすると別のタイルを読む', async ({ page }) => {
  const mock = await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await expect(page.locator('picture')).toBeVisible();
  await page.getByRole('button', { name: '拡大' }).click();
  await page.getByRole('button', { name: '拡大' }).click();
  await expect.poll(() => mock.tileCalls.length).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const maxLevel = Math.max(...mock.tileCalls.map(levelOf));
  expect(maxLevel).toBeGreaterThanOrEqual(1);
  const before = new Set(mock.tileCalls);
  const box = (await page.locator('.frame').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05);
  await page.mouse.down();
  // タイルの境目をまたぐよう、枠の大きさの9割ほど動かす
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.95, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => mock.tileCalls.some((u) => !before.has(u))).toBe(true);
});

test('地域の表示中に10分たつと、同じ地域のまま新しい時刻のタイルになる', async ({ page }) => {
  let capturedAt = minutesAgo(10);
  const mock = await setup(page, (sat) => ok(sat, capturedAt));
  await page.goto('/');
  await region(page, '日本').click();
  await expect(tileImgs(page).first()).toBeAttached();
  capturedAt = minutesAgo(0);
  await page.clock.runFor('10:00');
  await expect(page.locator('time')).toHaveAttribute('datetime', capturedAt);
  await expect(region(page, '日本')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () =>
      (await tileImgs(page).evaluateAll((els) => els.map((e) => e.getAttribute('src')))).every(
        (s) => s?.includes(stamp(capturedAt)),
      ),
    )
    .toBe(true);
  expect(mock.apiCalls).toEqual(['himawari9', 'himawari9']);
});

test('＋で拡大しただけの状態でも、更新のあと表示範囲を保つ', async ({ page }) => {
  let capturedAt = minutesAgo(10);
  await setup(page, (sat) => ok(sat, capturedAt));
  await page.goto('/');
  await expect(page.locator('picture')).toBeVisible();
  await page.getByRole('button', { name: '拡大' }).click();
  await expect(page.locator('[data-role="tiles"]')).toBeVisible();
  capturedAt = minutesAgo(0);
  await page.clock.runFor('10:00');
  await expect(page.locator('time')).toHaveAttribute('datetime', capturedAt);
  await expect(page.locator('[data-role="tiles"]')).toBeVisible();
  await expect(page.locator('picture')).toBeHidden();
});

test('「宇宙から」で EPIC の画像・注記・クレジットが出て、地域と拡大は出ない', async ({ page }) => {
  await setup(page, (sat) => ok(sat, minutesAgo(30 * 60)));
  await page.goto('/');
  await page.getByRole('button', { name: '宇宙から' }).click();
  await expect(page.locator('picture img')).toHaveAttribute('srcset', /epic\.gsfc\.nasa\.gov/);
  await expect(page.locator('[data-role="note"]')).toHaveText('公開まで1〜2日かかります');
  await expect(page.getByRole('link', { name: 'NASA EPIC Team' })).toBeVisible();
  await expect(page.locator('.regions')).toBeHidden();
  await expect(page.getByRole('button', { name: '拡大' })).toBeHidden();
  await expect(page.locator('[data-role="stale"]')).toBeHidden();
});

test('「宇宙から」の取得が 502 なら「取得できませんでした」', async ({ page }) => {
  await setup(page, (sat) => (sat === 'epic' ? { status: 502 } : ok(sat)));
  await page.goto('/');
  await page.getByRole('button', { name: '宇宙から' }).click();
  await expect(page.locator('[role="status"]')).toContainText('取得できませんでした');
});

test('「宇宙から」で撮影から72時間たっていれば「3日前の画像です」', async ({ page }) => {
  await setup(page, (sat) => ok(sat, minutesAgo(72 * 60)));
  await page.goto('/');
  await page.getByRole('button', { name: '宇宙から' }).click();
  await expect(page.locator('[data-role="stale"]')).toHaveText('3日前の画像です');
});

test('スマホ（375px、dpr 3）で「日本」を選ぶと、z3 のタイルを9枚以下だけ読む', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  const mock = await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await expect(page.locator('picture')).toBeVisible();
  await region(page, '日本').click();
  await expect.poll(() => mock.tileCalls.length).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const unique = [...new Set(mock.tileCalls)];
  expect(unique.every((u) => levelOf(u) === 3)).toBe(true);
  expect(unique.length).toBeLessThanOrEqual(9);
  await context.close();
});
