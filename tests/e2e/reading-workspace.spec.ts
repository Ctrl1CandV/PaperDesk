import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import catalog from '../../content/catalog.json' with { type: 'json' };
import type { AiStatus } from '../../src/assistant/api';

// AI responses are synthetic. Each test uses a fresh browser context and blocks
// all external requests; these checks do not contact a model or fetch a paper.
test.use({ serviceWorkers: 'block' });
const unexpectedRequests = new WeakMap<BrowserContext, string[]>();
const reader = `/read/agent-survey/${catalog.currentRevisions['agent-survey']}`;
const readerEntry = catalog.entries.find(entry => entry.guideId === 'agent-survey' && entry.revision === catalog.currentRevisions['agent-survey'])!;
const readerMetadata = JSON.parse(readFileSync(new URL(`../../content/${readerEntry.metadataFile}`, import.meta.url), 'utf8')) as { units: { id: string; heading: string | null }[] };
const firstChapter = readerMetadata.units[3].id, nextChapter = readerMetadata.units[4].id;
// The retained r1 supplies a reviewed Mermaid diagram for renderer regression.
// Current-revision layout and original-figure coverage use `reader` and Transformer below.
const diagramReader = '/read/agent-survey/1';
test.beforeEach(async ({ context, baseURL }) => {
  const unexpected: string[] = [];
  unexpectedRequests.set(context, unexpected);
  const status: AiStatus = { configured: true, model: 'synthetic-layout-model', searchAvailable: false,
    csrfToken: 'synthetic-layout-token', provider: 'api', apiConfigured: true,
    chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false,
      availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } } };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    if (url.pathname === '/api/ai/status' || url.pathname === '/api/ai/conversations') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/status') ? status : { conversations: [] }) }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
});
test.afterEach(async ({ context }) => { expect(unexpectedRequests.get(context)).toEqual([]); });

async function ready(page: Page) {
  await expect(page.locator('.prose h1')).toBeVisible();
  await expect(page.locator('.diagram-scroll[aria-busy="true"]')).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function capture(page: Page, name: string) {
  await mkdir('.cache/feedback-round/after', { recursive: true });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `.cache/feedback-round/after/${name}.png`, animations: 'disabled' });
}
async function settledAnchor(page: Page, id: string) {
  await expect.poll(() => page.locator(`#${id}`).evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.locator(`#${id}`).evaluate(node => node.getBoundingClientRect().top)).toBeLessThan(150);
}

for (const width of [1100, 1200, 1280, 1440, 1920, 2560]) test(`reader expands its prose when AI closes and restores the dock at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(reader);
  await ready(page);
  const sidebar = page.locator('.reading-sidebar'), prose = page.locator('.prose'), assistant = page.locator('.reader-assistant-slot');
  await expect(assistant).toBeInViewport();
  const middle = (await prose.boundingBox())!, right = (await assistant.boundingBox())!;
  if (width >= 1200) {
    await expect(sidebar).toBeInViewport();
    const left = (await sidebar.boundingBox())!;
    expect(left.x + left.width).toBeLessThan(middle.x);
  } else await expect(sidebar).toBeHidden();
  expect(middle.x + middle.width).toBeLessThan(right.x);
  expect(right.x + right.width).toBeLessThanOrEqual(width);
  expect(middle.width).toBeGreaterThan(360);
  expect(middle.width).toBeLessThanOrEqual(833);
  if (width >= 1440) {
    const left = (await sidebar.boundingBox())!;
    expect(right.width).toBeGreaterThan(380);
    expect(left.width).toBeGreaterThan(210);
    const workspaceShare = (right.x + right.width - left.x) / width;
    expect(workspaceShare).toBeGreaterThan(width >= 1920 ? .74 : .85);
    expect(workspaceShare).toBeLessThan(width >= 1920 ? .90 : .94);
    expect(await page.locator('.reading-sidebar .reading-tools').count()).toBe(1);
    await expect(page.locator('.reading-tools')).toHaveCSS('position', 'static');
  }
  await capture(page, `reader-${width}-open`);
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  await expect(assistant).toHaveCount(0);
  await expect(sidebar).toBeInViewport();
  const closed = (await prose.boundingBox())!;
  const paragraph = (await prose.locator('p').first().boundingBox())!;
  expect(closed.width).toBeGreaterThan(middle.width + 80);
  expect(Math.abs(paragraph.width - closed.width)).toBeLessThan(1);
  expect(paragraph.width).toBeGreaterThan(middle.width + 80);
  expect(closed.width).toBeLessThanOrEqual(1089);
  if (width >= 1440) expect(closed.width).toBeGreaterThan(900);
  await expect(page.locator('.reading-sidebar .reading-tools')).toHaveCSS('position', 'static');
  await noOverflow(page);
  await capture(page, `reader-${width}-closed`);
  await page.locator('#reader-ai-action').click();
  await expect(assistant).toBeVisible();
  const reopened = (await prose.boundingBox())!;
  expect(Math.abs(reopened.x - middle.x)).toBeLessThan(1);
  expect(Math.abs(reopened.width - middle.width)).toBeLessThan(1);
  await noOverflow(page);
});

test('1150px restores its chapter and tool sidebar when the AI dock closes', async ({ page }) => {
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto(reader);
  await ready(page);
  const main = (await page.locator('.reading-main').boundingBox())!;
  const tools = (await page.locator('.reading-tools').boundingBox())!;
  const dock = (await page.locator('.reader-assistant-dialog').boundingBox())!;
  expect(tools.x).toBeGreaterThanOrEqual(main.x + main.width);
  expect(tools.x + tools.width).toBeLessThanOrEqual(1150);
  expect(dock.y + dock.height).toBeLessThanOrEqual(tools.y);
  await expect(page.locator('.mobile-contents summary')).toBeVisible();
  await capture(page, 'reader-1150-compact-navigation');
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  const sidebar = page.locator('.reading-sidebar');
  await expect(sidebar).toBeInViewport();
  await expect(sidebar.locator('.reading-tools')).toHaveCSS('position', 'static');
  await expect(page.locator('.mobile-contents summary')).toBeHidden();
  expect((await page.locator('.reading-main').boundingBox())!.width).toBeGreaterThan(main.width);
  await sidebar.locator(`a[href="#${firstChapter}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#${firstChapter}$`));
  await settledAnchor(page, firstChapter);
  await noOverflow(page);
  await capture(page, 'reader-1150-chapter');
});

for (const width of [390, 1440]) test(`${width}px figures, formulas and tables stay contained through AI toggles`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/read/transformer/${catalog.currentRevisions.transformer}`);
  await ready(page);
  const prose = page.locator('.prose');
  const assertMediaContained = async () => {
    const article = (await prose.boundingBox())!;
    for (const selector of ['.paper-figure-frame', '.formula-scroll', '.table-scroll']) {
      const media = prose.locator(selector);
      expect(await media.count()).toBeGreaterThan(0);
      for (const node of await media.all()) {
        const box = (await node.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(article.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(article.x + article.width + 1);
      }
    }
    await noOverflow(page);
  };
  if (width >= 1100) {
    await assertMediaContained();
    await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  }
  await assertMediaContained();
  const closedWidth = (await prose.boundingBox())!.width;
  const figure = prose.locator('.paper-figure').first();
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => figure.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await capture(page, `reader-transformer-${width}-closed-figure`);
  await prose.locator('.table-scroll').first().scrollIntoViewIfNeeded();
  await capture(page, `reader-transformer-${width}-closed-table`);
  await page.locator('#reader-ai-action').click();
  await expect(page.locator('#reader-assistant')).toBeVisible();
  await assertMediaContained();
  if (width < 1100) {
    await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
    expect((await prose.boundingBox())!.width).toBe(closedWidth);
    await noOverflow(page);
  }
});

for (const width of [390, 320]) test(`${width}px retained diagram guide and maximum font controls contain long content without page overflow`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(diagramReader);
  await ready(page);
  await noOverflow(page);
  await capture(page, `reader-${width}-normal`);
  const increase = page.locator('.mobile-tools').getByRole('button', { name: '增大字号', exact: true });
  for (let count = 0; count < 4; count++) await increase.click();
  await expect(page.locator('.prose')).toHaveCSS('--reading-size', '22px');
  await expect(increase).toBeDisabled();
  await noOverflow(page);
  await capture(page, `reader-${width}-max-font`);
  const diagram = page.locator('.teaching-diagram').first();
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(page.locator('.reading-tool-context')).toContainText('把组成连接起来');
  await noOverflow(page);
  await capture(page, `reader-${width}-diagram-max-font`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.reading-footer')).toBeInViewport();
  const footer = (await page.locator('.reading-footer').boundingBox())!, tools = (await page.locator('.reading-tools').boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(tools.y);
  await noOverflow(page);
  await capture(page, `reader-${width}-ending-max-font`);
});

test('source dialog preserves the focused citation and reading position on return', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${reader}#${firstChapter}`);
  await ready(page);
  const citation = page.locator(`#${firstChapter} .citation-button`).first();
  await citation.scrollIntoViewIfNeeded();
  await citation.focus();
  const before = await page.evaluate(() => scrollY);
  await citation.press('Enter');
  const dialog = page.getByRole('dialog', { name: '来源详情' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('手动查找');
  await expect(dialog.getByRole('link', { name: '打开原文（新标签页）' })).toHaveAttribute('target', '_blank');
  await capture(page, 'reader-source-return');
  await dialog.getByRole('button', { name: '返回阅读', exact: true }).click();
  await expect(citation).toBeFocused();
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(3);
});

test('native same-document fragments keep distinct Back and Forward reading positions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${reader}#${firstChapter}`);
  await ready(page);
  await settledAnchor(page, firstChapter);
  await page.evaluate(() => { (window as Window & { syntheticDocumentMarker?: string }).syntheticDocumentMarker = 'synthetic-native-fragment'; window.scrollBy(0, 420); });
  const firstPosition = await page.evaluate(() => scrollY);
  await page.goto(`${reader}#${nextChapter}`);
  expect(await page.evaluate(() => (window as Window & { syntheticDocumentMarker?: string }).syntheticDocumentMarker)).toBe('synthetic-native-fragment');
  await settledAnchor(page, nextChapter);
  await page.evaluate(() => window.scrollBy(0, 180));
  const secondPosition = await page.evaluate(() => scrollY);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#${firstChapter}$`));
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - firstPosition)).toBeLessThan(5);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`#${nextChapter}$`));
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - secondPosition)).toBeLessThan(5);
});

test('actual reader typography, retained teaching diagram, final section and current HELM table are inspectable', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(diagramReader);
  await ready(page);
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable'); await session.send('CSS.enable');
  const document = await session.send('DOM.getDocument');
  const typography = [];
  for (const selector of ['.prose p', '.prose h1']) {
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: document.root.nodeId, selector });
    const rendered = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    const style = await page.locator(selector).first().evaluate(node => {
      const computed = getComputedStyle(node);
      return { size: computed.fontSize, weight: computed.fontWeight, lineHeight: computed.lineHeight };
    });
    typography.push({ selector, ...style, renderedFamilies: [...new Set(rendered.fonts.map(font => font.familyName))] });
  }
  await session.detach();
  console.log(`Actual reader typography: ${JSON.stringify(typography)}`);
  await testInfo.attach('rendered-reader-typography', { body: JSON.stringify(typography, null, 2), contentType: 'application/json' });
  const diagram = page.locator('.teaching-diagram').first();
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(page.locator('.reading-sidebar a[href="#u03"]')).toHaveAttribute('aria-current', 'location');
  await capture(page, 'reader-middle-diagram');
  await page.locator('.prose section').last().scrollIntoViewIfNeeded();
  await capture(page, 'reader-final-section');
  await page.goto(`/read/helm/${catalog.currentRevisions.helm}#u03`);
  await ready(page);
  const table = page.locator('.table-scroll').first();
  await table.scrollIntoViewIfNeeded();
  await expect(table.locator('table')).toBeVisible();
  await capture(page, 'reader-helm-table');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  await expect(page.locator('#reader-assistant')).toHaveCount(0);
  await table.scrollIntoViewIfNeeded();
  await expect(table).toBeInViewport();
  await noOverflow(page);
  await capture(page, 'reader-helm-table-narrow');
});

test('compact citations retain their exact accessible locator and source-dialog label', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/read/react/1#u03');
  await ready(page);
  const citation = page.locator('#u03 .citation-button').first();
  await expect(citation).toHaveAttribute('aria-label', '§3.1–3.2，PDF 第4页');
  await expect(citation).toContainText('§3.1–3.2，p.4');
  await expect(citation).toHaveAttribute('title', '§3.1–3.2，PDF 第4页');
  // The complete accessible locator must not be drawn beside the compact label.
  const buttonWidth = (await citation.boundingBox())!.width;
  const visibleLabelWidth = (await citation.locator('.citation-display').boundingBox())!.width;
  expect(buttonWidth - visibleLabelWidth).toBeLessThan(14);
  await citation.click();
  await expect(page.locator('.source-dialog .source-locator')).toHaveText('§3.1–3.2，PDF 第4页');
  await page.getByRole('button', { name: '返回阅读', exact: true }).click();
  await expect(citation).toBeFocused();
});

test('an open AI material dialog stays above its parent when the reader changes width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(reader);
  await ready(page);
  const question = page.getByLabel('向 AI 提问', { exact: true });
  await question.fill('合成测试：调整窗口时保留问题草稿');
  await page.getByRole('button', { name: '查看本次提问资料', exact: true }).click();
  const material = page.getByRole('dialog', { name: '本次提问资料', exact: true });
  const close = material.getByRole('button', { name: '关闭', exact: true });
  await close.focus();
  for (const width of [390, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(material).toBeVisible();
    await expect(close).toBeFocused();
    expect(await close.evaluate(button => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  await close.click();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(question).toHaveValue('合成测试：调整窗口时保留问题草稿');
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
