import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { posix } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import catalog from '../content/catalog.json' with { type: 'json' };

const compact = (value: string) => value.replace(/\s+/g, '');
async function bounded(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('the LLM survey learning path reaches the reviewed papers and browser back restores its reading position', async ({ page }) => {
  await page.goto('/read/llm-survey/1');
  for (const id of ['transformer', 'gpt3', 'chain-of-thought', 'rag', 'instructgpt', 'agent-survey', 'react', 'toolformer', 'reflexion', 'helm']) {
    const revision = (catalog.currentRevisions as Record<string, number>)[id];
    await expect(page.locator(`.prose a[href="/read/${id}/${revision}"]`).first()).toBeAttached();
  }
  const transformer = page.locator('.prose a[href="/read/transformer/1"]').first();
  await transformer.scrollIntoViewIfNeeded(); await transformer.focus();
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/read\/transformer\/1$/);
  await expect(page.locator('.prose h1')).toContainText('Transformer');
  await page.goBack();
  await expect(transformer).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(5);
  const state = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(state.guideStates).toEqual([]); expect(state.originalStates).toEqual([]);
});
async function shot(page: Page, name: string) {
  await bounded(page);
  await page.screenshot({ path: `docs/evidence/additions-${name}.png`, animations: 'disabled' });
}

// Every current guide participates, including future reviewed catalog additions.
for (const id of Object.keys(catalog.currentRevisions)) {
  test(`${id}: full reviewed prose, two-level reading, media and keyboard source return`, async ({ page, context }) => {
    const revision = (catalog.currentRevisions as Record<string, number>)[id];
    const entry = catalog.entries.find(item => item.guideId === id && item.revision === revision)!;
    expect(entry).toBeDefined();
    const metadata = JSON.parse(await readFile(`content/${entry.metadataFile}`, 'utf8'));
    const body = await readFile(posix.join('content', posix.dirname(entry.metadataFile), metadata.bodyFile), 'utf8');
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url());
    });
    await mkdir('docs/evidence', { recursive: true });
    await page.goto(`/library?article=${id}`);
    await expect(page.locator('#orientation-title')).toContainText(metadata.orientation.shortTitle);
    await expect(page.locator('.paper-original-title')).toHaveText(metadata.paperTitle);
    await expect(page.locator('.orientation-subject')).toContainText(metadata.orientation.summary);
    await expect(page.locator('.reading-value')).toContainText(metadata.orientation.value);
    for (const boundary of metadata.orientation.boundaries) await expect(page.locator('.orientation-coverage')).toContainText(boundary);
    const before = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
    expect(before.resume).toEqual([]); expect(before.guideStates).toEqual([]); expect(before.originalStates).toEqual([]);
    await shot(page, `${id}-orientation-desktop`);
    await page.getByRole('link', { name: '进入深入阅读' }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${id}/${revision}$`));
    await expect(page.locator('.prose h1')).toHaveText(metadata.title);
    await expect(page.locator('.prose section')).toHaveCount(metadata.units.length);
    for (const unit of metadata.units) {
      await expect(page.locator(`.prose section[id="${unit.id}"]`)).toHaveCount(1);
      if (unit.heading) await expect(page.locator(`#${unit.id} h2`)).toHaveText(unit.heading);
    }

    // Compare every non-math prose segment; formulas are checked as rendered KaTeX below.
    // This avoids treating raw TeX source as visible prose or hiding omissions behind word counts.
    const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body);
    const prose: string[] = [];
    let formulas = 0, diagrams = 0, tables = 0;
    function segments(node: any): string {
      if (node.type === 'inlineMath' || node.type === 'math') return '\u0000';
      return typeof node.value === 'string' ? node.value : (node.children ?? []).map(segments).join('');
    }
    function visit(node: any) {
      if (node.type === 'inlineMath' || node.type === 'math') formulas++;
      if (node.type === 'code' && node.lang === 'mermaid') diagrams++;
      if (node.type === 'table') tables++;
      if (['paragraph', 'heading', 'tableCell'].includes(node.type)) prose.push(...segments(node).split('\u0000').filter(value => value.trim()));
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    const actual = compact(await page.locator('.prose').evaluate(node => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[aria-hidden="true"]').forEach(item => item.remove());
      return clone.textContent ?? '';
    }));
    for (const part of prose) expect(actual).toContain(compact(part));
    await expect(page.locator('.formula-error')).toHaveCount(0);
    await expect(page.locator('.prose .katex')).toHaveCount(formulas);
    await expect(page.locator('.prose .teaching-diagram svg')).toHaveCount(diagrams);
    await expect(page.locator('.prose table')).toHaveCount(tables);
    await shot(page, `${id}-reader-desktop`);
    const firstMedia = page.locator('.prose .teaching-diagram, .prose .formula-block, .prose .table-wrap').first();
    // A valid prose-led guide need not contain a diagram, display formula or table.
    if (await firstMedia.count()) await firstMedia.scrollIntoViewIfNeeded();
    else await page.locator('.prose section').nth(Math.min(3, metadata.units.length - 1)).scrollIntoViewIfNeeded();
    await shot(page, `${id}-detail-desktop`);

    const secondUnit = metadata.units[1];
    // The AI pane moves contents into the header at intermediate desktop widths.
    // Exercise the visible navigation instead of focusing its hidden sidebar copy.
    const sidebarLink = page.locator(`.reading-sidebar a[href="#${secondUnit.id}"]`);
    const sidebarVisible = await sidebarLink.isVisible();
    if (!sidebarVisible) {
      await page.locator('.mobile-contents summary').focus();
      await page.keyboard.press('Enter');
    }
    const contentsLink = sidebarVisible ? sidebarLink : page.locator(`.mobile-contents a[href="#${secondUnit.id}"]`);
    await expect(contentsLink).toBeVisible();
    await contentsLink.focus(); await page.keyboard.press('Enter');
    await expect(page.locator(`#${secondUnit.id}`)).toBeFocused();
    const citation = page.locator('.citation-button').first();
    await citation.scrollIntoViewIfNeeded(); await citation.focus();
    const scroll = await page.evaluate(() => scrollY);
    const label = (await citation.innerText()).replace(/↗$/, '');
    const citedSource = metadata.citations.find((item: { labels: string[] }) => item.labels.includes(label));
    expect(citedSource).toBeDefined();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '来源详情' });
    await expect(dialog).toContainText(label);
    await expect(dialog).toContainText(citedSource.sourceVersion ?? '未指定固定版本');
    await expect(dialog.getByRole('link', { name: '打开原文（新标签页）' })).toHaveAttribute('href', citedSource.url);
    await expect(dialog.getByRole('link', { name: '打开原文（新标签页）' })).toHaveAttribute('rel', 'noopener noreferrer');
    await page.keyboard.press('Escape');
    await expect(citation).toBeFocused();
    expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(5);

    // Close the docked assistant deliberately before inspecting the article on a
    // narrow viewport; an open answer otherwise stays mounted in its modal.
    await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, `${id}-reader-narrow`);
    // SVG existence alone missed a tall diagram shrunk by a CSS height cap.
    // Check the effective on-screen label size, including viewBox scaling.
    for (const diagram of await page.locator('.prose .teaching-diagram svg').all()) {
      const textSizes = await diagram.locator('.node text').evaluateAll(nodes => nodes.map(node => {
        const matrix = (node as SVGGraphicsElement).getScreenCTM();
        return parseFloat(getComputedStyle(node).fontSize) * (matrix ? Math.hypot(matrix.c, matrix.d) : 0);
      }));
      expect(textSizes.length).toBeGreaterThan(0);
      for (const size of textSizes) expect(size).toBeGreaterThanOrEqual(13);
    }
    const media = page.locator('.prose .teaching-diagram, .prose .formula-block, .prose .table-wrap');
    for (let index = 0; index < await media.count(); index++) {
      const region = media.nth(index).locator('[tabindex="0"]').first();
      await region.evaluate(node => node.scrollIntoView({ block: 'center' }));
      await expect(region).toBeInViewport();
      await shot(page, `${id}-media-${index + 1}-narrow`);
      if (await region.evaluate(node => node.scrollWidth > node.clientWidth + 1)) {
        await region.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
        await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        await shot(page, `${id}-media-${index + 1}-end-narrow`);
      } else await rm(`docs/evidence/additions-${id}-media-${index + 1}-end-narrow.png`, { force: true });
    }
    await page.locator('.mobile-contents summary').focus(); await page.keyboard.press('Enter');
    await page.locator(`.mobile-contents a[href="#${secondUnit.id}"]`).focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.mobile-contents')).not.toHaveAttribute('open', '');
    await expect(page.locator(`#${secondUnit.id}`)).toBeFocused();
    const after = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
    expect(after.guideStates).toEqual([]); expect(after.originalStates).toEqual([]);
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
}
