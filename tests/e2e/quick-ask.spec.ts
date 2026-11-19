import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { AiStatus, AiTurn, AskInput } from '../../src/assistant/api';

// Synthetic local service only: a fixed status and one canned streamed answer.
// No model, private conversation, saved configuration or external network is used.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const guide = '/read/multi-agent-communication-survey/2';
const conversation = { id: '22222222-2222-4222-8222-222222222222', title: 'SYNTHETIC 快捷提问', guideId: 'multi-agent-communication-survey', revision: 2, updatedAt: '2026-11-14T00:00:00.000Z' };

async function service(context: BrowserContext, baseURL: string, configured = true) {
  const status: AiStatus = { configured, model: configured ? 'synthetic-quick-model' : null, searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: configured,
    chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false, availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } } };
  const asks: AskInput[] = [], turns: AiTurn[] = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/ai/')) { await route.continue(); return; }
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/ai/status') { await json(status); return; }
    if (url.pathname === '/api/ai/conversations') { await json({ conversations: turns.length ? [conversation] : [] }); return; }
    if (url.pathname === `/api/ai/conversations/${conversation.id}`) { await json({ conversation, turns }); return; }
    if (url.pathname === '/api/ai/ask') {
      const input: AskInput = request.postDataJSON(); asks.push(input);
      const turn: AiTurn = { id: crypto.randomUUID(), question: input.question, answer: `SYNTHETIC 回答 ${asks.length}：先给结论。`, status: 'complete', sources: [],
        context: { guideId: input.guideId, revision: input.revision, unitId: input.unitId, selection: input.selection ?? '', scope: 'section', webSearch: false, provider: 'api', model: 'synthetic-quick-model' }, createdAt: '2026-11-14T00:00:00.000Z' };
      turns.push(turn);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'accepted', conversationId: conversation.id, turnId: turn.id }, { type: 'delta', text: turn.answer }, { type: 'done', turn }].map(event => JSON.stringify(event)).join('\n') + '\n' });
      return;
    }
    await route.abort();
  });
  return { asks };
}

/** Select one paragraph the way a mouse would finish: a selection, then a pointer release. */
async function selectParagraph(page: Page, selector: string) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  return page.locator(selector).first().evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    return selection.toString();
  });
}

test('a selected passage is explained in one click, with that passage attached', async ({ page, context, baseURL }) => {
  const { asks } = await service(context, baseURL!);
  await page.goto(guide);
  await page.locator('#reader-ai-action').click();
  await expect(page.locator('#reader-assistant')).toHaveCount(0);
  const text = await selectParagraph(page, '#architecture p[data-paragraph]');
  const popover = page.locator('.selection-popover');
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: '解释这段' }).click();
  // The closed panel opens, connects and sends without a second action.
  await expect(page.locator('.ai-answer')).toContainText('SYNTHETIC 回答 1');
  expect(asks).toHaveLength(1);
  expect(asks[0].unitId).toBe('architecture');
  expect(asks[0].selection?.length).toBeGreaterThan(20);
  expect(text).toContain(asks[0].selection!.slice(0, 12));
  expect(asks[0].question).toContain('请解释我选中的这段话');
  await expect(popover).toHaveCount(0);
});

test('quick questions send at once for the current section and keep a written draft', async ({ page, context, baseURL }) => {
  const { asks } = await service(context, baseURL!);
  await page.goto(`${guide}#goals`);
  const composer = page.getByLabel('向 AI 提问');
  await composer.fill('SYNTHETIC 我自己的草稿');
  const quick = page.locator('.ai-quick');
  await expect(quick).toContainText('这一节');
  await quick.getByRole('button', { name: '讲这一节' }).click();
  await expect(page.locator('.ai-answer')).toContainText('SYNTHETIC 回答 1');
  expect(asks[0].unitId).toBe('goals');
  expect(asks[0].selection).toBeUndefined();
  await expect(composer).toHaveValue('SYNTHETIC 我自己的草稿');
  // An idea is the reader's own text: the starter only prepares the composer.
  await composer.fill('');
  await quick.getByRole('button', { name: '有个想法' }).click();
  await expect(composer).toHaveValue('我有一个想法：');
  await expect(composer).toBeFocused();
  expect(asks).toHaveLength(1);
});

test('“问 AI” reopens the panel from the reading tools, and an unconnected service keeps the question', async ({ page, context, baseURL }) => {
  const { asks } = await service(context, baseURL!, false);
  await page.goto(guide);
  await page.locator('#reader-ai-action').click();
  await page.locator('#reader-ask-action').click();
  await expect(page.getByLabel('向 AI 提问')).toBeFocused();
  await page.locator('#reader-ai-action').click();
  await selectParagraph(page, '#goals p[data-paragraph]');
  await page.locator('.selection-popover').getByRole('button', { name: '解释这段' }).click();
  await expect(page.getByLabel('向 AI 提问')).toHaveValue(/请解释我选中的这段话/);
  await expect(page.locator('.ai-notice')).toContainText('连接 AI 后即可发送');
  expect(asks).toHaveLength(0);
});
