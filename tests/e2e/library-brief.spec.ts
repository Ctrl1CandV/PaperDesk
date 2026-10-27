import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import catalog from '../../content/catalog.json' with { type: 'json' };
import briefs from '../../content/library-briefs.json' with { type: 'json' };

const revisions = catalog.currentRevisions as Record<string, number>;
const helmRevision = revisions.helm;
const helmEntry = catalog.entries.find(entry => entry.guideId === 'helm' && entry.revision === helmRevision)!;
const helm = JSON.parse(readFileSync(`content/${helmEntry.metadataFile}`, 'utf8')) as {
  units: { id: string; heading: string | null }[];
};
const chapters = helm.units.filter(unit => unit.heading);
const helmLabels = briefs.entries.find(entry => entry.guideId === 'helm' && entry.guideRevision === helmRevision)!.chapterLabels as Record<string, string>;
const helmParagraphs = [
  '不同模型常在不同任务、提示方式和指标下报告成绩，分数很难直接比较。HELM 将场景、适配方式与评价指标明确分开，在尽可能一致的条件下评测语言模型，并同时考察准确率、校准、鲁棒性等表现，使比较依据和指标之间的取舍更清楚。',
  '如果你正在设计模型评测，本文值得借鉴的是如何把研究问题落实成可执行的评测协议：任务覆盖什么，提示与评分怎样设定，哪些条件需要保持一致。公开的提示、模型输出和工具也提供了复查入口，便于判断分数差异可能来自模型能力，还是实验设置。',
  '了解模型输入、输出与任务样本即可开始。建议先读评测流程，再看多指标结果；原论文的核心场景限于英语，历史结果不代表当前模型排名。',
];

// Explicitly synthetic reading positions in Playwright's isolated browser store.
async function seedResume(page: Page, revision: number, unitId: string) {
  await page.evaluate(async target => {
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.setResume({ ...target, offset: 0, updatedAt: '2026-01-02T03:04:05.000Z' });
  }, { guideId: 'helm', revision, unitId });
  await page.reload();
}

test('HELM explains its contribution in full paragraphs with immediate reading and chapter links', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/library?article=helm');
  await expect(page.locator('#orientation-title')).toHaveText('HELM');
  await expect(page.locator('.paper-original-title')).toHaveText('Holistic Evaluation of Language Models');
  await expect(page.locator('.orientation-masthead')).toContainText('Percy Liang');
  await expect(page.locator('.orientation-masthead')).toContainText('2023');
  const prose = page.locator('.orientation-prose');
  await expect(prose.getByRole('heading')).toHaveText(['论文概述', '为什么值得读', '阅读建议']);
  await expect(prose.locator('p')).toHaveText(helmParagraphs);
  await expect(page.locator('.article-orientation details, .article-orientation [role="tab"], .article-orientation [role="tablist"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /展开全文|阅读准备|来源与版本|全部目录|完整来源与作者/ })).toHaveCount(0);

  const actions = page.locator('.orientation-actions');
  await expect(actions).toHaveCount(1);
  await expect(actions.getByRole('link', { name: '开始导读' })).toHaveAttribute('href', `/read/helm/${helmRevision}`);
  await expect(page.getByRole('link', { name: '继续阅读', exact: true })).toHaveCount(0);
  const actionBounds = (await actions.boundingBox())!, proseBounds = (await prose.boundingBox())!;
  expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(proseBounds.y);
  const outline = page.locator('.orientation-outline');
  await expect(outline.getByRole('link')).toHaveCount(7);
  await expect(outline.locator('small')).toHaveCount(0);
  await expect(outline.locator('[aria-current]')).toHaveCount(0);
  for (const unit of chapters) {
    const link = outline.locator(`a[href="/read/helm/${helmRevision}#${unit.id}"]`);
    await expect(link).toHaveAttribute('title', unit.heading!);
    await expect(link).toHaveAccessibleName(helmLabels[unit.id] ?? unit.heading!);
  }
  const first = (await outline.getByRole('link').nth(0).boundingBox())!;
  const second = (await outline.getByRole('link').nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  const footer = page.locator('.orientation-source');
  await expect(footer).toContainText('arxiv:2211.09110');
  await expect(footer).toContainText('v2');
  await expect(footer).toContainText('2023-10-01');
  await expect(footer).toContainText(`导读修订 ${helmRevision}`);
  const snapshot = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(snapshot.resume).toEqual([]);
  expect(snapshot.guideStates).toEqual([]);
  expect(snapshot.originalStates).toEqual([]);
  await mkdir('.cache/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/screenshots/library-brief-helm-desktop.png', fullPage: true, animations: 'disabled' });

  // Another paper must explain its own method instead of reusing HELM's evaluation brief.
  await page.locator('#choose-instructgpt').click();
  const otherParagraphs = await page.locator('.orientation-prose p').allTextContents();
  expect(otherParagraphs).toHaveLength(3);
  expect(otherParagraphs.every(paragraph => !helmParagraphs.includes(paragraph))).toBe(true);
  expect(otherParagraphs.join('')).toMatch(/人类反馈|人工反馈/);
  expect(otherParagraphs.join('')).not.toContain('HELM 将场景');
});

test('a synthetic saved section is highlighted and continued without marking the paper read', async ({ page }) => {
  await page.goto('/library?article=helm');
  await seedResume(page, helmRevision, 'u02');
  const actions = page.locator('.orientation-actions');
  await expect(actions.getByRole('link', { name: '继续阅读', exact: true })).toHaveAttribute('href', `/read/helm/${helmRevision}`);
  await expect(actions.getByRole('link', { name: /从头阅读/ })).toHaveAttribute('href', `/read/helm/${helmRevision}#orientation`);
  await expect(page.locator('.orientation-outline [aria-current="location"]')).toHaveAttribute('href', `/read/helm/${helmRevision}#u02`);
  await expect(page.locator('.orientation-outline [aria-current="location"]')).toHaveCount(1);
  await actions.getByRole('link', { name: '继续阅读', exact: true }).click();
  await expect(page).toHaveURL(`/read/helm/${helmRevision}`);
  await expect.poll(async () => Math.abs(await page.locator('#u02').evaluate(element => element.getBoundingClientRect().top))).toBeLessThan(5);
  const snapshot = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(snapshot.guideStates).toEqual([]);
  expect(snapshot.originalStates).toEqual([]);
});

test('a retained older revision resumes its own route without highlighting the current outline', async ({ page }) => {
  const retained = catalog.entries.find(entry => entry.guideId === 'helm' && entry.revision < helmRevision)!;
  expect(retained).toBeDefined();
  await page.goto('/library?article=helm');
  await seedResume(page, retained.revision, 'u02');
  const actions = page.locator('.orientation-actions');
  await expect(actions).toContainText(`导读修订 ${retained.revision}`);
  await expect(actions.getByRole('link', { name: '继续阅读', exact: true })).toHaveAttribute('href', `/read/helm/${retained.revision}`);
  await expect(actions.getByRole('link', { name: /从头阅读/ })).toHaveAttribute('href', `/read/helm/${helmRevision}#orientation`);
  await expect(page.locator('.orientation-outline [aria-current]')).toHaveCount(0);
  const chapter = page.locator(`.orientation-outline a[href="/read/helm/${helmRevision}#u02"]`);
  await chapter.focus(); await chapter.press('Enter');
  await expect(page).toHaveURL(`/read/helm/${helmRevision}#u02`);
  await expect(page.locator('#u02')).toBeFocused();
});

test('narrow HELM keeps full prose and every chapter on one natural page without clipping', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/library?article=helm');
    await expect(page.locator('.library-shelf')).not.toBeVisible();
    await expect(page.locator('.orientation-prose p')).toHaveText(helmParagraphs);
    await expect(page.locator('.orientation-outline a')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const clipped = await page.locator('.library-preview, .article-orientation, .orientation-prose, .orientation-prose p, .orientation-outline').evaluateAll(elements => elements.filter(element => {
      const style = getComputedStyle(element);
      return (style.maxHeight !== 'none' && element.scrollHeight > element.clientHeight + 1)
        || (/hidden|clip|auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1)
        || (style.getPropertyValue('-webkit-line-clamp') !== 'none' && Number(style.getPropertyValue('-webkit-line-clamp')) > 0);
    }).map(element => element.className));
    expect(clipped).toEqual([]);
    const links = await page.locator('.orientation-outline a').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, bottom: bounds.bottom };
    }));
    for (let index = 1; index < links.length; index++) {
      expect(Math.abs(links[index].x - links[0].x)).toBeLessThan(2);
      expect(links[index].y).toBeGreaterThanOrEqual(links[index - 1].bottom);
    }
    await page.locator('.orientation-source').scrollIntoViewIfNeeded();
    await expect(page.locator('.orientation-source')).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await mkdir('.cache/screenshots', { recursive: true });
    await page.screenshot({ path: `.cache/screenshots/library-brief-helm-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.locator(`.orientation-outline a[href="/read/helm/${helmRevision}#u07"]`).click();
    await expect(page).toHaveURL(`/read/helm/${helmRevision}#u07`);
    await expect(page.locator('#u07')).toBeFocused();
  }
  expect(errors).toEqual([]);
});
