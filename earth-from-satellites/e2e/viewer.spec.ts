import { expect, test } from '@playwright/test';

test('トップページを開ける', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('世界の人工衛星から');
});
