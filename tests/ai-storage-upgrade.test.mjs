import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { AiStore, validateBackup } from '../server/store.mjs';
import { exportBackupStream, importBackupStream } from '../server/backup.mjs';
import { validateSource, validateContext } from '../server/validation.mjs';
import { createAiServer } from '../server/http.mjs';
import { AiRuntime } from '../server/ai-runtime.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

// All records are synthetic. No configuration, credentials or existing private data are opened.
const root = resolve('.cache/test-workspaces');
function fixture(t, options) {
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'ai-storage-upgrade-synthetic-'));
  const store = new AiStore(join(directory, 'records.sqlite'), options);
  let closed = false;
  t.after(() => { if (!closed) store.close(); assert.ok(resolve(directory).startsWith(root + sep)); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory, close() { store.close(); closed = true; } };
}
function begin(store, conversationId, historyTurnIds = [], size = 50) {
  const input = { requestId: randomUUID(), guideId: 'synthetic', revision: 1, bodySha256: 'a'.repeat(64), unitId: 'intro', question: 'Synthetic condition comparison', webSearch: false, ...(conversationId ? { conversationId } : {}) };
  const context = { guideId: input.guideId, revision: 1, bodySha256: input.bodySha256, unitId: 'intro', selection: '', scope: 'full-guide',
    metadataJson: '{}', historyTurnIds, webSearch: false, model: 'synthetic-model', toolEvents: [] };
  const source = { id: 'L1', kind: 'guide', title: 'Synthetic research evidence', guideId: 'synthetic', revision: 1, unitId: 'intro', url: '/read/synthetic/1#intro',
    text: 'Synthetic model / dataset / 32 token budget / baseline / limitations. '.repeat(Math.ceil(size / 67)).slice(0, size) };
  return store.begin(input, context, [source]).turn;
}
function finish(store, turn) { turn.answer = 'Synthetic explanation [L1].'; turn.status = 'complete'; store.save(turn); return turn; }

test('summary pages omit full evidence while exact turn reads and updated checkpoints preserve it', t => {
  const { store } = fixture(t), first = finish(store, begin(store, undefined, [], 90000));
  first.answer = 'Synthetic full answer '.repeat(1000); store.save(first);
  const second = finish(store, begin(store, first.conversationId, [first.id]));
  const page = store.turnSummariesPage(first.conversationId, { limit: 1 });
  assert.equal(page.turns.length, 1); assert.equal(page.turns[0].id, second.id); assert.equal(page.turns[0].summaryOnly, true);
  const older = store.turnSummariesPage(first.conversationId, { limit: 1, cursor: page.nextCursor });
  assert.equal(older.turns[0].id, first.id); assert.equal(older.turns[0].answer.length, 800); assert.deepEqual(older.turns[0].sources, []);
  assert.equal(older.turns[0].sourceCount, 1); assert.ok(JSON.stringify(older).length < 2000);
  assert.equal(store.turn(first.id).sources[0].text.length, 90000);
  assert.equal(store.turn(first.id).answer, first.answer);
});
async function lines(store) { const result = []; for await (const record of exportBackupStream(store)) result.push(record); return result; }
function legacyDatabase(file, backup, running = false) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE conversations(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE turns(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,request_id TEXT NOT NULL UNIQUE,data TEXT NOT NULL); CREATE INDEX turns_conversation ON turns(conversation_id); PRAGMA user_version=1;');
  for (const item of backup.conversations) db.prepare('INSERT INTO conversations VALUES (?,?)').run(item.id, JSON.stringify(item));
  for (const [i, item] of backup.turns.entries()) db.prepare('INSERT INTO turns VALUES (?,?,?,?)').run(item.id, item.conversationId, item.requestId, JSON.stringify(running && i === backup.turns.length - 1 ? { ...item, status: 'running' } : item));
  db.close();
}
test('synthetic v1 migration preserves identities, fallback, sources and history; restart recovers only running turns', t => {
  const source = fixture(t), first = finish(source.store, begin(source.store));
  const second = finish(source.store, begin(source.store, first.conversationId, [first.id]));
  second.context.provider = 'api'; second.context.fallback = { reason: 'subscription_quota', stage: 'answer', fromModel: 'synthetic-plan', previousAnswer: 'Synthetic partial', previousToolCount: 0 };
  source.store.save(second);
  const backup = source.store.export(), file = join(source.directory, 'legacy.sqlite');
  legacyDatabase(file, backup, true);
  const migrated = new AiStore(file);
  assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.deepEqual(migrated.turn(first.id), first);
  assert.deepEqual(migrated.turn(second.id), { ...second, status: 'interrupted' });
  assert.equal(migrated.usage().reservedBytes, 0);
  assert.ok(migrated.migrationBackup);
  const before = new DatabaseSync(migrated.migrationBackup, { readOnly: true });
  assert.equal(before.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(JSON.parse(before.prepare('SELECT data FROM turns WHERE id=?').get(second.id).data).status, 'running'); before.close();
  const expected = migrated.export(); migrated.close();
  const restarted = new AiStore(file); assert.deepEqual(restarted.export().turns, expected.turns); restarted.close();
});
test('synthetic migration failure rolls back the schema and keeps a recoverable old snapshot', t => {
  const f = fixture(t); finish(f.store, begin(f.store));
  for (const phase of ['prepared', 'written', 'committed']) {
    const file = join(f.directory, phase + '.sqlite'); legacyDatabase(file, f.store.export());
    assert.throws(() => new AiStore(file, { migrationHook: state => { if (state === phase) throw Error('Synthetic interrupted migration'); } }), /Synthetic/);
    const inspect = new DatabaseSync(file); assert.equal(inspect.prepare('PRAGMA user_version').get().user_version, phase === 'committed' ? 2 : 1); inspect.close();
    const restored = new AiStore(file); assert.deepEqual(restored.export().turns, f.store.export().turns); restored.close();
  }
});
test('synthetic large history exceeds 16 MiB, checkpoints never snapshot, counters survive delete and stream restore', async t => {
  const f = fixture(t), restored = fixture(t);
  f.store.snapshot = () => { throw Error('Full scan is forbidden on normal writes'); };
  let first;
  for (let i = 0; i < 190; i++) {
    const turn = begin(f.store, first?.conversationId, [], 95000);
    turn.sources.push({ ...turn.sources[0], id: 'L2', text: 'Synthetic experiment conditions. '.repeat(1000) });
    finish(f.store, turn); first ??= turn;
  }
  assert.ok(f.store.usage().bytes > 16 * 1024 * 1024);
  assert.equal(f.store.usage().reservedBytes, 0);
  const next = begin(f.store, first.conversationId, [first.id]); finish(f.store, next);
  assert.equal(f.store.recentTurns(first.conversationId).length, 6);
  const page = f.store.turnsPage(first.conversationId, { limit: 100 });
  assert.ok(Buffer.byteLength(JSON.stringify(page.turns)) < 4 * 1024 * 1024 + 4096);
  assert.ok(page.nextCursor);
  const imported = await importBackupStream(restored.store, exportBackupStream(f.store));
  assert.equal(imported.counts.turns, 191);
  assert.deepEqual(restored.store.turn(next.id), next);
  assert.deepEqual(restored.store.usage(), f.store.usage());
  restored.store.delete(first.conversationId);
  assert.equal(restored.store.usage().bytes, 0); assert.equal(restored.store.usage().turns, 0);
});
test('synthetic stream is a consistent snapshot while new records are written', async t => {
  const f = fixture(t), out = fixture(t); const first = finish(f.store, begin(f.store));
  const stream = exportBackupStream(f.store), firstLine = await stream.next();
  finish(f.store, begin(f.store, first.conversationId));
  async function* saved() { yield firstLine.value; yield* stream; }
  assert.equal((await importBackupStream(out.store, saved())).counts.turns, 1);
});
test('missing, duplicated, damaged, unknown-version and conflicting stream imports expose no partial records', async t => {
  const f = fixture(t), target = fixture(t); finish(f.store, begin(f.store)); const original = await lines(f.store);
  const cases = [original.slice(0, -1), [original[0], original[1], original[1], ...original.slice(2)],
    original.map((row, i) => i === 1 ? row.replace('Synthetic', 'Modified') : row), original.map((row, i) => i === 0 ? row.replace('"schemaVersion":3', '"schemaVersion":99') : row)];
  for (const bad of cases) { await assert.rejects(importBackupStream(target.store, bad)); assert.equal(target.store.usage().turns, 0); assert.equal(target.store.usage().conversations, 0); }
  await importBackupStream(target.store, original); const before = target.store.usage();
  await assert.rejects(importBackupStream(target.store, original), /ID 已存在/); assert.deepEqual(target.store.usage(), before);
  const preview = await importBackupStream(target.store, original, undefined, { preview: true }); assert.equal(preview.counts.turns, 1); assert.deepEqual(target.store.usage(), before);
});
test('synthetic cancellation removes staged files and preserves the destination', async t => {
  const f = fixture(t), target = fixture(t); finish(f.store, begin(f.store)); const records = await lines(f.store), controller = new AbortController();
  async function* canceled() { yield records[0]; controller.abort(); yield records[1]; }
  await assert.rejects(importBackupStream(target.store, canceled(), controller.signal));
  assert.equal(target.store.usage().conversations, 0);
  assert.equal(readdirSync(target.directory).some(file => file.startsWith('ai-import-')), false);
});
test('synthetic turn pages retain order and an upper boundary when new turns arrive', t => {
  const f = fixture(t); let first;
  for (let i = 0; i < 12; i++) { const turn = finish(f.store, begin(f.store, first?.conversationId)); first ??= turn; }
  const before = f.store.turns(first.conversationId), page = f.store.turnsPage(first.conversationId, { limit: 5 });
  finish(f.store, begin(f.store, first.conversationId));
  const gathered = [...page.turns]; let next = page.nextCursor;
  while (next) { const more = f.store.turnsPage(first.conversationId, { limit: 5, cursor: next }); gathered.unshift(...more.turns); next = more.nextCursor; }
  assert.deepEqual(gathered, before); assert.throws(() => f.store.turnsPage(first.conversationId, { cursor: 'invalid' }));
});
test('synthetic runtime reservations are independent of legacy export budget and roll back at capacity', t => {
  const f = fixture(t, { capacityBytes: 3 * 1024 * 1024 }); begin(f.store);
  const before = f.store.usage(); assert.throws(() => begin(f.store), /运行容量/); assert.deepEqual(f.store.usage(), before);
});
test('synthetic original evidence and retrieval context preserve strict source types and v3 backup round trip', async t => {
  const f = fixture(t), target = fixture(t), turn = begin(f.store);
  const original = { id: 'O1', kind: 'original', title: 'Synthetic original', text: 'Synthetic evidence.', url: 'https://example.test/paper#S2', version: 'v1', paperId: 'synthetic-paper',
    sourceRevisionId: 'synthetic-v1', materialSha256: 'b'.repeat(64), parserRevision: 'c'.repeat(64), sourceUnitId: 'section-2',
    locator: { label: 'Section 2', physicalPage: 2, printedPageLabel: '1', anchor: 'S2' }, gaps: ['Synthetic image not checked'], verification: 'text-checked' };
  turn.sources.push(original); turn.context.catalogDigest = 'd'.repeat(64); turn.context.indexGeneration = 'e'.repeat(64);
  turn.context.budget = { method: 'utf8-bytes-upper-bound', inputTokens: 500, outputTokens: 500, limit: 2000 };
  turn.context.toolEvents.push({ name: 'read_source_unit', argumentsJson: '{}', resultJson: '{"synthetic":true}', elapsedMs: 1 }); finish(f.store, turn);
  const backup = f.store.export(); assert.equal(backup.schemaVersion, 3); validateBackup(backup);
  await importBackupStream(target.store, exportBackupStream(f.store)); assert.deepEqual(target.store.turn(turn.id), turn);
  assert.throws(() => validateBackup({ ...backup, schemaVersion: 2 }), /版本 3/);
  assert.throws(() => validateSource({ ...original, kind: 'web', id: 'W1' }));
  assert.throws(() => validateSource({ ...original, locator: { ...original.locator, physicalPage: 0 } }));
  assert.throws(() => validateContext({ ...turn.context, budget: { ...turn.context.budget, limit: 1 } }));
});

test('synthetic original tool → ChatGPT quota → API retains O1 → HTTP v3 backup restores old L/W and new original evidence', async t => {
  const f = fixture(t), restored = fixture(t);
  const older = begin(f.store); older.sources.push({ id: 'W1', kind: 'web', title: 'Synthetic old web excerpt', url: 'https://example.test/old', text: 'Synthetic old excerpt.', version: null }); finish(f.store, older);
  const original = { id: 'O1', kind: 'original', title: 'Synthetic fixed original', text: 'Synthetic baseline and test conditions.', url: 'https://example.test/fixed#S2', version: 'v1', paperId: 'synthetic-paper',
    sourceRevisionId: 'synthetic-v1', materialSha256: 'b'.repeat(64), parserRevision: 'c'.repeat(64), sourceUnitId: 'section-2',
    locator: { label: 'Section 2', physicalPage: null, printedPageLabel: null, anchor: 'S2' }, gaps: [], verification: 'text-checked' };
  const toolArguments = { sourceRevisionId: original.sourceRevisionId, parserRevision: original.parserRevision, sourceUnitId: original.sourceUnitId };
  const localCalls = [], apiBodies = [], planBodies = [];
  const content = {
    reading: { view(sourceRevisionId, parserRevision, sourceUnitId) {
      if (sourceRevisionId === original.sourceRevisionId && parserRevision === original.parserRevision && sourceUnitId === original.sourceUnitId) return original;
    } },
    prepare(input, history, config) {
      return { sources: [structuredClone(older.sources[0])], history, context: { ...structuredClone(older.context), model: config.modelId,
        historyTurnIds: history.map(turn => turn.id), catalogDigest: 'd'.repeat(64), indexGeneration: 'e'.repeat(64), toolEvents: [] } };
    },
    runLocal(name, args, sources, context) {
      assert.equal(name, 'read_source_unit'); assert.deepEqual(args, toolArguments); assert.equal(context.indexGeneration, 'e'.repeat(64));
      localCalls.push({ name, args });
      if (!sources.some(source => source.id === 'O1')) sources.push(structuredClone(original));
      return { source: sources.find(source => source.id === 'O1'), indexGeneration: context.indexGeneration, scope: 'Synthetic section 2 only' };
    },
  };
  const config = normalizeConfig({ baseURL: 'https://synthetic-api.invalid/v1', apiKey: 'SYNTHETIC_ONLY', modelId: 'synthetic-api-model', toolsEnabled: true, maxOutputTokens: 1024 });
  const auth = { async initialize() {}, async close() {}, async getAccessToken() { return 'SYNTHETIC_AUTH_ONLY'; }, status() { return { connected: true, planEnabled: true, needsLogin: false, pending: false }; } };
  const sse = values => new Response(values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes('synthetic-api.invalid')) {
      apiBodies.push(body);
      if (apiBodies.length === 1) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'synthetic-api-read', type: 'function', function: { name: 'read_source_unit', arguments: JSON.stringify(toolArguments) } }] }, finish_reason: 'tool_calls' }] }]);
      return sse([{ choices: [{ delta: { content: 'Synthetic final explanation [O1] [L1].' }, finish_reason: 'stop' }] }]);
    }
    assert.equal(String(url), 'https://api.openai.com/v1/responses'); planBodies.push(body);
    if (planBodies.length === 1) return sse([{ type: 'response.completed', response: { id: 'synthetic-response', status: 'completed', output: [
      { type: 'message', id: 'synthetic-message', role: 'assistant', status: 'completed', phase: 'commentary', content: [{ type: 'output_text', text: 'Synthetic original lookup.', annotations: [] }] },
      { type: 'function_call', id: 'synthetic-item', call_id: 'synthetic-plan-read', namespace: 'paperdesk', name: 'read_source_unit', arguments: JSON.stringify(toolArguments), status: 'completed' },
    ] } }]);
    return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Synthetic quota event' } }, { status: 429 });
  };
  const runtime = new AiRuntime({ config, directory: f.directory, auth, fetchImpl, resolveModel: async () => 'synthetic-plan-model' });
  await runtime.initialize(); await runtime.select('chatgpt');
  const server = createAiServer({ config, content, store: f.store, runtime, fetchImpl });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.abortActive(); server.closeAllConnections(); await new Promise(done => server.close(done)); await runtime.close(); });
  const call = (path, { body, token, type = 'application/json', headers = {} } = {}) => new Promise((done, fail) => {
    const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const request = httpRequest({ host: '127.0.0.1', port: server.address().port, path: '/api/ai' + path, method: data === null ? 'GET' : 'POST',
      headers: { host: '127.0.0.1:4176', ...(data !== null ? { 'content-type': type, 'content-length': Buffer.byteLength(data) } : {}), ...(token ? { 'x-paperdesk-token': token } : {}), ...headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; }); response.on('end', () => done({ status: response.statusCode, text }));
    });
    request.on('error', fail); request.end(data);
  });
  const token = JSON.parse((await call('/status')).text).csrfToken;
  const response = await call('/ask', { token, body: { requestId: randomUUID(), conversationId: older.conversationId, guideId: 'synthetic', revision: 1,
    bodySha256: 'a'.repeat(64), unitId: 'intro', question: 'Synthetic request for original evidence', webSearch: false } });
  assert.equal(response.status, 200);
  const events = response.text.trim().split('\n').map(JSON.parse), completed = events.find(event => event.type === 'done');
  assert.ok(completed, response.text); const turn = completed.turn;
  assert.equal(turn.context.provider, 'api'); assert.equal(turn.context.fallback.stage, 'answer');
  assert.equal(turn.context.fallback.previousAnswer.trim(), 'Synthetic original lookup.');
  assert.deepEqual(turn.sources.filter(source => source.kind === 'original'), [original]);
  assert.equal(localCalls.length, 2); assert.equal(planBodies.length, 2); assert.equal(apiBodies.length, 2);
  assert.ok(JSON.stringify(apiBodies[0].messages).includes('"id\\":\\"O1')); // Source snapshot is in a JSON string inside the prompt.
  assert.ok(apiBodies[0].tools.some(tool => tool.function.name === 'read_source_unit'));
  assert.equal(turn.context.toolEvents.length, 2); assert.ok(turn.context.toolEvents.every(event => event.name === 'read_source_unit'));
  assert.equal(turn.context.indexGeneration, 'e'.repeat(64));
  const materialPath = '/materials/' + original.sourceRevisionId + '/' + original.parserRevision + '/' + original.sourceUnitId;
  assert.equal((await call(materialPath)).status, 403);
  assert.equal((await call(materialPath, { token, headers: { origin: 'https://synthetic-cross-origin.invalid' } })).status, 403);
  assert.equal((await call(materialPath, { token })).status, 200);
  assert.equal((await call(materialPath.replace('section-2', 'missing'), { token })).status, 404);
  const exported = await call('/export/stream', { token }); assert.equal(exported.status, 200);
  await importBackupStream(restored.store, [exported.text]);
  assert.deepEqual(restored.store.turn(older.id), older); assert.deepEqual(restored.store.turn(turn.id), turn);
  const preview = await call('/import/stream?preview=1', { token, type: 'application/x-ndjson', body: exported.text });
  assert.equal(preview.status, 200); assert.equal(JSON.parse(preview.text).counts.turns, 2);
  assert.equal((await call('/import/stream', { token, type: 'application/x-ndjson', body: exported.text })).status, 409);
});
