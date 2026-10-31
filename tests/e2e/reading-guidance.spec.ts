import { test, expect, type Page } from '@playwright/test';
import catalog from '../../content/catalog.json' with { type: 'json' };
import memory from '../../content/guides/rag-survey.json' with { type: 'json' };

// SYNTHETIC reading marks only; the AI transport is a local stub and never sends a question.
const revision = catalog.currentRevisions['rag-survey'];
const activeCount = Object.keys(catalog.currentRevisions).filter(id => !((catalog as { archivedGuideIds?: string[] }).archivedGuideIds ?? []).includes(id)).length;
async function stubAi(page: Page) {
  await page.route('**/api/ai/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/ai/status' ? { configured: true, model: 'synthetic-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true, chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false } }
      : path === '/api/ai/conversations' ? { conversations: [] } : {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}
const marks = (page: Page) => page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('guideStates'));

test('the guide card ties reading targets to chapters, shows explicit marks quietly and filters by them', async ({ page }) => {
  await page.goto('/library');
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.setGuideState({ guideId: 'rag', revision: 2, status: 'reading', updatedAt: new Date().toISOString() });
  });
  await page.goto(`/library?article=rag-survey`);
  const outline = page.locator('.orientation-outline');
  const targets = memory.orientation.readingTargets;
  await expect(outline.locator('.outline-aim')).toHaveCount(targets.length);
  await expect(outline.locator('li', { has: page.locator(`a[href$="#${targets[0].unitId}"]`) }).locator('.outline-aim')).toHaveText(targets[0].purpose);
  const related = page.getByRole('navigation', { name: '相关导读' });
  await expect(related.getByRole('listitem')).toHaveCount(memory.related.length);
  await expect(related.getByRole('listitem').filter({ hasText: 'RAG' })).toContainText('导读阅读中');
  await related.getByRole('button', { name: 'RAG' }).click();
  await expect(page).toHaveURL(/article=rag/);
  await expect(page.locator('.orientation-marks')).toHaveText('导读阅读中');
  await expect(page.locator('#choose-rag .guide-card-marks')).toHaveText('导读阅读中');

  await page.getByRole('combobox', { name: '按导读阅读状态筛选' }).selectOption('reading');
  await expect(page.locator('.guide-entry')).toHaveCount(1);
  await expect(page.locator('.library-result-count')).toContainText('阅读中 · 1 篇文章');
  await page.getByRole('combobox', { name: '按导读阅读状态筛选' }).selectOption('unmarked');
  await expect(page.locator('.guide-entry')).toHaveCount(activeCount - 1);
});

test('reading keeps guidance beside the article and closes with one quiet step', async ({ page }) => {
  await stubAi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const target = memory.orientation.readingTargets[1];
  await page.goto(`/read/rag-survey/${revision}#${target.unitId}`);
  const aim = page.locator('.reading-sidebar .toc-aim');
  await expect(aim).toHaveCount(1);
  await expect(aim).toContainText(target.purpose);
  await expect(aim).toContainText(`留意：${target.limit}`);
  await expect(page.locator('.reading-lens')).not.toHaveAttribute('open');
  await page.locator('.reading-lens summary').click();
  await expect(page.locator('.reading-lens li')).toHaveCount(3);

  // The direction picker is part of the panel's context; starters only fill the composer.
  await expect(page.locator('.ai-panel .ai-context .ai-topic-picker select')).toHaveAccessibleName('关联方向');
  await page.getByRole('button', { name: '我先复述，请你检查' }).click();
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await expect(composer).toHaveValue(/^我对这一节的理解是：\n\n请对照导读和原文/);
  await expect(composer).toBeFocused();
  expect(await composer.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe('我对这一节的理解是：'.length);

  const close = page.getByLabel('读完这篇');
  await close.scrollIntoViewIfNeeded();
  await expect(close).toContainText('这篇导读：未记录');
  await close.getByRole('button', { name: '标为已读' }).click();
  await expect(close).toContainText('这篇导读：已读');
  await expect(close.getByRole('button', { name: '标为已读' })).toHaveCount(0);
  expect((await marks(page)).map(item => [item.guideId, item.revision, item.status])).toEqual([['rag-survey', revision, 'read']]);
  await expect(close.getByRole('link', { name: 'RAG' })).toHaveAttribute('href', `/read/rag/${catalog.currentRevisions.rag}`);
});
