import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// All notes, questions and quotations created here are explicitly synthetic fixtures.
async function seedAccumulation(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/records/store.ts';
    const { personalStore } = await import(modulePath);
    const note = await personalStore.saveNote({ id: crypto.randomUUID(), guideId: 'agent-survey', revision: 1, unitId: 'u01', status: 'open', text: '合成测试笔记：持续任务中的目标和反馈应怎样区分？', quote: '合成测试摘录，仅用于检查笔记保存和回到来源。' }, null);
    await personalStore.saveNote({ id: crypto.randomUUID(), guideId: 'helm', revision: 1, unitId: 'u03', status: 'resolved', text: '合成测试笔记：指标的适用条件已做人工标记。' }, null);
    const exploration = await personalStore.saveExploration({ id: crypto.randomUUID(), title: '合成测试：核对持续任务中的评价条件', question: '合成测试问题：材料支持了什么，还缺什么？', origin: 'reader', status: 'exploring', interpretation: '合成测试理解：先区分观察和解释。', unknowns: '合成测试未知：仍需核对来源条件。', nextAction: { kind: 'read-guide', description: '合成测试行动：回到 Agent 综述的具体章节。', target: { guideId: 'agent-survey', revision: 1, unitId: 'u01' } }, evidence: [{ id: crypto.randomUUID(), provenance: 'guide-excerpt', text: '合成测试证据快照：旧版定位必须保留。', target: { guideId: 'agent-survey', revision: 1, unitId: 'u01' }, sources: [] }] }, null);
    return { noteId: note.id, explorationId: exploration.id };
  });
}
async function capture(page: Page, name: string) {
  await mkdir('.cache/redesign/after', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.cache/redesign/after/${name}.png`, animations: 'disabled' });
}

test('synthetic notes retain their versioned source, edit result and temporary filter through reading return', async ({ page }) => {
  await page.goto('/notes');
  const { noteId } = await seedAccumulation(page);
  await expect(page.locator('.note-entry')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '查找笔记' }).fill('持续任务');
  await expect(page.locator('.note-entry')).toHaveCount(1);
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('button', { name: '编辑笔记' }).click();
  const editor = page.getByRole('dialog', { name: '编辑笔记' });
  await editor.getByLabel('我的笔记或问题').fill('合成测试笔记：持续任务还需要核对反馈。');
  await editor.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await editor.getByRole('button', { name: '返回笔记', exact: true }).click();
  await capture(page, 'notes-desktop');
  const source = page.locator(`#note-reading-${noteId}`);
  await source.click();
  await expect(page).toHaveURL(/\/read\/agent-survey\/1#u01$/);
  await page.goBack();
  await expect(source).toBeFocused();
  await expect(page.getByRole('searchbox', { name: '查找笔记' })).toHaveValue('持续任务');
  await expect(page.locator('.note-text')).toHaveText('合成测试笔记：持续任务还需要核对反馈。');
  await page.reload();
  await expect(page.locator(`#note-${noteId} .note-text`)).toHaveText('合成测试笔记：持续任务还需要核对反馈。');
  await page.getByLabel('筛选笔记状态').selectOption('resolved');
  await expect(page.locator('.note-entry')).toHaveCount(1);
  await expect(page.locator('.note-entry')).toContainText('已解决');
  await page.getByRole('searchbox', { name: '查找笔记' }).fill('合成不存在');
  await expect(page.getByRole('heading', { name: '没有匹配的笔记' })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.locator('.note-entry')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'notes-narrow');
});

test('existing exploration appears before editorial choices and its next action retains old source return', async ({ page }) => {
  await page.goto('/explore');
  const { explorationId } = await seedAccumulation(page);
  await expect(page.locator('.exploration-record-row')).toHaveCount(1);
  const personal = await page.locator('.explore-directions').boundingBox();
  const editorial = await page.locator('.exploration-editorial').boundingBox();
  expect(personal!.y).toBeLessThan(editorial!.y);
  await expect(page.locator('.exploration-record-row')).toContainText('1 条材料');
  await expect(page.locator('.exploration-row-next')).toContainText('合成测试行动');
  await capture(page, 'explore-saved-desktop');
  await page.locator('.exploration-record-row').click();
  const next = page.locator(`#exploration-next-${explorationId}`);
  await expect(next).toHaveAttribute('href', '/read/agent-survey/1#u01');
  const nextBox = await page.locator('.now-panel').boundingBox();
  const evidenceBox = await page.locator('.exploration-evidence').boundingBox();
  expect(nextBox!.y).toBeLessThan(evidenceBox!.y);
  await capture(page, 'exploration-detail-desktop');
  await next.click();
  await page.goBack();
  await expect(next).toBeFocused();
  await expect(page.locator('.exploration-evidence')).toContainText('旧版定位必须保留');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'exploration-detail-narrow');
});

test('backup scope, local counts and clear confirmation remain distinct from AI conversations', async ({ page }) => {
  await page.goto('/backup');
  await seedAccumulation(page);
  await expect(page.locator('.records-counts div').first().locator('dd')).toHaveText('2');
  await expect(page.locator('.records-scope')).toContainText('AI 对话需在阅读页');
  await capture(page, 'backup-desktop');
  await page.getByRole('button', { name: '清除前确认' }).click();
  const dialog = page.getByRole('dialog', { name: '确认清除本地记录' });
  await expect(dialog.getByRole('button', { name: '确认清除全部记录' })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.records-counts div').first().locator('dd')).toHaveText('2');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'backup-narrow');
});
