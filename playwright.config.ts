import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Isolated project browser cache and origin: no normal reading storage is touched.
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.cache/playwright');

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './.cache/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev:web -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 90_000,
  },
});
