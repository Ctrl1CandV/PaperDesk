import { test, expect } from '@playwright/test';
import catalog from '../content/catalog.json' with { type: 'json' };
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const revision = catalog.currentRevisions as Record<string, number>;
const currentMetadata = catalog.entries.filter(entry => revision[entry.guideId] === entry.revision)
  .map(entry => JSON.parse(readFileSync(resolve('content', entry.metadataFile), 'utf8')) as { id: string; type: string });
const paperCount = currentMetadata.filter(metadata => metadata.type !== 'survey').length;
const lastGuide = catalog.entries.filter(entry => revision[entry.guideId] === entry.revision)
  .sort((a, b) => a.recommendation.rank - b.recommendation.rank).at(-1)!;

test('title/topic search excludes incidental mentions and filtering clears the preview without marking reading', async ({ page }) => {
  await page.goto('/library');
  await expect(page.locator('.guide-entry')).toHaveCount(currentMetadata.length);
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: '查找文章' });
  await search.fill('Agent');
  const matches = await page.locator('.guide-entry').evaluateAll(elements => elements.map(element => element.id));
  expect(matches).toEqual(expect.arrayContaining(['choose-agent-survey', 'choose-react', 'choose-reflexion']));
  expect(matches).not.toContain('choose-instructgpt');
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await page.locator('#choose-agent-survey').click();
  await expect(page.locator('#article-preview')).toHaveAttribute('aria-label', '文章导学');
  const snapshot = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(snapshot.resume).toEqual([]); expect(snapshot.guideStates).toEqual([]); expect(snapshot.originalStates).toEqual([]);
  await search.fill('合成测试不存在的主题');
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有匹配的文章' })).toBeVisible();
  await page.getByRole('button', { name: '查看全部文章' }).click();
  await page.getByRole('group', { name: '文章类型' }).getByRole('button', { name: /^论文/ }).click();
  await expect(page.locator('.guide-entry')).toHaveCount(paperCount);
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await page.locator('#choose-instructgpt').press('Enter');
  await expect(page.locator('#orientation-title')).toContainText('InstructGPT');
  await expect(page.locator('.paper-original-title')).toContainText('Training language models');
  await expect(page.locator('.orientation-masthead')).toContainText('2022');
  await expect(page.locator('.orientation-prose')).toContainText('为什么值得读');
  const selectedURL = page.url();
  await page.getByRole('link', { name: '开始导读' }).click();
  await expect(page).toHaveURL(new RegExp(`/read/instructgpt/${revision.instructgpt}$`));
  await expect(page.locator('.prose')).toContainText('三个阶段各自解决一个问题');
  // Body rendering and the debounced resume write are separate asynchronous
  // steps. Establish the saved-position prerequisite before expecting Continue.
  await expect.poll(() => page.evaluate(async current => Boolean(await (await import('/src/records/store.ts')).personalStore.get('resume', `instructgpt/${current}`)), revision.instructgpt)).toBe(true);
  await page.goBack(); await expect(page).toHaveURL(selectedURL);
  await expect(page.getByRole('button', { name: /^论文/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#choose-instructgpt')).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await expect(page.locator('#orientation-title')).toContainText('InstructGPT');
  const enter = page.getByRole('link', { name: '继续阅读', exact: true });
  await enter.scrollIntoViewIfNeeded(); await enter.focus();
  const before = await page.evaluate(() => scrollY);
  await enter.press('Enter');
  await page.locator('.back-link:visible, .reader-mobile-back:visible').click();
  await expect(page).toHaveURL(selectedURL);
  await expect(page.locator('#start-instructgpt')).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(5);
});

test('desktop and narrow two-level navigation restore the query, selection and focused article', async ({ page }) => {
  await mkdir('docs/evidence', { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/library');
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await page.screenshot({ path: 'docs/evidence/library-dual-browse-desktop.png', animations: 'disabled' });
  await page.locator('#choose-instructgpt').click();
  await expect(page.locator('#orientation-title')).toBeFocused();
  await page.screenshot({ path: 'docs/evidence/library-dual-orientation-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: '关闭导学', exact: true }).click();
  await expect(page.locator('#choose-instructgpt')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#orientation-title')).toContainText('InstructGPT');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/library');
  await expect(page.locator('.library-shelf')).toBeVisible();
  await expect(page.locator('.library-preview')).not.toBeVisible();
  await page.getByRole('searchbox', { name: '查找文章' }).fill('HELM');
  await page.locator('#choose-helm').click();
  await expect(page.locator('.library-shelf')).not.toBeVisible();
  await expect(page.locator('#orientation-title')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'docs/evidence/library-dual-query-narrow.png', animations: 'disabled' });
  await page.getByRole('link', { name: '开始导读' }).click();
  await expect(page).toHaveURL(new RegExp(`/read/helm/${revision.helm}$`));
  await page.goBack();
  await expect(page.locator('#orientation-title')).toContainText('HELM');
  await page.getByRole('button', { name: '返回筛选结果' }).click();
  await expect(page.locator('#choose-helm')).toBeFocused();
  await expect(page.getByRole('searchbox', { name: '查找文章' })).toHaveValue('HELM');
  await expect(page.locator('.guide-entry')).toHaveCount(1);
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a late article keeps its adjacent preview and reading return position through history and reload', async ({ page }) => {
  await page.goto(`/library?article=${lastGuide.guideId}`);
  const row = page.locator(`#choose-${lastGuide.guideId}`);
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('#orientation-title')).toBeInViewport();
  const selectedURL = page.url();
  const aligned = async () => {
    await expect.poll(async () => {
      const selected = await row.boundingBox(), card = await page.locator('.library-preview').boundingBox();
      const layout = await page.locator('.library-layout').boundingBox();
      if (!selected || !card || !layout) return Infinity;
      const expectedTop = Math.max(layout.y, selected.y + selected.height / 2 - card.height / 2);
      return Math.abs(card.y - expectedTop);
    }).toBeLessThan(2);
  };
  await aligned();
  await page.reload();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('#orientation-title')).toBeInViewport();
  await aligned();
  const enter = page.getByRole('link', { name: '开始导读' });
  await enter.scrollIntoViewIfNeeded(); await enter.focus();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(300);
  await enter.press('Enter');
  await expect(page).toHaveURL(`/read/${lastGuide.guideId}/${lastGuide.revision}`);
  await page.locator('.back-link:visible, .reader-mobile-back:visible').click();
  await expect(page).toHaveURL(selectedURL);
  await expect(page.locator(`#start-${lastGuide.guideId}`)).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(5);
  await aligned();
  await page.getByRole('button', { name: '关闭导学', exact: true }).click();
  await expect(row).toBeFocused(); await expect(row).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(selectedURL);
  await aligned();
  await page.goForward();
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await expect(row).toBeFocused(); await expect(row).toBeInViewport();
  const snapshot = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(snapshot.guideStates).toEqual([]); expect(snapshot.originalStates).toEqual([]);
});
