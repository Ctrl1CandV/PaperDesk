import { test, expect } from '@playwright/test';

// Uses only the browser's own preference store; no personal content is involved.
const theme = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme);

test('day and night follow the system until the reader chooses, then the choice persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/library');
  expect(await theme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');

  await page.getByRole('button', { name: '切换到夜间模式' }).click();
  expect(await theme(page)).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toBe('dark');
  await expect.poll(() => page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.getPreferences())).toEqual({ theme: 'dark' });

  // An explicit choice outlives the system setting and a reload.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  expect(await theme(page)).toBe('dark');
  await page.getByRole('button', { name: '切换到白天模式' }).click();
  expect(await theme(page)).toBe('light');
  await page.goto('/read/react/1');
  expect(await theme(page)).toBe('light');
  await expect(page.getByRole('button', { name: '切换到夜间模式' })).toBeVisible();
});
