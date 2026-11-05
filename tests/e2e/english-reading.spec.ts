import { test, expect } from '@playwright/test';

test('the reading page can switch Transformer between Chinese and English without changing its figures', async ({ page }) => {
  await page.goto('/read/transformer/5#architecture');
  const prose = page.locator('article.prose');
  await expect(prose).toHaveAttribute('lang', 'zh-Hans');
  await page.getByRole('button', { name: '切换英文阅读' }).click();
  await expect(prose).toHaveAttribute('lang', 'en');
  await expect(prose.getByRole('heading', { level: 1 })).toContainText('Transformer');
  await expect(prose.locator('.paper-figure')).toHaveCount(2);
  const term = prose.locator('.term-hint').first();
  await expect(term).toBeVisible();
  await term.click();
  await expect(page.getByRole('dialog', { name: /Term:/ })).toBeVisible();
  await page.getByRole('button', { name: '切换回中文' }).click();
  await expect(prose).toHaveAttribute('lang', 'zh-Hans');
});

test('the RAG survey has an English reading view with English term cards', async ({ page }) => {
  await page.goto('/read/rag-survey/5#orientation');
  await page.getByRole('button', { name: '切换英文阅读' }).click();
  const prose = page.locator('article.prose');
  await expect(prose).toHaveAttribute('lang', 'en');
  await expect(prose.getByRole('heading', { level: 1 })).toContainText('RAG');
  await expect(prose.locator('.paper-figure')).toHaveCount(5);
  const term = prose.locator('.term-hint').first();
  await expect(term).toBeVisible();
  await term.click();
  await expect(page.getByRole('dialog', { name: /Term:/ })).toContainText(/./);
});
