import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const compact = (text: string) => text.replace(/\s+/g, '');
async function shot(page: Page, name: string) {
  await mkdir('.cache/screenshots', { recursive: true });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `.cache/screenshots/${name}.png`, animations: 'disabled' });
}
async function bounded(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('dialog name and keyboard focus survive successive edits', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: '创建自己的问题' }).click();
  const dialog = page.locator('dialog');
  await expect(dialog).toHaveAccessibleName('创建一个探索问题');
  await dialog.getByLabel('探索标题', { exact: true }).fill('合成测试问题');
  await expect(dialog).toHaveAccessibleName('创建一个探索问题');
  await dialog.getByRole('button', { name: '丢弃草稿' }).click();
  await page.getByRole('button', { name: '创建自己的问题' }).click();
  await dialog.getByLabel('探索标题', { exact: true }).fill('合成测试重新打开');
  await expect(dialog).toHaveAccessibleName('创建一个探索问题');
  await dialog.getByLabel('我想继续追问的问题', { exact: true }).fill('合成测试：如何回到材料？');
  await expect(dialog).toHaveAccessibleName('创建一个探索问题');
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '创建自己的问题' })).toBeFocused();
});

for (const id of ['agent-survey', 'instructgpt', 'helm']) {
  test(`full approved ${id} prose, desktop/narrow visual evidence and citation return`, async ({ page, context }) => {
    const errors: string[] = [], outbound: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url()); });
    await page.goto(`/read/${id}/1`);
    await expect(page.locator('#orientation p').first()).toBeInViewport();
    const body = await readFile(`content/guides/${id}.md`, 'utf8');
    const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
    const text = (node: any): string => typeof node.value === 'string' ? node.value : (node.children ?? []).map(text).join('');
    const prose: string[] = [];
    function visit(node: any) {
      if (['paragraph', 'heading', 'tableCell'].includes(node.type)) prose.push(text(node));
      else for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    const actual = compact(await page.locator('.prose').evaluate(node => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[aria-hidden="true"]').forEach(item => item.remove());
      return clone.textContent ?? '';
    }));
    for (const part of prose) expect(actual).toContain(compact(part));
    if (id !== 'helm') await expect(page.locator('.teaching-diagram svg')).toBeVisible();
    await bounded(page); await shot(page, `v1-${id}-desktop`);
    const detail = id === 'helm' ? page.locator('.table-scroll').first() : page.locator('.teaching-diagram');
    await detail.scrollIntoViewIfNeeded(); await shot(page, `v1-${id}-detail-desktop`);
    const citation = page.locator('.citation-button').first();
    await citation.scrollIntoViewIfNeeded(); await citation.focus();
    const before = await page.evaluate(() => scrollY);
    const locator = (await citation.getAttribute('aria-label')) ?? ''; expect(locator).toBeTruthy(); await citation.press('Enter');
    const dialog = page.getByRole('dialog', { name: '来源详情' });
    await expect(dialog).toContainText(locator); await expect(dialog).toContainText('手动查找');
    await expect(dialog.locator('.source-facts')).not.toContainText('未指定固定版本');
    await expect(dialog.getByRole('link', { name: '打开原文（新标签页）' })).toHaveAttribute('href', /^https:\/\//);
    await shot(page, `v1-${id}-source`); await page.keyboard.press('Escape');
    await expect(citation).toBeFocused(); expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(5);
    await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
    await expect(page.locator('#orientation p').first()).toBeInViewport();
    await bounded(page); await shot(page, `v1-${id}-narrow`);
    await detail.scrollIntoViewIfNeeded(); await bounded(page); await shot(page, `v1-${id}-detail-narrow`);
    const region = id === 'helm' ? page.locator('.table-scroll').first() : page.locator('.diagram-scroll');
    await region.focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    await shot(page, `v1-${id}-detail-end-narrow`);
    // This is a CSS 200% zoom reflow simulation, explicitly not a physical phone or native browser zoom test.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await detail.scrollIntoViewIfNeeded(); await bounded(page); await shot(page, `v1-${id}-zoom200`);
    expect(outbound).toEqual([]); expect(errors).toEqual([]);
  });
}

test('all platform surfaces remain usable at desktop and simulated narrow widths', async ({ page }) => {
  const surfaces = [['/', 'home'], ['/library', 'library'], ['/explore', 'explore'], ['/explore/lenses/application-construction', 'lens'], ['/notes', 'notes-empty'], ['/backup', 'backup']] as const;
  for (const [url, name] of surfaces) {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await bounded(page); await shot(page, `v1-${name}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await bounded(page); await shot(page, `v1-${name}-narrow`);
  }
});
