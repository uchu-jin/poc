import { defineConfig, devices } from '@playwright/test';

// E2E は dist/index.html を file:// で開く。webServer は使わない。
export default defineConfig({
  testDir: 'e2e',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
