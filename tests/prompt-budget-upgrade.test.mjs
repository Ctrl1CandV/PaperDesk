import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { ReadingMaterials } from '../server/reading-materials.mjs';
import { ContentIndex } from '../server/content.mjs';
import { AiStore, validateBackup } from '../server/store.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { answer } from '../server/provider.mjs';
import { answerWithChatGpt } from '../server/chatgpt-provider.mjs';
import { validateSource, validateContext } from '../server/validation.mjs';

// Actual reviewed guide bytes are combined only with isolated synthetic original
// fixtures. No private/reading, credentials, real conversations or network calls.
const temporaryParent = resolve('.cache/test-workspaces');
const guideIds = ['streamingllm', 'rag', 'agent-memory-survey'];
const sse = values => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const config = normalizeConfig({ baseURL: 'https://synthetic-api.invalid/v1', apiKey: 'SYNTHETIC_ONLY', modelId: 'synthetic-budget-model', toolsEnabled: true, contextTokenLimit: 32768, maxOutputTokens: 3000 });
const auth = { async getAccessToken() { return 'SYNTHETIC_AUTH_ONLY'; } };

async function fixture(t) {
  mkdirSync(temporaryParent, { recursive: true });
  const root = mkdtempSync(join(temporaryParent, 'synthetic-prompt-budget-'));
  let content;
  t.after(() => {
    content?.close();
    const child = relative(temporaryParent, root);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rmSync(root, { recursive: true, force: true });
  });
  const reading = new ReadingMaterials(join(root, 'reading')), papers = new Map();
  for (const guideId of guideIds) {
    const paragraphs = Array.from({ length: 12 }, (_, index) => {
      const length = 1000 + Math.floor(index * 6000 / 11);
      const prefix = `SYNTHETIC budgetprobe ${guideId} fixture ${index}. `;
      const filler = 'Synthetic evidence budgetprobe baseline conditions. 合成数据、条件与限制；不得作为真实论文结论。';
      const text = prefix + filler.repeat(Math.ceil((length - prefix.length) / filler.length)).slice(0, length - prefix.length - 1) + 'X';
      return `<p id="synthetic-unit-${index}">${text}</p>`;
    });
    const file = join(root, `${guideId}.html`);
    writeFileSync(file, `<!doctype html><html><body><article>${paragraphs.join('')}</article></body></html>`);
    const manifest = await reading.import({ file, paperId: `synthetic:${guideId}`, sourceRevisionId: `synthetic-${guideId}-v1`, title: `SYNTHETIC original for ${guideId} budget test`, version: 'synthetic-v1', url: `https://example.test/synthetic-${guideId}.html`, format: 'html' });
    const units = reading.derived(manifest).units;
    assert.equal(units.length, 12);
    assert.ok(units.every(unit => unit.text.length >= 1000 && unit.text.length <= 7000));
    assert.ok(units.every(unit => unit.verification === 'unreviewed'));
    papers.set(guideId, { manifest, units });
  }
  content = await ContentIndex.load({ rootDir: resolve('.'), readingDirectory: reading.directory, indexFile: join(root, 'synthetic-index.sqlite') });
  return { content, papers };
}

function toolResponse(provider, round, name, args) {
  const id = `synthetic-call-${round}`;
  if (provider === 'api') return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }]);
  return sse([{ type: 'response.completed', response: { id: `synthetic-response-${round}`, status: 'completed', output: [
    { type: 'function_call', id: `synthetic-item-${round}`, call_id: id, namespace: 'paperdesk', name, arguments: JSON.stringify(args), status: 'completed' },
  ] } }]);
}

function finalResponse(provider, text) {
  if (provider === 'api') return sse([{ choices: [{ delta: { content: text }, finish_reason: 'stop' }] }]);
  return sse([{ type: 'response.completed', response: { id: 'synthetic-final-response', status: 'completed', output: [
    { type: 'message', id: 'synthetic-final-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] },
  ] } }]);
}

function wireOutput(provider, body, call) {
  const output = provider === 'api' ? body.messages.find(item => item.role === 'tool' && item.tool_call_id === call)?.content
    : body.input.find(item => item.type === 'function_call_output' && item.call_id === call)?.output;
  assert.equal(typeof output, 'string', `Tool result ${call} reaches the next actual provider request.`);
  return JSON.parse(output);
}

function independentlyCheckBudget(provider, body, turn, budgets) {
  const input = provider === 'api' ? { messages: body.messages, tools: body.tools ?? [] }
    : { instructions: body.instructions, input: body.input, tools: body.tools ?? [] };
  const inputTokens = Buffer.byteLength(JSON.stringify(input), 'utf8') + 512;
  assert.ok(inputTokens + config.maxOutputTokens <= 32768, `Synthetic provider round exceeds 32768: ${inputTokens}+${config.maxOutputTokens}`);
  assert.equal(turn.context.budget.limit, 32768);
  assert.equal(turn.context.budget.inputTokens, inputTokens);
  assert.equal(turn.context.budget.outputTokens, config.maxOutputTokens);
  budgets.push(inputTokens + config.maxOutputTokens);
}

function assertSourceIdentity(source, paper, unit) {
  assert.equal(source.kind, 'original'); assert.match(source.id, /^O[1-9]\d*$/);
  assert.equal(source.paperId, paper.manifest.paperId);
  assert.equal(source.sourceRevisionId, paper.manifest.sourceRevisionId);
  assert.equal(source.parserRevision, paper.manifest.parserRevision);
  assert.equal(source.materialSha256, paper.manifest.materialSha256);
  assert.equal(source.sourceUnitId, unit.sourceUnitId);
  assert.equal(source.verification, 'unreviewed');
  assert.equal(source.locator.anchor, unit.locator.anchor);
  assert.equal(source.url, `${paper.manifest.finalUrl}#${unit.locator.anchor}`);
}

function assertRange(result, unit) {
  assert.ok(result.range && Number.isInteger(result.range.start) && Number.isInteger(result.range.end));
  assert.equal(result.range.total, unit.text.length);
  assert.ok(result.range.start >= 0 && result.range.end > result.range.start && result.range.end <= result.range.total);
  assert.equal(result.source.text, unit.text.slice(result.range.start, result.range.end));
  if (result.range.end < result.range.total) {
    assert.equal(result.partial, true);
    assert.equal(result.nextOffset, result.range.end);
  }
}

test('three current r2 guides complete budgeted synthetic search/read/final rounds through both actual providers', async t => {
  const { content, papers } = await fixture(t);
  for (const guideId of guideIds) for (const provider of ['api', 'chatgpt']) for (const limit of [8, 12]) {
    await t.test(`${guideId} r2 / ${provider} / search limit ${limit}`, async subtest => {
      assert.equal(content.catalog.currentRevisions[guideId], 2);
      const guide = content.get(guideId, 2), paper = papers.get(guideId);
      const active = [...guide.units].filter(unit => unit.heading).sort((left, right) => Buffer.byteLength(right.text) - Buffer.byteLength(left.text))[0];
      const request = { requestId: randomUUID(), guideId, revision: 2, bodySha256: guide.metadata.bodySha256, unitId: active.id, question: 'SYNTHETIC budget regression: 检索合成材料，补读一个有明确边界的原文单元，并保留当前导读依据。', webSearch: false };
      const prepared = content.prepare(request, [], config);
      const metadata = JSON.parse(prepared.context.metadataJson);
      assert.ok(Array.isArray(metadata.guideRanges) && metadata.guideRanges.length > 0, 'Guide excerpts must expose their precise sent ranges.');
      assert.ok(prepared.sources.length > 0);
      assert.deepEqual(metadata.coverage, guide.metadata.coverage, 'Budgeting cannot remove original coverage conditions.');
      assert.deepEqual(metadata.guideRanges.map(range => range.unitId), prepared.sources.map(source => source.unitId));
      for (const range of metadata.guideRanges) {
        const unit = guide.units.find(item => item.id === range.unitId);
        const source = prepared.sources.find(item => item.unitId === range.unitId);
        assert.equal(range.start, 0); assert.equal(range.total, unit.text.length);
        assert.equal(source.text, unit.text.slice(0, range.end));
        assert.equal(range.excerptOnly, range.end < range.total);
      }
      assert.ok(prepared.sources.reduce((bytes, source) => bytes + Buffer.byteLength(source.text), 0) <= 5000);
      if (metadata.guideRanges.some(range => range.excerptOnly)) {
        assert.equal(prepared.context.scope, 'section'); assert.match(metadata.guideScope, /节选/);
      }
      const initialSources = structuredClone(prepared.sources), initialMetadata = prepared.context.metadataJson;
      const store = new AiStore(':memory:'); subtest.after(() => store.close());
      const turn = store.begin(request, prepared.context, prepared.sources).turn;
      const payloads = [], budgets = [], sourceEvents = [];
      let selected, selectedUnit, searchSnapshot;
      const transport = async (url, options) => {
        assert.equal(String(url), provider === 'api' ? 'https://synthetic-api.invalid/v1/chat/completions' : 'https://api.openai.com/v1/responses');
        const body = JSON.parse(options.body); payloads.push(body);
        independentlyCheckBudget(provider, body, turn, budgets);
        if (payloads.length === 1) return toolResponse(provider, 1, 'search_sources', { query: 'budgetprobe baseline conditions', paperId: paper.manifest.paperId, limit });
        if (payloads.length === 2) {
          const output = wireOutput(provider, body, 'synthetic-call-1');
          assert.ok(output.results.length > 0 && output.results.length <= limit);
          assert.equal(output.returnedCount, output.results.length);
          assert.equal(output.omittedCount, output.candidateCount - output.returnedCount);
          if (output.omittedCount) assert.equal(output.budgetLimited, true);
          assert.ok(Array.isArray(output.materials) && output.materials.length > 0);
          for (const result of output.results) {
            const material = output.materials.find(item => item.id === result.material);
            assert.ok(material, 'Every compact candidate resolves to a shared fixed-material identity.');
            const unit = paper.units.find(item => item.sourceUnitId === result.source.sourceUnitId);
            assert.ok(unit); assertSourceIdentity({ ...material, ...result.source, url: paper.manifest.finalUrl + '#' + unit.locator.anchor }, paper, unit);
            assert.equal(result.source.text, unit.text.slice(result.range.start, result.range.end));
            assert.equal(result.range.total, unit.text.length);
            assert.equal(result.excerptOnly, result.range.end < result.range.total);
            if (result.excerptOnly) assert.equal(result.nextOffset, result.range.end);
            const retained = turn.sources.find(item => item.id === result.source.id);
            assertSourceIdentity(retained, paper, unit);
          }
          searchSnapshot = structuredClone(turn.sources);
          // Prefer the longest returned unit so a bounded read must be partial.
          selected = [...output.results].sort((left, right) => right.range.total - left.range.total)[0];
          selectedUnit = paper.units.find(unit => unit.sourceUnitId === selected.source.sourceUnitId);
          assert.ok(selectedUnit);
          return toolResponse(provider, 2, 'read_source_unit', { sourceRevisionId: paper.manifest.sourceRevisionId, parserRevision: paper.manifest.parserRevision, sourceUnitId: selectedUnit.sourceUnitId, offset: selected.nextOffset ?? selected.range.end, maxChars: 700 });
        }
        assert.equal(payloads.length, 3, 'The requested chain completes in three provider rounds.');
        const result = wireOutput(provider, body, 'synthetic-call-2');
        assertSourceIdentity(result.source, paper, selectedUnit); assertRange(result, selectedUnit);
        assert.equal(result.range.start, selected.nextOffset ?? selected.range.end);
        assert.equal(result.partial, true);
        assert.deepEqual(result.source.readRanges, [result.range]);
        return finalResponse(provider, `SYNTHETIC transport-only final [L1] [${result.source.id}]. No semantic model quality claim.`);
      };
      const emit = event => {
        if (event.type === 'delta') turn.answer += event.text;
        if (event.type === 'replace') turn.answer = event.text;
        if (event.type === 'sources') sourceEvents.push(structuredClone(event.sources));
      };
      const run = provider === 'api' ? answer : answerWithChatGpt;
      await run({ config, content, prepared, request, turn, signal: new AbortController().signal, emit, persist: () => store.save(turn), fetchImpl: transport, auth });
      turn.status = 'complete'; store.save(turn);
      assert.equal(payloads.length, 3); assert.equal(budgets.length, 3);
      assert.deepEqual(turn.context.toolEvents.map(event => event.name), ['search_sources', 'read_source_unit']);
      assert.equal(turn.context.metadataJson, initialMetadata);
      assert.deepEqual(turn.sources.filter(source => source.kind === 'guide'), initialSources);
      for (const prior of searchSnapshot) {
        const retained = turn.sources.find(source => source.id === prior.id);
        assert.ok(retained, 'Reading a further fragment cannot discard an earlier source identity.');
        if (prior.kind === 'original') {
          const unit = paper.units.find(item => item.sourceUnitId === prior.sourceUnitId);
          assertSourceIdentity(retained, paper, unit);
          for (const range of prior.readRanges) {
            assert.ok(retained.readRanges.some(item => item.start <= range.start && item.end >= range.end), 'The persisted ranges still cover every earlier excerpt.');
            assert.ok(retained.text.includes(unit.text.slice(range.start, range.end)), 'Previously read original text is retained even when range labels merge.');
          }
        } else assert.deepEqual(retained, prior);
      }
      assert.equal(sourceEvents.length, 2);
      for (const source of turn.sources) validateSource(source);
      validateContext(turn.context);
      assert.deepEqual(store.turn(turn.id), turn, 'Full provenance/tool snapshots survive actual checkpoint storage.');
      assert.match(turn.answer, /SYNTHETIC transport-only final/);
      subtest.diagnostic(`Conservative input plus reserved-output totals per provider round: ${budgets.join(', ')} / 32768. This is not an upstream exact token count. Synthetic transport and original material only; no live model semantic evaluation.`);
    });
  }
});


test('disjoint and overlapping original reads preserve exact bounded ranges under one source ID through backup restore', async t => {
  const { content, papers } = await fixture(t), paper = papers.get('rag'), guide = content.get('rag', 2);
  const unit = [...paper.units].sort((a, b) => b.text.length - a.text.length)[0];
  const request = { requestId: randomUUID(), guideId: 'rag', revision: 2, bodySha256: guide.metadata.bodySha256, unitId: 'u03', question: 'SYNTHETIC disjoint and overlap range retention.', webSearch: false };
  const prepared = content.prepare(request, [], config), store = new AiStore(':memory:'), restored = new AiStore(':memory:');
  t.after(() => { store.close(); restored.close(); });
  const turn = store.begin(request, prepared.context, prepared.sources).turn;
  const initial = structuredClone(turn.sources), wireSnapshots = [];
  let sourceId;
  for (const [offset, maxChars] of [[0, 220], [1200, 200], [180, 180]]) {
    const args = { sourceRevisionId: paper.manifest.sourceRevisionId, parserRevision: paper.manifest.parserRevision, sourceUnitId: unit.sourceUnitId, offset, maxChars };
    const output = content.runLocal('read_source_unit', args, turn.sources, turn.context);
    assertSourceIdentity(output.source, paper, unit); assertRange(output, unit);
    assert.deepEqual(output.range, { start: offset, end: offset + maxChars, total: unit.text.length });
    assert.deepEqual(output.source.readRanges, [output.range]);
    assert.equal(output.partial, true); assert.equal(output.excerptOnly, true);
    sourceId ??= output.source.id; assert.equal(output.source.id, sourceId);
    wireSnapshots.push(structuredClone(output));
    turn.context.toolEvents.push({ name: 'read_source_unit', argumentsJson: JSON.stringify(args), resultJson: JSON.stringify(output), elapsedMs: 1 });
    store.save(turn);
  }
  assert.equal(turn.sources.filter(source => source.kind === 'original').length, 1);
  assert.deepEqual(turn.sources.filter(source => source.kind === 'guide'), initial);
  const retained = turn.sources.find(source => source.id === sourceId);
  assertSourceIdentity(retained, paper, unit);
  assert.deepEqual(retained.readRanges, [{ start: 0, end: 360, total: unit.text.length }, { start: 1200, end: 1400, total: unit.text.length }]);
  for (const output of wireSnapshots) {
    assert.equal(output.source.text, unit.text.slice(output.range.start, output.range.end), 'Earlier wire snapshots remain their original exact fragment.');
    assert.ok(retained.text.includes(output.source.text), 'All previously read fragments are retained after merging.');
  }
  assert.ok(retained.text.includes(unit.text.slice(0, 360)));
  assert.ok(retained.text.includes(unit.text.slice(1200, 1400)));
  assert.equal(retained.readRanges.some(range => range.start <= 360 && range.end >= 1200), false, 'The unread gap is not promoted into evidence.');
  turn.answer = 'SYNTHETIC completed range fixture.'; turn.status = 'complete'; store.save(turn);
  const backup = store.export(); validateBackup(backup); restored.import(backup);
  assert.deepEqual(restored.turn(turn.id), turn);
  t.diagnostic('Executed reads 0–220, 1200–1400, 180–360: same O ID; persisted ranges 0–360 and 1200–1400; unread gap excluded; exact wire snapshots and v3 backup restore retained.');
});

test('very small remaining tool budget returns explicit errors without adding unread sources or extending prior ranges', async t => {
  const { content, papers } = await fixture(t), paper = papers.get('rag'), guide = content.get('rag', 2);
  const request = { requestId: randomUUID(), guideId: 'rag', revision: 2, bodySha256: guide.metadata.bodySha256, unitId: 'u03', question: 'SYNTHETIC insufficient evidence budget.', webSearch: false };
  const prepared = content.prepare(request, [], config), unit = paper.units[0];
  const identity = { sourceRevisionId: paper.manifest.sourceRevisionId, parserRevision: paper.manifest.parserRevision, sourceUnitId: unit.sourceUnitId };
  const first = content.runLocal('read_source_unit', { ...identity, offset: 0, maxChars: 100 }, prepared.sources, prepared.context);
  assertRange(first, unit);
  const before = structuredClone(prepared.sources);
  prepared.context.budget = { method: 'utf8-bytes-upper-bound', inputTokens: 28550, outputTokens: 3000, limit: 32768 };
  validateContext(prepared.context);
  for (const sourceUnitId of [unit.sourceUnitId, paper.units[1].sourceUnitId]) {
    const output = content.runLocal('read_source_unit', { ...identity, sourceUnitId, offset: 100, maxChars: 200 }, prepared.sources, prepared.context);
    assert.match(output.error, /预算/); assert.match(output.error, /未.*证据/);
    assert.equal(output.source, undefined); assert.deepEqual(prepared.sources, before);
  }
  const search = content.runLocal('search_sources', { query: 'budgetprobe baseline conditions', paperId: paper.manifest.paperId, limit: 12 }, prepared.sources, prepared.context);
  assert.match(search.error, /预算/); assert.equal(search.returnedCount, 0); assert.equal(search.candidateCount, 12);
  assert.deepEqual(prepared.sources, before);
  t.diagnostic('Executed near-exhausted budget branches for existing and unseen original units plus search: explicit errors, zero added evidence and unchanged prior source text/ranges.');
});


for (const provider of ['api', 'chatgpt']) test(provider + ' same-round double original read refreshes remaining budget before the second tool', async t => {
  const { content, papers } = await fixture(t), paper = papers.get('rag'), guide = content.get('rag', 2);
  const request = { requestId: randomUUID(), guideId: 'rag', revision: 2, bodySha256: guide.metadata.bodySha256, unitId: 'u03', question: 'SYNTHETIC same-round batch: search then read two original units, retaining already read evidence.', webSearch: false };
  const prepared = content.prepare(request, [], config), store = new AiStore(':memory:');
  t.after(() => store.close());
  // Deliberately distinct context objects exercise the provider's turn-context
  // handoff instead of accidentally passing through a shared-reference alias.
  const turn = store.begin(request, structuredClone(prepared.context), structuredClone(prepared.sources)).turn;
  const initial = structuredClone(turn.sources), payloads = [], budgets = [], calls = [];
  let chosen, chosenUnits, secondOutcome;
  const observedContent = { runLocal(name, args, sources, context) {
    const budget = structuredClone(context.budget);
    const output = content.runLocal(name, args, sources, context);
    calls.push({ name, budget, output: structuredClone(output), sources: structuredClone(sources) });
    return output;
  } };
  const transport = async (url, options) => {
    assert.equal(String(url), provider === 'api' ? 'https://synthetic-api.invalid/v1/chat/completions' : 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); payloads.push(body);
    independentlyCheckBudget(provider, body, turn, budgets);
    if (payloads.length === 1) return toolResponse(provider, 1, 'search_sources', { query: 'budgetprobe baseline conditions', paperId: paper.manifest.paperId, limit: 12 });
    if (payloads.length === 2) {
      const search = wireOutput(provider, body, 'synthetic-call-1');
      assert.ok(search.results.length >= 2, 'The synthetic search returns at least two candidates to exercise a real batched read.');
      chosen = [...search.results].sort((left, right) => right.range.total - left.range.total).slice(0, 2);
      chosenUnits = chosen.map(result => paper.units.find(unit => unit.sourceUnitId === result.source.sourceUnitId));
      const argumentsList = chosen.map((result, index) => ({ sourceRevisionId: paper.manifest.sourceRevisionId, parserRevision: paper.manifest.parserRevision, sourceUnitId: chosenUnits[index].sourceUnitId, offset: result.nextOffset, maxChars: 7000 }));
      if (provider === 'api') return sse([{ choices: [{ delta: { tool_calls: argumentsList.map((args, index) => ({ index, id: 'synthetic-batch-read-' + index, type: 'function', function: { name: 'read_source_unit', arguments: JSON.stringify(args) } })) }, finish_reason: 'tool_calls' }] }]);
      return sse([{ type: 'response.completed', response: { id: 'synthetic-batch-response', status: 'completed', output: argumentsList.map((args, index) => ({ type: 'function_call', id: 'synthetic-batch-item-' + index, call_id: 'synthetic-batch-read-' + index, namespace: 'paperdesk', name: 'read_source_unit', arguments: JSON.stringify(args), status: 'completed' })) } }]);
    }
    assert.equal(payloads.length, 3);
    const first = wireOutput(provider, body, 'synthetic-batch-read-0'), second = wireOutput(provider, body, 'synthetic-batch-read-1');
    assert.ok(first.source?.text, 'The first same-round read really supplies evidence.');
    assertRange(first, chosenUnits[0]); assertSourceIdentity(first.source, paper, chosenUnits[0]);
    assert.equal(first.range.start, chosen[0].nextOffset);
    if (second.error) {
      assert.match(second.error, /预算/); assert.match(second.error, /未.*证据/); assert.equal(second.source, undefined);
      assert.deepEqual(calls[2].sources, calls[1].sources, 'Rejected second tool cannot add an unread source or change an existing range.');
      secondOutcome = 'explicit budget error; evidence unchanged';
    } else {
      assertRange(second, chosenUnits[1]); assertSourceIdentity(second.source, paper, chosenUnits[1]);
      assert.equal(second.range.start, chosen[1].nextOffset);
      assert.ok(second.range.end - second.range.start <= 7000);
      secondOutcome = 'bounded second excerpt';
    }
    return finalResponse(provider, 'SYNTHETIC batch final [L1] [' + first.source.id + ']. No semantic quality claim.');
  };
  const emit = event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; };
  await (provider === 'api' ? answer : answerWithChatGpt)({ config, content: observedContent, prepared, request, turn, signal: new AbortController().signal, emit, persist: () => store.save(turn), fetchImpl: transport, auth });
  assert.equal(payloads.length, 3); assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.name), ['search_sources', 'read_source_unit', 'read_source_unit']);
  assert.ok(calls.every(call => call.budget?.limit === 32768), 'Every tool receives the current turn budget.');
  assert.ok(calls[2].budget.inputTokens > calls[1].budget.inputTokens, 'The second tool is charged for the first same-round result.');
  assert.deepEqual(turn.sources.filter(source => source.kind === 'guide'), initial);
  for (const prior of calls[0].sources) {
    const retained = turn.sources.find(source => source.id === prior.id); assert.ok(retained);
    if (prior.kind !== 'original') { assert.deepEqual(retained, prior); continue; }
    const unit = paper.units.find(item => item.sourceUnitId === prior.sourceUnitId);
    for (const range of prior.readRanges) {
      assert.ok(retained.readRanges.some(item => item.start <= range.start && item.end >= range.end));
      assert.ok(retained.text.includes(unit.text.slice(range.start, range.end)));
    }
  }
  turn.status = 'complete'; store.save(turn); validateBackup(store.export());
  assert.deepEqual(store.turn(turn.id), turn);
  assert.equal(turn.context.toolEvents.length, 3);
  t.diagnostic('Three actual ' + provider + ' sends; conservative input plus reserved-output totals: ' + budgets.join(', ') + ' / 32768. Second tool: ' + secondOutcome + '. Synthetic transport only.');
});
