import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import catalog from '../../content/catalog.json' with { type: 'json' };

const current = catalog.currentRevisions as Record<string, number>;
const archived = (catalog as { archivedGuideIds?: string[] }).archivedGuideIds ?? [];
const screenshotDirectory = '.cache/screenshots/research-refresh';

async function metadata(id: string) {
  const entry = catalog.entries.find(item => item.guideId === id && item.revision === current[id]);
  expect(entry, `retained catalog identity for ${id}`).toBeDefined();
  return JSON.parse(await readFile(`content/${entry!.metadataFile}`, 'utf8'));
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function narrowReader(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  // An open desktop AI column becomes a drawer on narrow viewports.
  const closeAi = page.getByRole('button', { name: '收起 AI 解读', exact: true });
  if (await closeAi.isVisible()) await closeAi.click();
}

async function showDiagramTail(page: Page, id: string, unitId: string, label: string, viewport: string) {
  const diagram = page.locator(`#${unitId} .teaching-diagram`);
  const scroll = diagram.locator('.diagram-scroll');
  await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  const tail = diagram.locator('svg .node').filter({ hasText: label });
  await expect(tail).toHaveCount(1);
  const region = await scroll.boundingBox(), node = await tail.boundingBox();
  expect(region).not.toBeNull(); expect(node).not.toBeNull();
  expect(node!.x).toBeGreaterThanOrEqual(region!.x - 1);
  expect(node!.x + node!.width).toBeLessThanOrEqual(region!.x + region!.width + 1);
  await diagram.screenshot({ path: `${screenshotDirectory}/${id}-diagram-tail-${viewport}.png` });
}

// Fresh, isolated browser records only. No provider credentials or real model calls.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/ai/status'
      ? { configured: false, model: null, searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: false, chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false } }
      : path === '/api/ai/conversations' ? { conversations: [] } : {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
});

test('the refreshed library exposes 18 readings in seven surveys and eleven papers', async ({ page }) => {
  expect(archived).toHaveLength(6);
  await page.goto('/library');
  await expect(page.locator('.guide-entry')).toHaveCount(18);
  await expect(page.locator('.library-result-count')).toHaveText('18 篇文章');
  for (const id of archived) await expect(page.locator(`#choose-${id}`)).toHaveCount(0);

  await page.locator('#library-type-survey').click();
  await expect(page.locator('.guide-entry')).toHaveCount(7);
  await page.locator('#library-type-paper').click();
  await expect(page.locator('.guide-entry')).toHaveCount(11);

  const state = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(state.guideStates).toEqual([]);
  expect(state.originalStates).toEqual([]);
  expect(state.notes).toEqual([]);
});

test('archived readings remain available at their retained revision URLs', async ({ page }) => {
  for (const id of archived) {
    const guide = await metadata(id);
    await page.goto(`/read/${id}/${current[id]}`);
    await expect(page.locator('.prose h1')).toHaveText(guide.title);
    await expect(page.locator('.article-labels')).toContainText(`导读修订 ${current[id]}`);
    await expect(page.locator('.prose section')).toHaveCount(guide.units.length);
  }
  const state = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(state.guideStates).toEqual([]);
  expect(state.originalStates).toEqual([]);
});

test('the three communication guides render their teaching diagrams and exact source entry', async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });
  for (const [id, unitId, label, tail] of [
    ['autogen', 'u03', '返回结果或错误', '条件成立时结束本次对话'],
    ['camel', 'u02', '提出当前指令', '触发条件时保留结果并结束'],
    ['agentprune', 'u03', '固定稀疏通信图', '继续任务并评价效果与成本'],
  ]) {
    const guide = await metadata(id);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/read/${id}/${current[id]}#${unitId}`);
    const diagram = page.locator(`#${unitId} .teaching-diagram`);
    await expect(diagram.locator('svg')).toBeVisible();
    await expect(diagram.locator('svg')).toContainText(label);
    await expect(page.locator('.formula-error')).toHaveCount(0);
    await diagram.screenshot({ path: `${screenshotDirectory}/${id}-diagram-desktop.png` });
    await showDiagramTail(page, id, unitId, tail, 'desktop');

    const source = page.locator('.prose').getByRole('button', { name: 'HTML 全文', exact: true });
    await source.click();
    await expect(page.getByRole('dialog').getByRole('link', { name: /打开原文/ })).toHaveAttribute('href', guide.source.url);
    await page.getByRole('button', { name: /返回阅读/ }).click();
    await expect(source).toBeFocused();

    await narrowReader(page);
    await diagram.locator('.diagram-scroll').evaluate(element => { element.scrollLeft = 0; });
    await diagram.scrollIntoViewIfNeeded();
    await expect(diagram.locator('svg')).toBeVisible();
    await noPageOverflow(page);
    await diagram.screenshot({ path: `${screenshotDirectory}/${id}-diagram-narrow.png` });
    await showDiagramTail(page, id, unitId, tail, 'narrow');
  }
});

test('AgentBench and tau-bench render both display formulas and preserve narrow layout', async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });
  for (const id of ['agentbench', 'tau-bench']) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/read/${id}/${current[id]}#u04`);
    await expect(page.locator('.prose .formula-block .katex')).toHaveCount(2);
    await expect(page.locator('.formula-error')).toHaveCount(0);
    const formula = page.locator('#u04 .formula-block');
    await expect(formula.locator('.katex')).toBeVisible();
    await formula.screenshot({ path: `${screenshotDirectory}/${id}-formula-desktop.png` });
    await narrowReader(page);
    await formula.scrollIntoViewIfNeeded();
    await expect(formula.locator('.katex')).toBeVisible();
    await noPageOverflow(page);
    await formula.screenshot({ path: `${screenshotDirectory}/${id}-formula-narrow.png` });
  }
});
