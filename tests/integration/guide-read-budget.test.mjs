import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { ContentIndex } from '../../server/content/index.mjs';
import { normalizeConfig } from '../../server/config.mjs';
import { prepareAssistantContext } from '../../server/ai/research.mjs';
import { answer } from '../../server/ai/providers/api.mjs';
import { answerWithChatGpt } from '../../server/ai/providers/chatgpt.mjs';
import { AiStore, validateBackup } from '../../server/storage/ai-store.mjs';
import { normalizeReadingText, readingTextFromMarkdown } from '../../shared/reading-text.mjs';

// Reviewed public guide bytes and synthetic requests/transports only. Original
// material storage, indexes and SQLite conversations are isolated from real data.
const temporaryParent = resolve('.cache/test-workspaces');
const config = normalizeConfig({ baseURL: 'https://synthetic-guide.invalid/v1', apiKey: 'SYNTHETIC_ONLY', modelId: 'synthetic-guide-model',
  toolsEnabled: true, contextTokenLimit: 32768, maxOutputTokens: 3000 });
const auth = { async getAccessToken() { return 'SYNTHETIC_AUTH_ONLY'; } };
async function fixture(t) {
  mkdirSync(temporaryParent, { recursive: true });
  const directory = mkdtempSync(join(temporaryParent, 'synthetic-guide-read-budget-'));
  const content = await ContentIndex.load({ rootDir: resolve('.'), readingDirectory: join(directory, 'synthetic-empty-reading'), indexFile: join(directory, 'synthetic-index.sqlite') });
  t.after(() => {
    content.close(); const child = relative(temporaryParent, directory);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rmSync(directory, { recursive: true, force: true });
  });
  const guide = content.get('llm-survey', content.catalog.currentRevisions['llm-survey']);
  const unit = guide.units.find(unit => unit.id === 'architecture');
  const input = extra => ({ requestId: randomUUID(), guideId: guide.metadata.id, revision: guide.metadata.revision, bodySha256: guide.metadata.bodySha256,
    unitId: unit.id, question: 'SYNTHETIC：比较这一节的资源负担，并保留导读条件。', webSearch: false, ...extra });
  return { content, guide, unit, input };
}
const sse = values => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
function toolResponse(provider, callId, name, args) {
  const call = { type: 'function_call', id: `item-${callId}`, call_id: callId, namespace: 'paperdesk', name, arguments: JSON.stringify(args), status: 'completed' };
  return provider === 'api' ? sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }])
    : sse([{ type: 'response.completed', response: { id: `response-${callId}`, status: 'completed', output: [call] } }]);
}
function finalResponse(provider) {
  return provider === 'api' ? sse([{ choices: [{ delta: { content: 'SYNTHETIC bounded guide answer.' }, finish_reason: 'stop' }] }])
    : sse([{ type: 'response.completed', response: { id: 'synthetic-final', status: 'completed', output: [{ type: 'message', id: 'synthetic-final-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'SYNTHETIC bounded guide answer.', annotations: [] }] }] } }]);
}
function outputFor(provider, body, callId) {
  return JSON.parse(provider === 'api' ? body.messages.find(message => message.role === 'tool' && message.tool_call_id === callId).content
    : body.input.find(item => item.type === 'function_call_output' && item.call_id === callId).output);
}
function checkWireBudget(provider, body, turn) {
  const payload = provider === 'api' ? { messages: body.messages, tools: body.tools ?? [] } : { instructions: body.instructions, input: body.input, tools: body.tools ?? [] };
  const bytes = Buffer.byteLength(JSON.stringify(payload)) + 512;
  assert.ok(bytes + config.maxOutputTokens <= config.contextTokenLimit, 'Every actual adapter payload must fit the unchanged configured budget.');
  assert.equal(turn.context.budget.inputTokens, bytes);
  return bytes + config.maxOutputTokens;
}

for (const provider of ['api', 'chatgpt']) test(`${provider}: a long fixed architecture selection can start and read only its missing guide suffix`, async t => {
  const { content, guide, unit, input } = await fixture(t);
  const selection = unit.renderedText.slice(0, 1264).trim();
  assert.ok(selection.length >= 1200 && Buffer.byteLength(selection) > 3000);
  const request = input({ selection }), prepared = prepareAssistantContext(content, request, [], config);
  const initial = structuredClone(prepared.sources.find(source => source.unitId === unit.id));
  assert.deepEqual(initial.readRanges, [{ start: 0, end: initial.text.length, total: unit.text.length }]);
  const turn = { id: randomUUID(), question: request.question, status: 'running', answer: '', sources: prepared.sources, context: prepared.context };
  const budgets = []; let calls = 0;
  const transport = async (_url, options) => {
    const body = JSON.parse(options.body); budgets.push(checkWireBudget(provider, body, turn)); calls++;
    if (calls === 1) return toolResponse(provider, 'synthetic-read', 'read_section', { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, maxChars: 600 });
    assert.equal(calls, 2);
    const output = outputFor(provider, body, 'synthetic-read');
    assert.equal(output.error, undefined); assert.ok(output.source.text.length > 0);
    assert.equal(output.source.id, initial.id); assert.equal(output.range.start, initial.text.length);
    assert.equal(output.source.text, unit.text.slice(output.range.start, output.range.end));
    assert.deepEqual(output.source.readRanges, [output.range]);
    assert.equal(output.coverage, undefined); assert.equal(output.coverageRef.location, 'initial.metadata.coverage');
    assert.equal(output.coverageRef.bodySha256, guide.metadata.bodySha256);
    assert.equal(output.excerptOnly, output.range.end < unit.text.length);
    const retained = turn.sources.find(source => source.id === initial.id);
    assert.deepEqual(retained.readRanges, [{ start: 0, end: output.range.end, total: unit.text.length }]);
    assert.equal(retained.text, unit.text.slice(0, output.range.end));
    return finalResponse(provider);
  };
  const run = provider === 'api' ? answer : answerWithChatGpt;
  await run({ config, content, request, prepared, turn, auth, signal: new AbortController().signal,
    emit: event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; }, persist: () => {}, fetchImpl: transport });
  assert.equal(calls, 2); assert.match(turn.answer, /SYNTHETIC bounded guide answer/);
  t.diagnostic(`${selection.length} selected UTF16 units / ${Buffer.byteLength(selection)} UTF8 bytes; actual input+output reservations ${budgets.join(', ')} / 32768.`);
});

for (const provider of ['api', 'chatgpt']) test(`${provider}: search then disjoint guide reads retain one source, exact wire ranges and backup history`, async t => {
  const { content, guide, unit, input } = await fixture(t);
  // A tight first excerpt leaves an unread tail for the two disjoint reads below.
  const request = input(), prepared = prepareAssistantContext(content, request, [], { ...config, initialGuideBytes: 5000 });
  const store = new AiStore(':memory:'), restored = new AiStore(':memory:');
  t.after(() => { store.close(); restored.close(); });
  const turn = store.begin(request, prepared.context, prepared.sources).turn;
  const initial = structuredClone(turn.sources.find(source => source.unitId === unit.id));
  const firstOffset = initial.text.length + 300, secondOffset = firstOffset + 500;
  assert.ok(secondOffset + 180 < unit.text.length);
  const wire = [], budgets = []; let calls = 0;
  const transport = async (_url, options) => {
    const body = JSON.parse(options.body); budgets.push(checkWireBudget(provider, body, turn)); calls++;
    if (calls === 1) return toolResponse(provider, 'search', 'search_library', { query: 'MQA GQA' });
    if (calls === 2) {
      const output = outputFor(provider, body, 'search');
      const hit = output.results.find(item => item.source.guideId === guide.metadata.id && item.source.unitId === unit.id);
      assert.ok(hit); assert.equal(hit.source.id, initial.id);
      assert.equal(hit.source.text, unit.text.slice(0, hit.range.end));
      return toolResponse(provider, 'read-a', 'read_section', { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, offset: firstOffset, maxChars: 160 });
    }
    if (calls === 3) {
      wire.push(structuredClone(outputFor(provider, body, 'read-a')));
      return toolResponse(provider, 'read-b', 'read_section', { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, offset: secondOffset, maxChars: 180 });
    }
    assert.equal(calls, 4); wire.push(structuredClone(outputFor(provider, body, 'read-b'))); return finalResponse(provider);
  };
  await (provider === 'api' ? answer : answerWithChatGpt)({ config, content, request, prepared, turn, auth, signal: new AbortController().signal,
    emit: event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; }, persist: () => store.save(turn), fetchImpl: transport });
  assert.equal(calls, 4);
  t.diagnostic(`Actual input+output reservations ${budgets.join(', ')} / 32768.`);
  const retained = turn.sources.find(source => source.id === initial.id);
  assert.equal(wire[0].range.start, firstOffset); assert.equal(wire[1].range.start, secondOffset);
  assert.ok(wire[0].range.end > firstOffset && wire[0].range.end <= firstOffset + 160);
  assert.ok(wire[1].range.end > secondOffset && wire[1].range.end <= secondOffset + 180);
  assert.deepEqual(retained.readRanges, [...initial.readRanges, ...wire.map(output => output.range)]);
  for (const output of wire) {
    assert.equal(output.source.id, initial.id); assert.deepEqual(output.source.readRanges, [output.range]);
    assert.equal(output.source.text, unit.text.slice(output.range.start, output.range.end));
    assert.equal(output.excerptOnly, true); assert.equal(output.nextOffset, output.range.end);
    assert.ok(retained.text.includes(output.source.text));
  }
  assert.ok(!retained.text.includes(unit.text.slice(initial.text.length, firstOffset)), 'The unread hole cannot become source evidence.');
  const firstWire = JSON.parse(turn.context.toolEvents.find(event => event.name === 'read_section').resultJson);
  assert.deepEqual(firstWire, wire[0], 'A later read must not widen an earlier tool snapshot.');
  turn.status = 'complete'; store.save(turn); const backup = store.export(); validateBackup(backup); restored.import(backup);
  assert.deepEqual(restored.turn(turn.id), turn);
});

for (const provider of ['api', 'chatgpt']) test(`${provider}: a late MoE selection is included in the exact persisted source range and citation projection`, async t => {
  const { content, guide, unit, input } = await fixture(t);
  const at = unit.renderedText.indexOf('混合专家 MoE'); assert.ok(at > 500);
  const selection = unit.renderedText.slice(at, at + 239).trim(), request = input({ selection });
  const prepared = prepareAssistantContext(content, request, [], config);
  const source = prepared.sources.find(source => source.unitId === unit.id);
  assert.equal(source.readRanges.length, 1); const range = source.readRanges[0];
  assert.ok(range.start > 0, 'Late selected evidence must displace an unrelated prefix.');
  assert.equal(source.text, unit.text.slice(range.start, range.end));
  assert.ok(readingTextFromMarkdown(source.text).includes(normalizeReadingText(selection)));
  const metadata = JSON.parse(prepared.context.metadataJson);
  assert.deepEqual(metadata.coverage, guide.metadata.coverage); assert.deepEqual(metadata.source, guide.metadata.source);
  assert.equal(metadata.metadataProjection.citationScope, 'only-sent-guide-ranges');
  for (const citation of metadata.citations) assert.ok(prepared.sources.some(source => source.text.includes(citation.url)));
  for (const citation of guide.metadata.citations.filter(citation => prepared.sources.some(source => source.text.includes(citation.url)))) assert.ok(metadata.citations.some(sent => sent.id === citation.id));
  const turn = { id: randomUUID(), question: request.question, answer: '', status: 'running', context: prepared.context, sources: prepared.sources };
  let calls = 0;
  await (provider === 'api' ? answer : answerWithChatGpt)({ config, content, request, prepared, turn, auth, signal: new AbortController().signal,
    emit: event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; }, persist: () => {},
    fetchImpl: async (_url, options) => { calls++; checkWireBudget(provider, JSON.parse(options.body), turn); return finalResponse(provider); } });
  assert.equal(calls, 1); assert.match(turn.answer, /SYNTHETIC bounded guide answer/);
});

for (const provider of ['api', 'chatgpt']) test(`${provider}: actual bounded history yields to required selected evidence without bypassing final preflight`, async t => {
  const { content, unit, input } = await fixture(t);
  const previous = Array.from({ length: 6 }, (_, at) => ({ id: randomUUID(), status: 'complete', question: `SYNTHETIC earlier question ${at}`, answer: '合成历史。'.repeat(80) }));
  const request = input({ selection: unit.renderedText.slice(0, 1264).trim() });
  const prepared = prepareAssistantContext(content, request, previous, config);
  assert.ok(prepared.history.length > 0 && prepared.history.length < previous.length);
  assert.deepEqual(prepared.context.historyTurnIds, prepared.history.map(turn => turn.id));
  const source = prepared.sources.find(source => source.unitId === unit.id);
  assert.ok(readingTextFromMarkdown(source.text).includes(normalizeReadingText(request.selection)));
  const turn = { id: randomUUID(), question: request.question, answer: '', status: 'running', context: prepared.context, sources: prepared.sources };
  let calls = 0;
  await (provider === 'api' ? answer : answerWithChatGpt)({ config, content, request, prepared, turn, auth, signal: new AbortController().signal,
    emit: event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; }, persist: () => {},
    fetchImpl: async (_url, options) => { calls++; checkWireBudget(provider, JSON.parse(options.body), turn); return finalResponse(provider); } });
  assert.equal(calls, 1);
});

test('guide reads merge overlaps without holes, reuse explicit prior coverage, and do not mutate evidence on budget failure', async t => {
  const { content, guide, unit } = await fixture(t), sources = [], context = { indexGeneration: content.generation, toolEvents: [] };
  const read = (offset, maxChars = 200, ctx = context) => content.runLocal('read_section', { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, offset, maxChars }, sources, ctx);
  const first = read(0); assert.deepEqual(first.coverage, guide.metadata.coverage);
  context.toolEvents.push({ name: 'read_section', argumentsJson: '{}', resultJson: JSON.stringify(first), elapsedMs: 1 });
  const disjoint = read(1200, 100); assert.equal(disjoint.coverage, undefined); assert.equal(disjoint.coverageRef.toolEventIndex, 0);
  const overlap = read(150); assert.equal(overlap.requestedOffset, 150); assert.equal(overlap.range.start, 200);
  assert.deepEqual(sources[0].readRanges, [{ start: 0, end: 400, total: unit.text.length }, { start: 1200, end: 1300, total: unit.text.length }]);
  const before = structuredClone(sources);
  const error = read(500, 200, { ...context, budget: { limit: 1000, inputTokens: 900, outputTokens: 100 } });
  assert.match(error.error, /预算/); assert.deepEqual(sources, before);
  assert.throws(() => read(-1), /参数/);
  assert.ok(read(unit.text.length + 1).error); assert.deepEqual(sources, before);
});
