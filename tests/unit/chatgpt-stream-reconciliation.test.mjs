// All credentials, messages, sources and transport responses below are synthetic.
// No network service, saved configuration or reader records are accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithChatGpt, isChatGptQuotaError } from '../../server/ai/providers/chatgpt.mjs';
import { LIMITS } from '../../server/ai/instructions.mjs';

const responseId = 'synthetic-response';
const messageId = 'synthetic-message';
const textPart = text => ({ type: 'output_text', text, annotations: [] });
const message = (text, { id = messageId, phase = 'final_answer', content = [textPart(text)] } = {}) => ({
  type: 'message', id, role: 'assistant', status: 'completed', phase, content,
});
const delta = (text, { output = 0, content = 0, id = messageId, type = 'response.output_text.delta' } = {}) => ({
  type, item_id: id, output_index: output, content_index: content, delta: text,
});
const textDone = (text, { output = 0, content = 0, id = messageId } = {}) => ({
  type: 'response.output_text.done', item_id: id, output_index: output, content_index: content, text,
});
const done = (output, { id = responseId, status = 'completed' } = {}) => ({
  type: 'response.completed', response: { id, status, output },
});
const created = { type: 'response.created', response: { id: responseId, status: 'in_progress', output: [] } };

function sse(events) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  // Small chunks exercise partial UTF-8 sequences and event boundaries too.
  let position = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (position === bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(position, position + 17)); position = Math.min(bytes.length, position + 17);
  } }), { headers: { 'content-type': 'text/event-stream' } });
}

function fixture(rounds) {
  const requests = [], events = [], saved = [], toolCalls = [];
  const context = { scope: 'full-guide', metadataJson: '{"title":"Synthetic guide"}', model: 'synthetic-model', toolEvents: [] };
  const sources = [{ id: 'L1', kind: 'guide', title: 'Synthetic source', text: 'Synthetic reviewed material.',
    guideId: 'synthetic', revision: 1, unitId: 'intro', url: '/read/synthetic/1#intro', version: null }];
  const state = {
    config: { modelId: 'synthetic-model', toolsEnabled: true, searchAvailable: false, search: { apiKey: '' } },
    prepared: { context, sources, history: [] },
    request: { question: 'Synthetic reconciliation question', unitId: 'intro', webSearch: false },
    turn: { answer: '', context, sources }, signal: new AbortController().signal,
    auth: { getAccessToken: async () => 'SYNTHETIC_NOT_A_REAL_TOKEN' },
    content: { runLocal(name, args) { toolCalls.push({ name, args }); return { text: 'Synthetic tool evidence.' }; } },
    emit(event) {
      events.push(structuredClone(event));
      if (event.type === 'delta') state.turn.answer += event.text;
      else if (event.type === 'replace') state.turn.answer = event.text;
    },
    persist() { saved.push(structuredClone(state.turn)); },
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const round = rounds[requests.length - 1];
      assert.ok(round, 'Unexpected inference replay; real network access is forbidden.');
      return sse(round);
    },
  };
  return { state, requests, events, saved, toolCalls, run: () => answerWithChatGpt(state) };
}

test('synthetic interleaved messages and content parts reconcile in output order', async () => {
  const first = 'synthetic-commentary', second = 'synthetic-final';
  const f = fixture([[created,
    delta('甲', { id: first }),
    delta('终', { output: 1, id: second }),
    delta('乙', { content: 1, id: first }),
    delta('章', { id: first }),
    delta('答', { output: 1, id: second }),
    delta('节', { content: 1, id: first }),
    done([message('', { id: first, phase: 'commentary', content: [textPart('甲章'), textPart('乙节')] }),
      message('终答', { id: second })]),
  ]]);
  await f.run();
  assert.equal(f.state.turn.answer, '甲章乙节终答');
  assert.ok(f.events.some(event => event.type === 'replace'));
  assert.equal(f.requests.length, 1);
});

test('synthetic text.done replaces non-prefix provisional text without another inference', async () => {
  const f = fixture([[created, delta('Synthetic provisional wording.'), textDone('Synthetic corrected answer.'),
    done([message('Synthetic corrected answer.')])]]);
  await f.run();
  assert.equal(f.state.turn.answer, 'Synthetic corrected answer.');
  assert.deepEqual(f.events.filter(event => event.type === 'replace'), [{ type: 'replace', text: 'Synthetic corrected answer.' }]);
  assert.equal(f.requests.length, 1);
});

test('synthetic validated completed snapshot alone can correct provisional text', async () => {
  const f = fixture([[created, delta('Synthetic provisional.'), done([message('Synthetic authoritative final.')])]]);
  await f.run();
  assert.equal(f.state.turn.answer, 'Synthetic authoritative final.');
  assert.equal(f.events.filter(event => event.type === 'replace').length, 1);
  assert.equal(f.requests.length, 1);
});

test('synthetic refusal.done corrects its own content without duplicate text', async () => {
  const refusal = 'Synthetic finalized refusal.';
  const f = fixture([[created, delta('Synthetic initial refusal.', { type: 'response.refusal.delta' }),
    { type: 'response.refusal.done', item_id: messageId, output_index: 0, content_index: 0, refusal },
    done([message('', { content: [{ type: 'refusal', refusal }] })])]]);
  await f.run();
  assert.equal(f.state.turn.answer, refusal);
  assert.deepEqual(f.events.filter(event => event.type === 'replace'), [{ type: 'replace', text: refusal }]);
  assert.equal(f.requests.length, 1);
});

test('synthetic output_item.done supplies text missing from deltas exactly once', async () => {
  const item = message('Synthetic completed-only message.');
  const f = fixture([[created, { type: 'response.output_item.done', output_index: 0, item }, done([item])]]);
  await f.run();
  assert.equal(f.state.turn.answer, item.content[0].text);
  assert.deepEqual(f.events.filter(event => ['delta', 'replace'].includes(event.type)), [{ type: 'delta', text: item.content[0].text }]);
  assert.equal(f.requests.length, 1);
});

test('synthetic second tool round replacement keeps prior text and opaque continuation items', async () => {
  const reasoning = { type: 'reasoning', id: 'synthetic-reasoning', summary: [], encrypted_content: 'SYNTHETIC_OPAQUE_REASONING' };
  const commentary = message('Synthetic first-round preamble.', { id: 'synthetic-preamble', phase: 'commentary' });
  const call = { type: 'function_call', id: 'synthetic-tool-item', call_id: 'synthetic-tool-call',
    namespace: 'paperdesk', name: 'search_library', arguments: '{"query":"synthetic"}', status: 'completed' };
  const firstOutput = [reasoning, commentary, call];
  const f = fixture([[created, done(firstOutput)], [created, delta('Synthetic second-round draft.'),
    textDone('Synthetic corrected second-round answer.'), done([message('Synthetic corrected second-round answer.')])]]);
  await f.run();
  const expected = 'Synthetic first-round preamble.\n\nSynthetic corrected second-round answer.';
  assert.equal(f.state.turn.answer, expected);
  assert.deepEqual(f.events.filter(event => event.type === 'replace'), [{ type: 'replace', text: expected }]);
  assert.equal(f.requests.length, 2);
  assert.equal(f.toolCalls.length, 1);
  for (const item of firstOutput) assert.deepEqual(f.requests[1].body.input.find(value => value.id === item.id), item);
  assert.ok(f.requests[1].body.input.some(item => item.type === 'function_call_output' && item.call_id === call.call_id));
  assert.equal(JSON.stringify({ events: f.events, saved: f.saved, turn: f.state.turn }).includes(reasoning.encrypted_content), false);
});

const partial = 'Synthetic recoverable partial.';
const failures = [
  ['failed', [{ type: 'response.failed', response: { id: responseId, status: 'failed', error: { code: 'server_error' } } }]],
  ['error', [{ type: 'error', error: { code: 'server_error' } }]],
  ['EOF', []],
  ['incomplete', [{ type: 'response.incomplete', response: { id: responseId, status: 'incomplete', output: [] } }]],
  ['empty final', [done([])]],
  ['whitespace final', [done([message('   ')])]],
  ['invalid completed status', [done([message('Synthetic replacement.')], { status: 'incomplete' })]],
];
for (const [name, terminal] of failures) test(`synthetic ${name} rejects and preserves partial without replay`, async () => {
  const f = fixture([[created, delta(partial), ...terminal]]);
  await assert.rejects(f.run(), error => { assert.equal(isChatGptQuotaError(error), false); return true; });
  assert.equal(f.state.turn.answer, partial);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.requests.length, 1);
  assert.equal(f.toolCalls.length, 0);
});

const invalidSnapshots = [
  ['changed response identity', done([message('Synthetic replacement.')], { id: 'synthetic-wrong-response' })],
  ['changed final item identity', done([message('Synthetic replacement.', { id: 'synthetic-wrong-message' })])],
  ['changed text.done identity', textDone('Synthetic replacement.', { id: 'synthetic-wrong-message' })],
  ['changed item.done identity', { type: 'response.output_item.done', output_index: 0, item: message('Synthetic replacement.', { id: 'synthetic-wrong-message' }) }],
  ['unfinished item snapshot', { type: 'response.output_item.done', output_index: 0, item: { ...message('Synthetic replacement.'), status: 'incomplete' } }],
  ['unsupported final content', done([message('', { content: [{ type: 'synthetic_unsupported', text: 'Synthetic replacement.' }] })])],
  ['overlong final', done([message('x'.repeat(LIMITS.answerChars + 1))])],
  ['overlong text.done', textDone('x'.repeat(LIMITS.answerChars + 1))],
  ['overlong item.done', { type: 'response.output_item.done', output_index: 0, item: message('x'.repeat(LIMITS.answerChars + 1)) }],
];
for (const [name, snapshot] of invalidSnapshots) test(`synthetic ${name} cannot replace valid partial text`, async () => {
  const f = fixture([[created, delta(partial), snapshot]]);
  await assert.rejects(f.run());
  assert.equal(f.state.turn.answer, partial);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.requests.length, 1);
});

test('synthetic final output order can differ from wire indices while item identities stay stable', async () => {
  const firstId = 'synthetic-wire-a', secondId = 'synthetic-wire-b';
  const f = fixture([[created, delta('A', { output: 0, id: firstId }), delta('B', { output: 1, id: secondId }),
    done([message('B', { id: secondId }), message('A', { id: firstId })])]]);
  await f.run();
  assert.equal(f.state.turn.answer, 'BA');
  assert.deepEqual(f.events.filter(event => event.type === 'replace'), [{ type: 'replace', text: 'BA' }]);
  assert.equal(f.requests.length, 1);
});

test('synthetic completed commentary may be omitted from the final response snapshot', async () => {
  const commentary = message('Synthetic completed commentary.', { id: 'synthetic-commentary-done', phase: 'commentary' });
  const final = message('Synthetic final answer.', { id: 'synthetic-final-only' });
  const f = fixture([[created, delta(commentary.content[0].text, { output: 0, id: commentary.id }),
    { type: 'response.output_item.done', output_index: 0, item: commentary },
    delta(final.content[0].text, { output: 1, id: final.id }), done([final])]]);
  await f.run();
  assert.equal(f.state.turn.answer, final.content[0].text);
  assert.deepEqual(f.events.filter(event => event.type === 'replace'), [{ type: 'replace', text: final.content[0].text }]);
  assert.equal(f.requests.length, 1);
});

test('synthetic one item identity cannot occupy two wire output indices', async () => {
  const f = fixture([[created, delta(partial, { output: 0 }), delta('Synthetic invalid second item.', { output: 1 }),
    done([message('Synthetic replacement.')])]]);
  await assert.rejects(f.run());
  assert.equal(f.state.turn.answer, partial);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.requests.length, 1);
});

test('synthetic duplicate final item identities cannot replace a valid partial', async () => {
  const f = fixture([[created, delta(partial), done([message('Synthetic duplicate one.'), message('Synthetic duplicate two.')])]]);
  await assert.rejects(f.run());
  assert.equal(f.state.turn.answer, partial);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.requests.length, 1);
});

test('synthetic final snapshot cannot drop an unfinished streamed item identity', async () => {
  const unfinishedId = 'synthetic-unfinished', retainedId = 'synthetic-retained';
  const retainedText = 'Synthetic second partial.';
  const f = fixture([[created, delta(partial, { output: 0, id: unfinishedId }),
    delta(retainedText, { output: 1, id: retainedId }), done([message(retainedText, { id: retainedId })])]]);
  await assert.rejects(f.run());
  assert.equal(f.state.turn.answer, partial + retainedText);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.requests.length, 1);
});

for (const replacement of [
  { type: 'reasoning', id: messageId, summary: [], encrypted_content: 'SYNTHETIC_OPAQUE_REPLACEMENT' },
  { type: 'function_call', id: messageId, call_id: 'synthetic-retyped-call', namespace: 'paperdesk',
    name: 'search_library', arguments: '{"query":"synthetic"}', status: 'completed' },
]) test(`synthetic final cannot retype a streamed message identity as ${replacement.type}`, async () => {
  // A separate valid answer keeps this check focused on the identity/type
  // transition, rather than rejection of an empty final response.
  const f = fixture([[created, delta(partial), done([replacement,
    message('Synthetic unrelated final answer.', { id: 'synthetic-other-final' })])]]);
  await assert.rejects(f.run());
  assert.equal(f.state.turn.answer, partial);
  assert.equal(f.events.some(event => event.type === 'replace'), false);
  assert.equal(f.toolCalls.length, 0);
  assert.equal(f.requests.length, 1);
});
