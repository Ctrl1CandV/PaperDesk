import { test, expect, type Page } from '@playwright/test';

// No live backend or account state is needed for reading-tool checks.
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) return route.abort();
    if (!url.pathname.startsWith('/api/ai/')) return route.continue();
    const data = url.pathname.endsWith('/status')
      ? { configured: false, provider: 'api', model: null, searchAvailable: false, csrfToken: 'synthetic-tools', apiConfigured: false,
          chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false, availability: { state: 'unknown' } } }
      : { conversations: [] };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
});

// Every personal string, storage injection and clipboard below is synthetic.
async function chooseText(page: Page, paragraph = 0) {
  const quote = await page.locator('#u01 p').nth(paragraph).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && (text.textContent?.trim().length ?? 0) < 15) text = walker.nextNode();
    if (!text) throw new Error('Synthetic fixture could not find public guide prose');
    const range = document.createRange(); range.selectNodeContents(text);
    const selected = window.getSelection()!; selected.removeAllRanges(); selected.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return text.textContent!.trim();
  });
  await expect(page.locator('.reading-tool-context span')).toHaveText('选中文本');
  return quote;
}
async function openNote(page: Page) {
  await page.getByRole('button', { name: '记笔记', exact: true }).click();
  return page.getByRole('dialog', { name: '留下一条笔记' });
}
async function notes(page: Page) {
  return page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('notes'));
}

test('backdrop and Escape preserve a note draft; interior and drag release never dismiss it', async ({ page }) => {
  await page.goto('/read/agent-survey/1#u01');
  const quote = await chooseText(page);
  let dialog = await openNote(page);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：外部关闭后仍需继续的笔记');
  await dialog.getByText('问题状态', { exact: false }).click();
  await expect(dialog).toBeVisible();
  const textarea = await dialog.getByLabel('我的笔记或问题').boundingBox();
  await page.mouse.move(textarea!.x + 12, textarea!.y + 12);
  await page.mouse.down(); await page.mouse.move(4, 4); await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '记笔记', exact: true })).toBeFocused();
  expect(await notes(page)).toEqual([]);
  dialog = await openNote(page);
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('合成测试：外部关闭后仍需继续的笔记');
  await expect(dialog.locator('blockquote')).toHaveText(quote);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  dialog = await openNote(page);
  await dialog.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  dialog = await openNote(page);
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('');
  expect(await notes(page)).toEqual([]);
});

test('a different passage in the same section does not silently reuse an earlier quotation or draft', async ({ page }) => {
  await page.goto('/read/agent-survey/1#u01');
  const first = await chooseText(page);
  let dialog = await openNote(page);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：只属于第一段的草稿');
  await page.keyboard.press('Escape');
  const second = await chooseText(page, 1);
  expect(second).not.toBe(first);
  dialog = await openNote(page);
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('');
  await expect(dialog.locator('blockquote')).toHaveText(second);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：第二段的新草稿也必须保留');
  await dialog.locator('.other-note-drafts summary').click();
  await dialog.getByRole('button', { name: '恢复此摘录草稿', exact: true }).click();
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('合成测试：只属于第一段的草稿');
  await expect(dialog.locator('blockquote')).toHaveText(first);
  await dialog.getByRole('button', { name: '返回本次选中的摘录', exact: true }).click();
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('合成测试：第二段的新草稿也必须保留');
  await expect(dialog.locator('blockquote')).toHaveText(second);
});

test('pending note save blocks dismissal and a failed write leaves the exact draft recoverable', async ({ page }) => {
  await page.goto('/read/agent-survey/1#u01'); await chooseText(page);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    personalStore.saveNote = () => new Promise((_resolve, reject) => { (window as any).syntheticRejectNote = () => reject(new DOMException('Synthetic save failure', 'QuotaExceededError')); });
  });
  let dialog = await openNote(page);
  await dialog.getByLabel('我的笔记或问题').fill('合成测试：保存期间不能意外关闭');
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as any).syntheticRejectNote());
  await expect(dialog.getByRole('alert')).toContainText('保存失败');
  await page.keyboard.press('Escape'); dialog = await openNote(page);
  await expect(dialog.getByLabel('我的笔记或问题')).toHaveValue('合成测试：保存期间不能意外关闭');
  expect(await notes(page)).toEqual([]);
});

test('packet drafts survive dismissal and changing source options cannot erase a manually edited preview', async ({ page }) => {
  await page.goto('/read/agent-survey/1#u01'); await chooseText(page);
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '复制阅读上下文' });
  await dialog.getByLabel('这次想问什么？', { exact: true }).fill('合成测试：准备核对原文条件');
  await dialog.getByLabel('完整复制预览', { exact: true }).fill('合成测试：手动编辑、必须保留的上下文');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '复制阅读上下文' });
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue('合成测试：手动编辑、必须保留的上下文');
  await expect(dialog.getByLabel('这次想问什么？', { exact: true })).toHaveValue('合成测试：准备核对原文条件');
  await expect(dialog.locator('.preview-update')).toHaveCount(0);
  await dialog.getByLabel('这次想问什么？', { exact: true }).fill('合成测试：改为核对另一个条件');
  await expect(dialog.locator('.preview-update')).toContainText('尚未被覆盖');
  await expect(dialog.getByRole('button', { name: '复制预览内容', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue('合成测试：手动编辑、必须保留的上下文');
  await dialog.getByRole('button', { name: '按当前选项重建预览', exact: true }).click();
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue(/合成测试：改为核对另一个条件/);
  await expect(dialog.getByRole('button', { name: '复制预览内容', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  await expect(page.getByLabel('这次想问什么？', { exact: true })).toHaveValue('');
});

test('exploration dismissal retains only a draft and explicit discard removes it', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: '创建自己的问题', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建一个探索问题' });
  await dialog.getByLabel('探索标题', { exact: true }).fill('合成测试：会话中的探索草稿');
  await dialog.getByLabel('我想继续追问的问题', { exact: true }).fill('合成测试：这条问题还没有保存');
  await page.mouse.click(4, 4); await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('explorations'))).toEqual([]);
  await page.getByRole('button', { name: '创建自己的问题', exact: true }).click();
  await expect(dialog.getByLabel('探索标题', { exact: true })).toHaveValue('合成测试：会话中的探索草稿');
  await dialog.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  await page.getByRole('button', { name: '创建自己的问题', exact: true }).click();
  await expect(dialog.getByLabel('探索标题', { exact: true })).toHaveValue('');
});

test('restored packet choices wait for delayed notes before question changes can rebuild the preview', async ({ page }) => {
  await page.goto('/read/agent-survey/1#u01'); await chooseText(page);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.saveNote({ id: crypto.randomUUID(), guideId: 'agent-survey', revision: 1, unitId: 'u01', text: '合成测试：先前明确选入的笔记', status: 'open' }, null);
  });
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '复制阅读上下文' });
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue(/合成测试：先前明确选入的笔记/);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const original = personalStore.listPage.bind(personalStore);
    const releases: (() => Promise<void>)[] = [];
    personalStore.listPage = (name: string, options: unknown) => name === 'notes' ? new Promise(resolve => { releases.push(async () => resolve(await original('notes', options))); }) : original(name, options);
    (window as any).syntheticReleasePacketNotes = () => Promise.all(releases.map(release => release()));
  });
  await page.getByRole('button', { name: '复制上下文', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '复制阅读上下文' });
  await expect(dialog.getByRole('status')).toContainText('正在读取本章可选笔记');
  await expect(dialog.getByLabel('这次想问什么？', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '复制预览内容', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue(/合成测试：先前明确选入的笔记/);
  await page.evaluate(() => (window as any).syntheticReleasePacketNotes());
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await dialog.getByLabel('这次想问什么？', { exact: true }).fill('合成测试：加载完成后的新问题');
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue(/合成测试：加载完成后的新问题/);
  await expect(dialog.getByLabel('完整复制预览', { exact: true })).toHaveValue(/合成测试：先前明确选入的笔记/);
});

test('article-level status is separate from passage tools and survives closing after an explicit change', async ({ page }) => {
  await page.goto('/read/agent-survey/1');
  await expect(page.locator('.reading-state-trigger')).toHaveAttribute('title', '本篇解读 · 未记录；原论文 · 未记录');
  await expect(page.locator('.reading-tools').getByRole('button', { name: '阅读记录', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '阅读记录', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '阅读记录' });
  await dialog.getByLabel('导读阅读状态', { exact: true }).selectOption('reading');
  await expect(dialog.getByRole('status')).toContainText('已保存');
  await page.mouse.click(4, 4);
  await expect(page.locator('.reading-state-trigger')).toHaveAttribute('title', '本篇解读 · 阅读中；原论文 · 未记录');
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '记笔记', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '复制上下文', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
