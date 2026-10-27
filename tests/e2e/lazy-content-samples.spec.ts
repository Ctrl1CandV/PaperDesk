import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('reviewed revision 2 samples preserve old routes, render teaching material and expose precise sources', async ({ page }) => {
  await mkdir('.cache/upgrade/rendered', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/read/streamingllm/2#u04');
  const section = page.locator('#u04');
  await expect(section.locator('.diagram-scroll svg')).toBeVisible();
  await expect(section).toContainText('非论文原图');
  await section.screenshot({ path: '.cache/upgrade/rendered/streamingllm-r2-cache-desktop.png' });
  const source = section.getByRole('button', { name: /缓存机制与原图4/ });
  await source.click();
  await expect(page.getByRole('dialog')).toContainText('固定 v4 HTML');
  await expect(page.getByRole('dialog').getByRole('link', { name: /打开原文/ })).toHaveAttribute('href', 'https://arxiv.org/html/2309.17453v4#S3.F4');
  await page.getByRole('button', { name: /返回阅读/ }).click();
  await expect(source).toBeFocused();

  await page.goto('/read/rag/2#u03');
  await expect(page.locator('#u03')).toContainText('用两个输出词元看清求和的区别');
  await expect(page.locator('#u03 .formula-error')).toHaveCount(0);
  await page.locator('#u03').screenshot({ path: '.cache/upgrade/rendered/rag-r2-formulas-desktop.png' });
  await page.goto('/read/agent-memory-survey/2#u08');
  await expect(page.locator('#u08')).toContainText('修订2补看了固定 v1 PDF');
  await page.locator('#u08').getByRole('button', { name: /图5：评价分支/ }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: /打开原文/ })).toHaveAttribute('href', 'https://arxiv.org/pdf/2404.13501v1#page=20');
  await page.getByRole('button', { name: /返回阅读/ }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/read/streamingllm/2#u04');
  await expect(page.locator('#u04 .diagram-scroll svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('#u04').screenshot({ path: '.cache/upgrade/rendered/streamingllm-r2-cache-narrow.png' });
  for (const id of ['streamingllm', 'rag', 'agent-memory-survey']) {
    await page.goto(`/read/${id}/1`);
    await expect(page.locator('.article-labels')).toContainText('导读修订 1');
    await expect(page.locator('.prose')).toBeVisible();
  }
});
