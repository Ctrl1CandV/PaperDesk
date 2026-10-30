import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import type { AskInput, AiTurn } from '../../src/assistant/api';

// Synthetic research text and mock AI only. Never reads an existing personal browser profile.
const initial = '# SYNTHETIC 研究随记\n\n## 从哪里开始\n\nSYNTHETIC 先理解方法在什么条件下成立，再考虑自己的实践问题。\n\n## 读到的问题\n\nSYNTHETIC 两篇文章看似使用同一指标，但任务环境并不相同。现在还不能直接比较高低。\n\n- SYNTHETIC 核对输入、工具与停止条件。\n- SYNTHETIC 记录成本和失败的具体位置。\n\n## 一次小尝试\n\nSYNTHETIC 这只是设计练习，还没有执行实验。原来的直觉需要保留，也需要找反例。\n\n## 阶段收获\n\nSYNTHETIC 作为理解与实践，当前已经达到预期；如果之后准备写论文，再补充可重复的实验和更完整的证据。';
const updated = `${initial}\n\n## SYNTHETIC 新问题\n\nSYNTHETIC 把失败的位置与成本一起记录，暂不预判哪个方案更好。`;
const getRecord = (page: Page, id: string) => page.evaluate(async value => (await import('/src/records/store.ts')).personalStore.get('explorations', value), id);
async function seed(page: Page) {
  await page.goto('/explore');
  const record = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    return personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 从阅读到实践', question: 'SYNTHETIC 怎样把阅读中的疑问变成可以检查的问题？', origin: 'reader', status: 'exploring', interpretation: 'SYNTHETIC 尚在理解阶段。', unknowns: '', nextAction: null, evidence: [], research: { ...emptyResearchState(), relatedGuides: [{ guideId: 'agentbench', revision: 1 }, { guideId: 'helm', revision: 2 }] } }, null);
  });
  await page.goto(`/explore/questions/${record.id}`);
  return record;
}
async function offline(context: BrowserContext) { await context.route('**/api/ai/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SYNTHETIC offline' }) })); }
async function shot(page: Page, name: string) { await mkdir('.cache/screenshots/notebook', { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `.cache/screenshots/notebook/${name}.png`, animations: 'disabled' }); }

test('a living document supports writing, reading, download and non-destructive history restore', async ({ page, context }) => {
  await offline(context); const record = await seed(page);
  const notebook = page.locator('.research-notebook');
  await expect(notebook.getByText('从一个想法开始，慢慢写成你的研究过程。')).toBeVisible();
  await notebook.getByRole('button', { name: '开始记录', exact: true }).click();
  await page.getByRole('textbox', { name: '研究记录正文' }).fill(initial);
  await shot(page, 'editor-desktop');
  await page.getByRole('button', { name: '预览排版' }).click();
  await expect(notebook.getByRole('heading', { name: '阶段收获' })).toBeVisible();
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(notebook.getByRole('status')).toHaveText('已保存研究记录 · 第 1 版');
  let saved = await getRecord(page, record.id); expect(saved.research.notebook.versions).toHaveLength(1); expect(saved.status).toBe('exploring');
  await shot(page, 'document-desktop');
  await notebook.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '研究记录正文' }).fill(updated);
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  const download = page.waitForEvent('download'); await notebook.getByRole('button', { name: '下载', exact: true }).click();
  const file = await download; expect(await readFile((await file.path())!, 'utf8')).toContain(updated);
  await notebook.getByRole('button', { name: '历史 · 2' }).click();
  await page.getByRole('combobox', { name: '研究记录版本' }).selectOption('1');
  await shot(page, 'history-desktop');
  await page.getByRole('button', { name: '恢复为新版本' }).click();
  await expect(notebook.getByRole('status')).toContainText('第 3 版');
  saved = await getRecord(page, record.id); expect(saved.research.notebook.versions.map((v: any) => v.body)).toEqual([initial, updated, initial]); expect(saved.research.notebook.versions[2].restoredFrom).toBe(1);
  await page.reload(); await expect(notebook.locator('.notebook-prose')).toContainText('还没有执行实验');
  await page.getByRole('button', { name: '切换到夜间模式' }).click(); await shot(page, 'document-night');
  await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'document-narrow-night');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '切换到白天模式' }).click(); await shot(page, 'document-narrow');
});

test('editor draft survives navigation; conflicts keep both texts until an explicit comparison', async ({ page, context }) => {
  await offline(context); const record = await seed(page);
  await page.getByRole('button', { name: '开始记录', exact: true }).click(); await page.getByRole('textbox', { name: '研究记录正文' }).fill(initial);
  await page.getByRole('link', { name: '← 探索', exact: true }).click();
  await page.getByRole('link', { name: /SYNTHETIC 从阅读到实践/ }).click();
  await expect(page.getByRole('textbox', { name: '研究记录正文' })).toHaveValue(initial);
  await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts'); const { saveResearchNotebook } = await import('/src/research/notebook-actions.ts');
    await saveResearchNotebook((await personalStore.get('explorations', id))!, 'SYNTHETIC 另一处已保存的文本。');
  }, record.id);
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.locator('.notebook-error')).toContainText('另一处修改');
  await expect(page.locator('.notebook-conflict')).toContainText('SYNTHETIC 另一处已保存的文本。');
  await shot(page, 'conflict-desktop');
  await expect(page.getByRole('textbox', { name: '研究记录正文' })).toHaveValue(initial);
  await page.getByRole('textbox', { name: '研究记录正文' }).fill(`${initial}\n\nSYNTHETIC 手动合并另一处的发现。`);
  await page.getByRole('button', { name: '已比较，按最新版本继续编辑' }).click();
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  expect((await getRecord(page, record.id)).research.notebook.versions).toHaveLength(2);
  await page.locator('.research-notebook').getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '研究记录正文' }).fill('SYNTHETIC 删除方向之前尚未保存的文字。');
  await page.evaluate(async id => { const { personalStore } = await import('/src/records/store.ts'); const latest = (await personalStore.get('explorations', id))!; await personalStore.deleteExploration(id, latest.recordRevision); }, record.id);
  await expect(page.getByRole('textbox', { name: '可恢复的研究记录草稿' })).toHaveValue('SYNTHETIC 删除方向之前尚未保存的文字。');
});

test('personal Markdown renders notation without executing HTML or loading remote images', async ({ page, context }) => {
  await offline(context); await seed(page);
  const remote: string[] = []; page.on('request', request => { if (request.url().includes('example.invalid')) remote.push(request.url()); });
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await page.getByRole('textbox', { name: '研究记录正文' }).fill('SYNTHETIC 数学显示测试：$x^2 + y^2$\n\n$$\nE = mc^2\n$$\n\n![SYNTHETIC 远程图片](https://example.invalid/image.png)\n\n<script>window.__notebookUnsafe = true</script>\n\n[SYNTHETIC 不安全链接](javascript:alert(1))\n\n[SYNTHETIC 固定导读](/read/helm/2#u01)\n\n[SYNTHETIC 非阅读路径](/backup)');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.locator('.notebook-prose .katex')).toHaveCount(2);
  await expect(page.locator('.notebook-prose img, .notebook-prose script')).toHaveCount(0);
  await expect(page.locator('.notebook-prose a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('.notebook-prose').getByRole('link', { name: 'SYNTHETIC 固定导读' })).toHaveAttribute('href', '/read/helm/2#u01');
  await expect(page.locator('.notebook-prose a[href="/backup"]')).toHaveCount(0);
  expect(remote).toEqual([]); expect(await page.evaluate(() => (window as any).__notebookUnsafe)).toBeUndefined();
});

async function model(context: BrowserContext, options: { beforeNotebook?: () => Promise<void> } = {}) {
  const requests: AskInput[] = [], conversations = new Map<string, any>();
  await context.route('**/api/ai/**', async route => {
    const url = new URL(route.request().url()); const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/status')) return json({ configured: true, model: 'synthetic-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true, chatgpt: { connected: false, loginPending: false, needsLogin: false } });
    if (url.pathname.endsWith('/summary')) return json({ conversations: 0, turns: 0, lastTurnAt: null, guides: [] });
    if (url.pathname.endsWith('/conversations')) return json({ conversations: [...conversations.values()].map(value => value.conversation) });
    if (url.pathname.includes('/conversations/')) return json(conversations.get(url.pathname.split('/').at(-1)!));
    if (url.pathname.endsWith('/ask')) {
      const input: AskInput = route.request().postDataJSON(); requests.push(input);
      const id = input.conversationId ?? crypto.randomUUID(), turnId = crypto.randomUUID();
      if (input.command?.name === 'notebook') await options.beforeNotebook?.();
      const turn: AiTurn = { id: turnId, question: input.question, answer: 'SYNTHETIC 根据要求整理了记录，假设仍需验证。', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { conversationScope: input.conversationScope, researchSnapshot: input.researchSnapshot, ...(input.command ? { command: input.command } : {}), ...(input.command?.name === 'notebook' ? { notebookDraft: { body: updated, summary: 'SYNTHETIC 整理新增问题', baseNotebookVersion: input.researchSnapshot?.notebook?.version ?? 0 } } : {}) } };
      const data = conversations.get(id) ?? { conversation: { id, title: 'SYNTHETIC 研究讨论', conversationScope: input.conversationScope, updatedAt: new Date().toISOString() }, turns: [] }; data.turns.push(turn); conversations.set(id, data);
      return route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'accepted', conversationId: id, turnId }, { type: 'done', turn }].map(item => JSON.stringify(item)).join('\n') + '\n' });
    }
    return route.abort();
  });
  return requests;
}

test('/记录 uses saved document context, normal discussion does not write, and one command saves one version', async ({ page, context }) => {
  const requests = await model(context); const record = await seed(page);
  await page.getByRole('button', { name: '开始记录', exact: true }).click(); await page.getByRole('textbox', { name: '研究记录正文' }).fill(initial); await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await composer.fill('SYNTHETIC 先讨论这个问题'); await page.locator('.ai-send').click(); await expect(composer).toHaveValue('');
  await expect.poll(async () => (await getRecord(page, record.id)).research.notebook.versions.length).toBe(1);
  expect(requests[0].researchSnapshot?.notebook?.body).toBe(initial);
  await composer.fill('/记录 请整理新增的问题'); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-command-result')).toContainText('已更新研究记录 · 第 2 版');
  const saved = await getRecord(page, record.id); expect(saved.research.notebook.versions).toHaveLength(2); expect(saved.research.notebook.versions[1]).toMatchObject({ body: updated, author: 'assistant' }); expect(saved.status).toBe('exploring');
  await page.getByRole('button', { name: '收起 AI 解读' }).click(); await expect(page.locator('.notebook-meta').first()).toContainText('AI 整理');
  await page.locator('.research-notebook').getByRole('button', { name: '让 AI 整理' }).click(); await expect(composer).toHaveValue(/^\/记录/); expect(requests).toHaveLength(2);
});

test('AI conflict preserves its proposed text and does not overwrite a later manual version', async ({ page, context }) => {
  let id = '';
  await model(context, { beforeNotebook: async () => { await page.evaluate(async value => { const { personalStore } = await import('/src/records/store.ts'); const { saveResearchNotebook } = await import('/src/research/notebook-actions.ts'); await saveResearchNotebook((await personalStore.get('explorations', value))!, 'SYNTHETIC 模型回答期间手动保存的新内容。'); }, id); } });
  const record = await seed(page); id = record.id;
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('/记录 SYNTHETIC 整理讨论'); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-error')).toContainText('指令结果未能保存');
  await page.getByText('查看 AI 研究记录草稿', { exact: true }).click();
  await expect(page.locator('.ai-notebook-draft pre')).toHaveText(updated);
  const saved = await getRecord(page, id); expect(saved.research.notebook.versions).toHaveLength(1); expect(saved.research.notebook.versions[0].body).toBe('SYNTHETIC 模型回答期间手动保存的新内容。');
});
