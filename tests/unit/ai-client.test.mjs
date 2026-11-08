// Synthetic local transport only. No provider, credentials or personal records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const compiled = stripTypeScriptTypes(readFileSync(new URL('../../src/assistant/api.ts', import.meta.url), 'utf8'), { mode: 'transform' });
const { aiClient, getAiStatus, AiApiError } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const status = { configured: true, csrfToken: 'synthetic-new-token', chatgpt: {} };
const input = { requestId: 'synthetic-request', question: 'SYNTHETIC question', webSearch: false };
const complete = { type: 'done', turn: { id: 'synthetic-turn', status: 'complete' } };

test('a stale local token refreshes once and preserves the exact request identity', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/status')) return json(status);
    if (calls.length === 1) return json({ message: 'Synthetic stale connection', code: 'connection_stale' }, 403);
    return new Response(JSON.stringify(complete) + '\n');
  });
  const events = [];
  await aiClient('synthetic-old-token').ask(input, new AbortController().signal, event => events.push(event));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers['x-paperdesk-token'], 'synthetic-old-token');
  assert.equal(calls[2].options.headers['x-paperdesk-token'], status.csrfToken);
  assert.equal(calls[0].options.body, calls[2].options.body);
  assert.deepEqual(events, [complete]);
});

test('a second stale-token rejection stops without an unbounded retry', async t => {
  let asks = 0, checks = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/status')) { checks++; return json(status); }
    asks++; return json({ message: 'Synthetic stale connection', code: 'connection_stale' }, 403);
  });
  await assert.rejects(aiClient('old').ask(input, new AbortController().signal, () => {}), error => error.status === 403 && error.code === 'connection_stale');
  assert.equal(asks, 2); assert.equal(checks, 1);
});

test('selection, provider and arbitrary HTTP failures are never automatically replayed', async t => {
  for (const [httpStatus, code] of [[400, 'selection_mismatch'], [403, 'provider_denied'], [504, undefined]]) {
    let calls = 0;
    const mocked = t.mock.method(globalThis, 'fetch', async () => { calls++; return json({ message: 'Synthetic rejection', code }, httpStatus); });
    await assert.rejects(aiClient('token').ask(input, new AbortController().signal, () => {}), error => error instanceof AiApiError && error.status === httpStatus && error.code === code);
    assert.equal(calls, 1); mocked.mock.restore();
  }
});

test('ambiguous network failures never trigger another inference request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('Synthetic connection lost'); });
  await assert.rejects(aiClient('token').ask(input, new AbortController().signal, () => {}), /Synthetic connection lost/);
  assert.equal(calls, 1);
});

test('terminal events finish and cancel a transport that remains open', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(complete) + '\n')); },
    cancel() { cancelled = true; },
  })));
  const events = [];
  await aiClient('token').ask(input, new AbortController().signal, event => events.push(event));
  assert.equal(cancelled, true); assert.deepEqual(events, [complete]);
});

test('an incomplete accepted stream remains an error and retains received events', async t => {
  const accepted = { type: 'accepted', conversationId: 'synthetic-conversation', turnId: 'synthetic-turn' };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(accepted) + '\n'));
  const events = [];
  await assert.rejects(aiClient('token').ask(input, new AbortController().signal, event => events.push(event)), /回答连接已中断/);
  assert.deepEqual(events, [accepted]);
});

test('status and history reads have bounded waits and preserve caller cancellation', async t => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', duration => { deadlines.push(duration); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('/status') ? json(status) : json({ conversations: [] }));
  await getAiStatus(); await aiClient('token').conversations('synthetic', 1);
  assert.deepEqual(deadlines, [5000, 15000]);
  const controller = new AbortController(); controller.abort(new Error('Synthetic caller cancellation'));
  t.mock.method(globalThis, 'fetch', async (_url, options) => { options.signal.throwIfAborted(); });
  await assert.rejects(getAiStatus(controller.signal), /Synthetic caller cancellation/);
});

test('a stalled history response is released with a recoverable error', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    deadline.abort(new DOMException('Synthetic timeout', 'TimeoutError'));
    options.signal.throwIfAborted();
  });
  await assert.rejects(aiClient('token').conversations('synthetic', 1), /本机 AI 服务响应超时/);
});

test('saving a ChatGPT model allows the same preparation budget as its catalog', async t => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', duration => { deadlines.push(duration); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async () => json({ settings: { chatgpt: {} }, status }));
  await aiClient('token').saveChatGptSettings({ revision: 'synthetic', modelId: 'synthetic-model' });
  assert.deepEqual(deadlines, [75000]);
});
