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

// Public, reviewed guide bytes plus synthetic questions and transports only.
// The reading directory and index are isolated: never open private originals,
// credentials, existing conversations or an authorized model connection.
const temporaryParent = resolve('.cache/test-workspaces');
const config = normalizeConfig({ baseURL: 'https://synthetic-api.invalid/v1', apiKey: 'SYNTHETIC_ONLY', modelId: 'synthetic-budget-model',
  toolsEnabled: true, contextTokenLimit: 32768, maxOutputTokens: 3000, search: { apiKey: 'SYNTHETIC_SEARCH_ONLY' } });
const auth = { async getAccessToken() { return 'SYNTHETIC_AUTH_ONLY'; } };
const sse = values => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

async function fixture(t) {
  mkdirSync(temporaryParent, { recursive: true });
  const root = mkdtempSync(join(temporaryParent, 'synthetic-initial-guide-budget-'));
  let content;
  t.after(() => {
    content?.close();
    const child = relative(temporaryParent, root);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rmSync(root, { recursive: true, force: true });
  });
  content = await ContentIndex.load({ rootDir: resolve('.'), readingDirectory: join(root, 'synthetic-empty-reading'), indexFile: join(root, 'synthetic-index.sqlite') });
  return content;
}

const input = (guide, unit, webSearch, extra = {}) => ({ requestId: randomUUID(), guideId: guide.metadata.id, revision: guide.metadata.revision,
  bodySha256: guide.metadata.bodySha256, unitId: unit.id, question: 'SYNTHETIC 请解释当前章节中的一个术语，并说明依据。', webSearch, ...extra });

function assertGuideContext(prepared, guide, active) {
  const metadata = JSON.parse(prepared.context.metadataJson);
  assert.deepEqual(metadata.coverage, guide.metadata.coverage, 'Original coverage conditions must remain whole.');
  assert.deepEqual(metadata.source, guide.metadata.source, 'The versioned original identity must remain whole.');
  assert.equal(metadata.paperId, guide.metadata.paperId); assert.equal(metadata.paperTitle, guide.metadata.paperTitle);
  assert.ok(prepared.sources.find(source => source.unitId === active.id)?.text.length > 0, 'The requested chapter cannot be displaced by navigation metadata.');
  assert.ok(metadata.guideRanges.length > 0);
  assert.deepEqual(metadata.guideRanges.map(range => range.unitId), prepared.sources.map(source => source.unitId));
  for (const range of metadata.guideRanges) {
    const unit = guide.units.find(item => item.id === range.unitId), source = prepared.sources.find(item => item.unitId === range.unitId);
    assert.equal(range.start, 0); assert.equal(range.total, unit.text.length);
    assert.equal(source.text, unit.text.slice(0, range.end));
    assert.equal(range.excerptOnly, range.end < range.total);
  }
  assert.equal(metadata.metadataProjection.scope, 'bibliography-and-selected-guide-units');
  const selected = new Set(metadata.metadataProjection.unitIds);
  assert.ok(selected.has(active.id));
  assert.ok((metadata.orientation?.readingTargets ?? []).every(target => selected.has(target.unitId)));
  assert.equal(metadata.metadataProjection.omittedReadingTargets + (metadata.orientation?.readingTargets.length ?? 0), guide.metadata.orientation?.readingTargets.length ?? 0);
  assert.equal(metadata.metadataProjection.omittedCitations + metadata.citations.length, guide.metadata.citations.length);
  for (const citation of metadata.citations) assert.deepEqual(citation, guide.metadata.citations.find(item => item.url === citation.url));
}

function finalResponse(provider) {
  if (provider === 'api') return sse([{ choices: [{ delta: { content: 'SYNTHETIC bounded first reply.' }, finish_reason: 'stop' }] }]);
  return sse([{ type: 'response.completed', response: { id: 'synthetic-first-response', status: 'completed', output: [
    { type: 'message', id: 'synthetic-first-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'SYNTHETIC bounded first reply.', annotations: [] }] },
  ] } }]);
}

async function firstSend(content, request, prepared, provider, options = {}) {
  const activeConfig = options.config ?? config;
  const turn = { id: randomUUID(), status: 'running', question: request.question, answer: '', sources: prepared.sources, context: prepared.context };
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    assert.equal(String(url), provider === 'api' ? 'https://synthetic-api.invalid/v1/chat/completions' : 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    // Independently inspect the actual serialized adapter payload, not its
    // preparatory estimate or the metadataProjection bookkeeping.
    const payload = provider === 'api' ? { messages: body.messages, tools: body.tools ?? [] }
      : { instructions: body.instructions, input: body.input, tools: body.tools ?? [] };
    const measured = Buffer.byteLength(JSON.stringify(payload), 'utf8') + 512;
    assert.ok(measured + activeConfig.maxOutputTokens <= activeConfig.contextTokenLimit);
    assert.deepEqual(turn.context.budget, { method: 'utf8-bytes-upper-bound', inputTokens: measured, outputTokens: activeConfig.maxOutputTokens, limit: activeConfig.contextTokenLimit });
    const tools = body.tools ?? [];
    if (!activeConfig.toolsEnabled) assert.equal(tools.length, 0);
    return finalResponse(provider);
  };
  const run = provider === 'api' ? answer : answerWithChatGpt;
  const emit = event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; };
  await run({ config: activeConfig, content, request, prepared, turn, auth, signal: new AbortController().signal, emit, persist: () => {}, fetchImpl });
  assert.equal(calls, 1); assert.match(turn.answer, /SYNTHETIC bounded first reply/);
}

test('all current guides admit every chapter on an initial default-budget question with search enabled or disabled', async t => {
  const content = await fixture(t), library = content.libraryOverview();
  assert.ok(library.length > 0);
  let cases = 0;
  for (const item of library) {
    const guide = content.get(item.guideId, item.revision);
    for (const unit of guide.units) for (const webSearch of [false, true]) {
      const request = input(guide, unit, webSearch), prepared = prepareAssistantContext(content, request, [], config);
      assertGuideContext(prepared, guide, unit); cases++;
    }
  }
  t.diagnostic(`${library.length} public current guides, ${cases} chapter/search preparation cases; default 32768 conservative budget unchanged.`);
});

test('current-guide first replies fit the actual API and ChatGPT payloads without increasing the default budget', async t => {
  const content = await fixture(t);
  for (const item of content.libraryOverview()) for (const provider of ['api', 'chatgpt']) for (const webSearch of [false, true]) {
    await t.test(`${item.guideId} r${item.revision}, ${provider}, search ${webSearch}`, async () => {
      const guide = content.get(item.guideId, item.revision), unit = [...guide.units].sort((a, b) => Buffer.byteLength(b.text) - Buffer.byteLength(a.text))[0];
      const request = input(guide, unit, webSearch), prepared = prepareAssistantContext(content, request, [], config);
      assertGuideContext(prepared, guide, unit);
      await firstSend(content, request, prepared, provider);
    });
  }
});

test('the LLM survey post-training chapter keeps source conditions while unused reading targets do not block a short first question', async t => {
  const content = await fixture(t), guide = content.get('llm-survey', content.catalog.currentRevisions['llm-survey']);
  const unit = guide.units.find(item => item.heading?.includes('后训练'));
  assert.ok(unit, 'The reviewed chapter that exposed this regression must be included.');
  const request = input(guide, unit, true), prepared = prepareAssistantContext(content, request, [], config);
  assertGuideContext(prepared, guide, unit);
  const metadata = JSON.parse(prepared.context.metadataJson);
  assert.ok(metadata.metadataProjection.omittedReadingTargets > 0);
  await firstSend(content, request, prepared, 'chatgpt');
});

test('disabled tools remain absent under a tighter budget and oversized questions are rejected before transport', async t => {
  const content = await fixture(t), guide = content.get('llm-survey', content.catalog.currentRevisions['llm-survey']);
  const unit = guide.units.find(item => item.heading?.includes('后训练'));
  const tight = { ...config, contextTokenLimit: 28000, toolsEnabled: false, searchAvailable: false };
  const request = input(guide, unit, false), prepared = prepareAssistantContext(content, request, [], tight);
  for (const provider of ['api', 'chatgpt']) await firstSend(content, request, structuredClone(prepared), provider, { config: tight });
  for (const provider of ['api', 'chatgpt']) {
    let calls = 0;
    const huge = { ...request, requestId: randomUUID(), question: 'SYNTHETIC ' + '合成'.repeat(7000) };
    assert.throws(() => prepareAssistantContext(content, huge, [], config), /预算/);
    const run = provider === 'api' ? answer : answerWithChatGpt;
    const base = prepareAssistantContext(content, request, [], config);
    await assert.rejects(() => run({ config, content, request: huge, prepared: base, turn: { answer: '', sources: base.sources, context: base.context }, auth,
      signal: new AbortController().signal, emit: () => {}, persist: () => {}, fetchImpl: () => { calls++; throw Error('Oversized synthetic prompt must not reach transport.'); } }), /预算/);
    assert.equal(calls, 0);
  }
});
