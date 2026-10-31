import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import catalog from '../../content/catalog.json' with { type: 'json' };

const activeGuideIds = Object.keys(catalog.currentRevisions).filter(id => !((catalog as { archivedGuideIds?: string[] }).archivedGuideIds ?? []).includes(id));
const currentGuideCount = activeGuideIds.length;

// All personal text and storage/clipboard failures below are synthetic test fixtures.
const syntheticText = '合成测试笔记：需要核对行动成立的条件。';
const noteId = '88888888-8888-4888-8888-888888888888';
async function notes(page: Page) { return page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('notes')); }
async function backup(page: Page) { return page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup()); }
async function seedNote(page: Page, quote = true) {
  return page.evaluate(async input => {
    const { personalStore } = await import('/src/records/store.ts');
    const file = await personalStore.exportBackup();
    file.notes.push({ id: input.noteId, guideId: 'agent-survey', revision: 1, unitId: 'u01', text: input.syntheticText, ...(input.quote ? { quote: '合成测试：已有导读摘录' } : {}), blockFingerprint: 'synthetic-retained-fingerprint', status: 'open', recordRevision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    await personalStore.importBackup(await personalStore.previewImport(file));
  }, { noteId, syntheticText, quote });
}
async function selectParagraph(page: Page) {
  await page.goto('/read/agent-survey/1#u01');
  const quote = await page.locator('#u01 p').first().evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && (text.textContent?.trim().length ?? 0) < 20) text = walker.nextNode();
    if (!text) throw new Error('Synthetic test could not locate guide prose');
    const range = document.createRange(); range.selectNodeContents(text);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return text.textContent!.trim();
  });
  await expect(page.locator('.reading-tool-context')).toContainText('选中文本');
  return quote;
}
async function openNote(page: Page) {
  await page.getByRole('button', { name: '记笔记', exact: true }).click();
  return page.getByRole('dialog', { name: '留下一条笔记' });
}

test('current guides and local search have honest empty and fresh-home states', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.guide-entry')).toHaveCount(currentGuideCount);
  await expect(page.locator('.resume-entry')).toHaveCount(0);
  const initial = await backup(page);
  expect(initial.resume).toEqual([]); expect(initial.guideStates).toEqual([]); expect(initial.originalStates).toEqual([]);
  // The shelf follows the catalog's editorial ranks for current, non-archived guides.
  const ranked = activeGuideIds.map(id => ({ id, rank: catalog.entries.find(entry => entry.guideId === id && entry.revision === catalog.currentRevisions[id as keyof typeof catalog.currentRevisions])!.recommendation.rank })).sort((a, b) => a.rank - b.rank);
  for (const [index, { id }] of ranked.slice(0, 3).entries()) await expect(page.locator('.guide-entry').nth(index)).toHaveAttribute('id', `choose-${id}`);
  for (const id of activeGuideIds) await expect(page.locator(`#choose-${id}`)).toBeAttached();
  await page.getByRole('searchbox', { name: '查找文章' }).fill('合成测试不存在的关键词-9bf1');
  await expect(page.getByRole('heading', { name: '没有匹配的文章' })).toBeVisible();
  await expect(page.locator('.guide-entry')).toHaveCount(0);
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.locator('.guide-entry')).toHaveCount(currentGuideCount);
  await page.getByRole('searchbox', { name: '查找文章' }).fill('InstructGPT');
  await expect(page.locator('#choose-instructgpt')).toBeVisible();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '书架', exact: true }).click();
  await expect(page.locator('.guide-entry')).toHaveCount(currentGuideCount);
});

test('actual scrolling resumes after reload while guide and original marks remain independently explicit', async ({ page }) => {
  await page.goto('/read/helm/1');
  await expect(page.locator('#u03')).toBeAttached();
  await expect.poll(async () => (await backup(page)).resume.length).toBe(1);
  await page.locator('#u03').evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top + element.getBoundingClientRect().height * .3));
  await expect.poll(async () => (await backup(page)).resume[0]?.unitId).toBe('u03');
  await expect.poll(async () => (await backup(page)).resume[0]?.offset).toBeGreaterThan(.2);
  const before = await backup(page), savedOffset = before.resume[0].offset;
  expect(before.guideStates).toEqual([]); expect(before.originalStates).toEqual([]);
  await page.reload();
  await expect.poll(async () => page.locator('#u03').evaluate((element, offset) => Math.abs(-element.getBoundingClientRect().top / element.getBoundingClientRect().height - offset), savedOffset)).toBeLessThan(.12);
  await page.getByRole('button', { name: /^阅读记录/ }).click();
  const dialog = page.getByRole('dialog', { name: '阅读记录' });
  await expect(dialog.getByLabel('导读阅读状态', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('原论文阅读状态', { exact: true })).toHaveValue('');
  await dialog.getByLabel('导读阅读状态', { exact: true }).selectOption('read');
  await expect(dialog.getByRole('status')).toContainText('已保存');
  await dialog.getByLabel('原论文阅读状态', { exact: true }).selectOption('deferred');
  await expect.poll(async () => (await backup(page)).originalStates[0]?.status).toBe('deferred');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('#u06').scrollIntoViewIfNeeded();
  await page.reload();
  const after = await backup(page);
  expect(after.guideStates[0].status).toBe('read'); expect(after.originalStates[0].status).toBe('deferred');
});

test('selected guide text becomes a note only on save and survives reload unchanged', async ({ page }) => {
  const quote = await selectParagraph(page);
  const dialog = await openNote(page);
  await expect(dialog.locator('blockquote')).toHaveText(quote);
  expect(await notes(page)).toEqual([]);
  await dialog.getByLabel('我的笔记或问题', { exact: true }).fill(syntheticText);
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已保存到此浏览器');
  await dialog.getByRole('button', { name: '返回阅读', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '笔记', exact: true }).click();
  await page.reload();
  await expect(page.locator('.note-entry .note-text')).toHaveText(syntheticText);
  await expect(page.locator('.note-entry blockquote')).toHaveText(quote);
  const record = (await notes(page))[0];
  expect(record.guideId).toBe('agent-survey'); expect(record.revision).toBe(1); expect(record.unitId).toBe('u01'); expect(record.quote).toBe(quote);
  expect((await backup(page)).guideStates).toEqual([]); expect((await backup(page)).originalStates).toEqual([]);
});

test('note editors in two pages preserve conflicts and save the current draft as a separate copy', async ({ page, context }) => {
  await page.goto('/notes'); await seedNote(page);
  await expect(page.locator('.note-entry')).toHaveCount(1);
  const second = await context.newPage(); await second.goto('/notes');
  await page.getByRole('button', { name: '编辑笔记' }).click(); await second.getByRole('button', { name: '编辑笔记' }).click();
  const firstEditor = page.getByRole('dialog', { name: '编辑笔记' }), secondEditor = second.getByRole('dialog', { name: '编辑笔记' });
  await firstEditor.getByLabel('我的笔记或问题').fill('合成测试：第一页已保存的版本');
  await secondEditor.getByLabel('我的笔记或问题').fill('合成测试：第二页冲突草稿');
  await firstEditor.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(firstEditor.getByRole('status')).toContainText('已保存');
  await secondEditor.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(secondEditor.getByRole('alert')).toContainText('另一处已修改');
  await expect(secondEditor.getByLabel('我的笔记或问题')).toHaveValue('合成测试：第二页冲突草稿');
  await expect(secondEditor.locator('.conflict-panel')).toContainText('合成测试：第一页已保存的版本');
  await secondEditor.getByLabel('我的笔记或问题').fill('合成测试：冲突后继续改写的最新草稿');
  await secondEditor.getByRole('button', { name: '将我的草稿另存一条' }).click();
  await expect(secondEditor).not.toBeVisible();
  const values = (await notes(page)).map(note => note.text);
  expect(values).toEqual(expect.arrayContaining(['合成测试：第一页已保存的版本', '合成测试：冲突后继续改写的最新草稿']));
  expect(values).toHaveLength(2);
});

test('a note deleted elsewhere can be recovered as a new note without resurrecting the removed ID', async ({ page }) => {
  await page.goto('/notes'); await seedNote(page);
  await page.getByRole('button', { name: '编辑笔记' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑笔记' });
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：删除发生时仍在编辑的草稿');
  await page.evaluate(async id => (await import('/src/records/store.ts')).personalStore.deleteNote(id, 1), noteId);
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.locator('.conflict-panel')).toContainText('已在另一处删除');
  await dialog.getByRole('button', { name: '将我的草稿另存一条' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await notes(page);
  expect(saved).toHaveLength(1); expect(saved[0].id).not.toBe(noteId);
  expect(saved[0].text).toBe('合成测试：删除发生时仍在编辑的草稿');
});

test('editing an imported note without optional quotation retains its fingerprint and remains schema-valid', async ({ page }) => {
  await page.goto('/notes'); await seedNote(page, false);
  await page.getByRole('button', { name: '编辑笔记' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑笔记' });
  await expect(dialog.locator('blockquote')).toHaveCount(0);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：无引文笔记的编辑版本');
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已保存');
  const saved = (await notes(page))[0];
  expect(saved.blockFingerprint).toBe('synthetic-retained-fingerprint'); expect(saved).not.toHaveProperty('quote');
  expect(saved.recordRevision).toBe(2); expect((await backup(page)).notes[0]).toEqual(saved);
});

test('quota failure retains a note draft, exposes download recovery and never reports saved', async ({ page }) => {
  await selectParagraph(page); const dialog = await openNote(page);
  await dialog.getByLabel('我的笔记或问题').fill(syntheticText);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes') throw new DOMException('SYNTHETIC quota', 'QuotaExceededError'); return original.apply(this, args); };
  });
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('保存失败');
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue(syntheticText);
  await expect(dialog.getByRole('status')).not.toContainText('已保存到此浏览器'); expect(await notes(page)).toEqual([]);
  const downloadEvent = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载草稿' }).click();
  const download = await downloadEvent; expect(await readFile((await download.path())!, 'utf8')).toContain(syntheticText);
  await dialog.getByRole('button', { name: '返回阅读' }).click(); await openNote(page);
  await expect(page.getByRole('dialog').getByLabel('我的笔记或问题')).toHaveValue(syntheticText);
});

test('unavailable storage leaves guide prose and a downloadable unsaved note accessible', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('SYNTHETIC unavailable storage', 'SecurityError'); } }); });
  await selectParagraph(page);
  await expect(page.locator('#u01 p').first()).toBeVisible();
  const dialog = await openNote(page);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：存储不可用时的草稿');
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('保存失败');
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('合成测试：存储不可用时的草稿');
  const downloadEvent = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载草稿' }).click();
  const download = await downloadEvent; expect(await readFile((await download.path())!, 'utf8')).toContain('合成测试：存储不可用时的草稿');
});

test('reading packet copies exactly the deliberate preview; private notes, failures and size limits stay explicit', async ({ page }) => {
  await selectParagraph(page); await seedNote(page);
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制阅读上下文' }), preview = dialog.getByLabel('完整复制预览', { exact: true });
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  expect(await preview.inputValue()).not.toContain(syntheticText);
  await dialog.getByLabel('这次想问什么？', { exact: true }).fill('合成测试：请解释适用条件。');
  await dialog.getByRole('checkbox').check();
  await expect.poll(() => preview.inputValue()).toContain(syntheticText);
  const exact = await preview.inputValue();
  expect(exact).toContain('修订 1'); expect(exact).toContain('覆盖缺口'); expect(exact).toContain('返回：/read/agent-survey/1#u01');
  expect(exact).not.toMatch(/(?:127\.0\.0\.1|localhost|[A-Z]:\\)/);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => new Promise<void>(resolve => { (window as any).syntheticClipboardText = text; (window as any).syntheticClipboardResolve = resolve; }) } }); });
  await dialog.getByRole('button', { name: '复制预览内容', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '正在复制…' })).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).syntheticClipboardText)).toBe(exact);
  await page.evaluate(() => (window as any).syntheticClipboardResolve());
  await expect(dialog.getByRole('status')).toContainText('已复制');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('SYNTHETIC denied clipboard', 'NotAllowedError')) } }); });
  await dialog.getByRole('button', { name: '复制预览内容', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('自动复制不可用');
  await dialog.getByRole('button', { name: '选中预览手动复制' }).click();
  expect(await preview.evaluate(element => (element as HTMLTextAreaElement).selectionEnd - (element as HTMLTextAreaElement).selectionStart)).toBe(exact.length);
  const oversized = '合'.repeat(12001); await preview.fill(oversized);
  await expect(dialog.getByRole('alert')).toContainText('没有自动截断');
  await expect(dialog.getByRole('button', { name: '复制预览内容', exact: true })).toBeDisabled();
  expect(await preview.inputValue()).toBe(oversized);
});

test('optional notes arriving asynchronously never overwrite an edited packet preview', async ({ page }) => {
  await selectParagraph(page); await seedNote(page);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const original = personalStore.listPage.bind(personalStore);
    personalStore.listPage = (name: string, options) => name === 'notes' ? new Promise(resolve => { (window as any).syntheticReleaseNotes = async () => resolve(await original('notes', options)); }) : original(name, options);
  });
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制阅读上下文' }), preview = dialog.getByLabel('完整复制预览', { exact: true });
  await expect(preview).not.toHaveValue('');
  await preview.fill('合成测试：手动编辑的精确交接预览');
  await page.evaluate(() => (window as any).syntheticReleaseNotes());
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(preview).toHaveValue('合成测试：手动编辑的精确交接预览');
  await dialog.getByRole('checkbox').check();
  await expect(preview).toHaveValue('合成测试：手动编辑的精确交接预览');
  await dialog.getByRole('button', { name: '按当前选项重建预览' }).click();
  await expect.poll(() => preview.inputValue()).toContain(syntheticText);
});

test('direction navigation no longer offers a second context-export workflow', async ({ page }) => {
  await page.goto('/explore');
  const record = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 简化方向', question: 'SYNTHETIC 保留问题与证据', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', nextAction: null, evidence: [] }, null));
  await page.goto(`/explore/questions/${record.id}`);
  await expect(page.getByRole('button', { name: '复制上下文', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '继续讨论', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '一键生成积累选文文件', exact: true })).toBeVisible();
});
