import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import catalog from '../content/catalog.json' with { type: 'json' };

const revisions = catalog.currentRevisions as Record<string, number>;
const currentEntries = catalog.entries.filter(entry => revisions[entry.guideId] === entry.revision).sort((a, b) => a.recommendation.rank - b.recommendation.rank);
const lastGuide = currentEntries.at(-1)!;
const noPageOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
const noNestedVerticalScroll = async (page: Page) => {
  const scrollers = await page.locator('.library-shelf, .library-preview').evaluateAll(elements => elements
    .filter(element => element.getClientRects().length > 0)
    .filter(element => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1)
    .map(element => element.className));
  expect(scrollers).toEqual([]);
};
const singleArticleRows = async (page: Page) => {
  const boxes = await page.locator('.guide-entry').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, bottom: box.bottom };
  }));
  expect(boxes.length).toBeGreaterThan(1);
  for (let index = 1; index < boxes.length; index++) {
    expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThan(2);
    expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThan(2);
    expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].bottom);
  }
};
const centeredBrowse = async (page: Page) => {
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const layout = (await page.locator('.library-layout').boundingBox())!;
  expect(Math.abs(layout.x + layout.width / 2 - viewportWidth / 2)).toBeLessThan(2);
  expect(layout.width).toBeLessThanOrEqual(900);
  for (const selector of ['.library-heading', '.library-shelf', '.library-search-box']) {
    const bounds = (await page.locator(selector).boundingBox())!;
    expect(Math.abs(bounds.x - layout.x)).toBeLessThan(2);
    expect(Math.abs(bounds.width - layout.width)).toBeLessThan(2);
  }
  if (viewportWidth >= 1024) expect(layout.width).toBe(900);
};
const previewBesideSelected = async (page: Page, guideId: string) => {
  await expect.poll(async () => {
    const article = await page.locator(`#choose-${guideId}`).boundingBox();
    const card = await page.locator('.library-preview').boundingBox();
    const layout = await page.locator('.library-layout').boundingBox();
    if (!article || !card || !layout) return Infinity;
    // Keep both centers aligned wherever the card fits above the selected row.
    // The first rows instead stop at the workspace's top boundary.
    const expectedTop = Math.max(layout.y, article.y + article.height / 2 - card.height / 2);
    return Math.abs(card.y - expectedTop);
  }).toBeLessThan(2);
  const article = (await page.locator(`#choose-${guideId}`).boundingBox())!;
  const card = (await page.locator('.library-preview').boundingBox())!;
  expect(card.x - article.x - article.width).toBeGreaterThanOrEqual(12);
  expect(card.x - article.x - article.width).toBeLessThanOrEqual(36);
  expect(card.width).toBeLessThan(article.width);
  expect(await page.locator('.library-preview').evaluate(element => getComputedStyle(element, '::before').content)).toMatch(/^(none|normal)$/);
  await noNestedVerticalScroll(page);
};

test('keyboard browsing uses the page scroll and the last article opens a dismissible preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto('/library');
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await page.getByRole('searchbox', { name: '查找文章' }).focus();
  let reachedLast = false;
  for (let index = 0; index < currentEntries.length + 12; index++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id) === `choose-${lastGuide.guideId}`) { reachedLast = true; break; }
  }
  expect(reachedLast).toBe(true);
  const last = page.locator(`#choose-${lastGuide.guideId}`);
  await expect(last).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await noNestedVerticalScroll(page);
  expect(await page.locator('.library-shelf').evaluate(element => element.scrollTop)).toBe(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('#orientation-title')).toBeInViewport();
  await expect(page.getByRole('link', { name: '进入深入阅读' })).toHaveAttribute('href', `/read/${lastGuide.guideId}/${lastGuide.revision}`);
  await previewBesideSelected(page, lastGuide.guideId);
  await noNestedVerticalScroll(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#orientation-title')).toHaveCount(0);
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#orientation-title')).toBeFocused();
  await page.getByRole('button', { name: '关闭导学', exact: true }).click();
  await expect(last).toBeFocused();
  await expect(page).not.toHaveURL(/article=/);
});

test('opening expands the centered workspace and the preview follows each article at a stable open-state row width', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('docs/evidence', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/library');
  await singleArticleRows(page);
  await centeredBrowse(page);
  const originalWidth = (await page.locator('.guide-entry').first().boundingBox())!.width;
  let openWidth = 0;
  const samples = [currentEntries[0], currentEntries[Math.floor(currentEntries.length / 2)], lastGuide];
  for (const [index, entry] of samples.entries()) {
    const row = page.locator(`#choose-${entry.guideId}`);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(page.locator('#orientation-title')).toBeFocused();
    await expect(page.locator('#orientation-title')).toBeInViewport();
    await expect(page.getByRole('link', { name: '进入深入阅读' })).toBeInViewport();
    await previewBesideSelected(page, entry.guideId);
    const rowWidth = (await row.boundingBox())!.width;
    if (index === 0) {
      openWidth = rowWidth;
      expect(originalWidth - rowWidth).toBeGreaterThan(100);
    } else expect(Math.abs(rowWidth - openWidth)).toBeLessThan(2);
    const before = await page.evaluate(() => scrollY);
    if (index > 0) expect(before).toBeGreaterThan(300);
    await row.click();
    await expect(page.locator('#orientation-title')).toBeFocused();
    await expect(page.getByRole('link', { name: '进入深入阅读' })).toBeInViewport();
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(5);
    await previewBesideSelected(page, entry.guideId);
    await page.screenshot({ path: `docs/evidence/library-dual-anchored-${index === 0 ? 'first' : index === 1 ? 'middle' : 'last'}.png`, animations: 'disabled' });
  }
  // Reflow changes earlier rows' text wrapping, so the last article must remain the anchor.
  await page.setViewportSize({ width: 1024, height: 900 });
  await previewBesideSelected(page, lastGuide.guideId);
  await singleArticleRows(page);
  await page.setViewportSize({ width: 1920, height: 900 });
  await previewBesideSelected(page, lastGuide.guideId);
  await page.keyboard.press('Escape');
  await expect(page.locator(`#choose-${lastGuide.guideId}`)).toBeFocused();
  await expect(page.locator(`#choose-${lastGuide.guideId}`)).toBeInViewport();
  await centeredBrowse(page);
  expect(Math.abs((await page.locator('.guide-entry').first().boundingBox())!.width - originalWidth)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('selected identity, source disclosures and chapters remain keyboard accessible', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '书架' })).toHaveAttribute('aria-current', 'page');
  await page.locator('#choose-instructgpt').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#orientation-title')).toContainText('InstructGPT');
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('#orientation-title')).toBeInViewport();
  await page.locator('#choose-instructgpt').click();
  await expect(page.locator('#orientation-title')).toBeFocused();
  const preparation = page.locator('.orientation-preparation');
  await preparation.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(preparation).toHaveAttribute('open', '');
  await expect(preparation.getByRole('heading', { name: '带着哪些基础开始' })).toBeVisible();
  await expect(preparation.getByRole('heading', { name: '本次阅读的范围' })).toBeVisible();
  const source = page.locator('.orientation-source');
  await source.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(source).toHaveAttribute('open', '');
  await expect(source).toContainText('完整作者');
  await expect(source).toContainText('首次预印本 2022 年');
  for (const link of await source.getByRole('link').all()) await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await noNestedVerticalScroll(page);
  await page.locator('.orientation-outline summary').focus(); await page.keyboard.press('Enter');
  const chapter = page.locator('.orientation-outline a').first();
  await expect(chapter).toHaveAttribute('href', new RegExp(`/read/instructgpt/${revisions.instructgpt}#`));
  await chapter.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/read/instructgpt/${revisions.instructgpt}#`));
});

test('expanding and collapsing card details preserves keyboard focus and recenters beside a late article', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/library?article=${lastGuide.guideId}`);
  const card = page.locator('.library-preview');
  await expect(page.locator('#orientation-title')).toBeFocused();
  await previewBesideSelected(page, lastGuide.guideId);
  const closedHeight = (await card.boundingBox())!.height;
  const preparation = page.locator('.orientation-preparation');
  const toggle = preparation.locator('summary');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(preparation).toHaveAttribute('open', '');
  await expect(toggle).toBeFocused();
  await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(closedHeight + 40);
  await previewBesideSelected(page, lastGuide.guideId);
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preparation).not.toHaveAttribute('open', '');
  await previewBesideSelected(page, lastGuide.guideId);
  await expect(toggle).toBeFocused();
  expect(Math.abs((await card.boundingBox())!.height - closedHeight)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('centered browsing and wider two-column reading reflow across wide, narrow and zoom simulations', async ({ page, context }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url()); });
  await mkdir('docs/evidence', { recursive: true });
  const shot = async (name: string, fullPage = false) => {
    await noPageOverflow(page); await noNestedVerticalScroll(page);
    await page.screenshot({ path: `docs/evidence/library-dual-${name}.png`, fullPage, animations: 'disabled' });
  };
  for (const width of [2560, 1920, 1440, 1280, 1024, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/library');
    await expect(page.locator('#orientation-title')).toHaveCount(0);
    await singleArticleRows(page);
    await centeredBrowse(page);
    const fullListWidth = (await page.locator('.library-shelf').boundingBox())!.width;
    await shot(`browse-${width}`);
    await page.locator('#choose-instructgpt').click();
    await expect(page.locator('#orientation-title')).toBeFocused();
    await expect(page.locator('#orientation-title')).toBeInViewport();
    if (width >= 1024) {
      const list = (await page.locator('.library-shelf').boundingBox())!;
      const card = (await page.locator('.library-preview').boundingBox())!;
      const layout = (await page.locator('.library-layout').boundingBox())!;
      expect(card.x).toBeGreaterThan(width / 2);
      expect(card.width).toBeLessThan(list.width);
      expect(card.width).toBeGreaterThanOrEqual(340);
      expect(card.width).toBeLessThanOrEqual(540);
      if (width >= 1440) expect(card.width).toBe(540);
      expect(layout.width).toBeLessThanOrEqual(1360);
      expect(layout.width).toBeGreaterThan(fullListWidth);
      expect(Math.abs(card.x + card.width - layout.x - layout.width)).toBeLessThan(2);
      expect(list.x + list.width).toBeLessThanOrEqual(card.x);
      expect(fullListWidth - list.width).toBeGreaterThan(100);
      await previewBesideSelected(page, 'instructgpt');
      await singleArticleRows(page);
    }
    await shot(`selected-${width}`);
    if (width === 1280) await shot('selected-full', true);
    await page.getByRole('button', { name: '关闭导学', exact: true }).click();
    await expect(page.locator('#choose-instructgpt')).toBeFocused();
    await expect(page.locator('#orientation-title')).toHaveCount(0);
    await centeredBrowse(page);
    expect(Math.abs((await page.locator('.library-shelf').boundingBox())!.width - fullListWidth)).toBeLessThan(2);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library'); await shot('narrow-list');
  await page.locator('#choose-instructgpt').click();
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('.library-shelf')).not.toBeVisible();
  await shot('narrow-orientation'); await shot('narrow-full', true);
  await page.getByRole('button', { name: '返回筛选结果' }).click();
  await expect(page.locator('#choose-instructgpt')).toBeFocused();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/library'); await noPageOverflow(page);
  await page.locator('#choose-helm').click(); await shot('small-orientation');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/library?article=instructgpt');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.locator('.library-shelf')).not.toBeVisible();
  await expect(page.locator('#orientation-title')).toBeVisible();
  await shot('css-zoom-200');
  await page.getByRole('button', { name: '返回筛选结果' }).click();
  await expect(page.locator('#choose-instructgpt')).toBeFocused();
  await page.locator('#choose-helm').click();
  await expect(page.locator('#orientation-title')).toBeFocused();
  await expect(page.locator('.library-shelf')).not.toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  expect(errors).toEqual([]); expect(external).toEqual([]);
});
