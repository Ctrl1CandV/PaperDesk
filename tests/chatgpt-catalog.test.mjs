// Synthetic catalogs, credentials and configuration only. No network or user records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatGptCatalog } from '../server/chatgpt-catalog.mjs';
import { AiRuntime } from '../server/ai-runtime.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { PublicError } from '../server/validation.mjs';

const models = () => [{ id: 'synthetic-plan', name: 'Synthetic plan', reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'high' }];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const signal = () => new AbortController().signal;

test('synthetic catalog is shared for five minutes, copied defensively, and explicitly refreshable', async () => {
  let now = 0, requests = 0;
  const catalog = new ChatGptCatalog(async () => { requests++; return models(); }, { now: () => now });
  const first = await catalog.get(signal()); first[0].reasoningEfforts.push('max');
  now = 299999;
  assert.deepEqual(await catalog.get(signal()), models()); assert.equal(requests, 1);
  now = 300000;
  await catalog.get(signal()); assert.equal(requests, 2);
  await catalog.get(signal(), { refresh: true }); assert.equal(requests, 3);
});

test('synthetic concurrent readers share a load but one cancellation cannot abort the other', async () => {
  const entered = deferred(), release = deferred(); let requests = 0, upstream;
  const catalog = new ChatGptCatalog(async incoming => { requests++; upstream = incoming; entered.resolve(); return release.promise; });
  const controller = new AbortController();
  const first = catalog.get(controller.signal), second = catalog.get(signal());
  await entered.promise; controller.abort();
  await assert.rejects(first, error => error.name === 'AbortError'); assert.equal(upstream.aborted, false);
  release.resolve(models()); assert.deepEqual(await second, models()); assert.equal(requests, 1);
});

test('synthetic cancellation of all readers aborts the load and cannot poison the next request', async () => {
  const entered = deferred(), release = deferred(); let upstream, requests = 0;
  const catalog = new ChatGptCatalog(async incoming => {
    if (++requests > 1) return models();
    upstream = incoming; entered.resolve(); return release.promise;
  });
  const controller = new AbortController(), pending = catalog.get(controller.signal);
  await entered.promise; controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(upstream.aborted, true); assert.deepEqual(await catalog.get(signal()), models());
  release.resolve([{ id: 'synthetic-stale', name: 'Synthetic stale' }]); await new Promise(done => setImmediate(done));
  assert.deepEqual(await catalog.get(signal()), models()); assert.equal(requests, 2);
});

test('synthetic authorization invalidation prevents an old catalog result from entering the new connection', async () => {
  const entered = deferred(), release = deferred(); let calls = 0;
  const catalog = new ChatGptCatalog(async () => { if (++calls > 1) return models(); entered.resolve(); return release.promise; });
  const old = catalog.get(signal()); await entered.promise;
  catalog.clear(); assert.deepEqual(await catalog.get(signal()), models());
  release.resolve([{ id: 'synthetic-old-account', name: 'Synthetic old account' }]);
  await assert.rejects(old, { name: 'AbortError' }); assert.deepEqual(await catalog.get(signal()), models());
});

test('synthetic failed refresh discards the old catalog and is retryable without stale fallback', async () => {
  let calls = 0;
  const catalog = new ChatGptCatalog(async () => { if (++calls === 2) throw new PublicError('Synthetic rejection', 403); return models(); });
  await catalog.get(signal());
  await assert.rejects(catalog.get(signal(), { refresh: true }), error => error.status === 403);
  await catalog.get(signal()); assert.equal(calls, 3);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(catalog.get(aborted.signal), { name: 'AbortError' }); assert.equal(calls, 3);
});

function runtimeFixture(options = {}) {
  const controls = { lists: 0, probes: [], answers: [], models: models() };
  const auth = { connected: true, pending: false, status() { return { connected: this.connected, pending: this.pending, planEnabled: true }; },
    async beginLogin() { this.pending = true; }, async cancelLogin() { this.pending = false; }, async disconnect() { this.connected = false; }, async close() {} };
  const runtime = new AiRuntime({ config: normalizeConfig({ chatgptReasoningEffort: 'high' }), directory: '.cache/synthetic-unused-runtime', auth,
    fetchImpl: () => { throw Error('Live network forbidden'); },
    listModels: async () => { controls.lists++; return controls.models; },
    probe: async (_auth, input) => { controls.probes.push(input); },
    chatgptAnswer: async input => { controls.answers.push(input.config); }, ...options });
  runtime.provider = 'chatgpt';
  return { runtime, controls, auth };
}

test('synthetic picker, checks and repeated questions share one catalog and check uses lowest supported effort', async t => {
  const { runtime, controls } = runtimeFixture(); t.after(() => runtime.close());
  await runtime.getModels(signal());
  await runtime.checkChatGpt(signal());
  for (let index = 0; index < 2; index++) {
    const selected = await runtime.resolve(signal());
    await selected.run({ config: selected.config, signal: signal() });
  }
  assert.equal(controls.lists, 1); assert.equal(controls.probes[0].reasoningEffort, 'low');
  assert.ok(controls.answers.every(config => config.chatgptReasoningEffort === 'high'));
  assert.equal(runtime.status().chatgpt.availability.state, 'available');
  await runtime.getModels(signal(), { refresh: true }); assert.equal(controls.lists, 2);
});

test('synthetic thinking selection fails before inference when capabilities disappear or model changes', async t => {
  const { runtime, controls } = runtimeFixture(); t.after(() => runtime.close());
  await runtime.resolve(signal()); controls.models = [{ id: 'synthetic-plan', name: 'Synthetic no capabilities' }];
  await runtime.getModels(signal(), { refresh: true });
  await assert.rejects(runtime.resolve(signal()), error => error.status === 409 && /Thinking/.test(error.message));
  assert.equal(controls.answers.length, 0);
  runtime.config = normalizeConfig();
  const selected = await runtime.resolve(signal()); assert.equal(selected.config.chatgptReasoningEffort, '');
});

test('synthetic authorization operations invalidate catalogs and availability without new implicit checks', async t => {
  const { runtime, controls } = runtimeFixture(); t.after(() => runtime.close());
  await runtime.checkChatGpt(signal());
  await runtime.beginLogin(); assert.equal(runtime.status().chatgpt.availability.state, 'unknown');
  await runtime.cancelLogin(); await runtime.getModels(signal()); assert.equal(controls.lists, 2);
  await runtime.disconnect(); await assert.rejects(runtime.getModels(signal()), error => error.status === 409);
  assert.equal(controls.probes.length, 1);
});

test('synthetic failed checks preserve the last confirmed result with the actual sanitized diagnostic', async t => {
  let fail = false;
  const { runtime } = runtimeFixture({ probe: async () => { if (fail) throw new PublicError('Synthetic stream transport budget exceeded', 502); } });
  t.after(() => runtime.close());
  await runtime.checkChatGpt(signal()); fail = true; await runtime.checkChatGpt(signal());
  assert.equal(runtime.status().chatgpt.availability.state, 'available');
  assert.equal(runtime.status().chatgpt.availability.lastError, 'Synthetic stream transport budget exceeded');
});

test('synthetic canceled availability check never confirms success or falls back to API', async t => {
  const entered = deferred(); let apiCalls = 0;
  const { runtime } = runtimeFixture({ probe: async (_auth, { signal }) => {
    entered.resolve(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }, apiAnswer: async () => { apiCalls++; } });
  t.after(() => runtime.close());
  const controller = new AbortController(), checking = runtime.checkChatGpt(controller.signal);
  await entered.promise; controller.abort(); await checking;
  assert.equal(runtime.status().chatgpt.availability.state, 'unknown');
  assert.equal(runtime.status().chatgpt.availability.checking, false); assert.equal(apiCalls, 0);
});
