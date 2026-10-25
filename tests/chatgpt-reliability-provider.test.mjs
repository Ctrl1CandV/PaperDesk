// Synthetic credentials, models and messages only. Every request uses an injected transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithChatGpt, checkChatGptAvailability, listChatGptModels, CHATGPT_CATALOG_LIMITS } from '../server/chatgpt-provider.mjs';

const auth = { getAccessToken: async () => 'SYNTHETIC_ACCESS' };
const catalog = () => Response.json({ models: [{ slug: 'synthetic-model', visibility: 'list' }] });
const textItem = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
const done = output => ({ type: 'response.completed', response: { status: 'completed', output } });
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

function answerFixture(responses) {
  const requests = [], events = [], saves = [];
  const context = { scope: 'full-guide', metadataJson: '{}', toolEvents: [] };
  const state = {
    auth, config: { modelId: 'synthetic-model', toolsEnabled: true, chatgptReasoningEffort: 'high' },
    content: { runLocal: () => ({ text: 'Synthetic source result.' }) },
    prepared: { context, history: [] }, request: { question: 'Synthetic question.', unitId: 'synthetic', webSearch: false },
    turn: { context, sources: [], answer: '' }, signal: new AbortController().signal,
    emit(event) { events.push(event); if (event.type === 'delta') state.turn.answer += event.text; else if (event.type === 'replace') state.turn.answer = event.text; },
    persist() { saves.push(structuredClone(state.turn)); },
    fetchImpl: async (_url, options) => {
      requests.push({ method: options.method, body: JSON.parse(options.body) });
      assert.ok(responses.length, 'Unexpected synthetic request');
      const next = responses.shift(); return typeof next === 'function' ? next() : next;
    },
  };
  return { state, requests, events, saves };
}

test('synthetic catalog projects bounded reasoning choices without exposing descriptions or templates', async () => {
  const models = await listChatGptModels(auth, { fetchImpl: async () => Response.json({ models: [
    { slug: 'synthetic-model', visibility: 'list', default_reasoning_level: 'medium',
      supported_reasoning_levels: [{ effort: 'low', description: 'SYNTHETIC_HIDDEN' }, { effort: 'medium' }, { effort: 'high' },
        { effort: 'high' }, { effort: 'unknown' }, { effort: ' HIGH' }, null, 'low'], base_instructions: 'SYNTHETIC_HIDDEN' },
    { slug: 'synthetic-legacy', visibility: 'list' },
    { slug: 'synthetic-all', visibility: 'list', supported_reasoning_levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(effort => ({ effort })), default_reasoning_level: 'max' },
    { slug: 'synthetic-mismatch', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'high' },
  ] }) });
  assert.deepEqual(models, [
    { id: 'synthetic-model', name: 'synthetic-model', reasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'medium' },
    { id: 'synthetic-legacy', name: 'synthetic-legacy' },
    { id: 'synthetic-all', name: 'synthetic-all', reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultReasoningEffort: 'max' },
    { id: 'synthetic-mismatch', name: 'synthetic-mismatch', reasoningEfforts: ['low'] },
  ]);
  assert.equal(JSON.stringify(models).includes('SYNTHETIC_HIDDEN'), false);
});

test('synthetic thinking selection survives tool continuation and only generic progress leaves the stream', async () => {
  const reasoning = { type: 'reasoning', id: 'synthetic-reasoning', encrypted_content: 'SYNTHETIC_HIDDEN', summary: [] };
  const call = { type: 'function_call', namespace: 'paperdesk', call_id: 'synthetic-call', name: 'search_library', arguments: '{"query":"synthetic"}', status: 'completed' };
  const progress = [
    { type: 'response.output_item.added', item: reasoning },
    { type: 'response.reasoning_text.delta', delta: 'SYNTHETIC_HIDDEN' },
    { type: 'response.reasoning_summary_part.added', part: { text: 'SYNTHETIC_HIDDEN' } },
    { type: 'response.reasoning_summary_text.delta', delta: 'SYNTHETIC_HIDDEN' },
  ];
  const f = answerFixture([sse([...progress, done([reasoning, call])]), sse([...progress, done([reasoning, textItem('Synthetic answer.')])])]);
  await answerWithChatGpt(f.state);
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(request => request.body.reasoning.effort === 'high'));
  assert.ok(f.requests.every(request => request.body.store === false && request.body.include[0] === 'reasoning.encrypted_content'));
  assert.equal(f.events.filter(event => event.type === 'status' && event.text === '正在思考').length, 2);
  assert.ok(f.requests[1].body.input.some(item => item.encrypted_content === 'SYNTHETIC_HIDDEN'));
  assert.equal(JSON.stringify(f.events).includes('SYNTHETIC_HIDDEN'), false);
  assert.equal(JSON.stringify(f.saves).includes('SYNTHETIC_HIDDEN'), false);
  assert.equal(JSON.stringify(f.state.turn).includes('SYNTHETIC_HIDDEN'), false);
});

test('synthetic automatic reasoning omits the override and does not invent thinking progress', async () => {
  const f = answerFixture([sse([{ type: 'response.created', response: { status: 'in_progress' } }, done([textItem('Synthetic answer.')])])]);
  f.state.config.chatgptReasoningEffort = '';
  await answerWithChatGpt(f.state);
  assert.equal(Object.hasOwn(f.requests[0].body, 'reasoning'), false);
  assert.equal(f.events.some(event => event.text === '正在思考'), false);
  f.state.config.chatgptReasoningEffort = 'synthetic-unsupported';
  await assert.rejects(answerWithChatGpt(f.state), error => error.status === 400);
  assert.equal(f.requests.length, 1);
});

test('synthetic availability probe sends its chosen lower effort once with no reader context or tools', async () => {
  const bodies = [];
  const fetchImpl = async (_url, options) => { bodies.push(JSON.parse(options.body)); return sse([done([textItem('OK')])]); };
  await checkChatGptAvailability(auth, { modelId: 'synthetic-model', reasoningEffort: 'low', fetchImpl });
  await checkChatGptAvailability(auth, { modelId: 'synthetic-model', fetchImpl });
  assert.deepEqual(bodies[0].reasoning, { effort: 'low' });
  assert.deepEqual(bodies[0].input, [{ role: 'user', content: 'Reply with OK.' }]);
  assert.deepEqual(bodies[0].tools, []);
  assert.equal(Object.hasOwn(bodies[1], 'reasoning'), false);
});

test('synthetic availability budget admits bounded opaque reasoning while preserving transport and visible limits', async () => {
  const response = (size, text = 'OK') => sse([done([
    { type: 'reasoning', encrypted_content: 's'.repeat(size), summary: [] }, textItem(text),
  ])]);
  assert.deepEqual(await checkChatGptAvailability(auth, { modelId: 'synthetic-model', fetchImpl: async () => response(96 * 1024) }), { model: 'synthetic-model' });
  await assert.rejects(checkChatGptAvailability(auth, { modelId: 'synthetic-model', fetchImpl: async () => response(256 * 1024) }), /传输预算/);
  await assert.rejects(checkChatGptAvailability(auth, { modelId: 'synthetic-model', fetchImpl: async () => response(0, 's'.repeat(257)) }), /长度预算/);
});

test('synthetic catalog retries one temporary GET under a single deadline', async t => {
  for (const [name, first] of [
    ['network', () => { throw Error('SYNTHETIC_HIDDEN'); }],
    ['502', () => Response.json({ detail: 'Synthetic gateway failure.' }, { status: 502 })],
    ['503', () => Response.json({ error: { code: 'subscription_sharing_usage_unavailable' } }, { status: 503 })],
    ['504', () => Response.json({ detail: 'Synthetic gateway timeout.' }, { status: 504 })],
    ['interrupted body', () => new Response(new ReadableStream({ start(controller) { controller.error(Error('SYNTHETIC_HIDDEN')); } }))],
  ]) await t.test(name, async () => {
    const requests = [];
    const models = await listChatGptModels(auth, { fetchImpl: async (_url, options) => { requests.push(options); return requests.length === 1 ? first() : catalog(); } });
    assert.equal(models[0].id, 'synthetic-model');
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.method === 'GET'));
    assert.equal(requests[0].signal, requests[1].signal);
  });
});

test('synthetic repeated transient catalog failure stops after two attempts', async () => {
  let calls = 0;
  await assert.rejects(listChatGptModels(auth, { fetchImpl: async () => { calls++; return Response.json({}, { status: 503 }); } }), error => error.status === 503);
  assert.equal(calls, 2);
});

test('synthetic authorization, quota, rate, malformed and budget catalog failures never retry', async t => {
  const failures = [
    ...[401, 403, 429, 500].map(status => [String(status), () => Response.json({}, { status })]),
    ...['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_user_not_eligible', 'subscription_sharing_unsupported_capability', 'chatpass_v2_scope_not_authorized'].map(code => [code, () => Response.json({ error: { code } }, { status: 503 })]),
    ['invalid JSON', () => new Response('{synthetic malformed')],
    ['invalid schema', () => Response.json({ data: [] })],
    ['size budget', () => new Response('', { headers: { 'content-length': String(CHATGPT_CATALOG_LIMITS.bytes + 1) } })],
  ];
  for (const [name, failure] of failures) await t.test(name, async () => {
    let calls = 0;
    await assert.rejects(listChatGptModels(auth, { fetchImpl: async () => { calls++; return failure(); } }));
    assert.equal(calls, 1);
  });
});

test('synthetic catalog cancellation during backoff prevents a second request', async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = listChatGptModels(auth, { signal: controller.signal, fetchImpl: async () => {
    calls++; setTimeout(() => controller.abort(), 20); return Response.json({}, { status: 503 });
  } });
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(calls, 1);
});

test('synthetic shared catalog deadline also stops retry backoff', async t => {
  const timeout = new AbortController(); let calls = 0, deadlines = 0;
  t.mock.method(AbortSignal, 'timeout', milliseconds => { deadlines++; assert.equal(milliseconds, 15000); return timeout.signal; });
  await assert.rejects(listChatGptModels(auth, { fetchImpl: async () => {
    calls++; setTimeout(() => timeout.abort(), 20); return Response.json({}, { status: 503 });
  } }), error => error.status === 504);
  assert.equal(calls, 1); assert.equal(deadlines, 1);
});

test('synthetic response POST failures never use the catalog retry policy', async () => {
  for (const failure of [() => { throw Error('SYNTHETIC_HIDDEN'); }, () => Response.json({}, { status: 503 })]) {
    const f = answerFixture([failure]);
    await assert.rejects(answerWithChatGpt(f.state));
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].method, 'POST');
  }
});

test('synthetic SSE accepts LF, CRLF and bare CR even when every byte is a separate chunk', async t => {
  for (const newline of ['\n', '\r\n', '\r']) await t.test(JSON.stringify(newline), async () => {
    const events = [{ type: 'response.output_text.delta', delta: '合成流式文本。' }, done([textItem('合成流式文本。')])];
    const raw = events.map(event => `event: ${event.type}${newline}data: ${JSON.stringify(event)}${newline}${newline}`).join('');
    const encoded = new TextEncoder().encode(raw);
    const body = new ReadableStream({ start(controller) {
      for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } });
    const f = answerFixture([new Response(body, { headers: { 'content-type': 'text/event-stream' } })]);
    await answerWithChatGpt(f.state);
    assert.equal(f.state.turn.answer, '合成流式文本。');
    assert.equal(f.events.filter(event => event.type === 'delta').length, 1);
  });
});
