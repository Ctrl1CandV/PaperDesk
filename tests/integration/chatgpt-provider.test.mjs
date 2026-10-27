import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithChatGpt, listChatGptModels, resolveChatGptModel, isChatGptQuotaError, CHATGPT_CATALOG_LIMITS } from '../../server/ai/providers/chatgpt.mjs';
import { LIMITS } from '../../server/ai/instructions.mjs';
import { PublicError } from '../../server/http/validation.mjs';

// Every credential, model, message and source in these tests is synthetic. No real service is called.
const TOKEN = 'synthetic-oauth-access-token';
const auth = { getAccessToken: async () => TOKEN };
const textItem = (text, phase = 'final_answer') => ({ type: 'message', id: 'synthetic-message', role: 'assistant', status: 'completed', phase, content: [{ type: 'output_text', text, annotations: [] }] });
const callItem = (id, name = 'search_library', args = { query: 'synthetic' }) => ({ type: 'function_call', id: `synthetic-item-${id}`, call_id: `synthetic-call-${id}`, namespace: 'paperdesk', name, arguments: JSON.stringify(args), status: 'completed' });
const completed = output => ({ type: 'response.completed', response: { id: 'synthetic-response', status: 'completed', output } });
const delta = text => ({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text });

function sse(events, { split = false, crlf = false } = {}) {
  let raw = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  if (crlf) raw = raw.replace(/\n/g, '\r\n');
  const bytes = new TextEncoder().encode(raw);
  const body = new ReadableStream({ start(controller) {
    if (split) { for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7)); }
    else controller.enqueue(bytes);
    controller.close();
  } });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function fixture(responses = []) {
  const controller = new AbortController();
  const sources = [{ id: 'L1', kind: 'guide', title: 'Synthetic guide', url: '/read/synthetic/1#intro', guideId: 'synthetic', revision: 1, unitId: 'intro', text: 'Synthetic reviewed guide only.', version: null }];
  const context = { scope: 'full-guide', metadataJson: JSON.stringify({ title: 'Synthetic guide', coverage: 'Synthetic coverage only.' }), model: 'synthetic-model', toolEvents: [] };
  const emitted = [], requests = [], localCalls = [], saved = [];
  const state = {
    config: { modelId: 'synthetic-model', toolsEnabled: true, searchAvailable: false, search: { apiKey: 'synthetic-tavily-key' }, maxOutputTokens: 1000 },
    prepared: { context, sources, history: [{ question: 'Synthetic earlier question', answer: 'Synthetic earlier answer' }] },
    request: { unitId: 'intro', question: 'Synthetic new question', selection: 'Synthetic', webSearch: false },
    turn: { context, sources, answer: '' }, signal: controller.signal, auth,
    content: { runLocal(name, args, sourceList) { localCalls.push({ name, args }); return { source: sourceList[0], scope: 'Synthetic tool result' }; } },
    emit(event) { emitted.push(structuredClone(event)); if (event.type === 'delta') state.turn.answer += event.text; else if (event.type === 'replace') state.turn.answer = event.text; },
    persist() { saved.push(structuredClone(state.turn)); },
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
      const response = responses.shift();
      assert.ok(response, 'Synthetic test has no remaining mocked response; live fetch is forbidden.');
      return typeof response === 'function' ? response(url, options) : response;
    },
  };
  return { state, controller, emitted, requests, localCalls, saved };
}

test('catalog uses official OAuth route, account ordering, display visibility and a bounded signal', async () => {
  const { state, requests } = fixture([Response.json({ models: [
    { slug: 'synthetic-hidden', visibility: 'hide' },
    { slug: 'synthetic-first', visibility: 'list' },
    { slug: 'synthetic-second', visibility: 'list' },
  ] })]);
  assert.equal(await resolveChatGptModel(auth, { fetchImpl: state.fetchImpl, signal: state.signal }), 'synthetic-first');
  assert.equal(requests[0].url, 'https://api.openai.com/v1/models');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(requests[0].redirect, 'error');
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.notEqual(requests[0].signal, state.signal);
});

test('explicit backend model must occur in the current account catalog; catalog is not shared between calls', async () => {
  const { state, requests } = fixture([
    Response.json({ models: [{ slug: 'synthetic-custom', visibility: 'list' }] }),
    Response.json({ models: [{ slug: 'synthetic-other', visibility: 'list' }] }),
    Response.json({ data: [{ id: 'ordinary-api-format-is-not-this-catalog' }] }),
  ]);
  assert.equal(await resolveChatGptModel(auth, { modelId: 'synthetic-custom', fetchImpl: state.fetchImpl }), 'synthetic-custom');
  await assert.rejects(resolveChatGptModel(auth, { modelId: 'synthetic-custom', fetchImpl: state.fetchImpl }), error => error instanceof PublicError && error.status === 403);
  await assert.rejects(resolveChatGptModel(auth, { fetchImpl: state.fetchImpl }), /模型目录/);
  assert.equal(requests.length, 3);
});

test('catalog exposes only visible models in server order, deduplicates slugs and uses bounded display names', async () => {
  const { state } = fixture([Response.json({ models: [
    { slug: 'synthetic-hidden', visibility: 'hide', display_name: 'Hidden' },
    { slug: 'synthetic-first', visibility: 'list', display_name: ' Synthetic First ', name: 'Ignored fallback' },
    { slug: 'synthetic-first', visibility: 'list', display_name: 'Duplicate must not replace first' },
    { slug: 'synthetic-fallback', visibility: 'list', name: 'Synthetic Fallback' },
    { slug: 'synthetic-no-label', visibility: 'list' },
    { slug: 'synthetic-long-label', visibility: 'list', display_name: 'x'.repeat(201) },
    { slug: 'synthetic-empty-label', visibility: 'list', display_name: '   ', name: 'Synthetic Secondary' },
    { slug: 'synthetic-control-label', visibility: 'list', display_name: 'Synthetic\nName' },
    { slug: 'synthetic-missing-visibility' },
    { slug: 'synthetic-wrong-case', visibility: 'LIST' },
    { slug: '', visibility: 'list' },
    { slug: ' synthetic-leading-space', visibility: 'list' },
    { slug: 'synthetic inner space', visibility: 'list' },
    { slug: 'synthetic\u0000control', visibility: 'list' },
    { slug: 'x'.repeat(201), visibility: 'list' },
    { slug: 42, visibility: 'list' }, null,
    { slug: 'synthetic-hidden', visibility: 'list', display_name: 'Synthetic Now Visible' },
  ] })]);
  assert.deepEqual(await listChatGptModels(auth, { fetchImpl: state.fetchImpl }), [
    { id: 'synthetic-first', name: 'Synthetic First' },
    { id: 'synthetic-fallback', name: 'Synthetic Fallback' },
    { id: 'synthetic-no-label', name: 'synthetic-no-label' },
    { id: 'synthetic-long-label', name: 'synthetic-long-label' },
    { id: 'synthetic-empty-label', name: 'Synthetic Secondary' },
    { id: 'synthetic-control-label', name: 'synthetic-control-label' },
    { id: 'synthetic-hidden', name: 'Synthetic Now Visible' },
  ]);
});

test('explicit model selection cannot use a hidden catalog entry and an empty list stays empty', async () => {
  const hidden = { slug: 'synthetic-hidden', visibility: 'hide' };
  const { state } = fixture([Response.json({ models: [hidden] }), Response.json({ models: [hidden] }), Response.json({ models: [] })]);
  await assert.rejects(resolveChatGptModel(auth, { modelId: hidden.slug, fetchImpl: state.fetchImpl }), error => error instanceof PublicError && error.status === 403);
  assert.deepEqual(await listChatGptModels(auth, { fetchImpl: state.fetchImpl }), []);
  await assert.rejects(resolveChatGptModel(auth, { fetchImpl: state.fetchImpl }), error => error instanceof PublicError && error.status === 403);
});

test('catalog timeout bounds token acquisition and returns a safe timeout without a service request', async t => {
  const timeout = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => { assert.equal(milliseconds, 15000); return timeout.signal; });
  const delayedAuth = { getAccessToken: async () => {
    timeout.abort(new DOMException('Synthetic timeout', 'TimeoutError'));
    return new Promise(() => {});
  } };
  let calls = 0;
  await assert.rejects(listChatGptModels(delayedAuth, { fetchImpl: async () => { calls++; throw new Error('Synthetic unexpected request'); } }), error => {
    assert.ok(error instanceof PublicError);
    assert.equal(error.status, 504);
    assert.match(error.message, /读取 ChatGPT 可用模型超时/);
    return true;
  });
  assert.equal(calls, 0);
});

test('large synthetic catalog metadata above the old budget yields only ordered picker fields', async () => {
  const payload = { models: [
    { slug: 'synthetic-first', display_name: 'Synthetic First', visibility: 'list', supported_in_api: false,
      model_messages: [{ role: 'developer', content: 'SYNTHETIC_IGNORED_TEMPLATE'.repeat(18000) }],
      base_instructions: 'SYNTHETIC_BASE_INSTRUCTION'.repeat(5000), tools: [{ synthetic: true }] },
    { slug: 'synthetic-second', display_name: 'Synthetic Second', visibility: 'list', capability_hints: { synthetic: true } },
  ], extra: 'SYNTHETIC_IGNORED_TOP_LEVEL' };
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) > 512 * 1024);
  const { state } = fixture([Response.json(payload)]);
  const models = await listChatGptModels(auth, { fetchImpl: state.fetchImpl });
  assert.deepEqual(models, [{ id: 'synthetic-first', name: 'Synthetic First' }, { id: 'synthetic-second', name: 'Synthetic Second' }]);
  assert.equal(JSON.stringify(models).includes('IGNORED'), false);
});

test('synthetic catalog accepts its exact independent byte budget', async () => {
  const empty = JSON.stringify({ models: [{ slug: 'synthetic-boundary', visibility: 'list' }], ignored: '' });
  const raw = JSON.stringify({ models: [{ slug: 'synthetic-boundary', visibility: 'list' }], ignored: 'x'.repeat(CHATGPT_CATALOG_LIMITS.bytes - Buffer.byteLength(empty)) });
  assert.equal(Buffer.byteLength(raw), CHATGPT_CATALOG_LIMITS.bytes);
  const { state } = fixture([new Response(raw)]);
  assert.deepEqual(await listChatGptModels(auth, { fetchImpl: state.fetchImpl }), [{ id: 'synthetic-boundary', name: 'synthetic-boundary' }]);
});

test('synthetic catalog over its byte budget cancels input and cannot count as quota exhaustion', async () => {
  let canceled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(CHATGPT_CATALOG_LIMITS.bytes + 1)); }, cancel() { canceled = true; } });
  const { state } = fixture([new Response(body)]);
  await assert.rejects(listChatGptModels(auth, { fetchImpl: state.fetchImpl }), error => {
    assert.equal(error.code, 'chatgpt_catalog_limit'); assert.equal(error.status, 502);
    assert.match(error.message, /模型目录.*8 MiB/); assert.equal(isChatGptQuotaError(error), false); return true;
  });
  assert.equal(canceled, true);
});

test('synthetic catalog declared excessive length is rejected without reading its body', async () => {
  let pulled = 0, canceled = false;
  const body = new ReadableStream({ pull() { pulled++; }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  const { state } = fixture([new Response(body, { headers: { 'content-length': String(CHATGPT_CATALOG_LIMITS.bytes + 1) } })]);
  await assert.rejects(listChatGptModels(auth, { fetchImpl: state.fetchImpl }), error => error.code === 'chatgpt_catalog_limit');
  assert.equal(pulled, 0); assert.equal(canceled, true);
});

test('synthetic catalog bounds raw entries and visible choices without silently truncating', async () => {
  for (const models of [
    Array.from({ length: CHATGPT_CATALOG_LIMITS.entries + 1 }, () => ({ visibility: 'hide' })),
    Array.from({ length: CHATGPT_CATALOG_LIMITS.choices + 1 }, (_, index) => ({ slug: `synthetic-choice-${index}`, visibility: 'list' })),
  ]) {
    const { state } = fixture([Response.json({ models })]);
    await assert.rejects(listChatGptModels(auth, { fetchImpl: state.fetchImpl }), error => error.code === 'chatgpt_catalog_limit' && !isChatGptQuotaError(error));
  }
});

test('synthetic catalog streaming cancellation is distinct from quota and closes the input', async () => {
  let canceled = false; const controller = new AbortController();
  const body = new ReadableStream({ pull() { queueMicrotask(() => controller.abort()); return new Promise(() => {}); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  const { state } = fixture([new Response(body)]);
  await assert.rejects(listChatGptModels(auth, { fetchImpl: state.fetchImpl, signal: controller.signal }), error => error.name === 'AbortError' && !isChatGptQuotaError(error));
  assert.equal(canceled, true);
});

test('Responses uses supported stateless fields, instructions, namespaced tools and original snapshots', async () => {
  const { state, requests, emitted } = fixture([sse([
    { type: 'response.reasoning_text.delta', delta: 'Synthetic hidden reasoning must never reach UI.' },
    delta('合成回答 [L1]。'), completed([textItem('合成回答 [L1]。')]),
  ], { split: true, crlf: true })]);
  await answerWithChatGpt(state);
  const request = requests[0];
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(request.redirect, 'error');
  assert.equal(request.signal, state.signal);
  assert.deepEqual(Object.keys(request.body).sort(), ['include', 'input', 'instructions', 'model', 'store', 'stream', 'tools']);
  assert.deepEqual(request.body.include, ['reasoning.encrypted_content']);
  assert.equal(request.body.store, false);
  assert.equal(request.body.stream, true);
  assert.match(request.body.instructions, /压缩导读/);
  assert.deepEqual(request.body.input.map(item => item.role), ['user', 'user', 'assistant', 'user']);
  assert.match(request.body.input[0].content, /Synthetic reviewed guide only/);
  assert.match(request.body.input[0].content, /Synthetic coverage only/);
  assert.equal(request.body.tools[0].type, 'namespace');
  assert.equal(request.body.tools[0].name, 'paperdesk');
  assert.deepEqual(request.body.tools[0].tools.map(item => item.name), ['search_library', 'read_section', 'search_sources', 'read_source_unit', 'resolve_source_locator']);
  assert.ok(request.body.tools[0].tools.every(tool => tool.type === 'function' && tool.strict === true && !('function' in tool)));
  assert.equal(state.turn.answer, '合成回答 [L1]。');
  assert.equal(JSON.stringify(emitted).includes('Synthetic hidden'), false);
});

test('tool continuation retains opaque reasoning, assistant phase, calls and all previous outputs only in memory', async () => {
  const reasoning = { type: 'reasoning', id: 'synthetic-reasoning', summary: [], encrypted_content: 'synthetic-opaque-ciphertext' };
  const firstOutput = [reasoning, textItem('Synthetic preamble', 'commentary'), callItem('one')];
  const secondOutput = [callItem('two', 'read_section', { guideId: 'synthetic', revision: 1, unitId: 'intro' })];
  const { state, requests, localCalls, saved, emitted } = fixture([
    sse([delta('Synthetic preamble'), completed(firstOutput)]),
    sse([completed(secondOutput)]),
    sse([completed([textItem('Synthetic final [L1].')])]),
  ]);
  await answerWithChatGpt(state);
  assert.equal(requests.length, 3);
  const secondInput = requests[1].body.input, thirdInput = requests[2].body.input;
  assert.deepEqual(secondInput.slice(4, 7), firstOutput);
  assert.equal(secondInput[7].type, 'function_call_output');
  assert.equal(secondInput[7].call_id, 'synthetic-call-one');
  assert.deepEqual(thirdInput.slice(0, secondInput.length), secondInput);
  assert.deepEqual(thirdInput.slice(-2, -1), secondOutput);
  assert.equal(thirdInput.at(-1).call_id, 'synthetic-call-two');
  assert.equal(localCalls.length, 2);
  assert.equal(state.turn.context.toolEvents.length, 2);
  assert.equal(saved.length, 5, 'three prompt budget checkpoints plus two retained tool results');
  assert.equal(emitted.filter(event => event.type === 'sources').length, 2);
  assert.equal(JSON.stringify(saved).includes('synthetic-opaque-ciphertext'), false);
  assert.equal(JSON.stringify(emitted).includes('synthetic-opaque-ciphertext'), false);
  assert.equal(state.turn.answer, 'Synthetic preamble\n\nSynthetic final [L1].');
});

test('only a completed response with final visible text succeeds', async t => {
  for (const [name, events, expected] of [
    ['no terminal', [delta('Synthetic partial')], /中断/],
    ['incomplete', [delta('Synthetic partial'), { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }], /未完整结束/],
    ['empty', [completed([])], /最终可见回答/],
    ['reasoning only', [completed([{ type: 'reasoning', summary: [], encrypted_content: 'synthetic' }])], /最终可见回答/],
    ['empty stream', [], /中断/],
  ]) await t.test(name, async () => {
    const { state } = fixture([sse(events)]);
    await assert.rejects(answerWithChatGpt(state), expected);
    if (events[0]?.type === 'response.output_text.delta') assert.equal(state.turn.answer, 'Synthetic partial');
  });
  const { state } = fixture([sse([completed([callItem('one')])]), sse([completed([])])]);
  await assert.rejects(answerWithChatGpt(state), /最终可见回答/);
});

test('malformed SSE cannot count as a completed answer', async () => {
  const { state } = fixture([new Response('data: {malformed synthetic JSON}\n\n')]);
  await assert.rejects(answerWithChatGpt(state), /响应流包含无效数据/);
});

test('visible refusal content is streamed once and completed-only text is not lost', async () => {
  const refusal = { ...textItem(''), content: [{ type: 'refusal', refusal: 'Synthetic refusal.' }] };
  const { state } = fixture([sse([{ type: 'response.refusal.delta', delta: 'Synthetic refusal.' }, completed([refusal])])]);
  await answerWithChatGpt(state);
  assert.equal(state.turn.answer, 'Synthetic refusal.');
  const onlyCompleted = fixture([sse([completed([textItem('Synthetic complete answer.')])])]);
  await answerWithChatGpt(onlyCompleted.state);
  assert.equal(onlyCompleted.state.turn.answer, 'Synthetic complete answer.');
});

test('plan errors after streamed text retain partial answer and expose only safe known diagnostics', async () => {
  const { state } = fixture([sse([delta('Synthetic partial'), { type: 'response.failed', response: { error: {
    code: 'subscription_sharing_usage_limit_exceeded', message: 'synthetic-secret-provider-message', param: 'synthetic-private-param',
  } } }])]);
  await assert.rejects(answerWithChatGpt(state), error => {
    assert.equal(error.status, 429);
    assert.equal(error.code, 'subscription_sharing_usage_limit_exceeded');
    assert.equal(isChatGptQuotaError(error), true);
    assert.match(error.message, /套餐或此应用/);
    assert.equal(JSON.stringify(error).includes('synthetic-secret'), false);
    assert.equal(error.message.includes('synthetic-secret'), false);
    return true;
  });
  assert.equal(state.turn.answer, 'Synthetic partial');
});

test('documented quota code is recognized in HTTP and both structured SSE error forms', async () => {
  const code = 'subscription_sharing_usage_limit_exceeded';
  for (const response of [
    Response.json({ error: { code, message: TOKEN } }, { status: 429 }),
    sse([{ type: 'error', code, message: TOKEN }]),
    sse([{ type: 'error', error: { code, message: TOKEN } }]),
  ]) {
    const { state, requests } = fixture([response]);
    await assert.rejects(answerWithChatGpt(state), error => {
      assert.equal(isChatGptQuotaError(error), true); assert.equal(error.code, code); assert.equal(error.status, 429);
      assert.equal(error.message.includes(TOKEN), false); assert.equal(error.message.includes('不会自动'), false); return true;
    });
    assert.equal(requests.length, 1);
  }
});

test('up to four object error/detail wrappers preserve the exact quota code in catalog, HTTP, and failed SSE responses', async () => {
  const code = 'subscription_sharing_usage_limit_exceeded';
  const wrap = (value, depth) => {
    for (let index = 0; index < depth; index++) value = { [index % 2 ? 'error' : 'detail']: value };
    return value;
  };
  for (let depth = 0; depth <= 4; depth++) for (const leaf of [{ code, message: TOKEN }, { error: code, message: TOKEN }]) {
    const payload = wrap(leaf, depth);
    const catalog = fixture([Response.json(payload, { status: 429 })]);
    await assert.rejects(listChatGptModels(auth, { fetchImpl: catalog.state.fetchImpl }), error => error.code === code && isChatGptQuotaError(error));
    for (const response of [Response.json(payload, { status: 429 }), sse([delta('Synthetic nested-error partial.'), { type: 'response.failed', response: payload }])]) {
      const { state, requests } = fixture([response]);
      await assert.rejects(answerWithChatGpt(state), error => {
        assert.equal(isChatGptQuotaError(error), true); assert.equal(error.code, code); assert.equal(error.status, 429);
        assert.equal(error.message.includes(TOKEN), false); assert.equal(JSON.stringify(error).includes(TOKEN), false); return true;
      });
      assert.equal(requests.length, 1);
    }
  }
});

test('detail text, arrays, excessive nesting and unknown structured errors cannot imply quota', async () => {
  const code = 'subscription_sharing_usage_limit_exceeded';
  let tooDeep = { code }; for (let index = 0; index < 5; index++) tooDeep = { detail: tooDeep };
  for (const payload of [
    { detail: code }, { detail: [{ code }] }, { error: [{ code }] }, [{ code }],
    { detail: { detail: code } }, { detail: { code: [code] } }, { error: { message: code } },
    { detail: { error: { code: 'rate_limit_exceeded', message: code } } },
    { detail: { error: { code: 'synthetic_unknown', message: code } } }, tooDeep,
  ]) for (const response of [Response.json(payload, { status: 429 }), sse([{ type: 'response.failed', response: payload }])]) {
    const { state, requests } = fixture([response]);
    await assert.rejects(answerWithChatGpt(state), error => error instanceof PublicError && !isChatGptQuotaError(error) && error.code === undefined);
    assert.equal(requests.length, 1);
  }
});

test('structured object error takes precedence over detail, and leaf string error takes precedence over code', async () => {
  const code = 'subscription_sharing_usage_limit_exceeded';
  for (const payload of [
    { error: { code: 'rate_limit_exceeded' }, detail: { code } },
    { error: { error: { code: 'synthetic_unknown' }, detail: { code } } },
    { error: 'synthetic_unknown', code },
  ]) {
    const { state } = fixture([Response.json(payload, { status: 429 })]);
    await assert.rejects(answerWithChatGpt(state), error => !isChatGptQuotaError(error) && error.code === undefined);
  }
});

test('rate limits, authorization, availability, unknown codes and message text never imply quota exhaustion', async () => {
  for (const [status, payload] of [
    [429, { error: { code: 'rate_limit_exceeded', message: 'quota exhausted subscription_sharing_usage_limit_exceeded' } }],
    [429, { error: { code: 'concurrency_limit_exceeded' } }], [429, { detail: 'usage limit exceeded' }],
    [401, { detail: TOKEN }], [403, { error: { code: 'subscription_sharing_user_not_eligible' } }],
    [403, { error: { code: 'chatpass_v2_scope_not_authorized' } }],
    [503, { error: { code: 'subscription_sharing_usage_unavailable' } }],
    [503, { error: { code: 'subscription_sharing_user_unavailable' } }],
    [500, { error: { code: 'synthetic_unknown_error' } }],
  ]) {
    const { state } = fixture([Response.json(payload, { status })]);
    await assert.rejects(answerWithChatGpt(state), error => { assert.equal(isChatGptQuotaError(error), false); return true; });
  }
  const streamed = fixture([sse([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_unavailable' } } }])]);
  await assert.rejects(answerWithChatGpt(streamed.state), error => error.status === 503 && !isChatGptQuotaError(error));
  assert.equal(isChatGptQuotaError({ code: 'subscription_sharing_usage_limit_exceeded' }), false);
  assert.equal(isChatGptQuotaError(new PublicError('subscription_sharing_usage_limit_exceeded', 429)), false);
});

test('oversized error bodies retain the small error budget and cannot trigger API fallback', async () => {
  let canceled = false;
  const raw = JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'x'.repeat(64 * 1024) } });
  const body = new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(raw)); }, cancel() { canceled = true; } });
  const { state } = fixture([new Response(body, { status: 429 })]);
  await assert.rejects(answerWithChatGpt(state), error => error.status === 429 && !isChatGptQuotaError(error));
  assert.equal(canceled, true);
});

test('HTTP admission detail, temporary usage errors and authentication errors have no raw provider text or retries', async t => {
  for (const [status, payload, expectedStatus] of [
    [401, { detail: 'synthetic-private-diagnostic' }, 401],
    [403, { error: { code: 'subscription_sharing_user_not_eligible', message: TOKEN } }, 403],
    [503, { error: { code: 'subscription_sharing_usage_unavailable', message: TOKEN } }, 503],
    [400, { error: { code: 'subscription_sharing_unsupported_capability', message: TOKEN } }, 400],
    [500, { error: { code: TOKEN, message: TOKEN } }, 502],
  ]) await t.test(String(status), async () => {
    const { state, requests } = fixture([Response.json(payload, { status, headers: { 'x-request-id': 'synthetic-request-id' } })]);
    await assert.rejects(answerWithChatGpt(state), error => {
      assert.equal(error.status, expectedStatus);
      assert.equal(error.upstreamStatus, status);
      assert.equal(error.requestId, 'synthetic-request-id');
      assert.ok(!error.message.includes(TOKEN) && !error.message.includes('synthetic-private'));
      assert.equal(error.code === TOKEN, false);
      return true;
    });
    assert.equal(requests.length, 1);
  });
});

test('refresh errors are sanitized, declared public auth errors survive, and no inference runs without credentials', async () => {
  const { state, requests } = fixture();
  state.auth = { getAccessToken: async () => { throw new Error(TOKEN); } };
  await assert.rejects(answerWithChatGpt(state), error => error instanceof PublicError && !error.message.includes(TOKEN));
  const declared = new PublicError('Synthetic reauthentication required', 401);
  state.auth = { getAccessToken: async () => { throw declared; } };
  await assert.rejects(answerWithChatGpt(state), error => error === declared);
  assert.equal(requests.length, 0);
});

test('cancel stops a pending stream, preserves partial text and prevents tool execution', async () => {
  let streamCancelled = false;
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(delta('Synthetic partial'))}\n\n`));
  }, cancel() { streamCancelled = true; } });
  const { state, controller, localCalls } = fixture([new Response(body)]);
  const emit = state.emit;
  state.emit = event => { emit(event); if (event.type === 'delta') queueMicrotask(() => controller.abort()); };
  await assert.rejects(answerWithChatGpt(state), error => error.name === 'AbortError');
  assert.equal(state.turn.answer, 'Synthetic partial');
  assert.equal(streamCancelled, true);
  assert.equal(localCalls.length, 0);
});

test('pre-aborted model lookup sends no request', async () => {
  const { state, controller, requests } = fixture();
  controller.abort();
  await assert.rejects(resolveChatGptModel(auth, { signal: state.signal, fetchImpl: state.fetchImpl }), error => error.name === 'AbortError');
  assert.equal(requests.length, 0);
});

test('cancelling stops waiting for a shared refresh without a later inference request', async () => {
  const { state, controller, requests } = fixture();
  let finishRefresh;
  state.auth = { getAccessToken: () => new Promise(resolve => { finishRefresh = resolve; }) };
  const running = answerWithChatGpt(state);
  controller.abort();
  await assert.rejects(running, error => error.name === 'AbortError');
  finishRefresh(TOKEN);
  await Promise.resolve();
  assert.equal(requests.length, 0);
});

test('four tool rounds are followed by a final request without tools', async () => {
  const { state, requests, localCalls } = fixture([
    ...Array.from({ length: LIMITS.rounds }, (_, i) => sse([completed([callItem(String(i))])])),
    sse([completed([textItem('Synthetic answer after budget.')])]),
  ]);
  await answerWithChatGpt(state);
  assert.equal(localCalls.length, LIMITS.rounds);
  assert.equal(requests.length, LIMITS.rounds + 1);
  assert.deepEqual(requests.at(-1).body.tools, []);
  assert.match(requests.at(-1).body.input.at(-1).content, /工具预算已结束/);
});

test('a model cannot call tools after budget removal or repeat a previous call id', async () => {
  const disabled = fixture([sse([completed([callItem('one')])])]);
  disabled.state.config.toolsEnabled = false;
  await assert.rejects(answerWithChatGpt(disabled.state), /工具预算/);
  assert.equal(disabled.localCalls.length, 0);
  const repeated = fixture([sse([completed([callItem('one')])]), sse([completed([callItem('one')])])]);
  await assert.rejects(answerWithChatGpt(repeated.state), /重复/);
  assert.equal(repeated.localCalls.length, 1);
});

test('at most six tools execute; excess calls receive a result and the next request can answer', async () => {
  const { state, requests, localCalls } = fixture([
    sse([completed(Array.from({ length: 5 }, (_, i) => callItem(String(i))))]),
    sse([completed([callItem('five'), callItem('six')])]),
    sse([completed([textItem('Synthetic final after six calls.')])]),
  ]);
  await answerWithChatGpt(state);
  assert.equal(localCalls.length, LIMITS.toolCalls);
  assert.equal(state.turn.context.toolEvents.length, LIMITS.toolCalls);
  assert.deepEqual(requests.at(-1).body.tools, []);
  const exceededOutput = requests.at(-1).body.input.find(item => item.type === 'function_call_output' && item.call_id === 'synthetic-call-six');
  assert.match(JSON.parse(exceededOutput.output).error, /预算已结束/);
});

test('unauthorized namespaces, tool types, names and duplicate ids never execute', async t => {
  for (const [name, output] of [
    ['namespace', [{ ...callItem('one'), namespace: 'arbitrary' }]],
    ['tool', [callItem('one', 'run_command')]],
    ['web search without opt-in', [callItem('one', 'web_search')]],
    ['duplicate', [callItem('one'), callItem('one')]],
    ['too many', Array.from({ length: LIMITS.toolCalls + 1 }, (_, i) => callItem(String(i)))],
    ['hosted tool', [{ type: 'web_search_call', status: 'completed' }]],
    ['programmatic', [{ ...callItem('one'), caller: { type: 'program', caller_id: 'synthetic-program' } }]],
    ['malformed args', [{ ...callItem('one'), arguments: '{broken synthetic json' }]],
  ]) await t.test(name, async () => {
    const { state, localCalls } = fixture([sse([completed(output)])]);
    await assert.rejects(answerWithChatGpt(state), error => error instanceof PublicError);
    assert.equal(localCalls.length, 0);
  });
});

test('web search reuses bounded Tavily source extraction and provides real W source ids', async () => {
  const { state, requests } = fixture([
    sse([completed([callItem('web', 'web_search', { query: 'Synthetic public search' })])]),
    Response.json({ results: [{ title: 'Synthetic public page', url: 'https://example.test/synthetic', content: 'Synthetic search excerpt.' }] }),
    sse([completed([textItem('Synthetic sourced answer [W1].')])]),
  ]);
  state.config.searchAvailable = true;
  state.request.webSearch = true;
  await answerWithChatGpt(state);
  assert.equal(requests[1].url, 'https://api.tavily.com/search');
  assert.equal(requests[1].headers.authorization, 'Bearer synthetic-tavily-key');
  assert.equal(requests[1].body.auto_parameters, false);
  assert.equal(state.turn.sources.at(-1).id, 'W1');
  assert.equal(state.turn.sources.at(-1).url, 'https://example.test/synthetic');
  assert.equal(state.turn.context.toolEvents[0].name, 'web_search');
  assert.equal(requests[2].body.input.at(-1).type, 'function_call_output');
  assert.match(requests[2].body.input.at(-1).output, /retrievedAt/);
});

test('temporary web failure allows a guide-only final answer without fabricated sources', async () => {
  const { state, requests } = fixture([
    sse([completed([callItem('web', 'web_search')])]),
    Response.json({ error: 'Synthetic search failure' }, { status: 502 }),
    sse([completed([textItem('Synthetic guide-only answer [L1]; web search unavailable.')])]),
  ]);
  state.config.searchAvailable = true;
  state.request.webSearch = true;
  await answerWithChatGpt(state);
  assert.equal(state.turn.sources.length, 1);
  assert.match(requests[2].body.input.at(-1).output, /未取得可引用的网页来源/);
});

test('context and transport budgets are enforced before unbounded processing', async () => {
  const { state, requests } = fixture();
  state.request.question = 'S'.repeat(LIMITS.messageChars);
  await assert.rejects(answerWithChatGpt(state), error => error.status === 413);
  assert.equal(requests.length, 0);
  const oversized = fixture([new Response('x'.repeat(LIMITS.upstreamBytes + 1))]);
  await assert.rejects(answerWithChatGpt(oversized.state), /传输预算/);
});
