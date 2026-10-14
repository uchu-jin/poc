import { expect, test } from '@playwright/test';

test('loads the top page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('みちすがら')).toBeVisible();
});
