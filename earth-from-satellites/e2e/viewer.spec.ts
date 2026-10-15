import { expect, test, type Page } from '@playwright/test';

// 1x1 の PNG（画像の中身は問わない。読み込みと decode が通ればよい）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const T0 = new Date('2026-10-14T15:00:00Z');
const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000).toISOString();

type Sat = 'himawari9' | 'goes-east' | 'goes-west';

function latest(sat: Sat, capturedAt: string) {
  if (sat === 'himawari9') {
    return {
      satelliteId: sat,
      satelliteName: 'ひまわり9号',
      capturedAt,
      images: [{ url: `https://slider.cira.colostate.edu/h/${capturedAt}.png`, width: 688 }],
      credit: { text: 'CSU/CIRA & JMA', url: 'https://satlib.cira.colostate.edu/credit-media' },
    };
  }
  const star = sat === 'goes-east' ? 'GOES19' : 'GOES18';
  return {
    satelliteId: sat,
    satelliteName: sat === 'goes-east' ? 'GOES-East' : 'GOES-West',
    capturedAt,
    images: [339, 678, 1808].map((w) => ({
      url: `https://cdn.star.nesdis.noaa.gov/${star}/${capturedAt}-${w}x${w}.jpg`,
      width: w,
    })),
    credit: { text: 'NOAA/NESDIS/STAR, CSU/CIRA', url: 'https://www.star.nesdis.noaa.gov/GOES/' },
  };
}

interface Reply {
  status?: number;
  body?: unknown;
  gate?: Promise<void>;
}

interface Mock {
  api: (sat: Sat) => Reply;
  brokenImages: Set<string>;
  apiCalls: string[];
  imageCalls: string[];
}

async function setup(page: Page, api: Mock['api']): Promise<Mock> {
  const mock: Mock = { api, brokenImages: new Set(), apiCalls: [], imageCalls: [] };
  await page.clock.install({ time: T0 });
  await page.route('**/api/latest?*', async (route) => {
    const sat = new URL(route.request().url()).searchParams.get('satellite') as Sat;
    mock.apiCalls.push(sat);
    const reply = mock.api(sat);
    if (reply.gate) await reply.gate;
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(reply.body ?? { code: 'upstream_error' }),
    });
  });
  const serveImage = async (route: import('@playwright/test').Route) => {
    const url = route.request().url();
    mock.imageCalls.push(url);
    const broken = [...mock.brokenImages].some((part) => url.includes(part));
    await route.fulfill(
      broken ? { status: 404, body: '' } : { status: 200, contentType: 'image/png', body: PNG },
    );
  };
  await page.route('https://slider.cira.colostate.edu/**', serveImage);
  await page.route('https://cdn.star.nesdis.noaa.gov/**', serveImage);
  return mock;
}

const ok = (sat: Sat, capturedAt = minutesAgo(10)): Reply => ({ body: latest(sat, capturedAt) });
const fail: Reply = { status: 502 };

const status = (page: Page) => page.locator('[role="status"]');
const satName = (page: Page) => page.locator('[data-role="name"]');
const picture = (page: Page) => page.locator('picture');
const img = (page: Page) => page.locator('picture img');

test('開くと、ひまわり9号の画像・衛星名・撮影日時・クレジットが出る', async ({ page }) => {
  await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await expect(satName(page)).toHaveText('ひまわり9号');
  await expect(img(page)).toHaveAttribute('srcset', /slider\.cira\.colostate\.edu/);
  await expect(page.locator('time')).toHaveAttribute('datetime', minutesAgo(10));
  await expect(page.getByRole('link', { name: 'CSU/CIRA & JMA' })).toBeVisible();
  await expect(status(page)).toHaveText('');
});

test('初回の取得が失敗すると「取得できませんでした」が出て、10分後の成功で画像が出る', async ({
  page,
}) => {
  let healthy = false;
  await setup(page, (sat) => (healthy ? ok(sat) : fail));
  await page.goto('/');
  await expect(status(page)).toContainText('取得できませんでした');
  await expect(satName(page)).toHaveText('ひまわり9号');
  await expect(picture(page)).toBeHidden();
  healthy = true;
  await page.clock.runFor('10:00');
  await expect(picture(page)).toBeVisible();
  await expect(status(page)).toHaveText('');
});

test('初回の画像が 404 だと「取得できませんでした」が出る', async ({ page }) => {
  const mock = await setup(page, (sat) => ok(sat));
  mock.brokenImages.add('slider.cira.colostate.edu');
  await page.goto('/');
  await expect(status(page)).toContainText('取得できませんでした');
  await expect(picture(page)).toBeHidden();
});

test('GOES-East を押すと切り替わり、再読み込み後も GOES-East で始まる', async ({ page }) => {
  const mock = await setup(page, (sat) => ok(sat));
  await page.goto('/');
  await expect(satName(page)).toHaveText('ひまわり9号');
  await page.getByRole('button', { name: 'GOES-East' }).click();
  await expect(satName(page)).toHaveText('GOES-East');
  await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
  await expect(page.getByRole('button', { name: 'GOES-East' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(satName(page)).toHaveText('GOES-East');
  expect(mock.apiCalls.at(-1)).toBe('goes-east');
});

test('切り替え先が失敗すると、選んだ衛星名と「取得できませんでした」が出て、10分後に取り直す', async ({
  page,
}) => {
  let goesHealthy = false;
  const mock = await setup(page, (sat) => (sat === 'goes-east' && !goesHealthy ? fail : ok(sat)));
  await page.goto('/');
  await expect(picture(page)).toBeVisible();
  await page.getByRole('button', { name: 'GOES-East' }).click();
  await expect(status(page)).toContainText('取得できませんでした');
  await expect(satName(page)).toHaveText('GOES-East');
  await expect(picture(page)).toBeHidden();
  goesHealthy = true;
  await page.clock.runFor('10:00');
  await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
  expect(mock.apiCalls.at(-1)).toBe('goes-east');
});

test('ひまわりの応答を待つ間に GOES-East を押すと、後から返ったひまわりの結果で上書きしない', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  // 後から返るひまわりのほうが新しい撮影日時なので、競合を無視しなければ上書きされる
  await setup(page, (sat) =>
    sat === 'himawari9' ? { ...ok(sat, minutesAgo(1)), gate } : ok(sat, minutesAgo(10)),
  );
  await page.goto('/');
  await expect(status(page)).toHaveText('読み込み中…');
  await page.getByRole('button', { name: 'GOES-East' }).click();
  await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
  release();
  await page.waitForTimeout(500);
  await expect(satName(page)).toHaveText('GOES-East');
  await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
});

test('10分たつと撮影日時が新しい画像に差し替わり、同じなら画像を取り直さない', async ({ page }) => {
  let capturedAt = minutesAgo(10);
  const mock = await setup(page, (sat) => ok(sat, capturedAt));
  await page.goto('/');
  await expect(page.locator('time')).toHaveAttribute('datetime', capturedAt);

  const before = mock.imageCalls.length;
  await page.clock.runFor('10:00');
  await expect.poll(() => mock.apiCalls.length).toBe(2);
  await page.waitForTimeout(300);
  expect(mock.imageCalls.length).toBe(before);

  capturedAt = minutesAgo(-10);
  await page.clock.runFor('10:00');
  await expect(page.locator('time')).toHaveAttribute('datetime', capturedAt);
});

test('更新に失敗すると、前の画像を残して「更新できませんでした」が出て、次の成功で消える', async ({
  page,
}) => {
  let healthy = true;
  let n = 0;
  await setup(page, (sat) => (healthy ? ok(sat, minutesAgo(10 - 10 * n++)) : fail));
  await page.goto('/');
  await expect(picture(page)).toBeVisible();
  healthy = false;
  await page.clock.runFor('10:00');
  await expect(status(page)).toContainText('更新できませんでした');
  await expect(picture(page)).toBeVisible();
  healthy = true;
  await page.clock.runFor('10:00');
  await expect(status(page)).toHaveText('');
});

test('更新先の画像が 404 だと、前の画像を残して「更新できませんでした」が出る', async ({
  page,
}) => {
  let capturedAt = minutesAgo(10);
  const mock = await setup(page, (sat) => ok(sat, capturedAt));
  await page.goto('/');
  await expect(picture(page)).toBeVisible();
  capturedAt = minutesAgo(-10);
  mock.brokenImages.add(capturedAt);
  await page.clock.runFor('10:00');
  await expect(status(page)).toContainText('更新できませんでした');
  await expect(page.locator('time')).toHaveAttribute('datetime', minutesAgo(10));
});

test('撮影日時が90分前だと「90分前の画像です」が出る', async ({ page }) => {
  await setup(page, (sat) => ok(sat, minutesAgo(90)));
  await page.goto('/');
  await expect(page.locator('[data-role="stale"]')).toHaveText('90分前の画像です');
});

test('59分前の画像は、1分たつと「60分前の画像です」になり、API は呼び直さない', async ({
  page,
}) => {
  const mock = await setup(page, (sat) => ok(sat, minutesAgo(59)));
  await page.goto('/');
  await expect(page.locator('time')).toBeVisible();
  await expect(page.locator('[data-role="stale"]')).toBeHidden();
  const calls = mock.apiCalls.length;
  await page.clock.runFor('01:00');
  await expect(page.locator('[data-role="stale"]')).toHaveText('60分前の画像です');
  expect(mock.apiCalls.length).toBe(calls);
});

test.describe('画像サイズ（FR-008）', () => {
  test('スマホ（375px、3倍密度）では 1808px を読み込まない', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const mock = await setup(page, () => ok('goes-east'));
    await page.addInitScript(() =>
      window.localStorage.setItem('earth-from-satellites:satellite', 'goes-east'),
    );
    await page.goto('/');
    await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
    await page.waitForTimeout(300);
    expect(mock.imageCalls.some((u) => u.includes('678x678'))).toBe(true);
    expect(mock.imageCalls.some((u) => u.includes('1808x1808'))).toBe(false);
    await context.close();
  });

  test('PC 幅では 1808px を読み込む', async ({ page }) => {
    const mock = await setup(page, () => ok('goes-east'));
    await page.addInitScript(() =>
      window.localStorage.setItem('earth-from-satellites:satellite', 'goes-east'),
    );
    await page.goto('/');
    await expect(img(page)).toHaveAttribute('srcset', /GOES19/);
    await expect.poll(() => mock.imageCalls.some((u) => u.includes('1808x1808'))).toBe(true);
  });
});
