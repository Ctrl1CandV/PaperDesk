import { test, expect } from '@playwright/test';

// Public reviewed content only; no personal records are created.
test('the shelf is one list, and a category word finds its reading collection', async ({ page }) => {
  await page.goto('/library');
  await expect(page.locator('.guide-list')).toHaveCount(1);
  await expect(page.locator('.guide-entry')).toHaveCount(18);
  await expect(page.locator('.shelf-collection, .shelf-progress, .library-explore-link')).toHaveCount(0);
  await expect(page.locator('.library-heading').getByRole('link')).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: '查找文章' });
  await search.fill('通信');
  await expect(page.locator('.guide-entry')).toHaveCount(5);
  await expect(page.locator('#choose-multi-agent-communication-survey')).toBeVisible();
  await expect(page.locator('.library-result-count')).toHaveText('“通信” · 5 篇文章');
  await search.fill('评价');
  await expect(page.locator('.guide-entry')).toHaveCount(5);
  await expect(page.locator('#choose-helm')).toBeVisible();
  await search.fill('基础');
  await expect(page.locator('.guide-entry')).toHaveCount(8);
  // Titles and topics still match as before.
  await search.fill('ReAct');
  await expect(page.locator('#choose-react')).toBeVisible();
});

test('with a brief open, the shelf keeps roomy rows and a toolbar that does not break words', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/library?article=multi-agent-communication-survey');
  const list = (await page.locator('.guide-list').boundingBox())!, card = (await page.locator('.library-preview').boundingBox())!;
  expect(list.width).toBeGreaterThan(500);
  expect(card.width).toBeGreaterThan(list.width);
  const row = (await page.locator('.guide-entry').first().boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(88);
  // The source line sits under the title, not pushed to the far edge.
  const source = (await page.locator('.guide-entry').first().locator('.guide-card-bottom').boundingBox())!;
  expect(source.x - row.x).toBeLessThan(40);
  // Each type tab stays on one line.
  for (const tab of await page.locator('.library-categories button').all()) expect((await tab.boundingBox())!.height).toBeLessThan(48);
});

test('browsing rows are roomy, and a paper without a ranked venue names where it was published', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/library');
  expect((await page.locator('.guide-entry').first().boundingBox())!.height).toBeGreaterThanOrEqual(96);
  // A survey first read as a preprint and later published in a journal shows the journal; the row uses its abbreviation.
  await expect(page.locator('#choose-multi-agent-communication-survey .guide-card-source')).toContainText('Front. Comput. Sci. 2026');
  await expect(page.locator('#choose-llm-evaluation-survey .guide-card-source')).toContainText('ACM TIST 2024');
  await expect(page.locator('#choose-autogen .guide-card-source')).toContainText('COLM 2024');
  await page.goto('/library?article=llm-evaluation-survey');
  const line = page.locator('.orientation-bibliography p');
  await expect(line).toContainText('ACM Transactions on Intelligent Systems and Technology 2024');
  await expect(line).toContainText('导读依据 arXiv v1');
  await expect(page.locator('.orientation-ranking')).toHaveCount(0);
  await page.goto('/library?article=helm');
  await expect(page.locator('.orientation-bibliography p')).toContainText('Transactions on Machine Learning Research (TMLR) 2023');
  // Still a preprint: said so plainly.
  await page.goto('/library?article=rag-survey');
  await expect(page.locator('.orientation-bibliography p')).toContainText('arXiv 预印本 2023');
});
