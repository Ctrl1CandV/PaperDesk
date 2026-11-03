import { test, expect } from '@playwright/test';
import catalog from '../../content/catalog.json' with { type: 'json' };

const revision = catalog.currentRevisions.transformer;

test('a term opens a small card on first mention and closes back to the text', async ({ page }) => {
  await page.goto(`/read/transformer/${revision}#background`);
  const term = page.locator('#background .term-hint').first();
  await term.click();
  const card = page.getByRole('dialog', { name: /^术语：/ });
  await expect(card).toBeVisible();
  await expect(card.locator('.term-card-explain')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(term).toBeFocused();
});

test('an original figure keeps its source and opens at full size', async ({ page }) => {
  await page.goto(`/read/transformer/${revision}#architecture`);
  const figure = page.locator('#architecture .paper-figure');
  await expect(figure.locator('figcaption')).toContainText('原论文图 1');
  await figure.getByRole('button', { name: /放大查看/ }).click();
  await expect(page.locator('dialog.figure-dialog img')).toBeVisible();
});

test('the guide card overview reads as several paragraphs', async ({ page }) => {
  await page.goto('/library?article=transformer');
  const overview = page.locator('.orientation-prose section').first();
  expect(await overview.locator('p').count()).toBeGreaterThan(1);
  await expect(overview.locator('.paper-figure img')).toBeVisible();
});
