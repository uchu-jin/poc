// 水墨画風の描画（.claude/plans/ink-render.md 5章 E2E）。
// npm run build でできた dist/index.html を file:// で開く。Three.js は CDN（jsDelivr）から読むので、ネットが要る。
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const INDEX_URL = pathToFileURL(fileURLToPath(new URL('../dist/index.html', import.meta.url))).href;
const KEY = 'bonsai.save.v1';
const MSG_RENDER_FAILED = '3D の部品を読み込めませんでした。ネットにつないで開き直してください';

type Pick =
  | { kind: 'branch'; nodeId: number }
  | { kind: 'leaf'; nodeId: number; leafIndex: number }
  | { kind: 'soil' }
  | null;
interface Cam {
  azimuth: number;
  elevation: number;
  distance: number;
  targetY: number;
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function open(page: Page, search = ''): Promise<void> {
  await page.goto(INDEX_URL + search);
}

async function plant(page: Page): Promise<void> {
  await page.locator('#seed-screen button').click();
  await expect(page.locator('#hud')).toBeVisible();
}

/** 3D の canvas が出て、Renderer ができる（カメラが読める）まで待つ */
async function waitScene(page: Page): Promise<void> {
  await expect(page.locator('canvas.scene')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__bonsai.camera !== null)).toBe(true);
}

const camera = (page: Page): Promise<Cam> =>
  page.evaluate(() => window.__bonsai.camera as unknown as Cam);

const pick = (page: Page, x: number, y: number): Promise<Pick> =>
  page.evaluate(
    ([px, py]) => window.__bonsai.pickAt(px as number, py as number),
    [x, y],
  ) as Promise<Pick>;

async function viewport(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
}

test('種をまくと canvas.scene が出て WebGL の文脈ができ、pageerror は 0 件', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  await waitScene(page);
  const hasGl = await page.evaluate(() => {
    const c = document.querySelector('canvas.scene') as HTMLCanvasElement;
    // 同じ canvas から 2D を取ろうとすると null になる＝すでに WebGL の文脈がある
    return c.getContext('webgl2') !== null || c.getContext('webgl') !== null;
  });
  expect(hasGl).toBe(true);
  await expect(page.locator('#render-failed')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('jsDelivr を止めると #render-failed が出て、種まき・左上の表示・保存は動く', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
  await open(page);
  await expect(page.locator('#render-failed')).toHaveText(MSG_RENDER_FAILED);

  await plant(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.hud-stage')).toHaveText('種');
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  expect(raw).not.toBeNull();
  expect(JSON.parse(raw ?? '').age).toBe(0);
  await expect(page.locator('canvas.scene')).toHaveCount(0);
  expect(await page.evaluate(() => window.__bonsai.pickAt(10, 10))).toBeNull();
  expect(await page.evaluate(() => window.__bonsai.camera)).toBeNull();
  expect(errors).toEqual([]);
});

test('pickAt：土の上は soil、何もないところは null', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  await waitScene(page);
  const { w, h } = await viewport(page);

  // 何もないところ（四隅の近く）
  for (const [x, y] of [
    [5, 5],
    [w - 5, 5],
    [5, h - 5],
    [w - 5, h - 5],
  ] as const) {
    expect(await pick(page, x, y)).toBeNull();
  }

  // 中心の少し下から縦に走査して、土が返る点を探す（鉢の土の面）
  const found = await page.evaluate(
    ([cx, height]) => {
      const hh = height as number;
      const hits: number[] = [];
      for (let y = Math.round(hh * 0.4); y < hh * 0.9; y += 4) {
        const r = window.__bonsai.pickAt(cx as number, y);
        if (r && r.kind === 'soil') hits.push(y);
      }
      return hits;
    },
    [Math.round(w / 2), h],
  );
  expect(found.length).toBeGreaterThan(0);
  const mid = found[Math.floor(found.length / 2)] ?? 0;
  expect(await pick(page, Math.round(w / 2), mid)).toEqual({ kind: 'soil' });
  expect(errors).toEqual([]);
});

test('カメラの操作：右ドラッグで azimuth、ホイールで distance、中ドラッグで targetY が変わり、R で戻る', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  // 見る高さの範囲（0〜木の高さ）が広がるよう、木を育てる
  await page.evaluate(() => window.__bonsai.advance(120));
  await waitScene(page);
  const { w, h } = await viewport(page);
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  await page.mouse.move(cx, cy);

  await page.keyboard.press('r');
  const init = await camera(page);
  expect(init.azimuth).toBe(0);
  expect(init.elevation).toBe(15);

  // 右ドラッグ：azimuth が変わる
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 80, cy, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  const rotated = await camera(page);
  expect(rotated.azimuth).not.toBe(init.azimuth);

  // ホイールを前に：distance が縮む
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await camera(page)).distance).toBeLessThan(rotated.distance);
  const zoomed = await camera(page);

  // 中ドラッグ：targetY が変わる（向きは次のテストで確かめる）
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx, cy + 80, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  expect((await camera(page)).targetY).not.toBe(zoomed.targetY);

  // R で 4 つの値が初期値に戻る（初期値の distance・targetY は木の大きさに合わせるので、R の直後に読み直す）
  await page.keyboard.press('r');
  const back = await camera(page);
  expect(back.azimuth).toBe(init.azimuth);
  expect(back.elevation).toBe(init.elevation);
  expect(back.distance).toBeCloseTo(init.distance, 5);
  expect(back.targetY).toBeCloseTo(init.targetY, 5);
  expect(errors).toEqual([]);
});

test('カメラの操作：中ドラッグで上へ動かすと targetY が上がる（プラン5章の向き）', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  await page.evaluate(() => window.__bonsai.advance(120));
  await waitScene(page);
  const { w, h } = await viewport(page);
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const drag = async (dy: number) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx, cy + dy, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
  };
  // 範囲の端に張りつかないよう、いったん中ほどへ動かす
  await page.keyboard.press('r');
  await drag(60);
  await drag(-30);
  const mid = await camera(page);
  expect(mid.targetY).toBeGreaterThan(0);

  await drag(-20);
  expect((await camera(page)).targetY).toBeGreaterThan(mid.targetY);
  expect(errors).toEqual([]);
});

test('FR-034 の枠が 5 つある', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  const { w, h } = await viewport(page);
  const box = async (sel: string) => {
    await expect(page.locator(sel)).toBeVisible();
    const b = await page.locator(sel).boundingBox();
    expect(b).not.toBeNull();
    return b as { x: number; y: number; width: number; height: number };
  };
  const hud = await box('#hud');
  const score = await box('#frame-score');
  const water = await box('#frame-water');
  const toolbar = await box('#frame-toolbar');
  const settings = await box('#frame-settings');

  expect(hud.x + hud.width / 2).toBeLessThan(w / 2);
  expect(hud.y + hud.height / 2).toBeLessThan(h / 2);
  expect(score.x + score.width / 2).toBeGreaterThan(w / 2);
  expect(score.y + score.height / 2).toBeLessThan(h / 2);
  expect(water.x + water.width / 2).toBeGreaterThan(w / 2);
  expect(water.y + water.height / 2).toBeGreaterThan(h / 2);
  expect(Math.abs(toolbar.x + toolbar.width / 2 - w / 2)).toBeLessThan(w * 0.1);
  expect(toolbar.y + toolbar.height / 2).toBeGreaterThan(h / 2);
  expect(settings.x + settings.width / 2).toBeLessThan(w / 2);
  expect(settings.y + settings.height / 2).toBeGreaterThan(h / 2);
  expect(errors).toEqual([]);
});

test('?debug のときだけ右の端に 2D の姿と fps が出る', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await plant(page);
  await expect(page.locator('#debug canvas')).toHaveCount(0);
  await expect(page.locator('#debug-perf')).toHaveCount(0);

  await open(page, '?debug');
  await expect(page.locator('#debug canvas')).toBeVisible();
  const { w } = await viewport(page);
  const b = await page.locator('#debug canvas').boundingBox();
  expect(b).not.toBeNull();
  expect((b?.x ?? 0) + (b?.width ?? 0) / 2).toBeGreaterThan(w * 0.7);
  await expect(page.locator('#debug-perf')).toContainText('fps');
  expect(errors).toEqual([]);
});
