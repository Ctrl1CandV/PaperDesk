import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { AiRuntime } from '../../server/ai/runtime.mjs';
import { createAiServer } from '../../server/http/server.mjs';
import { normalizeConfig } from '../../server/config.mjs';
import { AiStore } from '../../server/storage/ai-store.mjs';

// Synthetic concurrency regressions. Uses an in-memory DB and an ephemeral
// loopback server; never opens persistent credentials, config or user records.
const config = normalizeConfig({ baseURL: 'https://example.test/v1', apiKey: 'synthetic-api-key', modelId: 'synthetic-api-model' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ask = () => ({ requestId: randomUUID(), guideId: 'synthetic', revision: 1, bodySha256: 'a'.repeat(64), unitId: 'intro', question: 'Synthetic concurrency question', webSearch: false });
const content = { prepare(input, previous, provider) {
  const history = previous.filter(turn => turn.status === 'complete');
  return { history, sources: [{ id: 'L1', kind: 'guide', guideId: input.guideId, revision: input.revision,
    unitId: input.unitId, url: '/read/synthetic/1#intro', title: 'Synthetic source', text: 'Synthetic reviewed text.' }],
  context: { guideId: input.guideId, revision: input.revision, bodySha256: input.bodySha256, unitId: input.unitId,
    selection: '', scope: 'full-guide', metadataJson: '{}', historyTurnIds: history.map(turn => turn.id), webSearch: false, model: provider.modelId, toolEvents: [] } };
} };
const emptyBackup = () => ({ format: 'paperdesk-ai-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), conversations: [], turns: [] });

function fakeRuntime(overrides = {}) {
  return {
    status: () => ({ configured: true, provider: 'chatgpt', apiConfigured: true, model: 'synthetic-plan-model', searchAvailable: false,
      chatgpt: { connected: true, loginPending: false, needsLogin: false } }),
    resolve: async () => ({ config: { ...config, modelId: 'synthetic-plan-model' }, run: async ({ emit }) => emit({ type: 'delta', text: 'Synthetic final answer.' }) }),
    ...overrides,
  };
}

async function serverFixture(t, runtime) {
  const store = new AiStore(':memory:');
  const server = createAiServer({ config, content, store, runtime, fetchImpl: () => { throw Error('Live upstream fetch forbidden in synthetic tests.'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.abortActive(); server.closeAllConnections(); await new Promise(done => server.close(done)); store.close(); });
  function open(path, body, token, { holdLastByte = false } = {}) {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    let req;
    const promise = new Promise((resolve, reject) => {
      req = httpRequest({ host: '127.0.0.1', port: server.address().port, path: `/api/ai${path}`, method: payload ? 'POST' : 'GET',
        headers: { host: '127.0.0.1:4176', ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
          ...(token ? { 'x-paperdesk-token': token } : {}) } }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text, json: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : undefined }));
      });
      req.on('error', reject);
      if (holdLastByte) { req.flushHeaders(); req.write(payload.subarray(0, -1)); }
      else req.end(payload);
    });
    return { promise, finish: () => req.end(payload.subarray(-1)) };
  }
  const call = (path, body, token) => open(path, body, token).promise;
  const status = await call('/status');
  const seedConversation = () => {
    const input = ask(), prepared = content.prepare(input, [], config);
    const { turn } = store.begin(input, prepared.context, prepared.sources);
    turn.status = 'complete'; turn.answer = 'Synthetic earlier answer.'; store.save(turn);
    return turn.conversationId;
  };
  return { store, server, call, open, token: status.json.csrfToken, seedConversation };
}

test('identity-only ChatGPT login is not ready for plan inference or selection', async () => {
  let modelLookups = 0;
  const runtime = new AiRuntime({ config, directory: '.cache/synthetic-unused-runtime-directory',
    auth: { status: () => ({ connected: true, planEnabled: false, pending: false, needsLogin: false }) },
    resolveModel: async () => { modelLookups++; return 'synthetic-model'; },
  });
  runtime.provider = 'chatgpt';
  assert.equal(runtime.status().configured, false);
  assert.equal(runtime.status().chatgpt.connected, false);
  assert.equal(runtime.status().chatgpt.needsLogin, true);
  assert.match(runtime.status().chatgpt.error, /未授权套餐/);
  await assert.rejects(runtime.resolve(new AbortController().signal), /未授权套餐/);
  await assert.rejects(runtime.select('chatgpt'), /授权套餐/);
  assert.equal(modelLookups, 0);
  assert.equal(runtime.provider, 'chatgpt');
});

test('catalog preparation locks its conversation and imports, then releases the lock with fresh history', async t => {
  const entered = deferred(), release = deferred();
  let resolves = 0;
  const histories = [];
  const runtime = fakeRuntime({ resolve: async () => {
    resolves++;
    if (resolves === 1) { entered.resolve(); await release.promise; }
    return { config: { ...config, modelId: 'synthetic-plan-model' }, run: async ({ prepared, emit }) => {
      histories.push(prepared.history.map(turn => turn.answer)); emit({ type: 'delta', text: `Synthetic answer ${histories.length}.` });
    } };
  } });
  const { call, token, store, seedConversation } = await serverFixture(t, runtime);
  const conversationId = seedConversation(), input = { ...ask(), conversationId };
  const pending = call('/ask', input, token);
  await entered.promise;
  try {
    const other = await call('/ask', { ...ask(), conversationId }, token);
    assert.equal(other.status, 409);
    assert.match(other.json.message, /当前会话正在准备/);
    assert.equal((await call('/import', emptyBackup(), token)).status, 409);
    assert.equal(resolves, 1);
    assert.equal(store.turns(conversationId).length, 1);
  } finally { release.resolve(); }
  assert.equal((await pending).status, 200);
  assert.equal((await call('/ask', { ...ask(), conversationId }, token)).status, 200);
  assert.deepEqual(histories, [['Synthetic earlier answer.'], ['Synthetic earlier answer.', 'Synthetic answer 1.']]);
  assert.equal(resolves, 2);
});

test('an import body started before catalog preparation is rechecked after the body finishes', async t => {
  const entered = deferred(), release = deferred();
  const runtime = fakeRuntime({ resolve: async () => {
    entered.resolve(); await release.promise;
    return { config, run: async ({ emit }) => emit({ type: 'delta', text: 'Synthetic final.' }) };
  } });
  const { call, open, token } = await serverFixture(t, runtime);
  const importing = open('/import', emptyBackup(), token, { holdLastByte: true });
  const pending = call('/ask', ask(), token);
  await entered.promise;
  try {
    importing.finish();
    const result = await importing.promise;
    assert.equal(result.status, 409);
    assert.match(result.json.message, /问题结束后再导入/);
  } finally { release.resolve(); }
  assert.equal((await pending).status, 200);
});

test('a request found by store.begin after model resolution is replayed without generation or save', async t => {
  let runs = 0, saves = 0;
  const runtime = fakeRuntime({ resolve: async () => ({ config, run: async () => { runs++; } }) });
  const { call, store, token } = await serverFixture(t, runtime);
  const originalBegin = store.begin.bind(store);
  store.begin = (input, context, sources) => {
    const { turn } = originalBegin(input, context, sources);
    turn.answer = 'Synthetic already-committed answer.'; turn.status = 'complete';
    return { replay: true, turn };
  };
  store.save = () => { saves++; };
  const result = await call('/ask', ask(), token);
  assert.equal(result.status, 200);
  const events = result.text.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['accepted', 'sources', 'done']);
  assert.equal(events.at(-1).turn.answer, 'Synthetic already-committed answer.');
  assert.equal(runs, 0);
  assert.equal(saves, 0);
});

test('a still-running request found by store.begin is rejected without inference', async t => {
  let runs = 0;
  const { call, store, token } = await serverFixture(t, fakeRuntime({ resolve: async () => ({ config, run: async () => { runs++; } }) }));
  const originalBegin = store.begin.bind(store);
  store.begin = (input, context, sources) => ({ ...originalBegin(input, context, sources), replay: true });
  assert.equal((await call('/ask', ask(), token)).status, 409);
  assert.equal(runs, 0);
});

test('the preparation phase counts against the two-request concurrency limit', async t => {
  const bothEntered = deferred(), release = deferred();
  let resolves = 0, runs = 0;
  const runtime = fakeRuntime({ resolve: async () => {
    if (++resolves === 2) bothEntered.resolve();
    await release.promise;
    return { config, run: async ({ emit }) => { runs++; emit({ type: 'delta', text: 'Synthetic concurrent answer.' }); } };
  } });
  const { call, token } = await serverFixture(t, runtime);
  const first = call('/ask', ask(), token), second = call('/ask', ask(), token);
  await bothEntered.promise;
  try {
    assert.equal((await call('/ask', ask(), token)).status, 429);
    assert.equal(resolves, 2); assert.equal(runs, 0);
  } finally { release.resolve(); }
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.equal(runs, 2);
});

test('aborting preparation creates no running turn and releases its conversation lock', async t => {
  const entered = deferred();
  let resolves = 0, runs = 0;
  const runtime = fakeRuntime({ resolve: async signal => {
    if (++resolves === 1) {
      entered.resolve();
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
    return { config, run: async ({ emit }) => { runs++; emit({ type: 'delta', text: 'Synthetic recovered answer.' }); } };
  } });
  const { call, token, server, store, seedConversation } = await serverFixture(t, runtime);
  const conversationId = seedConversation();
  const pending = call('/ask', { ...ask(), conversationId }, token);
  await entered.promise;
  server.abortActive();
  assert.equal((await pending).status, 500);
  assert.equal(store.turns(conversationId).length, 1);
  assert.equal(runs, 0);
  assert.equal((await call('/ask', { ...ask(), conversationId }, token)).status, 200);
  assert.equal(runs, 1);
});
