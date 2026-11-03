import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { AiStatus, AiTurn, AskInput } from '../../src/assistant/api';

// Only synthetic questions, saved turns and provider responses. Never connects
// the normal local AI service or any external provider.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const questionText = 'SYNTHETIC：请解释这一节中的缩写。';
const answerText = 'SYNTHETIC：这是修复资料准备后的完整回答。';
const olderAnswer = 'SYNTHETIC：较早的一轮完整回答应继续保留。';
const partialAnswer = 'SYNTHETIC：已经接收并保存的回答片段。';

async function service(context: BrowserContext, baseURL: string, { history = false, interrupted = false, preflightStatus = 413 } = {}) {
  const conversation = { id: '11111111-1111-4111-8111-111111111111', title: 'SYNTHETIC 原有会话', guideId: 'llm-survey', revision: 1, updatedAt: '2026-11-03T00:00:00.000Z' };
  const status: AiStatus = { configured: true, model: 'synthetic-model', searchAvailable: true, csrfToken: 'synthetic-token', provider: 'chatgpt', apiConfigured: false, chatgpt: { connected: true, loginPending: false, needsLogin: false, fallbackToApi: false, availability: { state: 'available', checkedAt: null, model: 'synthetic-model', checking: false, lastError: null } } };
  const turn = (question: string, answer: string, turnStatus: AiTurn['status']): AiTurn => ({ id: crypto.randomUUID(), question, answer, status: turnStatus, sources: [], createdAt: '2026-11-03T00:00:00.000Z', context: { guideId: 'llm-survey', revision: 1, unitId: 'u04', scope: 'section', model: 'synthetic-model', provider: 'chatgpt', webSearch: false } });
  const turns: AiTurn[] = history ? [turn('SYNTHETIC 较早问题', olderAnswer, 'complete')] : [];
  const asks: AskInput[] = [], unexpected: string[] = [];
  let rejectNext = !interrupted;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push(url.origin); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') { await json(status); return; }
    if (url.pathname === '/api/ai/conversations') { await json({ conversations: turns.length ? [conversation] : [] }); return; }
    if (url.pathname === `/api/ai/conversations/${conversation.id}`) { await json({ conversation, turns }); return; }
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = request.postDataJSON(); asks.push(input);
      if (rejectNext) { rejectNext = false; await json({ message: preflightStatus === 413 ? 'SYNTHETIC：本地资料达到保守预算，请调整提问资料。' : 'SYNTHETIC：模型目录准备超时，请稍后重试。' }, preflightStatus); return; }
      const saved = turn(input.question, interrupted ? partialAnswer : answerText, interrupted ? 'interrupted' : 'complete'); turns.push(saved);
      const events = [{ type: 'accepted', conversationId: conversation.id, turnId: saved.id }, { type: 'delta', text: saved.answer }, ...interrupted ? [] : [{ type: 'done', turn: saved }]];
      await route.fulfill({ contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { asks, turns, unexpected };
}

async function open(page: Page) {
  await page.goto('/read/llm-survey/1#u04');
  await expect(page.getByRole('textbox', { name: '向 AI 提问', exact: true })).toBeVisible();
  return page.getByRole('textbox', { name: '向 AI 提问', exact: true });
}

test('a rejected first request shows preparation failure without a fake model turn and resends the same draft', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!); const composer = await open(page);
  await composer.fill(questionText); await page.locator('.ai-send').click();
  const alert = page.locator('.ai-composer > .ai-error');
  await expect(alert).toContainText('提问准备失败');
  await expect(alert).toContainText('本轮请求未发送给模型');
  await expect(alert.getByRole('button', { name: '重试连接', exact: true })).toHaveCount(0);
  await expect(page.locator('.ai-turn')).toHaveCount(0);
  await expect(page.getByText('此记录未包含模型信息', { exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue(questionText); expect(fixture.turns).toEqual([]);
  await mkdir('.cache/screenshots/ai-preflight', { recursive: true });
  await page.locator('.ai-panel').screenshot({ path: '.cache/screenshots/ai-preflight/preparation-failure.png', animations: 'disabled' });
  await alert.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.locator('.ai-answer')).toContainText(answerText); await expect(composer).toHaveValue('');
  await expect(alert).toHaveCount(0); await expect(page.locator('.ai-turn')).toHaveCount(1);
  expect(fixture.asks).toHaveLength(2); expect(fixture.asks[0].requestId).toBe(fixture.asks[1].requestId); expect(fixture.asks[0].unitId).toBe('u04');
  expect(fixture.asks[1].question).toBe(questionText); expect(fixture.unexpected).toEqual([]);
});

test('a preparation failure preserves completed conversation history and the current composer', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!, { history: true }); const composer = await open(page);
  await page.getByRole('button', { name: '查看历史对话', exact: true }).click();
  await page.getByRole('dialog', { name: '历史对话', exact: true }).getByRole('button', { name: /SYNTHETIC 原有会话/ }).click();
  await expect(page.locator('.ai-answer')).toContainText(olderAnswer);
  await composer.fill(questionText); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-composer > .ai-error')).toContainText('提问准备失败');
  await expect(page.locator('.ai-turn')).toHaveCount(1); await expect(page.locator('.ai-answer')).toContainText(olderAnswer);
  await expect(composer).toHaveValue(questionText); expect(fixture.turns).toHaveLength(1); expect(fixture.unexpected).toEqual([]);
});

test('a stream that ends after acceptance retains its interrupted saved model turn', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!, { interrupted: true }); const composer = await open(page);
  await composer.fill(questionText); await page.locator('.ai-send').click();
  await expect(page.locator('.ai-composer > .ai-error')).toContainText('回答连接已中断');
  await expect(page.locator('.ai-turn-state')).toHaveText('未完成');
  await expect(page.locator('.ai-answer')).toContainText(partialAnswer);
  await expect(page.getByText('提问准备失败', { exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue(questionText); expect(fixture.turns).toHaveLength(1); expect(fixture.unexpected).toEqual([]);
});

test('a catalog timeout before acceptance keeps a retryable draft without an empty model turn', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!, { preflightStatus: 504 }); const composer = await open(page);
  await composer.fill(questionText); await page.locator('.ai-send').click();
  const alert = page.locator('.ai-composer > .ai-error');
  await expect(alert).toContainText('提问准备失败'); await expect(alert).toContainText('本次提问未能正常开始，服务返回了错误');
  await expect(alert).toContainText('模型目录准备超时');
  await expect(page.locator('.ai-turn')).toHaveCount(0); await expect(page.locator('.ai-turn-state')).toHaveCount(0);
  await expect(composer).toHaveValue(questionText); expect(fixture.turns).toEqual([]);
  await alert.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(page.locator('.ai-answer')).toContainText(answerText); await expect(composer).toHaveValue('');
  expect(fixture.asks).toHaveLength(2); expect(fixture.asks[0].requestId).toBe(fixture.asks[1].requestId); expect(fixture.unexpected).toEqual([]);
});
