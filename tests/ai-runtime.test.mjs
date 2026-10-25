import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { AiRuntime } from '../server/ai-runtime.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { createAiServer } from '../server/http.mjs';
import { AiStore, validateBackup } from '../server/store.mjs';
import { PublicError } from '../server/validation.mjs';

// Synthetic fixtures only. Never read config.local.json, persistent AI records,
// actual OAuth state or the configured provider; all upstream calls are injected.
const config = normalizeConfig({ baseURL: 'https://example.test/v1', apiKey: 'synthetic-api-key', modelId: 'synthetic-api-model' });
const base = resolve('.cache/test-workspaces');
function fakeAuth() {
  return { connected: true, pending: false, needsLogin: false, closed: false,
    async initialize() {},
    status() { return { connected: this.connected, pending: this.pending, needsLogin: this.needsLogin, planEnabled: true }; },
    async beginLogin() { this.pending = true; return { authorizationUrl: 'https://auth.openai.com/api/accounts/authorize?state=synthetic', expiresAt: new Date(Date.now() + 60000).toISOString() }; },
    async cancelLogin() { this.pending = false; },
    async disconnect() { this.connected = false; },
    async close() { this.closed = true; },
  };
}
async function runtimeFixture(t, overrides = {}) {
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'chatgpt-runtime-synthetic-'));
  const auth = fakeAuth();
  const runtime = new AiRuntime({ config, directory, auth,
    fetchImpl: () => { throw new Error('Live fetch forbidden in synthetic tests'); },
    resolveModel: async () => 'synthetic-plan-model', ...overrides });
  await runtime.initialize();
  t.after(async () => {
    await runtime.close();
    const target = resolve(directory);
    assert.ok(target.startsWith(base + sep) && target !== base);
    await rm(target, { recursive: true, force: true });
  });
  return { runtime, auth, directory };
}
const ask = () => ({ requestId: randomUUID(), guideId: 'synthetic', revision: 1, bodySha256: 'a'.repeat(64), unitId: 'intro', question: 'Synthetic question', webSearch: false });
const content = { prepare(input, _history, provider) {
  return { history: [], sources: [{ id: 'L1', kind: 'guide', guideId: input.guideId, revision: input.revision,
    unitId: input.unitId, url: `/read/${input.guideId}/${input.revision}#${input.unitId}`, title: 'Synthetic guide', text: 'Synthetic content' }],
  context: { guideId: input.guideId, revision: input.revision, bodySha256: input.bodySha256, unitId: input.unitId,
    selection: '', scope: 'full-guide', metadataJson: '{}', historyTurnIds: [], webSearch: input.webSearch, model: provider.modelId, toolEvents: [] } };
} };
async function serverFixture(t, runtime) {
  const store = new AiStore(':memory:');
  const server = createAiServer({ config, content, store, runtime });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.abortActive(); server.closeAllConnections(); await new Promise(done => server.close(done)); store.close(); });
  const call = (path, body, token) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({ host: '127.0.0.1', port: server.address().port, path: `/api/ai${path}`, method: payload ? 'POST' : 'GET',
      headers: { host: '127.0.0.1:4176', ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...(token ? { 'x-paperdesk-token': token } : {}) } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text, json: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : undefined }));
    });
    req.on('error', reject); req.end(payload);
  });
  const initial = await call('/status');
  return { store, call, token: initial.json.csrfToken };
}

test('provider selection persists; disconnect/restart never falls back to the API', async t => {
  const { runtime, auth, directory } = await runtimeFixture(t);
  assert.equal(runtime.status().provider, 'api');
  await runtime.select('chatgpt');
  assert.equal(runtime.status().configured, true);
  await runtime.disconnect();
  assert.equal(runtime.status().provider, 'chatgpt');
  assert.equal(runtime.status().configured, false);
  await assert.rejects(runtime.resolve(new AbortController().signal), /尚未连接/);
  const restored = new AiRuntime({ config, directory, auth });
  await restored.initialize();
  assert.equal(restored.status().provider, 'chatgpt');
  assert.equal(restored.status().configured, false);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'provider.json'), 'utf8')), { version: 1, provider: 'chatgpt' });
  await runtime.select('api');
  assert.equal(runtime.status().configured, true);
});

test('safe status and persisted selection contain no credentials or identity', async t => {
  const { runtime, auth, directory } = await runtimeFixture(t);
  auth.status = () => ({ connected: true, planEnabled: true, pending: false, accessToken: 'synthetic-access-token', subject: 'synthetic-identity' });
  await runtime.select('chatgpt');
  const value = JSON.stringify(runtime.status()) + await readFile(join(directory, 'provider.json'), 'utf8');
  for (const secret of ['synthetic-api-key', 'synthetic-access-token', 'synthetic-identity']) assert.equal(value.includes(secret), false);
  assert.deepEqual(Object.keys(runtime.status().chatgpt).sort(), ['availability', 'connected', 'fallbackToApi', 'loginPending', 'needsLogin']);
});

test('corrupt preference fails closed instead of silently enabling API billing', async t => {
  const { auth, directory } = await runtimeFixture(t);
  await writeFile(join(directory, 'provider.json'), 'synthetic-invalid-json');
  const runtime = new AiRuntime({ config, directory, auth });
  await assert.rejects(runtime.initialize(), /连接选择无法读取/);
});

test('ChatGPT resolves a current model; API secrets are not supplied as the OAuth credential', async t => {
  let invoked = false, captured;
  const { runtime, auth } = await runtimeFixture(t, {
    resolveModel: async (connection, options) => { assert.equal(connection, auth); assert.equal(options.modelId, ''); return 'synthetic-account-model'; },
    chatgptAnswer: async options => { invoked = true; captured = options; },
  });
  await runtime.select('chatgpt');
  const selected = await runtime.resolve(new AbortController().signal);
  assert.equal(selected.config.modelId, 'synthetic-account-model');
  assert.equal(selected.config.apiKey, '');
  assert.equal(selected.config.baseURL, '');
  await selected.run({ config: selected.config });
  assert.ok(invoked); assert.equal(captured.auth, auth);
  assert.equal(runtime.status().model, 'synthetic-account-model');
});

test('HTTP connection mutations require CSRF and exact data shapes; disconnect keeps ChatGPT selected', async t => {
  const { runtime } = await runtimeFixture(t);
  const { call, token } = await serverFixture(t, runtime);
  assert.equal((await call('/provider', { provider: 'chatgpt' })).status, 403);
  assert.equal((await call('/provider', { provider: 'chatgpt', unexpected: true }, token)).status, 400);
  assert.equal((await call('/provider', { provider: 'unexpected' }, token)).status, 400);
  assert.equal((await call('/provider', { provider: 'chatgpt' }, token)).json.provider, 'chatgpt');
  const disconnected = await call('/chatgpt/disconnect', {}, token);
  assert.equal(disconnected.json.provider, 'chatgpt'); assert.equal(disconnected.json.configured, false);
  assert.equal((await call('/ask', ask(), token)).status, 503);
  assert.equal((await call('/provider', { provider: 'api' }, token)).json.provider, 'api');
});

test('login has bounded public return; pending login must be cancelled before switching', async t => {
  const { runtime } = await runtimeFixture(t);
  const { call, token } = await serverFixture(t, runtime);
  const started = await call('/chatgpt/connect', {}, token);
  assert.equal(new URL(started.json.authorizationUrl).origin, 'https://auth.openai.com');
  assert.equal((await call('/status')).json.chatgpt.loginPending, true);
  assert.equal((await call('/ask', ask(), token)).status, 409);
  assert.equal((await call('/provider', { provider: 'chatgpt' }, token)).status, 409);
  assert.equal((await call('/chatgpt/cancel', {}, token)).json.chatgpt.loginPending, false);
});

test('active model resolution locks mutations and duplicate request IDs before a turn is committed', async t => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const { runtime } = await runtimeFixture(t, {
    resolveModel: async () => { entered(); return new Promise(resolve => { release = resolve; }); },
    chatgptAnswer: async ({ emit }) => emit({ type: 'delta', text: 'Synthetic final [L1].' }),
  });
  await runtime.select('chatgpt');
  const { call, token, store } = await serverFixture(t, runtime);
  const input = ask();
  const answering = call('/ask', input, token);
  await ready;
  try {
    assert.equal((await call('/provider', { provider: 'api' }, token)).status, 409);
    assert.equal((await call('/chatgpt/disconnect', {}, token)).status, 409);
    assert.equal((await call('/ask', input, token)).status, 409);
  } finally { release('synthetic-plan-model'); }
  const response = await answering;
  assert.equal(response.status, 200);
  const events = response.text.trim().split('\n').map(line => JSON.parse(line));
  const done = events.find(event => event.type === 'done');
  assert.equal(done.turn.context.model, 'synthetic-plan-model');
  assert.equal(done.turn.status, 'complete');
  assert.equal(store.byRequest(input.requestId).answer, 'Synthetic final [L1].');
  validateBackup(store.export());
  await runtime.disconnect();
  const replay = await call('/ask', input, token);
  assert.equal(replay.status, 200); assert.ok(replay.text.includes('Synthetic final'));
});

test('unclassified subscription catalog 429 errors never execute the configured API', async t => {
  let apiCalls = 0;
  const { runtime } = await runtimeFixture(t, {
    resolveModel: async () => { throw new PublicError('Synthetic subscription limit', 429); },
    apiAnswer: async () => { apiCalls++; },
  });
  await runtime.select('chatgpt');
  const { call, token, store } = await serverFixture(t, runtime);
  const response = await call('/ask', ask(), token);
  assert.equal(response.status, 429); assert.equal(apiCalls, 0);
  assert.equal(runtime.provider, 'chatgpt'); assert.equal(store.export().turns.length, 0);
});
