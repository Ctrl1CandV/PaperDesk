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

test('the Transformer architecture section opens on the original figure', async ({ page }) => {
  await page.goto(`/read/transformer/${revision}#architecture`);
  const figure = page.locator('#architecture .paper-figure').first();
  await expect(figure.locator('figcaption')).toContainText('原论文图 1');
  await expect(figure.locator('img')).toBeInViewport();
  await figure.getByRole('button', { name: /放大查看/ }).click();
  await expect(page.locator('dialog.figure-dialog img')).toBeVisible();
});

test('a returning Transformer reader can open the new edition at its actual beginning', async ({ page }) => {
  await page.goto('/library?article=transformer');
  await page.evaluate(async () => {
    // Synthetic reading position in the isolated browser.
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.setResume({ guideId: 'transformer', revision: 3, unitId: 'two-heads', offset: 0, updatedAt: '2026-01-02T03:04:05.000Z' });
  });
  await page.reload();
  await expect(page.locator('.orientation-actions').getByRole('link', { name: '继续阅读' })).toHaveAttribute('href', '/read/transformer/3');
  await page.getByRole('link', { name: `从头阅读第 ${revision} 版` }).click();
  await expect(page.locator('article.prose section').first()).toBeFocused();
  await expect(page.locator('article.prose h1')).toBeInViewport();
});

for (const id of ['transformer', 'rag-survey'] as const) {
  test(`the ${id} card explains the paper, its value and how to read it in prose`, async ({ page }) => {
    await page.goto(`/library?article=${id}`);
    const sections = page.locator('.orientation-prose section');
    await expect(sections).toHaveCount(3);
    for (const section of await sections.all()) {
      await expect(section.locator('p').first()).toBeVisible();
    }
    await expect(page.locator('.orientation-prose .paper-figure')).toHaveCount(0);
  });
}
