import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import catalog from '../content/catalog.json' with { type: 'json' };

const readerRoute = '/read/agent-survey/1';
const evidence = 'docs/evidence';
const normalize = (text: string) => text.replace(/\s+/g, '');

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function screenshot(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' });
}

test('complete approved prose, stable sections, visible orientation and teaching diagram', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(readerRoute);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agent 综述：理解大模型怎样进入环境并持续行动');
  const intro = page.locator('#orientation p').first();
  await expect(intro).toBeInViewport();
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const document = await session.send('DOM.getDocument');
  const paragraphNode = await session.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#orientation p' });
  const fonts = await session.send('CSS.getPlatformFontsForNode', { nodeId: paragraphNode.nodeId });
  console.log(`Rendered paragraph fonts: ${fonts.fonts.map(font => font.familyName).join(', ')}`);
  await session.detach();
  await screenshot(page, 'w1-desktop-first');
  const markdown = await readFile('content/guides/agent-survey.md', 'utf8');
  const metadata = JSON.parse(await readFile('content/guides/agent-survey.json', 'utf8'));
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const texts: string[] = [];
  function visit(node: any) {
    if (node.type === 'paragraph' || (node.type === 'heading' && node.depth !== 1)) {
      const text = (item: any): string => typeof item.value === 'string' ? item.value : (item.children ?? []).map(text).join('');
      texts.push(text(node));
    } else for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  const displayed = normalize(await page.locator('.prose').evaluate(element => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return copy.textContent ?? '';
  }));
  for (const paragraph of texts) expect(displayed).toContain(normalize(paragraph));
  for (const unit of metadata.units) {
    await expect(page.locator(`[id="${unit.id}"]`)).toHaveCount(1);
    if (unit.heading) await expect(page.locator('.prose').getByRole('heading', { name: unit.heading, exact: true })).toBeVisible();
  }
  const diagram = page.locator('.teaching-diagram');
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.locator('svg')).toBeVisible();
  for (const label of ['任务与角色背景', '结合当前观察和相关记忆', '安排下一步', '执行动作', '环境返回结果']) {
    await expect(diagram.locator('svg')).toContainText(label);
  }
  await expect(diagram.locator('foreignObject')).toHaveCount(0);
  await expect(diagram).toContainText('教学示意');
  await noPageOverflow(page);
  await screenshot(page, 'w1-desktop-diagram');
  await page.locator('#u07').scrollIntoViewIfNeeded();
  await screenshot(page, 'w1-desktop-lower');
  if (await page.locator('#u07').evaluate(element => element.getBoundingClientRect().top < 180)) {
    await expect(page.locator('.reading-sidebar a[aria-current="location"]')).toHaveAttribute('href', '#u07');
  }
  expect(errors).toEqual([]);
});

test('keyboard citation dialog, source-opening contract, position and focus return', async ({ page, context }) => {
  const outbound: string[] = [];
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url());
  });
  // Deliberately mock the external document; this checks UI behavior, not availability or a PDF locator.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:4174\/)/, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Synthetic source fixture</title><p>Synthetic external-source fixture. No source content was fetched.</p>',
  }));
  await page.goto(readerRoute);
  let citationReached = false;
  for (let index = 0; index < 50; index++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.classList.contains('citation-button'))) {
      citationReached = true;
      break;
    }
  }
  expect(citationReached).toBe(true);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '来源详情' });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.classList.contains('citation-button'))).toBe(true);
  const citation = page.getByRole('button', { name: '图2，PDF 第4页', exact: true });
  await citation.scrollIntoViewIfNeeded();
  await citation.focus();
  const priorScroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('图2，PDF 第4页');
  await expect(dialog).toContainText('v7');
  await expect(dialog).toContainText('手动查找');
  await screenshot(page, 'w1-desktop-source');
  const original = dialog.getByRole('link', { name: '打开原文（新标签页）' });
  await expect(original).toHaveAttribute('href', 'https://arxiv.org/pdf/2308.11432v7#page=4');
  await expect(original).toHaveAttribute('target', '_blank');
  await expect(original).toHaveAttribute('rel', /noopener/);
  await expect(original).toHaveAttribute('rel', /noreferrer/);
  expect(outbound).toEqual([]);
  const popupPromise = page.waitForEvent('popup');
  await original.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://arxiv.org/pdf/2308.11432v7#page=4');
  await popup.close();
  expect(outbound.length).toBe(1);
  await dialog.getByRole('button', { name: '返回阅读', exact: true }).click();
  await expect(citation).toBeFocused();
  expect(Math.abs((await page.evaluate(() => scrollY)) - priorScroll)).toBeLessThan(3);
});

test('internal related-guide navigation restores guide, version, position and focus', async ({ page }) => {
  await page.goto(readerRoute);
  const related = page.locator('.prose').getByRole('link', { name: 'InstructGPT', exact: true });
  await related.scrollIntoViewIfNeeded();
  await related.focus();
  const priorScroll = await page.evaluate(() => scrollY);
  await related.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/read/instructgpt/${catalog.currentRevisions.instructgpt}`));
  await page.goBack();
  await expect(page).toHaveURL(/\/read\/agent-survey\/1/);
  await expect(related).toBeFocused();
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - priorScroll)).toBeLessThan(5);
  await page.getByRole('link', { name: '应用不同，“做好了”的含义也不同', exact: true }).click();
  await expect(page).toHaveURL(/#u04$/);
  await expect(page.locator('#u04')).toBeFocused();
  const chapterScroll = await page.evaluate(() => scrollY);
  await page.goBack();
  await expect(page).toHaveURL(/\/read\/agent-survey\/1$/);
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - priorScroll)).toBeLessThan(5);
  await page.goForward();
  await expect(page).toHaveURL(/#u04$/);
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - chapterScroll)).toBeLessThan(5);
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.getByRole('link', { name: '应用不同，“做好了”的含义也不同', exact: true }).click();
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - chapterScroll)).toBeLessThan(5);
});

test('390px reading, collapsed contents, diagram and source remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(readerRoute);
  await expect(page.locator('#orientation p').first()).toBeInViewport();
  await noPageOverflow(page);
  await screenshot(page, 'w1-narrow-first');
  const summary = page.locator('summary').filter({ hasText: '本文目录' });
  await expect(summary).toBeVisible();
  await summary.press('Enter');
  const contents = summary.locator('..');
  await contents.getByRole('link', { name: '把组成连接起来，仍要解释能力从哪里来', exact: true }).click();
  await expect(page).toHaveURL(/#u03$/);
  const diagram = page.locator('.teaching-diagram');
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram.locator('svg')).toContainText('任务与角色背景');
  await noPageOverflow(page);
  await screenshot(page, 'w1-narrow-diagram');
  await page.locator('#u07').scrollIntoViewIfNeeded();
  await noPageOverflow(page);
  await screenshot(page, 'w1-narrow-lower');
  const citation = page.getByRole('button', { name: '图2及紧接着的说明，PDF 第4页', exact: true });
  await citation.click();
  const dialog = page.getByRole('dialog', { name: '来源详情' });
  await expect(dialog).toBeVisible();
  await noPageOverflow(page);
  await screenshot(page, 'w1-narrow-source');
  await page.keyboard.press('Escape');
  await expect(citation).toBeFocused();
  await page.getByRole('button', { name: '增大字号', exact: true }).click();
  await noPageOverflow(page);
});

test('synthetic formula/table and hostile Markdown stay bounded and inert', async ({ page, context }) => {
  const outbound: string[] = [];
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/__fixtures/reader');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('技术测试');
  await expect(page.locator('.katex')).not.toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(1);
  await expect(page.locator('.formula-error')).toContainText('公式未能显示');
  await expect(page.locator('.teaching-diagram')).toContainText('图示暂时无法绘制');
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('img[src^="https:"]')).toHaveCount(0);
  await expect(page.locator('.prose script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { syntheticExecuted?: boolean }).syntheticExecuted)).toBeUndefined();
  await noPageOverflow(page);
  const overflowRegions = page.locator('[tabindex="0"]').filter({ has: page.locator('table, .katex') });
  expect(await overflowRegions.count()).toBeGreaterThan(0);
  const tableRegion = page.locator('.table-scroll');
  expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await tableRegion.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await screenshot(page, 'w1-synthetic-overflow');
  await page.locator('.formula-scroll').first().scrollIntoViewIfNeeded();
  await screenshot(page, 'w1-synthetic-formula');
  expect(outbound).toEqual([]);
});

test('missing revision is explicit and does not silently change text', async ({ page }) => {
  await page.goto('/read/agent-survey/999');
  await expect(page).toHaveURL(/\/read\/agent-survey\/999$/);
  await expect(page.getByRole('link', { name: /当前.*版本/ })).toHaveAttribute('href', `/read/agent-survey/${catalog.currentRevisions['agent-survey']}`);
  await expect(page.locator('.prose')).toHaveCount(0);
});
