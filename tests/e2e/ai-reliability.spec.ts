import { test, expect, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { AiStatus, AiTurn, AskInput, AiProvider } from '../../src/assistant/api';

// Synthetic transport/records only; no persistent AI service or live provider.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const question = 'SYNTHETIC：解释当前章节，并说明依据的范围。';
const answer = 'SYNTHETIC：已使用固定章节完成答疑。';
async function fixture(context: BrowserContext, baseURL: string, provider: AiProvider, failure: 'selection' | 'token' | 'network' | 'history' | 'lost-acceptance') {
  const conversation = { id: '22222222-2222-4222-8222-222222222222', title: 'SYNTHETIC 可靠性检查', guideId: 'llm-survey', revision: 2, updatedAt: '2026-11-06T00:00:00.000Z' };
  const status: AiStatus = { configured: true, provider, model: 'synthetic-model', apiConfigured: true, searchAvailable: false,
    csrfToken: 'synthetic-old-token', chatgpt: { connected: true, loginPending: false, needsLogin: false, fallbackToApi: false,
      availability: { state: 'available', checkedAt: null, model: 'synthetic-model', checking: false, lastError: null } } };
  const asks: AskInput[] = [], turns: AiTurn[] = [], tokens: (string | undefined)[] = [], unexpected: string[] = [];
  const savedRequests = new Map<string, AiTurn>();
  let failed = false, hangHistory = failure === 'history';
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') { await json(status); return; }
    if (url.pathname === '/api/ai/conversations') {
      if (hangHistory) return;
      await json({ conversations: turns.length ? [conversation] : [] }); return;
    }
    if (url.pathname === `/api/ai/conversations/${conversation.id}`) { await json({ conversation, turns }); return; }
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = request.postDataJSON(); asks.push(input); tokens.push(request.headers()['x-paperdesk-token']);
      const loseAcceptance = !failed && failure === 'lost-acceptance';
      if (!failed) {
        failed = true;
        if (failure === 'network') { await route.abort('connectionreset'); return; }
        if (failure === 'token') { status.csrfToken = 'synthetic-new-token'; await json({ message: 'SYNTHETIC 本地连接已更新', code: 'connection_stale' }, 403); return; }
        if (failure === 'selection') { await json({ message: 'SYNTHETIC 选文与当前章节不一致', code: 'selection_mismatch' }, 400); return; }
      }
      const turn: AiTurn = savedRequests.get(input.requestId) ?? { id: crypto.randomUUID(), question: input.question, answer, status: 'complete', sources: [], createdAt: '2026-11-06T00:00:00.000Z',
        context: { guideId: input.guideId, revision: input.revision, unitId: input.unitId, selection: input.selection ?? '', scope: 'section', model: status.model, provider, webSearch: false } };
      if (!savedRequests.has(input.requestId)) { savedRequests.set(input.requestId, turn); turns.push(turn); }
      if (loseAcceptance) { await route.abort('connectionreset'); return; }
      await route.fulfill({ contentType: 'application/x-ndjson', body: [
        { type: 'accepted', conversationId: conversation.id, turnId: turn.id }, { type: 'delta', text: answer }, { type: 'done', turn },
      ].map(event => JSON.stringify(event)).join('\n') + '\n' }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { asks, turns, tokens, unexpected, releaseHistory: () => { hangHistory = false; } };
}

for (const provider of ['api', 'chatgpt'] as const) {
  test(`${provider}: an invalid pinned selection can be removed without losing the question`, async ({ page, context, baseURL }) => {
    const service = await fixture(context, baseURL!, provider, 'selection');
    await page.goto('/read/llm-survey/2#architecture');
    const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
    await expect(composer).toBeVisible();
    await page.locator('#architecture p').first().evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await composer.fill(question); await page.locator('.ai-send').click();
    const error = page.locator('.ai-composer > .ai-error');
    await expect(error).toContainText('提问准备失败');
    await expect(error.getByRole('button', { name: '重试连接', exact: true })).toHaveCount(0);
    await expect(error.getByRole('button', { name: 'AI 设置', exact: true })).toHaveCount(0);
    await expect(page.locator('.ai-turn')).toHaveCount(0); await expect(composer).toHaveValue(question);
    await mkdir('.cache/screenshots/reliability', { recursive: true });
    await page.locator('.ai-panel').screenshot({ path: `.cache/screenshots/reliability/${provider}-selection-error.png` });
    await error.getByRole('button', { name: '不附带选文，保留问题', exact: true }).click();
    await expect(composer).toHaveValue(question); await expect(page.locator('.ai-composer > .ai-error')).toHaveCount(0);
    await page.locator('.ai-send').click(); await expect(page.locator('.ai-answer')).toContainText(answer);
    await expect(composer).toHaveValue('');
    expect(service.asks).toHaveLength(2); expect(service.asks[0].selection).toBeTruthy(); expect(service.asks[1].selection).toBeUndefined();
    expect(service.asks[0].unitId).toBe('architecture'); expect(service.asks[1].unitId).toBe('architecture');
    expect(service.asks[0].requestId).not.toBe(service.asks[1].requestId);
    expect(service.turns).toHaveLength(1); expect(service.unexpected).toEqual([]);
  });

  test(`${provider}: a restarted local service refreshes its token once and saves one answer`, async ({ page, context, baseURL }) => {
    const service = await fixture(context, baseURL!, provider, 'token');
    await page.goto('/read/llm-survey/2#architecture');
    const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
    await composer.fill(question); await page.locator('.ai-send').click();
    await expect(page.locator('.ai-answer')).toContainText(answer); await expect(composer).toHaveValue('');
    expect(service.asks).toHaveLength(2); expect(service.asks[0]).toEqual(service.asks[1]);
    expect(service.tokens).toEqual(['synthetic-old-token', 'synthetic-new-token']); expect(service.turns).toHaveLength(1);
    expect(service.unexpected).toEqual([]);
  });
}

test('an unconfirmed connection failure retains a retryable question and no fabricated answer', async ({ page, context, baseURL }) => {
  const service = await fixture(context, baseURL!, 'api', 'network');
  await page.goto('/read/llm-survey/2#architecture');
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await composer.fill(question); await page.locator('.ai-send').click();
  const error = page.locator('.ai-composer > .ai-error');
  await expect(error).toContainText('请求状态尚未确认'); await expect(page.locator('.ai-turn')).toHaveCount(0);
  await expect(composer).toHaveValue(question); expect(service.asks).toHaveLength(1);
  await error.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.locator('.ai-answer')).toContainText(answer);
  expect(service.asks).toHaveLength(2); expect(service.asks[0].requestId).toBe(service.asks[1].requestId);
  expect(service.turns).toHaveLength(1); expect(service.unexpected).toEqual([]);
});

test('a stalled history read times out and a deliberate reconnect restores sending', async ({ page, context, baseURL }) => {
  const service = await fixture(context, baseURL!, 'api', 'history');
  await page.goto('/read/llm-survey/2#architecture');
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true }); await composer.fill(question);
  await expect(page.locator('.ai-service-state')).toContainText('超时', { timeout: 22000 });
  service.releaseHistory();
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await expect(page.locator('.ai-send')).toBeEnabled(); await expect(composer).toHaveValue(question);
  await page.locator('.ai-send').click(); await expect(page.locator('.ai-answer')).toContainText(answer);
  expect(service.unexpected).toEqual([]);
});

test('a saved request with lost acceptance remains idempotent after closing and reopening the panel', async ({ page, context, baseURL }) => {
  const service = await fixture(context, baseURL!, 'api', 'lost-acceptance');
  await page.goto('/read/llm-survey/2#architecture');
  const composer = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await composer.fill(question); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-composer > .ai-error')).toContainText('请求状态尚未确认');
  expect(service.turns).toHaveLength(1);
  await page.getByRole('button', { name: '收起 AI 解读', exact: true }).click();
  await page.locator('#reader-ai-action').click();
  await expect(composer).toHaveValue(question); await expect(page.locator('.ai-send')).toBeEnabled();
  await page.locator('.ai-send').click(); await expect(page.locator('.ai-answer')).toContainText(answer);
  expect(service.asks).toHaveLength(2); expect(service.asks[0]).toEqual(service.asks[1]); expect(service.turns).toHaveLength(1);
  expect(service.unexpected).toEqual([]);
});
