import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ContentIndex } from '../../server/content/index.mjs';
import { normalizeConfig } from '../../server/config.mjs';
import { validateAsk } from '../../server/http/validation.mjs';
import type { AiStatus, AiTurn, AskInput } from '../../src/assistant/api';

// Real browser DOM -> normal frontend AskInput -> actual ContentIndex.prepare.
// Only the provider response/history transport is synthetic. No private store,
// local service configuration, existing records or external network is opened.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const config = normalizeConfig({ baseURL: 'https://synthetic.invalid/v1', apiKey: 'SYNTHETIC', modelId: 'synthetic-selection-model', toolsEnabled: false });

async function service(context: BrowserContext, baseURL: string, tamper = false) {
  const metadata = JSON.parse(readFileSync('content/guides/llm-survey.r2.json', 'utf8'));
  const body = readFileSync('content/guides/llm-survey.r2.md', 'utf8');
  const content = new ContentIndex({ catalog: { currentRevisions: { 'llm-survey': 2 } }, guides: [{ metadata, body }] });
  const conversation = { id: '11111111-1111-4111-8111-111111111111', title: 'SYNTHETIC 选文校验', guideId: 'llm-survey', revision: 2, updatedAt: '2026-11-06T00:00:00.000Z' };
  const status: AiStatus = { configured: true, model: 'synthetic-selection-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true,
    chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false, availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } } };
  const asks: AskInput[] = [], turns: AiTurn[] = [], unexpected: string[] = [];
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
      try {
        const checked = validateAsk(tamper ? { ...input, selection: `${input.selection ?? ''} SYNTHETIC forged excerpt` } : input);
        const prepared = content.prepare(checked, [], config);
        const turn: AiTurn = { id: crypto.randomUUID(), question: input.question, answer: 'SYNTHETIC：真实选文已通过固定章节的来源校验。', status: 'complete',
          sources: prepared.sources, context: { ...prepared.context, provider: 'api' }, createdAt: '2026-11-06T00:00:00.000Z' };
        turns.push(turn);
        await route.fulfill({ contentType: 'application/x-ndjson', body: [
          { type: 'accepted', conversationId: conversation.id, turnId: turn.id }, { type: 'sources', sources: turn.sources }, { type: 'done', turn },
        ].map(event => JSON.stringify(event)).join('\n') + '\n' });
      } catch (error) {
        const failure = error as Error & { status?: number; code?: string };
        await json({ message: failure.message, code: failure.code }, failure.status ?? 500);
      }
      return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  return { content, asks, turns, unexpected };
}

async function select(page: Page, selector: string, innerSelector?: string) {
  await page.locator(selector).first().evaluate((element, inner) => {
    const target = inner ? element.querySelector(inner) : element;
    if (!target) throw new Error('Synthetic selection target was not found.');
    const range = document.createRange(); range.selectNodeContents(target);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, innerSelector);
  await expect(page.locator('.ai-context-current')).toContainText('选文 ·');
}

async function send(page: Page) {
  const question = page.getByRole('textbox', { name: '向 AI 提问', exact: true });
  await question.fill('SYNTHETIC：请解释这段选文。');
  await page.locator('.ai-send').click();
  return question;
}

test('whole public chapter with terms, citations, inline formulae and table passes backend provenance validation', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!);
  try {
    await page.goto('/read/llm-survey/2#architecture');
    await select(page, '#architecture');
    await send(page);
    await expect(page.locator('.ai-answer')).toContainText('真实选文已通过');
    expect(fixture.asks).toHaveLength(1);
    const input = fixture.asks[0];
    expect(input.selection).toBe(fixture.content.get('llm-survey', 2).units.find((unit: { id: string }) => unit.id === 'architecture').renderedText);
    expect(input.selection).toContain('$2T\\times8d$');
    expect(input.selection).not.toContain('表格可横向滚动');
    expect(input.selection).not.toContain('TT');
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.content.close(); }
});

test('selecting inside a rendered formula attaches its source exactly once', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!);
  try {
    await page.goto('/read/llm-survey/2#architecture');
    await select(page, '#architecture .inline-formula', 'annotation');
    await send(page);
    await expect(page.locator('.ai-answer')).toContainText('真实选文已通过');
    expect(fixture.asks[0].selection).toBe('$T$');
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.content.close(); }
});

test('table cells keep their boundaries and exclude the added scrolling instruction', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!);
  try {
    await page.goto('/read/llm-survey/2#architecture');
    await select(page, '#architecture table');
    await send(page);
    await expect(page.locator('.ai-answer')).toContainText('真实选文已通过');
    expect(fixture.asks[0].selection).toContain('普通多头 8 8 $2T\\times8d$');
    expect(fixture.asks[0].selection).not.toContain('横向滚动');
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.content.close(); }
});

test('a visible compact citation restores the exact source label', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!);
  try {
    await page.goto('/read/llm-survey/2#architecture');
    await select(page, '#architecture .citation-button', '.citation-display');
    await send(page);
    await expect(page.locator('.ai-answer')).toContainText('真实选文已通过');
    expect(fixture.asks[0].selection).toBe('§3.2与表1，PDF 第6–9页');
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.content.close(); }
});

test('an altered excerpt is still rejected before a synthetic answer is created', async ({ page, context, baseURL }) => {
  const fixture = await service(context, baseURL!, true);
  try {
    await page.goto('/read/llm-survey/2#architecture');
    await select(page, '#architecture table');
    const question = await send(page);
    await expect(page.locator('.ai-composer > .ai-error')).toContainText('选文与当前章节不一致');
    await expect(question).toHaveValue('SYNTHETIC：请解释这段选文。');
    await expect(page.locator('.ai-turn')).toHaveCount(0);
    expect(fixture.turns).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.content.close(); }
});
