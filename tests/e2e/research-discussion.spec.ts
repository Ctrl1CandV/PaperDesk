import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import catalog from '../../content/catalog.json' with { type: 'json' };
import { READING_BRIEF } from '../../shared/research-documents.mjs';
import type { AiTurn, AskInput } from '../../src/assistant/api';

// Synthetic records and a synthetic model transport only; no provider or private record is used.
const guideRevision = catalog.currentRevisions['agent-survey'];
const brief = (topic: string) => `# ${READING_BRIEF.label}：${topic}\n\n${READING_BRIEF.sections.map((section, index) => `## ${index + 1}. ${section.title}\n\nSYNTHETIC ${section.title}内容。〔推断〕待确认。`).join('\n\n')}`;

async function service(context: BrowserContext, baseURL: string, options: { declineBrief?: boolean; beforeBrief?: () => Promise<void> } = {}) {
  const requests: AskInput[] = [], unexpected: string[] = [];
  const conversations = new Map<string, { conversation: any; turns: AiTurn[] }>();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') return json({ configured: true, model: 'synthetic-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true, chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false } });
    const summary = /^\/api\/ai\/topics\/([^/]+)\/summary$/.exec(url.pathname);
    if (summary) {
      const turns = [...conversations.values()].filter(value => value.conversation.conversationScope?.explorationId === summary[1]).flatMap(value => value.turns);
      return json({ conversations: turns.length ? 1 : 0, turns: turns.length, lastTurnAt: turns.at(-1)?.createdAt ?? null, guides: turns.length ? [{ guideId: 'agent-survey', revision: guideRevision, askedWhileReading: turns.length, cited: 0 }] : [] });
    }
    if (url.pathname === '/api/ai/conversations') {
      const topic = url.searchParams.get('explorationId');
      return json({ conversations: [...conversations.values()].map(value => value.conversation).filter(item => topic ? item.conversationScope?.explorationId === topic : !item.conversationScope && item.guideId === url.searchParams.get('guideId')) });
    }
    if (url.pathname.startsWith('/api/ai/conversations/')) return json(conversations.get(url.pathname.split('/').at(-1)!));
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = route.request().postDataJSON(); requests.push(input);
      const id = input.conversationId ?? crypto.randomUUID(), turnId = crypto.randomUUID(), snapshot = input.researchSnapshot;
      const declined = options.declineBrief || input.question.includes('SYNTHETIC 信息不足');
      let answer = 'SYNTHETIC 回答：可能有两个方向，仍是待调查的假设。';
      const context: Record<string, unknown> = { guideId: input.guideId, revision: input.revision, unitId: input.unitId, provider: 'api', model: 'synthetic-model', ...(snapshot ? { researchSnapshot: snapshot, researchProposals: [] } : {}), ...(input.command ? { command: input.command } : {}) };
      if (input.command?.name === 'direction' && !snapshot) { answer = 'SYNTHETIC 已建立方向：长任务中的目标保持。'; context.directionDraft = { title: 'SYNTHETIC 长任务目标保持', question: 'SYNTHETIC 长任务里 Agent 为什么偏离目标？', interpretation: 'SYNTHETIC 〔推断〕记忆与规划共同影响。', unknowns: 'SYNTHETIC 评测是否可比', scope: '', constraints: '', candidates: 'SYNTHETIC 候选 A：记忆；候选 B：评测', deferred: '', stage: 'narrow', nextAction: { kind: 'search-literature', description: 'SYNTHETIC 找长任务评测综述' }, rationale: 'SYNTHETIC' }; }
      if (input.command?.name === 'direction' && snapshot) { answer = 'SYNTHETIC 已更新：问题更具体，进入形成研究问题阶段。'; context.researchProposals = [{ id: crypto.randomUUID(), explorationId: snapshot.explorationId, baseRecordRevision: snapshot.recordRevision, baseSnapshotSha256: snapshot.snapshotSha256, sourceTurnId: turnId, changes: [{ kind: 'set-field', field: 'stage', value: 'question' }, { kind: 'set-field', field: 'unknowns', value: 'SYNTHETIC 更新后的未知' }], rationale: 'SYNTHETIC', evidenceRefs: [] }]; }
      if (input.command?.name === 'reading-brief') answer = declined ? 'SYNTHETIC 信息还不够：你想弄清通信协议还是评测？' : brief(input.command.purpose === 'research' ? 'SYNTHETIC 长任务评测' : 'SYNTHETIC Agent 如何工作');
      if (input.command?.name === 'reading-brief') await options.beforeBrief?.();
      const turn: AiTurn = { id: turnId, question: input.question, answer, status: 'complete', sources: [], createdAt: new Date().toISOString(), context };
      const data = conversations.get(id) ?? { conversation: { id, title: 'SYNTHETIC 对话', ...(input.conversationScope ? { conversationScope: input.conversationScope } : { guideId: input.guideId, revision: input.revision }), updatedAt: new Date().toISOString() }, turns: [] };
      data.turns.push(turn); conversations.set(id, data);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'accepted', conversationId: id, turnId }, { type: 'done', turn }].map(value => JSON.stringify(value)).join('\n') + '\n' }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { requests, unexpected };
}
const composer = (page: Page) => page.getByRole('textbox', { name: '向 AI 提问', exact: true });
async function send(page: Page, text?: string) { if (text !== undefined) await composer(page).fill(text); await page.locator('.ai-send').click(); await expect(composer(page)).toHaveValue(''); }
const explorations = (page: Page) => page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('explorations'));
async function capture(page: Page, name: string, selector?: string) {
  await mkdir('.cache/screenshots/research', { recursive: true });
  const path = `.cache/screenshots/research/${name}.png`;
  if (selector) await page.locator(selector).screenshot({ path }); else await page.screenshot({ path, animations: 'disabled' });
}

test('/方向 builds a direction from reading, updates it, and /选文 saves a reading file in the same conversation', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await expect(page.locator('.ai-panel-heading h2')).toHaveText('AI解读');
  await send(page, 'SYNTHETIC 长任务里 Agent 为什么会偏离目标？');
  await composer(page).fill('/');
  const menu = page.getByRole('listbox', { name: '可用指令' });
  await expect(menu.getByRole('option')).toHaveCount(3);
  await expect(menu.getByRole('option', { name: /选文实施文件 · 推进/ })).toBeDisabled();
  await capture(page, 'command-menu', '.ai-panel');
  await composer(page).press('Enter');
  await expect(composer(page)).toHaveValue('/方向 ');
  await expect(page.locator('.ai-command-hint')).toContainText('足够就直接建立');
  await send(page);
  expect(mock.requests[1]).toMatchObject({ command: { name: 'direction' }, guideId: 'agent-survey' });
  expect(mock.requests[1].readingProgress).toBeUndefined();
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page);
  expect(direction).toMatchObject({ title: 'SYNTHETIC 长任务目标保持', status: 'exploring', research: { stage: 'narrow', candidates: 'SYNTHETIC 候选 A：记忆；候选 B：评测' } });
  expect(direction.research.seedDiscussion.turns[0].question).toBe('SYNTHETIC 长任务里 Agent 为什么会偏离目标？');
  await expect(page.getByLabel('关联方向', { exact: true })).toHaveValue(direction.id);
  await expect(page.locator('.ai-topic-picker')).toContainText('已建立并关联方向');
  await expect(page.locator('.ai-empty-heading')).toContainText('继续讨论《SYNTHETIC 长任务目标保持》');

  await send(page, '/方向');
  expect(mock.requests[2].conversationScope).toEqual({ kind: 'exploration', explorationId: direction.id });
  await expect(page.locator('.ai-command-result').last()).toContainText('已更新方向');
  let [updated] = await explorations(page);
  expect(updated.research.stage).toBe('question'); expect(updated.unknowns).toBe('SYNTHETIC 更新后的未知'); expect(updated.research.appliedProposalIds).toHaveLength(1);

  await send(page, '/选文 重点看长任务评测');
  expect(mock.requests[3].command).toEqual({ name: 'reading-brief', purpose: 'research' });
  expect(mock.requests[3].readingProgress!.length).toBe(Object.keys(catalog.currentRevisions).filter(id => !((catalog as { archivedGuideIds?: string[] }).archivedGuideIds ?? []).includes(id)).length);
  await expect(page.locator('.ai-command-result').last()).toContainText('已生成选文实施文件 · 推进');
  await expect(page.locator('.ai-command-result').last()).toContainText('已包含全部 9 节');
  [updated] = await explorations(page);
  const file = updated.research.artifacts[0];
  expect(file).toMatchObject({ kind: 'reading-brief', purpose: 'research', title: `${READING_BRIEF.label}：SYNTHETIC 长任务评测` });
  expect(file.librarySnapshot).toContain('agent-survey');
  await capture(page, 'reader-commands-desktop');
  expect(mock.unexpected).toEqual([]);
});

test('/选文 without a direction files a learning goal; a declined request saves nothing', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await composer(page).fill('/选文 推进'); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-error')).toContainText('推进类选文需要先关联方向');
  await expect(composer(page)).toHaveValue('/选文 推进');
  expect(mock.requests).toHaveLength(0);
  await send(page, '/选文 积累 想进一步了解 Agent 是如何工作的');
  await expect(page.locator('.ai-command-result')).toContainText('（阅读积累）');
  const [goal] = await explorations(page);
  expect(goal).toMatchObject({ question: '想进一步了解 Agent 是如何工作的', research: { purpose: 'accumulation' } });
  expect(goal.research.artifacts[0].purpose).toBe('accumulation');
  await send(page, '/选文 积累 SYNTHETIC 信息不足');
  await expect(page.locator('.ai-command-result').last()).toContainText('这次没有生成');
  expect(await explorations(page)).toHaveLength(1);
  await page.goto('/explore');
  await expect(page.locator('.accumulation-row')).toContainText(goal.title);
  await expect(page.locator('.direction-tile')).toHaveCount(0);
  expect(mock.unexpected).toEqual([]);
});

test('the direction keeps research, related papers and reading files together, and opens the same conversation', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, 'SYNTHETIC 起点问题'); await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  await send(page, '/选文 推进');
  const [direction] = await explorations(page);
  await page.goto('/explore');
  const tile = page.locator('.direction-tile');
  await expect(tile).toContainText('收窄方向'); await expect(tile).toContainText('SYNTHETIC 长任务目标保持');
  await capture(page, 'explore-home-desktop');
  await tile.click();
  await expect(page.locator('.direction-kicker')).toContainText('收窄方向');
  await expect(page.locator('.direction-next')).toContainText('SYNTHETIC 找长任务评测综述');
  await expect(page.locator('.now-panel, .stage-track, .direction-more')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^选文实施文件/ })).toBeVisible();
  await expect(page.locator('.related-papers')).toContainText('边读边问 1');
  await expect(page.locator('.brief-list')).toContainText('推进');
  await capture(page, 'direction-desktop');
  await page.locator('.direction-files').scrollIntoViewIfNeeded();
  await capture(page, 'direction-files-desktop');
  await page.getByRole('button', { name: /切换.*夜/ }).click();
  await page.locator('.direction-files').scrollIntoViewIfNeeded();
  await capture(page, 'direction-files-night');
  await page.getByRole('button', { name: /切换.*白/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.brief-list').getByRole('button', { name: '下载' }).click()]);
  expect(download.suggestedFilename()).toBe(READING_BRIEF.fileName);
  await mkdir('.cache/test-results', { recursive: true });
  const saved = '.cache/test-results/synthetic-reading-brief.md'; await download.saveAs(saved);
  const markdown = await readFile(saved, 'utf8');
  expect(markdown.startsWith(`# ${READING_BRIEF.label}：SYNTHETIC 长任务评测\n\n> **文件用途**：选文实施文件（推进）`)).toBe(true);
  for (const text of ['执行者请先读完全文', '## 9. 完成与返回讨论的条件', '导出时的研究状态']) expect(markdown).toContain(text);
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `讨论：${direction.title}` });
  await expect(drawer.locator('.ai-turn')).toHaveCount(1);
  await capture(page, 'direction-drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'direction-narrow');
  await page.locator('.direction-files').scrollIntoViewIfNeeded();
  await capture(page, 'direction-files-narrow');
  expect(mock.unexpected).toEqual([]);
});


test('one click generates an accumulation file, preserves the question draft and does not repeat after reopening', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, 'SYNTHETIC 起点问题'); await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page);
  await page.goto(`/explore/questions/${direction.id}`);
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  await composer(page).fill('SYNTHETIC 保留这条尚未发送的问题');
  await page.keyboard.press('Escape');
  const before = mock.requests.length;
  await page.getByRole('button', { name: '一键生成积累选文文件', exact: true }).click();
  await expect(page.locator('.ai-command-result').last()).toContainText('已生成选文实施文件');
  expect(mock.requests).toHaveLength(before + 1);
  expect(mock.requests.at(-1)).toMatchObject({ command: { name: 'reading-brief', purpose: 'accumulation' }, conversationScope: { kind: 'exploration', explorationId: direction.id } });
  expect(mock.requests.at(-1)?.researchMaterials).toBeUndefined();
  await expect(composer(page)).toHaveValue('SYNTHETIC 保留这条尚未发送的问题');
  await page.keyboard.press('Escape');
  await expect(page.locator('.brief-list')).toContainText('积累');
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  await expect(composer(page)).toHaveValue('SYNTHETIC 保留这条尚未发送的问题');
  expect(mock.requests).toHaveLength(before + 1);
  await page.getByRole('button', { name: '探索问题', exact: true }).click();
  await expect(composer(page)).toHaveValue('/选文 推进 SYNTHETIC 保留这条尚未发送的问题');
  await send(page);
  expect(mock.requests.at(-1)?.command).toEqual({ name: 'reading-brief', purpose: 'research' });
  const [saved] = await explorations(page);
  expect(saved.research.artifacts).toHaveLength(2);
  expect(mock.unexpected).toEqual([]);
});

test('one-click generation unavailable at connection time requires explicit retry', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, 'SYNTHETIC 起点'); await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page);
  await page.goto(`/explore/questions/${direction.id}`);
  await page.route('**/api/ai/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ configured: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: false, searchAvailable: false, chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false } }) }));
  const before = mock.requests.length;
  await page.getByRole('button', { name: '一键生成积累选文文件' }).click();
  await expect(page.locator('.ai-error')).toContainText('暂时无法生成选文文件');
  await expect(page.getByRole('button', { name: '重试生成', exact: true })).toBeDisabled();
  expect(mock.requests).toHaveLength(before);
});

test('a one-click answer asking for clarification does not announce a saved file', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!, { declineBrief: true });
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page);
  await page.goto(`/explore/questions/${direction.id}`);
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  await composer(page).fill('SYNTHETIC 尚未发送的问题草稿');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '一键生成积累选文文件', exact: true }).click();
  await expect(page.locator('.ai-command-result').last()).toContainText('这次没有生成');
  await expect(page.locator('.ai-notice')).toContainText('补充信息后继续讨论');
  await expect(page.locator('.ai-notice')).not.toContainText('文件已生成');
  await expect(page.getByRole('button', { name: '重试生成', exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveValue('SYNTHETIC 尚未发送的问题草稿');
  expect((await explorations(page))[0].research.artifacts ?? []).toHaveLength(0);
  expect(mock.unexpected).toEqual([]);
});

test('one-click storage failure retries the completed file without a second model request', async ({ page, context, baseURL }) => {
  const mock = await service(context, baseURL!);
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page);
  await page.goto(`/explore/questions/${direction.id}`);
  await page.getByRole('button', { name: '继续讨论', exact: true }).click();
  await composer(page).fill('SYNTHETIC 保留独立的问题草稿');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const original = personalStore.saveExploration;
    personalStore.saveExploration = async (...args) => {
      if (args[0].research?.artifacts?.length) {
        personalStore.saveExploration = original;
        throw new Error('SYNTHETIC storage failure');
      }
      return original(...args);
    };
  });
  const before = mock.requests.length;
  await page.getByRole('button', { name: '一键生成积累选文文件', exact: true }).click();
  await expect(page.locator('.ai-error')).toContainText('SYNTHETIC storage failure');
  await expect(page.locator('.ai-notice')).toHaveCount(0);
  await expect(page.locator('.ai-quick-retry')).toContainText('尚未保存');
  expect((await explorations(page))[0].research.artifacts ?? []).toHaveLength(0);
  expect(mock.requests).toHaveLength(before + 1);
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.locator('.ai-command-result').last()).toContainText('已生成选文实施文件');
  await expect(page.locator('.ai-notice')).toContainText('已生成并保存');
  await expect(page.locator('.ai-quick-retry')).toHaveCount(0);
  await expect(page.locator('.ai-error')).toHaveCount(0);
  await expect(composer(page)).toHaveValue('SYNTHETIC 保留独立的问题草稿');
  expect((await explorations(page))[0].research.artifacts).toHaveLength(1);
  expect(mock.requests).toHaveLength(before + 1);
  expect(mock.unexpected).toEqual([]);
});

test('a direction deleted during generation never creates orphan accumulation entries on save or retry', async ({ page, context, baseURL }) => {
  let deletedTopic = '';
  const mock = await service(context, baseURL!, { beforeBrief: async () => {
    await page.evaluate(async id => {
      const { personalStore } = await import('/src/records/store.ts');
      const record = await personalStore.get('explorations', id);
      if (record) await personalStore.deleteExploration(id, record.recordRevision);
    }, deletedTopic);
  } });
  await page.goto(`/read/agent-survey/${guideRevision}#u01`);
  await send(page, '/方向');
  await expect(page.getByLabel('关联方向', { exact: true })).not.toHaveValue('');
  const [direction] = await explorations(page); deletedTopic = direction.id;
  await page.goto(`/explore/questions/${direction.id}`);
  await page.getByRole('button', { name: '一键生成积累选文文件', exact: true }).click();
  // The owning page may close when its record disappears. Replay the exact saved
  // complete answer through the same save entry point, as a historical retry does.
  await expect.poll(() => mock.requests.filter(item => item.command?.name === 'reading-brief').length).toBe(1);
  await expect.poll(async () => (await explorations(page)).length).toBe(0);
  const result = await page.evaluate(async id => {
    const { applyCommandTurn } = await import('/src/research/commands.ts');
    const { personalStore } = await import('/src/records/store.ts');
    const responses = await fetch(`/api/ai/conversations?explorationId=${id}`).then(response => response.json());
    const conversation = await fetch(`/api/ai/conversations/${responses.conversations[0].id}`).then(response => response.json());
    const turn = conversation.turns.at(-1);
    const errors = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await applyCommandTurn(turn, { conversation: conversation.turns, conversationId: conversation.conversation.id }); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    return { errors, records: await personalStore.list('explorations') };
  }, deletedTopic);
  expect(result.errors).toHaveLength(2);
  expect(result.errors.every(message => message.includes('研究方向已不存在'))).toBe(true);
  expect(result.records).toEqual([]);
  expect(mock.unexpected).toEqual([]);
});
