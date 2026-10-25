// Synthetic backend settings only. No real configuration, credentials, user
// records or provider network requests are read. HTTP uses an ephemeral port.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { BackendSettings } from '../server/settings.mjs';
import { AiRuntime } from '../server/ai-runtime.mjs';
import { createAiServer } from '../server/http.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { AiStore } from '../server/store.mjs';

const base = resolve('.cache/test-workspaces');
const rawConfig = () => ({ baseURL: 'https://synthetic.example/v1', apiKey: 'SYNTHETIC_API_SECRET', modelId: 'synthetic-api-a',
  chatgptModelId: '', toolsEnabled: false, maxOutputTokens: 700, timeoutMs: 17000, search: { apiKey: 'SYNTHETIC_SEARCH_SECRET' } });
const deferred = () => { let resolveDone; const promise = new Promise(done => { resolveDone = done; }); return { promise, resolve: resolveDone }; };
const ask = () => ({ requestId: randomUUID(), guideId: 'synthetic', revision: 1, bodySha256: 'a'.repeat(64), unitId: 'intro', question: 'Synthetic settings question', webSearch: false });
const content = { prepare(input, _history, config) {
  return { history: [], sources: [{ id: 'L1', kind: 'guide', title: 'Synthetic source', text: 'Synthetic context.',
    guideId: input.guideId, revision: input.revision, unitId: input.unitId, url: '/read/synthetic/1#intro' }],
  context: { guideId: input.guideId, revision: input.revision, bodySha256: input.bodySha256, unitId: input.unitId,
    selection: '', scope: 'full-guide', metadataJson: '{}', historyTurnIds: [], webSearch: false, model: config.modelId, toolEvents: [] } };
} };
function noSecrets(value) {
  const json = JSON.stringify(value);
  for (const forbidden of ['SYNTHETIC_API_SECRET', 'SYNTHETIC_SEARCH_SECRET', 'SYNTHETIC_REPLACEMENT_SECRET', 'SYNTHETIC_OAUTH_SECRET']) assert.equal(json.includes(forbidden), false);
}
async function fileFixture(t, config = rawConfig()) {
  await mkdir(base, { recursive: true }); const directory = await mkdtemp(join(base, 'ai-settings-synthetic-'));
  const file = join(directory, 'synthetic-config.json'); await writeFile(file, JSON.stringify(config));
  t.after(async () => { const target = resolve(directory); assert.ok(target.startsWith(base + sep)); await rm(target, { recursive: true, force: true }); });
  const changes = [], settings = new BackendSettings({ file, onChange: value => { changes.push(value); } });
  const initial = await settings.refresh();
  return { directory, file, settings, initial, changes, disk: async () => JSON.parse(await readFile(file, 'utf8')) };
}
const apiInput = (view, extra = {}) => ({ revision: view.revision, baseURL: view.api.baseURL, modelId: 'synthetic-api-b', ...extra });
async function runtimeFixture(t, overrides = {}) {
  const fixture = await fileFixture(t);
  const auth = { connected: true, pending: false, async initialize() {}, async close() {},
    status() { return { connected: this.connected, pending: this.pending, planEnabled: true, needsLogin: false, accessToken: 'SYNTHETIC_OAUTH_SECRET' }; } };
  const calls = [], controls = { models: [{ id: 'synthetic-plan-a', name: 'Synthetic Plan A' }], catalogs: 0 };
  const runtime = new AiRuntime({ config: normalizeConfig(rawConfig()), directory: fixture.directory, configFile: fixture.file, auth,
    fetchImpl: () => { throw Error('Live provider fetch forbidden in synthetic settings tests.'); },
    listModels: async () => { controls.catalogs++; return controls.models; },
    resolveModel: async (_auth, options) => options.modelId || controls.models[0].id,
    apiAnswer: async ({ config, emit }) => { calls.push({ provider: 'api', config }); emit({ type: 'delta', text: 'Synthetic API answer.' }); },
    chatgptAnswer: async ({ config, emit }) => { calls.push({ provider: 'chatgpt', config }); emit({ type: 'delta', text: 'Synthetic plan answer.' }); },
    ...overrides });
  await runtime.initialize(); t.after(() => runtime.close());
  return { ...fixture, runtime, auth, calls, controls };
}
async function httpFixture(t, overrides = {}) {
  const fixture = await runtimeFixture(t, overrides), store = new AiStore(':memory:');
  const server = createAiServer({ config: fixture.runtime.config, content, store, runtime: fixture.runtime,
    fetchImpl: () => { throw Error('Live provider fetch forbidden in synthetic settings tests.'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.abortActive(); server.closeAllConnections(); await new Promise(done => server.close(done)); store.close(); });
  function call(path, body, token, headers = {}) {
    return new Promise((resolveDone, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const request = httpRequest({ host: '127.0.0.1', port: server.address().port, path: `/api/ai${path}`, method: payload === null ? 'GET' : 'POST',
        headers: { host: '127.0.0.1:4176', ...(payload !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...(token ? { 'x-paperdesk-token': token } : {}), ...headers } }, response => {
        let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolveDone({ status: response.statusCode, text,
          json: response.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : undefined }));
      });
      request.on('error', reject); request.setTimeout(10000, () => request.destroy(Error('Synthetic settings request timed out.'))); request.end(payload);
    });
  }
  const token = (await call('/status')).json.csrfToken;
  return { ...fixture, store, call, token };
}

test('synthetic settings view never returns API/search credentials', async t => {
  const { initial, settings } = await fileFixture(t); noSecrets(initial); noSecrets(settings.view());
  assert.equal(initial.api.apiKeyConfigured, true); assert.equal(initial.search.apiKeyConfigured, true);
  assert.deepEqual(Object.keys(initial.api).sort(), ['apiKeyConfigured', 'baseURL', 'modelId']);
});

test('synthetic omitted or blank API key preserves existing credential and unrelated options', async t => {
  const f = await fileFixture(t); let view = f.initial;
  for (const extra of [{}, { apiKey: '' }, { apiKey: '   ', baseURL: 'https://synthetic.example/v1/' }]) {
    view = await f.settings.update(apiInput(view, extra), 'api'); noSecrets(view);
    const disk = await f.disk(); assert.equal(disk.apiKey, 'SYNTHETIC_API_SECRET');
    for (const key of ['search', 'toolsEnabled', 'maxOutputTokens', 'timeoutMs', 'chatgptModelId']) assert.deepEqual(disk[key], rawConfig()[key]);
  }
});

test('synthetic destination change requires a newly supplied key before any write', async t => {
  const f = await fileFixture(t); const before = await readFile(f.file, 'utf8');
  for (const apiKey of [undefined, '', '   ']) {
    await assert.rejects(f.settings.update(apiInput(f.initial, { baseURL: 'https://synthetic-new.example/v1', ...(apiKey === undefined ? {} : { apiKey }) }), 'api'), error => error.status === 400 && /重新填写/.test(error.message));
    assert.equal(await readFile(f.file, 'utf8'), before);
  }
  const next = await f.settings.update(apiInput(f.initial, { baseURL: 'https://synthetic-new.example/v1', apiKey: 'SYNTHETIC_REPLACEMENT_SECRET' }), 'api');
  noSecrets(next); assert.equal((await f.disk()).apiKey, 'SYNTHETIC_REPLACEMENT_SECRET');
});

test('synthetic stale revision and external file edits are rejected without overwriting newer values', async t => {
  const f = await fileFixture(t); const saved = await f.settings.update(apiInput(f.initial), 'api');
  await assert.rejects(f.settings.update(apiInput(f.initial, { modelId: 'synthetic-stale' }), 'api'), error => error.status === 409);
  const external = { ...await f.disk(), modelId: 'synthetic-external', timeoutMs: 29000 };
  const raw = JSON.stringify(external, null, 2); await writeFile(f.file, raw);
  await assert.rejects(f.settings.update(apiInput(saved), 'api'), error => error.status === 409);
  assert.equal(await readFile(f.file, 'utf8'), raw); assert.equal((await f.settings.refresh()).api.modelId, 'synthetic-external');
});

test('synthetic external edit after the initial settings read is detected before replacement', async t => {
  const f = await fileFixture(t);
  const external = JSON.stringify({ ...rawConfig(), modelId: 'synthetic-mid-save-edit', timeoutMs: 31000 }, null, 2);
  const readCurrent = f.settings.readCurrent.bind(f.settings);
  // Deterministic stand-in for an editor writing after the save's initial read.
  f.settings.readCurrent = async () => { const view = await readCurrent(); await writeFile(f.file, external); return view; };
  try { await assert.rejects(f.settings.update(apiInput(f.initial), 'api'), error => error.status === 409); }
  finally { f.settings.readCurrent = readCurrent; }
  assert.equal(await readFile(f.file, 'utf8'), external);
  assert.equal((await f.settings.refresh()).api.modelId, 'synthetic-mid-save-edit');
});

test('synthetic invalid file data is preserved and never silently reset', async t => {
  const f = await fileFixture(t); const invalid = '{SYNTHETIC_INVALID_CONFIG'; await writeFile(f.file, invalid);
  await assert.rejects(f.settings.refresh(), error => error.status === 503);
  await assert.rejects(f.settings.update(apiInput(f.initial), 'api'), error => error.status === 503);
  assert.equal(await readFile(f.file, 'utf8'), invalid);
});

test('synthetic concurrent refresh/update operations cannot roll back a successful settings save', async t => {
  const f = await fileFixture(t);
  const before = Array.from({ length: 12 }, () => f.settings.refresh());
  const saving = f.settings.update(apiInput(f.initial), 'api');
  const after = Array.from({ length: 12 }, () => f.settings.refresh());
  await Promise.all(before); const saved = await saving; const views = await Promise.all(after);
  assert.ok(views.every(view => view.revision === saved.revision && view.api.modelId === 'synthetic-api-b'));
  assert.equal(f.settings.view().api.modelId, 'synthetic-api-b'); assert.equal((await f.disk()).modelId, 'synthetic-api-b');
  assert.equal(f.changes.at(-1).modelId, 'synthetic-api-b');
});

test('synthetic simultaneous saves using one revision produce one winner and one conflict', async t => {
  const f = await fileFixture(t);
  const attempts = await Promise.allSettled(['synthetic-first', 'synthetic-second'].map(modelId => f.settings.update(apiInput(f.initial, { modelId }), 'api')));
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal((await f.disk()).modelId, attempts.find(item => item.status === 'fulfilled').value.api.modelId);
});

test('synthetic API settings save immediately affects the next ask and keeps secrets off HTTP', async t => {
  const f = await httpFixture(t), before = (await f.call('/settings', undefined, f.token)).json;
  noSecrets(before);
  const response = await f.call('/settings/api', apiInput(before, { apiKey: 'SYNTHETIC_REPLACEMENT_SECRET' }), f.token);
  assert.equal(response.status, 200); noSecrets(response.json); assert.equal(response.json.status.provider, 'api');
  const answer = await f.call('/ask', ask(), f.token); assert.equal(answer.status, 200);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].config.modelId, 'synthetic-api-b');
  assert.equal(f.calls[0].config.apiKey, 'SYNTHETIC_REPLACEMENT_SECRET');
  const done = answer.text.trim().split('\n').map(JSON.parse).find(item => item.type === 'done');
  assert.equal(done.turn.context.model, 'synthetic-api-b'); assert.equal(f.store.turn(done.turn.id).status, 'complete'); noSecrets(answer.text);
});

test('synthetic saving either provider configuration does not select that provider', async t => {
  const f = await runtimeFixture(t); await f.runtime.select('chatgpt');
  let view = await f.runtime.getSettings(); await f.runtime.updateSettings(apiInput(view), 'api', new AbortController().signal);
  assert.equal(f.runtime.provider, 'chatgpt');
  await f.runtime.select('api'); view = await f.runtime.getSettings();
  await f.runtime.updateSettings({ revision: view.revision, modelId: 'synthetic-plan-a' }, 'chatgpt', new AbortController().signal);
  assert.equal(f.runtime.provider, 'api');
  assert.equal((await f.disk()).apiKey, 'SYNTHETIC_API_SECRET'); assert.deepEqual((await f.disk()).search, rawConfig().search);
});

test('synthetic selected ChatGPT uses the newly saved catalog model on the next ask', async t => {
  const f = await httpFixture(t); await f.runtime.select('chatgpt');
  const view = await f.runtime.getSettings();
  const saved = await f.call('/settings/chatgpt', { revision: view.revision, modelId: 'synthetic-plan-a' }, f.token);
  assert.equal(saved.status, 200); assert.equal(saved.json.status.provider, 'chatgpt');
  const answer = await f.call('/ask', ask(), f.token); assert.equal(answer.status, 200);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].provider, 'chatgpt'); assert.equal(f.calls[0].config.modelId, 'synthetic-plan-a');
  assert.equal(f.calls[0].config.apiKey, ''); assert.equal(f.calls[0].config.baseURL, '');
  const done = answer.text.trim().split('\n').map(JSON.parse).find(item => item.type === 'done');
  assert.equal(done.turn.context.model, 'synthetic-plan-a'); noSecrets(answer.text);
});

test('synthetic ChatGPT settings revalidate the current model catalog and permit automatic selection', async t => {
  const f = await httpFixture(t); const view = (await f.call('/settings', undefined, f.token)).json;
  assert.deepEqual((await f.call('/chatgpt/models', undefined, f.token)).json.models, f.controls.models);
  f.controls.models = [{ id: 'synthetic-plan-b', name: 'Synthetic Plan B' }];
  assert.equal((await f.call('/settings/chatgpt', { revision: view.revision, modelId: 'synthetic-plan-a' }, f.token)).status, 409);
  const saved = await f.call('/settings/chatgpt', { revision: view.revision, modelId: 'synthetic-plan-b' }, f.token);
  assert.equal(saved.status, 200); assert.equal(saved.json.settings.chatgpt.modelId, 'synthetic-plan-b'); noSecrets(saved.json);
  const automatic = await f.call('/settings/chatgpt', { revision: saved.json.settings.revision, modelId: '' }, f.token);
  assert.equal(automatic.status, 200); assert.equal(automatic.json.settings.chatgpt.modelId, ''); assert.equal(f.runtime.provider, 'api');
});

test('synthetic settings routes enforce CSRF and strict payload shape', async t => {
  const f = await httpFixture(t); const view = await f.runtime.getSettings(); const input = apiInput(view);
  assert.equal((await f.call('/settings')).status, 403); assert.equal((await f.call('/chatgpt/models')).status, 403);
  assert.equal((await f.call('/settings/api', input)).status, 403);
  assert.equal((await f.call('/settings/api', input, f.token, { origin: 'https://synthetic.invalid' })).status, 403);
  for (const body of [null, [], {}, { ...input, search: { apiKey: 'SYNTHETIC_REPLACEMENT_SECRET' } }, { ...input, apiKey: 123 }, { ...input, baseURL: 'https://user:password@synthetic.example/v1' }]) {
    const response = await f.call('/settings/api', body, f.token); assert.equal(response.status, 400); noSecrets(response.json);
  }
  assert.equal((await f.call('/settings/api', { ...input, apiKey: 'x'.repeat(9000) }, f.token)).status, 413);
  assert.deepEqual(await f.disk(), rawConfig());
});

test('synthetic pending login blocks settings writes and model catalog requests', async t => {
  const f = await httpFixture(t), view = await f.runtime.getSettings(); f.auth.pending = true;
  assert.equal((await f.call('/settings/api', apiInput(view), f.token)).status, 409);
  assert.equal((await f.call('/settings/chatgpt', { revision: view.revision, modelId: '' }, f.token)).status, 409);
  assert.equal((await f.call('/chatgpt/models', undefined, f.token)).status, 409);
  assert.equal(f.controls.catalogs, 0); assert.deepEqual(await f.disk(), rawConfig());
});

test('synthetic active answer blocks settings save without altering its config', async t => {
  const entered = deferred(), release = deferred();
  const f = await httpFixture(t, { apiAnswer: async ({ config, emit }) => { entered.resolve(config); await release.promise; emit({ type: 'delta', text: 'Synthetic held answer.' }); } });
  const view = await f.runtime.getSettings(), pending = f.call('/ask', ask(), f.token), captured = await entered.promise;
  try { assert.equal((await f.call('/settings/api', apiInput(view), f.token)).status, 409); assert.equal(captured.modelId, 'synthetic-api-a'); }
  finally { release.resolve(); }
  assert.equal((await pending).status, 200); assert.deepEqual(await f.disk(), rawConfig());
});

test('synthetic model-save catalog lookup holds the mutation lock against asks and other settings requests', async t => {
  const entered = deferred(), release = deferred();
  const f = await httpFixture(t, { listModels: async () => { entered.resolve(); await release.promise; return [{ id: 'synthetic-plan-a', name: 'Synthetic' }]; } });
  const view = await f.runtime.getSettings();
  const pending = f.call('/settings/chatgpt', { revision: view.revision, modelId: 'synthetic-plan-a' }, f.token); await entered.promise;
  try {
    assert.equal((await f.call('/ask', ask(), f.token)).status, 409);
    assert.equal((await f.call('/settings', undefined, f.token)).status, 409);
    assert.equal((await f.call('/settings/api', apiInput(view), f.token)).status, 409);
  } finally { release.resolve(); }
  assert.equal((await pending).status, 200); assert.equal(f.store.export().turns.length, 0);
});

test('synthetic disconnected ChatGPT cannot fetch or save an account model', async t => {
  const f = await httpFixture(t), view = await f.runtime.getSettings(); f.auth.connected = false;
  assert.equal((await f.call('/chatgpt/models', undefined, f.token)).status, 409);
  assert.equal((await f.call('/settings/chatgpt', { revision: view.revision, modelId: 'synthetic-plan-a' }, f.token)).status, 409);
  assert.equal(f.controls.catalogs, 0); assert.deepEqual(await f.disk(), rawConfig());
});

test('synthetic thinking config defaults to model behavior and rejects unknown or non-string values', () => {
  assert.equal(normalizeConfig().chatgptReasoningEffort, '');
  for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    assert.equal(normalizeConfig({ chatgptReasoningEffort: effort }).chatgptReasoningEffort, effort);
  for (const effort of ['ultra', 'HIGH', null, 1, {}, ['low']])
    assert.throws(() => normalizeConfig({ chatgptReasoningEffort: effort }));
});

test('synthetic thinking save validates model capabilities and applies to the next production-path resolve', async t => {
  const f = await httpFixture(t, { resolveModel: undefined });
  f.controls.models[0].reasoningEfforts = ['low', 'high'];
  await f.runtime.select('chatgpt'); const initial = await f.runtime.getSettings();
  const saved = await f.call('/settings/chatgpt', { revision: initial.revision, modelId: 'synthetic-plan-a', reasoningEffort: 'high' }, f.token);
  assert.equal(saved.status, 200); assert.equal(saved.json.settings.chatgpt.reasoningEffort, 'high'); noSecrets(saved.json);
  assert.equal((await f.disk()).chatgptReasoningEffort, 'high');
  const response = await f.call('/ask', ask(), f.token); assert.equal(response.status, 200);
  assert.equal(f.calls[0].config.chatgptReasoningEffort, 'high'); assert.equal(f.calls[0].config.apiKey, '');
  const before = await readFile(f.file, 'utf8');
  for (const effort of ['max', 'ultra', null, ['low'], 42]) {
    const bad = await f.call('/settings/chatgpt', { revision: saved.json.settings.revision, modelId: 'synthetic-plan-a', reasoningEffort: effort }, f.token);
    assert.ok([400, 409].includes(bad.status)); assert.equal(await readFile(f.file, 'utf8'), before);
  }
  const afterApi = await f.call('/settings/api', apiInput(saved.json.settings), f.token);
  assert.equal(afterApi.status, 200); assert.equal(afterApi.json.settings.chatgpt.reasoningEffort, 'high');
  assert.equal((await f.disk()).chatgptReasoningEffort, 'high');
});

test('synthetic unknown capabilities permit default only and changing model through legacy input resets effort', async t => {
  const f = await runtimeFixture(t, { resolveModel: undefined });
  f.controls.models[0].reasoningEfforts = ['low', 'high'];
  let view = await f.runtime.getSettings();
  view = await f.runtime.updateSettings({ revision: view.revision, modelId: 'synthetic-plan-a', reasoningEffort: 'high' }, 'chatgpt', new AbortController().signal);
  f.controls.models.push({ id: 'synthetic-plan-b', name: 'Synthetic unknown capabilities' });
  await assert.rejects(f.runtime.updateSettings({ revision: view.revision, modelId: 'synthetic-plan-b', reasoningEffort: 'low' }, 'chatgpt', new AbortController().signal), error => error.status === 409);
  view = await f.runtime.updateSettings({ revision: view.revision, modelId: 'synthetic-plan-b' }, 'chatgpt', new AbortController().signal);
  assert.equal(view.chatgpt.reasoningEffort, '');
  assert.equal((await f.disk()).chatgptReasoningEffort, '');
});

test('synthetic explicit model refresh uses a new catalog while ordinary picker reads reuse the current one', async t => {
  const f = await httpFixture(t);
  await f.call('/chatgpt/models', undefined, f.token);
  await f.call('/chatgpt/models', undefined, f.token); assert.equal(f.controls.catalogs, 1);
  f.controls.models = [{ id: 'synthetic-refreshed', name: 'Synthetic refreshed' }];
  assert.equal((await f.call('/chatgpt/models?refresh=1', undefined, f.token)).json.models[0].id, 'synthetic-refreshed');
  assert.equal(f.controls.catalogs, 2);
});
