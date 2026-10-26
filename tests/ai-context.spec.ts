import { test, expect, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { AiStatus, AiTurn, AskInput } from '../src/assistant/api';

// All conversations and model answers are synthetic; no real AI service is used.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
async function syntheticService(context: BrowserContext, baseURL: string, options: { fail?: boolean; long?: boolean; historyGate?: Promise<void> } = {}) {
  const status: AiStatus = { configured: true, model: 'synthetic-model', searchAvailable: true,
    csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true,
    chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false,
      availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } } };
  const conversation = { id: '11111111-1111-4111-8111-111111111111', title: '合成对话：章节上下文', guideId: 'agent-survey', revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' };
  const requests: AskInput[] = [], unexpected: string[] = [];
  const turns: AiTurn[] = [];
  let fail = options.fail ?? false;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') { await json(status); return; }
    if (url.pathname === '/api/ai/conversations') { await json({ conversations: turns.length ? [conversation] : [] }); return; }
    if (url.pathname === `/api/ai/conversations/${conversation.id}`) { await options.historyGate; await json({ conversation, turns }); return; }
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = request.postDataJSON(); requests.push(input);
      if (fail) { fail = false; await json({ error: '合成测试：连接中断，问题未被接收。' }, 503); return; }
      const turn: AiTurn = { id: crypto.randomUUID(), question: input.question,
        answer: ('这是用于检查长回答排版与滚动的合成段落，不是研究结论。[L1]\n\n').repeat(options.long ? 32 : 1),
        status: 'complete', createdAt: '2026-01-01T00:00:00.000Z',
        context: { guideId: input.guideId, revision: input.revision, unitId: input.unitId, selection: input.selection ?? '', scope: 'full-guide', webSearch: input.webSearch, historyTurnIds: turns.map(item => item.id), model: 'synthetic-model', provider: 'api' },
        sources: [{ id: 'L1', kind: 'guide', title: '合成来源：提问章节', guideId: input.guideId, revision: input.revision, unitId: input.unitId, text: '合成来源摘录，仅用于验证定位和来源快照。' }] };
      turns.push(turn);
      const events = [{ type: 'accepted', conversationId: conversation.id, turnId: turn.id }, { type: 'sources', sources: turn.sources }, { type: 'delta', text: turn.answer }, { type: 'done', turn }];
      await route.fulfill({ contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { requests, turns, unexpected };
}

test('synthetic question keeps its material while drafting, answering and reopening history', async ({ page, context, baseURL }) => {
  const service = await syntheticService(context, baseURL!);
  await page.goto('/read/agent-survey/2#u01');
  const question = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await expect(page.locator('.ai-context-current')).toContainText('Agent 的基本视角');
  await question.fill('合成问题：请解释这一节。');
  await page.locator('.reading-sidebar a[href="#u02"]').click();
  await expect(page.locator('.ai-material-change')).toBeVisible();
  await expect(page.locator('.ai-context-current')).toContainText('Agent 的基本视角');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toContainText('合成段落');
  await expect(question).toHaveValue('');
  expect(service.requests[0].unitId).toBe('u01');
  const material = page.locator('.ai-turn-material');
  await expect(material).toContainText('Agent 的基本视角');
  await material.locator('summary').click();
  await expect(material.getByRole('link')).toHaveAttribute('href', '/read/agent-survey/2#u01');
  await expect(material).toContainText('带入 0 轮已完成对话');
  await page.locator('.reading-sidebar a[href="#u03"]').click();
  await expect(material).toContainText('Agent 的基本视角');
  await page.reload();
  await page.getByRole('button', { name: '查看历史对话', exact: true }).click();
  await page.getByRole('dialog', { name: '历史对话', exact: true }).getByRole('button', { name: /合成对话/ }).click();
  await expect(page.locator('.ai-turn-material')).toContainText('Agent 的基本视角');
  await page.locator('.ai-turn-material summary').click();
  await page.locator('.ai-turn-material a').click();
  await expect(page).toHaveURL(/#u01$/);
  expect(service.unexpected).toEqual([]);
});

test('synthetic failed question retains pinned draft and retries without duplicating its request', async ({ page, context, baseURL }) => {
  const service = await syntheticService(context, baseURL!, { fail: true });
  await page.goto('/read/agent-survey/2#u01');
  const question = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await question.fill('合成失败问题：保留我写下的内容。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-error')).toContainText('问题未被接收');
  await expect(question).toHaveValue('合成失败问题：保留我写下的内容。');
  await page.locator('.reading-sidebar a[href="#u02"]').click();
  await expect(page.locator('.ai-material-change')).toBeVisible();
  await page.locator('.ai-send').click();
  await expect(question).toHaveValue('');
  expect(service.requests).toHaveLength(2);
  expect(service.requests[0].requestId).toBe(service.requests[1].requestId);
  expect(service.requests[1].unitId).toBe('u01');
  await question.fill('合成追问：现在改变资料。');
  await page.locator('.reading-sidebar a[href="#u03"]').click();
  await page.locator('.ai-material-change').click();
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toHaveCount(2);
  expect(service.requests[2].unitId).toBe('u03');
  expect(service.unexpected).toEqual([]);
});

test('synthetic long answer completion preserves the position when reading earlier paragraphs', async ({ page, context, baseURL }) => {
  const service = await syntheticService(context, baseURL!, { long: true });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname !== '/api/ai/ask') return response;
      const lines = (await response.text()).trimEnd().split('\n'), encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode(lines.slice(0, -1).join('\n') + '\n'));
        (window as any).syntheticCompleteAnswer = () => { controller.enqueue(encoder.encode(lines.at(-1) + '\n')); controller.close(); };
      } }), { status: 200, headers: response.headers });
    };
  });
  await page.goto('/read/agent-survey/2#u01');
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成长回答问题。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toContainText('合成段落');
  await page.locator('.ai-messages').evaluate(element => { element.scrollTop = 80; element.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => (window as any).syntheticCompleteAnswer());
  await expect(page.locator('.ai-progress')).toHaveCount(0);
  await expect.poll(() => page.locator('.ai-messages').evaluate(element => element.scrollTop)).toBeLessThan(150);
  await page.locator('.ai-answer .ai-citation').first().click();
  await expect(page.locator('.ai-sources li')).toBeFocused();
  await mkdir('.cache/ai-context', { recursive: true });
  await page.locator('.ai-messages').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '.cache/ai-context/long-answer-desktop.png' });
  expect(service.unexpected).toEqual([]);
});

test('opening the docked assistant preserves a direct deep-section anchor and page focus', async ({ page, context, baseURL }) => {
  const service = await syntheticService(context, baseURL!);
  await page.goto('/read/agent-survey/2#u03');
  await expect(page.locator('.diagram-scroll[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.reading-sidebar a[href="#u03"]')).toHaveAttribute('aria-current', 'location');
  await expect.poll(() => page.locator('#u03').evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.locator('#u03').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(150);
  expect(await page.locator('#reader-assistant').evaluate(element => element.contains(document.activeElement))).toBe(false);
  expect(service.unexpected).toEqual([]);
});

test('synthetic final confirmation keeps the submitted material until reconciliation finishes', async ({ page, context, baseURL }) => {
  let release!: () => void;
  const historyGate = new Promise<void>(resolve => { release = resolve; });
  const service = await syntheticService(context, baseURL!, { historyGate });
  await page.goto('/read/agent-survey/2#u01');
  await expect(page.locator('.ai-context-current')).toContainText('Agent 的基本视角');
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成问题：回答完成后等待保存确认。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-progress')).toHaveText('正在确认对话已保存');
  await page.locator('.reading-sidebar a[href="#u02"]').click();
  await expect(page.locator('.ai-context-label')).toHaveText('本次提问位置');
  await expect(page.locator('.ai-context-current')).toContainText('Agent 的基本视角');
  release();
  await expect(page.locator('.ai-progress')).toHaveCount(0);
  await expect(page.locator('.ai-context-label')).toHaveText('围绕这一节提问');
  await expect(page.locator('.ai-turn-material')).toContainText('Agent 的基本视角');
  expect(service.unexpected).toEqual([]);
});
