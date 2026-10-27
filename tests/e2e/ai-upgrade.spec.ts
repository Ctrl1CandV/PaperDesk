import { test, expect } from '@playwright/test';
import type { AiStatus } from '../../src/assistant/api';

// Synthetic API responses only. Every AI request is intercepted; no provider is contacted.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
test('history pages load summaries and fetch original evidence only after deliberate actions', async ({ page }) => {
  const calls: string[] = [];
  const status: AiStatus = { configured: true, model: 'synthetic-model', searchAvailable: false, csrfToken: 'synthetic-token', provider: 'api', apiConfigured: true,
    chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: false, availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } } };
  const conversation = { id: '11111111-1111-4111-8111-111111111111', guideId: 'streamingllm', revision: 2, title: '合成分页历史', updatedAt: '2026-01-01T00:00:00.000Z' };
  const first = { id: '22222222-2222-4222-8222-222222222222', question: '合成摘要问题', answer: '合成摘要，仅含预览。', status: 'complete', createdAt: conversation.updatedAt, sources: [], context: { provider: 'api', model: 'synthetic-model' }, summaryOnly: true, sourceCount: 1 };
  const earlier = { ...first, id: '33333333-3333-4333-8333-333333333333', question: '合成更早问题', answer: '合成更早摘要。' };
  const source = { id: 'O1', kind: 'original', title: '合成固定原文', paperId: 'synthetic:original', sourceRevisionId: 'synthetic-v1', parserRevision: 'a'.repeat(64), materialSha256: 'b'.repeat(64), sourceUnitId: 'u1', text: '合成证据摘录，不是研究结论。', version: 'synthetic-v1', url: 'https://example.test/synthetic#mechanism', locator: { label: 'Synthetic section', anchor: 'mechanism', physicalPage: null, printedPageLabel: null }, verification: 'unreviewed', gaps: ['合成图像未核验。'] };
  const full = { ...first, summaryOnly: false, question: '合成完整问题', answer: '合成完整回答，见 [O1]。', sources: [source], context: { ...first.context, guideId: 'streamingllm', revision: 2, unitId: 'u01', scope: 'section', webSearch: false, historyTurnIds: [] } };
  const newTurn = { ...full, id: '44444444-4444-4444-8444-444444444444', question: '合成新增问题', answer: '合成回答中的完整段落。'.repeat(120) + '合成回答末尾 [O1]。' };
  let posted = false;
  await page.route('**/api/ai/**', async route => {
    const req = route.request(), url = new URL(req.url()); calls.push(url.pathname + url.search);
    const reply = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/ai/status') return reply(status);
    expect(req.headers()['x-paperdesk-token']).toBe('synthetic-token');
    if (url.pathname === '/api/ai/conversations') return reply({ conversations: url.searchParams.has('cursor') ? [conversation] : [], nextCursor: url.searchParams.has('cursor') ? null : 'synthetic-next' });
    if (url.pathname === `/api/ai/conversations/${conversation.id}`) {
      expect(url.searchParams.get('summary')).toBe('1');
      if (posted) return reply({ conversation, turns: [first, { ...newTurn, sources: [], summaryOnly: true, sourceCount: 1, answer: newTurn.answer.slice(0, 800) }], nextCursor: null });
      return reply({ conversation, turns: url.searchParams.has('cursor') ? [earlier] : [first], nextCursor: url.searchParams.has('cursor') ? null : 'synthetic-earlier' });
    }
    if (url.pathname === `/api/ai/turns/${first.id}`) return reply({ turn: full });
    if (url.pathname === '/api/ai/ask') {
      posted = true;
      return route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'accepted', conversationId: conversation.id, turnId: newTurn.id }, { type: 'done', turn: newTurn }].map(event => JSON.stringify(event)).join('\n') + '\n' });
    }
    if (url.pathname.startsWith('/api/ai/materials/')) return reply({ text: '合成本地完整材料。<script>不会执行</script>', ...source });
    return route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto('/read/streamingllm/2#u01');
  await page.getByRole('button', { name: '查看历史对话', exact: true }).click();
  await page.getByRole('button', { name: '读取更多对话', exact: true }).click();
  await page.getByRole('button', { name: /合成分页历史/ }).click();
  await expect(page.locator('.ai-question')).toContainText('历史摘要');
  expect(calls.some(call => call.startsWith('/api/ai/turns/'))).toBe(false);
  await page.getByRole('button', { name: '读取更早的问答', exact: true }).click();
  await expect(page.locator('.ai-question')).toHaveCount(2);
  await page.getByRole('button', { name: '读取完整问答与 1 条依据', exact: true }).last().click();
  await expect(page.locator('.ai-answer').last()).toContainText('合成完整回答');
  expect(calls.some(call => call.startsWith('/api/ai/materials/'))).toBe(false);
  await page.getByRole('link', { name: '查看来源 [O1]', exact: true }).click();
  await expect(page.locator('.ai-sources')).toContainText('固定原文');
  await expect(page.locator('.ai-sources')).toContainText('尚未独立核验');
  await page.getByRole('button', { name: '读取本地固定材料', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '合成固定原文', exact: true })).toContainText('合成证据摘录');
  expect(calls.filter(call => call.startsWith('/api/ai/turns/'))).toHaveLength(1);
  expect(calls.filter(call => call.startsWith('/api/ai/materials/'))).toHaveLength(1);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成新增问题');
  await page.locator('.ai-send').click();
  await expect(page.getByRole('textbox', { name: '向 AI 提问', exact: true })).toHaveValue('');
  await expect(page.locator('.ai-answer').last()).toContainText('合成回答末尾');
  await expect(page.locator('.ai-question')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toHaveCount(2);
});
