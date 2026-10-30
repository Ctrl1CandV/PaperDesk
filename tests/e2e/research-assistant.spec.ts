import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { AiTurn, AskInput } from '../../src/assistant/api';

// Synthetic browser records and synthetic model transport only. No provider request.
const topic = '11111111-1111-4111-8111-111111111111';
const otherTopic = '22222222-2222-4222-8222-222222222222';
async function seed(page: Page) {
  await page.goto('/explore');
  await page.evaluate(async ids => {
    const { personalStore } = await import('/src/records/store.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    for (const [index, id] of ids.entries()) await personalStore.saveExploration({ id, title: `SYNTHETIC 研究主题 ${index + 1}`, question: `SYNTHETIC 待调查问题 ${index + 1}`, origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null, research: { ...emptyResearchState(), constraints: `SYNTHETIC 约束 ${index + 1}` } }, null);
  }, [topic, otherTopic]);
}
async function service(context: BrowserContext, baseURL: string, proposal = false) {
  const requests: AskInput[] = [], unexpected: string[] = [];
  const conversations = new Map<string, { conversation: any; turns: AiTurn[] }>();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') return json({ configured: true, model: 'synthetic-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true, chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false } });
    if (/^\/api\/ai\/topics\/[^/]+\/summary$/.test(url.pathname)) return json({ conversations: 0, turns: 0, lastTurnAt: null, guides: [] });
    if (url.pathname === '/api/ai/conversations') return json({ conversations: [...conversations.values()].filter(value => value.conversation.conversationScope?.explorationId === url.searchParams.get('explorationId')).map(value => value.conversation) });
    if (url.pathname.startsWith('/api/ai/conversations/')) return json(conversations.get(url.pathname.split('/').at(-1)!));
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = route.request().postDataJSON(); requests.push(input);
      const id = input.conversationId ?? crypto.randomUUID(), turnId = crypto.randomUUID();
      const turn: AiTurn = { id: turnId, question: input.question, answer: 'SYNTHETIC 回答：这仍是需要调查的假设。', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { researchSnapshot: input.researchSnapshot, guideId: input.guideId, revision: input.revision, unitId: input.unitId, provider: 'api', model: 'synthetic-model', researchProposals: proposal && input.researchSnapshot ? [{ id: crypto.randomUUID(), explorationId: input.researchSnapshot.explorationId, baseRecordRevision: input.researchSnapshot.recordRevision, baseSnapshotSha256: input.researchSnapshot.snapshotSha256, sourceTurnId: turnId, changes: [{ kind: 'set-field', field: 'constraints', value: 'SYNTHETIC 新约束' }], rationale: 'SYNTHETIC 仅用于测试修改预览', evidenceRefs: [] }] : [] } };
      const data = conversations.get(id) ?? { conversation: { id, title: 'SYNTHETIC 研究对话', conversationScope: input.conversationScope, updatedAt: new Date().toISOString() }, turns: [] };
      if (input.researchMaterials) turn.context!.researchMaterials = input.researchMaterials;
      data.turns.push(turn); conversations.set(id, data);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'accepted', conversationId: id, turnId }, { type: 'done', turn }].map(value => JSON.stringify(value)).join('\n') + '\n' }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { requests, unexpected, conversations };
}
// On the direction page the same conversation opens in a drawer on request.
const openDiscussion = (page: Page) => page.getByRole('button', { name: '继续讨论', exact: true }).click();
async function ask(page: Page, text: string) {
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill(text);
  await page.locator('.ai-send').click();
  await expect(page.getByRole('textbox', { name: '向 AI 提问', exact: true })).toHaveValue('');
}
test('synthetic research thread crosses two guides and no-guide view, preserving consent and snapshot after reload', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!); await seed(page);
  await page.goto('/read/agent-survey/2#u01');
  // Linking a direction is the explicit permission to send its record; no separate checkbox.
  await page.getByLabel('关联方向', { exact: true }).selectOption(topic);
  await ask(page, 'SYNTHETIC 第一篇问题');
  expect(mock.requests[0].researchSnapshot?.explorationId).toBe(topic);
  await page.goto('/read/instructgpt/2#u01');
  await expect(page.getByLabel('关联方向', { exact: true })).toHaveValue(topic);
  await ask(page, 'SYNTHETIC 第二篇问题');
  expect(mock.requests[1].conversationId).toBe([...mock.conversations.keys()][0]);
  expect(mock.requests[1].guideId).toBe('instructgpt');
  await page.goto(`/explore/questions/${topic}`); await openDiscussion(page);
  await ask(page, 'SYNTHETIC 不附论文继续');
  expect(mock.requests[2].guideId).toBeUndefined();
  expect(mock.requests[2].researchSnapshot?.constraints).toBe('SYNTHETIC 约束 1');
  await page.reload(); await openDiscussion(page);
  await expect(page.locator('.ai-turn')).toHaveCount(3);
  await ask(page, 'SYNTHETIC 刷新后继续');
  expect(mock.requests[3].conversationId).toBe(mock.requests[1].conversationId);
  await page.goto(`/explore/questions/${otherTopic}`); await openDiscussion(page);
  await expect(page.locator('.ai-turn')).toHaveCount(0);
  expect(mock.unexpected).toEqual([]);
});
test('synthetic proposal previews exact edits, saves once and blocks a stale proposal', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!, true); await seed(page);
  await page.goto(`/explore/questions/${topic}`); await openDiscussion(page);
  await ask(page, 'SYNTHETIC 整理约束');
  await page.locator('.ai-research-proposal summary').first().click();
  await expect(page.locator('.ai-research-proposal')).toContainText('SYNTHETIC 新约束');
  await page.getByRole('button', { name: '采纳这些修改' }).click();
  await expect(page.locator('.ai-research-proposal')).toContainText('已保存到探索');
  const saved = await page.evaluate(async id => (await import('/src/records/store.ts')).personalStore.get('explorations', id), topic);
  expect(saved.research.constraints).toBe('SYNTHETIC 新约束'); expect(saved.research.appliedProposalIds).toHaveLength(1);
  await ask(page, 'SYNTHETIC 第二个修改建议');
  await page.evaluate(async id => { const { personalStore } = await import('/src/records/store.ts'); const value = await personalStore.get('explorations', id); await personalStore.saveExploration({ ...value, unknowns: 'SYNTHETIC 并发更新' }, value.recordRevision); }, topic);
  await page.locator('.ai-research-proposal').last().locator('summary').first().click();
  await expect(page.getByRole('button', { name: '采纳这些修改' })).toBeDisabled();
  await expect(page.locator('.ai-research-proposal').last()).toContainText('探索已修改');
  await mkdir('.cache/screenshots/research', { recursive: true });
  await page.locator('.conversation-drawer .ai-panel').screenshot({ path: '.cache/screenshots/research/assistant-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.conversation-drawer .ai-panel').screenshot({ path: '.cache/screenshots/research/assistant-narrow.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(mock.unexpected).toEqual([]);
});
test('synthetic manual decision is explicit and a receipt question never overwrites or sends a draft', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!); await seed(page);
  await page.goto(`/explore/questions/${topic}`);
  await page.getByRole('button', { name: '手动编辑记录' }).click();
  await page.getByText('记录一项研究决定或修订', { exact: true }).click();
  await page.getByRole('textbox', { name: '决定内容', exact: true }).fill('SYNTHETIC 优先检查约束');
  await page.getByRole('textbox', { name: '形成理由', exact: true }).fill('SYNTHETIC 决定理由');
  await page.getByRole('button', { name: '加入决定草稿' }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const saved = await page.evaluate(async id => (await import('/src/records/store.ts')).personalStore.get('explorations', id), topic);
  expect(saved.research.decisions[0]).toMatchObject({ kind: 'hypothesis', status: 'adopted', sourceTurnId: null, text: 'SYNTHETIC 优先检查约束' });
  const prefill = (question: string) => page.evaluate(detail => window.dispatchEvent(new CustomEvent('paperdesk:research-question', { detail })), { explorationId: topic, question });
  await prefill('SYNTHETIC 执行结果问题');
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await expect(composer).toHaveValue('SYNTHETIC 执行结果问题');
  await composer.fill('SYNTHETIC 我的未发送草稿');
  await prefill('SYNTHETIC 另一个执行结果');
  await expect(composer).toHaveValue('SYNTHETIC 我的未发送草稿');
  await expect(page.locator('.ai-notice')).toContainText('现有问题草稿已保留');
  expect(mock.requests).toHaveLength(0);
});
test('selected synthetic notes and documents are opt-in, fixed, revocable and isolated by topic', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!); await seed(page);
  const noteId = await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const { createResearchArtifact } = await import('/shared/research-artifacts.mjs');
    const note = await personalStore.saveNote({ id: crypto.randomUUID(), guideId: 'agent-survey', revision: 2, unitId: 'u01', text: 'SYNTHETIC 主动选择的笔记', status: 'open' }, null);
    const current = await personalStore.get('explorations', id);
    const artifact = createResearchArtifact({ title: 'SYNTHETIC 已保存阶段计划', body: 'SYNTHETIC 文档正文', recordRevision: current.recordRevision });
    await personalStore.saveExploration({ ...current, research: { ...current.research, artifacts: [artifact] } }, current.recordRevision);
    return note.id;
  }, topic);
  await page.goto(`/explore/questions/${topic}`); await openDiscussion(page);
  await ask(page, 'SYNTHETIC 默认不发送笔记');
  expect(mock.requests[0].researchMaterials).toBeUndefined();
  const picker = page.getByRole('dialog', { name: '选择笔记与研究文档', exact: true });
  await page.getByRole('button', { name: /^资料 ·/ }).click();
  await picker.getByRole('checkbox', { name: /SYNTHETIC 主动选择的笔记/ }).check();
  await picker.getByRole('checkbox', { name: /SYNTHETIC 已保存阶段计划/ }).check();
  await picker.getByRole('button', { name: '完成选择' }).click();
  await page.evaluate(async id => { const { personalStore } = await import('/src/records/store.ts'); const note = await personalStore.get('notes', id); await personalStore.saveNote({ ...note, text: 'SYNTHETIC 修改后的笔记' }, note.recordRevision); }, noteId);
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await composer.fill('SYNTHETIC 检查已选版本'); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-error')).toContainText('已选笔记或文档已修改');
  await expect(composer).toHaveValue('SYNTHETIC 检查已选版本'); expect(mock.requests).toHaveLength(1);
  await page.getByRole('button', { name: /^资料 ·/ }).click();
  await picker.getByRole('button', { name: '更新已选资料到最新版本' }).click();
  await picker.locator('.ai-material-selected details summary').first().click();
  await mkdir('.cache/screenshots/research', { recursive: true });
  await picker.screenshot({ path: '.cache/screenshots/research/materials-picker-desktop.png' });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.screenshot({ path: '.cache/screenshots/research/materials-picker-narrow.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize(originalViewport);
  await picker.getByRole('button', { name: '完成选择' }).click();
  await ask(page, 'SYNTHETIC 使用已确认资料');
  expect(mock.requests[1].researchMaterials?.notes[0]).toMatchObject({ id: noteId, recordRevision: 2, text: 'SYNTHETIC 修改后的笔记' });
  expect(mock.requests[1].researchMaterials?.artifacts[0].body).toBe('SYNTHETIC 文档正文');
  await page.getByRole('button', { name: /^资料 ·/ }).click();
  await picker.getByRole('checkbox', { name: /SYNTHETIC 修改后的笔记/ }).uncheck();
  await picker.getByRole('checkbox', { name: /SYNTHETIC 已保存阶段计划/ }).uncheck();
  await picker.getByRole('button', { name: '完成选择' }).click();
  await ask(page, 'SYNTHETIC 撤销资料后发送'); expect(mock.requests[2].researchMaterials).toBeUndefined();
  await page.goto(`/explore/questions/${otherTopic}`); await openDiscussion(page);
  await expect(page.getByRole('button', { name: /^资料 ·/ })).toContainText('默认不发送');
  expect(mock.unexpected).toEqual([]);
});
test('synthetic recent topic conversation can resume after remembered selection expires without overwriting draft', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!); await seed(page);
  await page.goto(`/explore/questions/${topic}`); await openDiscussion(page);
  await ask(page, 'SYNTHETIC 先前研究讨论');
  await page.evaluate(() => sessionStorage.clear()); await page.reload(); await openDiscussion(page);
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await composer.fill('SYNTHETIC 新写的问题草稿');
  await page.getByRole('button', { name: '继续最近的讨论' }).click();
  await expect(page.locator('.ai-turn')).toHaveCount(1); await expect(composer).toHaveValue('SYNTHETIC 新写的问题草稿');
  expect(mock.requests).toHaveLength(1);
});
