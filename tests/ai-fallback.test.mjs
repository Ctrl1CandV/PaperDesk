// Synthetic fixtures only: ephemeral HTTP, in-memory SQLite, isolated temporary
// configuration, and injected providers. Never read real credentials or records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { AiRuntime } from '../server/ai-runtime.mjs';
import { normalizeConfig } from '../server/config.mjs';
import { createAiServer } from '../server/http.mjs';
import { AiStore, validateBackup } from '../server/store.mjs';
import { PublicError, validateContext } from '../server/validation.mjs';
import { answer } from '../server/provider.mjs';
import { answerWithChatGpt } from '../server/chatgpt-provider.mjs';
import { LIMITS } from '../server/content.mjs';

const base = resolve('.cache/test-workspaces');
const rawConfig = () => ({ baseURL: 'https://synthetic-api.invalid/v1', apiKey: 'SYNTHETIC_API_SECRET',
  modelId: 'synthetic-api-model', toolsEnabled: true, timeoutMs: 17000, search: { apiKey: 'SYNTHETIC_SEARCH_SECRET' } });
const deferred = () => { let complete; const promise = new Promise(done => { complete = done; }); return { promise, resolve: complete }; };
const quota = () => Object.assign(new PublicError('Synthetic plan or application usage limit.', 429), { code: 'subscription_sharing_usage_limit_exceeded' });
const otherError = (code = 'rate_limit_exceeded', status = 429) => Object.assign(new PublicError('Synthetic service failure.', status), { code });
const ask = (extra = {}) => ({ requestId: randomUUID(), guideId: 'synthetic', revision: 1, bodySha256: 'a'.repeat(64),
  unitId: 'intro', question: 'Synthetic fallback question', webSearch: false, ...extra });
const toolEvent = () => ({ name: 'search_library', argumentsJson: '{"query":"synthetic"}', resultJson: '{"scope":"synthetic retrieved evidence"}' });
const extraSource = () => ({ id: 'L2', kind: 'guide', title: 'Synthetic retrieved guide', text: 'Synthetic acquired evidence.',
  guideId: 'synthetic-other', revision: 1, unitId: 'section', url: '/read/synthetic-other/1#section', version: null });
const content = { prepare(input, prior, config) {
  const history = prior.filter(turn => turn.status === 'complete').slice(-6);
  return { history, sources: [{ id: 'L1', kind: 'guide', title: 'Synthetic guide', text: 'Synthetic approved content.',
    guideId: input.guideId, revision: input.revision, unitId: input.unitId, url: '/read/synthetic/1#intro' }],
  context: { guideId: input.guideId, revision: input.revision, bodySha256: input.bodySha256, unitId: input.unitId,
    selection: input.selection ?? '', scope: 'full-guide', metadataJson: '{"title":"Synthetic guide"}',
    historyTurnIds: history.map(turn => turn.id), webSearch: input.webSearch, model: config.modelId, toolEvents: [] } };
} };
const noSecrets = value => {
  const text = JSON.stringify(value);
  for (const secret of ['SYNTHETIC_API_SECRET', 'SYNTHETIC_SEARCH_SECRET', 'SYNTHETIC_NEW_SECRET']) assert.equal(text.includes(secret), false);
};
const events = response => response.text.trim().split('\n').filter(Boolean).map(JSON.parse);
const doneTurn = response => events(response).find(event => event.type === 'done')?.turn;

async function fixture(t, { raw = rawConfig(), ...overrides } = {}) {
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'ai-fallback-synthetic-'));
  const file = join(directory, 'synthetic-config.json');
  await writeFile(file, JSON.stringify(raw));
  const auth = { connected: true, pending: false, async initialize() {}, async close() {},
    status() { return { connected: this.connected, pending: this.pending, planEnabled: true, needsLogin: false }; } };
  const calls = [], controls = { catalogs: 0, lists: 0 };
  const runtime = new AiRuntime({ config: normalizeConfig(raw), directory, configFile: file, auth,
    fetchImpl: () => { throw Error('Live fetch forbidden in synthetic fallback tests.'); },
    resolveModel: async () => { controls.catalogs++; return 'synthetic-plan-model'; },
    listModels: async () => { controls.lists++; return [{ id: 'synthetic-plan-model', name: 'Synthetic plan' }]; },
    apiAnswer: async ({ config, emit }) => { calls.push({ provider: 'api', config: structuredClone(config) }); emit({ type: 'delta', text: 'Synthetic API final [L1].' }); },
    chatgptAnswer: async ({ config, emit }) => { calls.push({ provider: 'chatgpt', config: structuredClone(config) }); emit({ type: 'delta', text: 'Synthetic plan final [L1].' }); },
    ...overrides });
  const f = { runtime, auth, directory, file, calls, controls };
  t.after(async () => {
    if (f.server) { f.server.abortActive(); f.server.closeAllConnections(); await new Promise(done => f.server.close(done)); }
    await runtime.close(); f.store?.close();
    const target = resolve(directory); assert.ok(target.startsWith(base + sep) && target !== base);
    await rm(target, { recursive: true, force: true });
  });
  await runtime.initialize(); await runtime.select('chatgpt');
  return f;
}

async function httpFixture(t, options) {
  const f = await fixture(t, options), store = new AiStore(':memory:');
  const server = createAiServer({ config: f.runtime.config, content, store, runtime: f.runtime,
    fetchImpl: () => { throw Error('Live fetch forbidden in synthetic fallback tests.'); } });
  Object.assign(f, { store, server, wire: [] });
  // Capture the persisted snapshot synchronously at response.write, before the
  // browser can receive the reset. This detects reset-before-save ordering.
  server.prependListener('request', (_request, response) => {
    const write = response.write.bind(response);
    let streamedTurnId;
    response.write = (data, ...args) => {
      const line = String(data).trim();
      if (line.startsWith('{')) {
        const event = JSON.parse(line);
        if (event.type === 'accepted') streamedTurnId = event.turnId;
        f.wire.push({ event: structuredClone(event), persisted: event.type === 'reset' ? store.turn(event.turn.id)
          : event.type === 'replace' ? store.turn(streamedTurnId) : undefined });
      }
      return write(data, ...args);
    };
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  f.call = (path, body, token, headers = {}) => new Promise((resolveDone, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = httpRequest({ host: '127.0.0.1', port: server.address().port, path: `/api/ai${path}`, method: payload === null ? 'GET' : 'POST',
      headers: { host: '127.0.0.1:4176', ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
        ...(token ? { 'x-paperdesk-token': token } : {}), ...headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolveDone({ status: response.statusCode, text,
        json: response.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : undefined }));
    });
    request.on('error', reject); request.setTimeout(10000, () => request.destroy(Error('Synthetic request timeout.'))); request.end(payload);
  });
  f.token = (await f.call('/status')).json.csrfToken;
  return f;
}

test('fallback configuration defaults on, preserves false, and accepts booleans only', () => {
  assert.equal(normalizeConfig().chatgptFallbackToApi, true);
  assert.equal(normalizeConfig({ chatgptFallbackToApi: false }).chatgptFallbackToApi, false);
  for (const value of [null, 0, 1, 'true', [], {}]) assert.throws(() => normalizeConfig({ chatgptFallbackToApi: value }), PublicError);
});

test('fallback settings save independently of model availability and retain unrelated options', async t => {
  const f = await fixture(t, { listModels: async () => { throw Error('Catalog must not be consulted.'); } });
  f.auth.connected = false;
  const before = await f.runtime.getSettings(); assert.equal(before.chatgpt.fallbackToApi, true); noSecrets(before);
  const saved = await f.runtime.updateSettings({ revision: before.revision, enabled: false }, 'fallback', new AbortController().signal);
  assert.equal(saved.chatgpt.fallbackToApi, false); assert.equal(f.runtime.provider, 'chatgpt'); noSecrets(saved);
  const disk = JSON.parse(await readFile(f.file, 'utf8'));
  assert.equal(disk.chatgptFallbackToApi, false);
  for (const [key, value] of Object.entries(rawConfig())) assert.deepEqual(disk[key], value);
  await assert.rejects(f.runtime.updateSettings({ revision: before.revision, enabled: true }, 'fallback', new AbortController().signal), error => error.status === 409);
});

test('fallback HTTP settings require CSRF, exact boolean shape, and pending-login lock', async t => {
  const f = await httpFixture(t), view = await f.runtime.getSettings(), input = { revision: view.revision, enabled: false };
  assert.equal((await f.call('/settings/fallback', input)).status, 403);
  assert.equal((await f.call('/settings/fallback', input, f.token, { origin: 'https://synthetic.invalid' })).status, 403);
  for (const invalid of [null, [], {}, { ...input, enabled: 'false' }, { ...input, modelId: '' }, { revision: view.revision }])
    assert.equal((await f.call('/settings/fallback', invalid, f.token)).status, 400);
  f.auth.pending = true;
  assert.equal((await f.call('/settings/fallback', input, f.token)).status, 409);
  f.auth.pending = false; f.auth.connected = false;
  const saved = await f.call('/settings/fallback', input, f.token);
  assert.equal(saved.status, 200); assert.equal(saved.json.settings.chatgpt.fallbackToApi, false);
  assert.equal(saved.json.status.provider, 'chatgpt'); assert.equal(f.controls.lists, 0); noSecrets(saved.json);
});

test('fallbackFor permits only a typed exact usage code with enabled configured API', async t => {
  const { runtime } = await fixture(t), signal = new AbortController().signal, config = structuredClone(runtime.config);
  const selected = runtime.fallbackFor(quota(), { signal, config, stage: 'answer', fromModel: 'synthetic-plan-model' });
  assert.equal(selected.provider, 'api'); assert.equal(selected.config, config); assert.equal(selected.run, runtime.apiAnswer);
  assert.deepEqual(selected.fallback, { reason: 'subscription_quota', stage: 'answer', fromModel: 'synthetic-plan-model', previousAnswer: '', previousToolCount: 0 });
  for (const error of [otherError(), otherError('slow_down'), otherError('usage_unavailable', 503), otherError('invalid_user', 401),
    otherError('user_not_eligible', 403), otherError('chatgpt_catalog_limit', 502), Error('quota text'), { code: quota().code }])
    assert.equal(runtime.fallbackFor(error, { signal, config, stage: 'answer' }), null);
  assert.equal(runtime.fallbackFor(quota(), { signal, config: { ...config, chatgptFallbackToApi: false }, stage: 'answer' }), null);
  assert.equal(runtime.fallbackFor(quota(), { signal, config: { ...config, configured: false }, stage: 'answer' }), null);
  const aborted = new AbortController(); aborted.abort();
  assert.throws(() => runtime.fallbackFor(quota(), { signal: aborted.signal, config, stage: 'answer' }), error => error.name === 'AbortError');
});

test('catalog quota resolves the snapshot API without persisting a provider switch', async t => {
  const f = await fixture(t, { resolveModel: async () => { throw quota(); } });
  const snapshot = structuredClone(f.runtime.config);
  const selected = await f.runtime.resolve(new AbortController().signal, snapshot);
  assert.equal(selected.provider, 'api'); assert.equal(selected.config, snapshot);
  assert.deepEqual(selected.fallback, { reason: 'subscription_quota', stage: 'catalog', fromModel: null, previousAnswer: '', previousToolCount: 0 });
  assert.equal(f.runtime.provider, 'chatgpt');
  assert.deepEqual(JSON.parse(await readFile(join(f.directory, 'provider.json'), 'utf8')), { version: 1, provider: 'chatgpt' });
});

test('catalog ordinary 429, auth, network, and transport failures never select API', async t => {
  let current;
  const f = await fixture(t, { resolveModel: async () => { throw current; } });
  for (const error of [otherError(), otherError('invalid_user', 401), otherError('user_not_eligible', 403),
    otherError('chatgpt_catalog_limit', 502), new TypeError('Synthetic network failure')]) {
    current = error;
    await assert.rejects(f.runtime.resolve(new AbortController().signal), caught => caught === error);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.runtime.provider, 'chatgpt');
});

test('HTTP catalog quota creates one API turn with provenance, then next question still tries ChatGPT', async t => {
  let catalogs = 0;
  const f = await httpFixture(t, { resolveModel: async () => { if (++catalogs === 1) throw quota(); return 'synthetic-plan-model'; } });
  const input = ask(), response = await f.call('/ask', input, f.token), turn = doneTurn(response);
  assert.equal(response.status, 200); assert.equal(turn.context.provider, 'api'); assert.equal(turn.context.model, 'synthetic-api-model');
  assert.equal(turn.context.fallback.stage, 'catalog'); assert.equal(turn.context.fallback.previousAnswer, '');
  assert.equal(events(response).filter(event => event.type === 'accepted').length, 1);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].provider, 'api');
  const replay = await f.call('/ask', input, f.token); assert.deepEqual(doneTurn(replay), turn); assert.equal(catalogs, 1); assert.equal(f.calls.length, 1);
  const next = doneTurn(await f.call('/ask', ask({ conversationId: turn.conversationId }), f.token));
  assert.equal(next.context.provider, 'chatgpt'); assert.equal(next.context.fallback, undefined);
  assert.equal(f.calls.at(-1).provider, 'chatgpt'); assert.equal(catalogs, 2); assert.equal(f.runtime.provider, 'chatgpt');
  noSecrets(response.text); validateBackup(f.store.export());
});

test('answer fallback archives partial text and tools, saves before reset, and uses original history plus acquired evidence', async t => {
  let apiOptions, planCalls = 0;
  const partial = 'Synthetic incomplete plan text [L2].';
  const f = await httpFixture(t, {
    chatgptAnswer: async ({ turn, emit, persist }) => {
      if (++planCalls === 1) { emit({ type: 'delta', text: 'Synthetic previous completed answer.' }); return; }
      turn.sources.push(extraSource()); turn.context.toolEvents.push(toolEvent()); persist();
      emit({ type: 'sources', sources: turn.sources }); emit({ type: 'delta', text: partial }); throw quota();
    },
    apiAnswer: async options => { apiOptions = structuredClone({ request: options.request, prepared: options.prepared, turn: options.turn });
      options.emit({ type: 'delta', text: 'Synthetic replacement final [L1] [L2].' }); },
  });
  const previous = doneTurn(await f.call('/ask', ask({ question: 'Synthetic prior question' }), f.token));
  const input = ask({ conversationId: previous.conversationId });
  const response = await f.call('/ask', input, f.token), stream = events(response), turn = doneTurn(response);
  const reset = stream.find(event => event.type === 'reset'); assert.ok(reset);
  assert.equal(reset.turn.answer, ''); assert.equal(reset.turn.status, 'running'); assert.equal(reset.turn.context.provider, 'api');
  assert.deepEqual(reset.turn.context.fallback, { reason: 'subscription_quota', stage: 'answer', fromModel: 'synthetic-plan-model', previousAnswer: partial, previousToolCount: 1 });
  assert.equal(reset.turn.sources.length, 2); assert.deepEqual(reset.turn.context.toolEvents, [toolEvent()]);
  const wire = f.wire.find(item => item.event.type === 'reset'); assert.deepEqual(wire.persisted, reset.turn);
  assert.equal(stream.filter(event => event.type === 'accepted').length, 1); assert.equal(stream.filter(event => event.type === 'reset').length, 1);
  assert.equal(turn.id, reset.turn.id); assert.equal(turn.requestId, input.requestId); assert.equal(turn.answer, 'Synthetic replacement final [L1] [L2].');
  assert.equal(turn.context.model, 'synthetic-api-model'); assert.equal(turn.sources.length, 2); assert.deepEqual(turn.context.toolEvents, [toolEvent()]);
  assert.deepEqual(apiOptions.request, input); assert.equal(apiOptions.turn.answer, '');
  assert.deepEqual(apiOptions.prepared.history.map(item => [item.question, item.answer]), [['Synthetic prior question', 'Synthetic previous completed answer.']]);
  assert.equal(JSON.stringify(apiOptions.prepared.history).includes(partial), false);
  assert.deepEqual(apiOptions.turn.sources, turn.sources);
  assert.deepEqual(f.store.turn(turn.id), turn); assert.equal(f.runtime.provider, 'chatgpt'); noSecrets(response.text);
});

test('API failure after fallback keeps both partial answers and never attempts another provider', async t => {
  let plans = 0, apis = 0;
  const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => { plans++; emit({ type: 'delta', text: 'Synthetic plan partial.' }); throw quota(); },
    apiAnswer: async ({ emit }) => { apis++; emit({ type: 'delta', text: 'Synthetic API partial.' }); throw quota(); } });
  const input = ask(), response = await f.call('/ask', input, f.token), stream = events(response);
  assert.equal(plans, 1); assert.equal(apis, 1); assert.equal(stream.filter(event => event.type === 'reset').length, 1);
  assert.equal(stream.some(event => event.type === 'done'), false);
  const terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(terminal.status, 'interrupted'); assert.equal(terminal.answer, 'Synthetic API partial.');
  assert.equal(terminal.context.fallback.previousAnswer, 'Synthetic plan partial.'); assert.deepEqual(f.store.byRequest(input.requestId), terminal);
  assert.equal(f.runtime.provider, 'chatgpt'); validateBackup(f.store.export());
});

test('answer fallback without prior text still resets once and preserves an API error terminal', async t => {
  let apis = 0;
  const f = await httpFixture(t, { chatgptAnswer: async () => { throw quota(); }, apiAnswer: async () => { apis++; throw otherError('synthetic_api_failure', 502); } });
  const response = await f.call('/ask', ask(), f.token), stream = events(response), terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(apis, 1); assert.equal(stream.filter(event => event.type === 'reset').length, 1);
  assert.equal(terminal.status, 'error'); assert.equal(terminal.answer, ''); assert.equal(terminal.context.fallback.previousAnswer, '');
});

test('failed fallback checkpoint never resets the browser or sends an API request and retains the original partial', async t => {
  let apiCalls = 0;
  const f = await httpFixture(t, { chatgptAnswer: async ({ turn, emit }) => {
    turn.sources.push(extraSource()); turn.context.toolEvents.push(toolEvent());
    emit({ type: 'delta', text: 'Synthetic partial retained after failed checkpoint.' }); throw quota();
  }, apiAnswer: async () => { apiCalls++; } });
  const save = f.store.save.bind(f.store);
  f.store.save = turn => {
    if (turn.status === 'running' && turn.context.fallback) throw new PublicError('Synthetic checkpoint write failed.', 503);
    save(turn);
  };
  const input = ask(), response = await f.call('/ask', input, f.token), stream = events(response);
  assert.equal(apiCalls, 0); assert.equal(stream.some(event => event.type === 'reset'), false);
  const terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(terminal.status, 'interrupted'); assert.equal(terminal.context.provider, 'chatgpt');
  assert.equal(terminal.answer, 'Synthetic partial retained after failed checkpoint.'); assert.equal(terminal.context.fallback, undefined);
  assert.equal(terminal.sources.length, 2); assert.deepEqual(terminal.context.toolEvents, [toolEvent()]);
  assert.deepEqual(f.store.byRequest(input.requestId), terminal); validateBackup(f.store.export());
});

test('synthetic completed ChatGPT snapshot replaces interim text after saving, without provider fallback or another inference', async t => {
  let requests = 0, apiCalls = 0;
  const final = 'Synthetic canonical answer [L1].';
  const f = await httpFixture(t, {
    chatgptAnswer: async options => answerWithChatGpt({ ...options, auth: { getAccessToken: async () => 'SYNTHETIC_TOKEN' }, fetchImpl: async () => {
      requests++;
      const frames = [
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'synthetic-message', delta: 'Synthetic interim answer.' },
        { type: 'response.completed', response: { id: 'synthetic-response', status: 'completed', output: [
          { id: 'synthetic-message', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: final }] },
        ] } },
      ];
      return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    } }), apiAnswer: async () => { apiCalls++; },
  });
  const input = ask(), response = await f.call('/ask', input, f.token), stream = events(response), turn = doneTurn(response);
  assert.equal(requests, 1); assert.equal(apiCalls, 0); assert.equal(turn.status, 'complete'); assert.equal(turn.answer, final);
  assert.equal(turn.context.provider, 'chatgpt'); assert.equal(turn.context.fallback, undefined);
  assert.equal(stream.some(event => ['error', 'reset'].includes(event.type)), false);
  const wire = f.wire.find(item => item.event.type === 'replace');
  assert.equal(wire.event.text, final); assert.equal(wire.persisted.answer, final);
  assert.deepEqual(wire.persisted.sources, turn.sources); assert.equal(wire.persisted.context.provider, 'chatgpt');
  assert.deepEqual(f.store.byRequest(input.requestId), turn);
  const replay = await f.call('/ask', input, f.token); assert.deepEqual(doneTurn(replay), turn); assert.equal(requests, 1);
  validateBackup(f.store.export());
});

test('synthetic replacement keeps the provider turn reference, evidence and subsequent tool progress', async t => {
  const f = await httpFixture(t, { chatgptAnswer: async ({ turn, emit, persist }) => {
    emit({ type: 'delta', text: 'Synthetic provisional.' });
    emit({ type: 'replace', text: 'Synthetic corrected.' });
    assert.equal(turn.answer, 'Synthetic corrected.');
    turn.sources.push(extraSource()); turn.context.toolEvents.push(toolEvent()); persist();
    emit({ type: 'sources', sources: turn.sources }); emit({ type: 'delta', text: ' Synthetic continuation [L2].' });
  } });
  const turn = doneTurn(await f.call('/ask', ask(), f.token));
  assert.equal(turn.answer, 'Synthetic corrected. Synthetic continuation [L2].');
  assert.equal(turn.sources.length, 2); assert.equal(turn.context.toolEvents.length, 1); validateBackup(f.store.export());
});

test('synthetic failed correction checkpoint retains provisional text and never sends replace or fallback', async t => {
  let apiCalls = 0;
  const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => {
    emit({ type: 'delta', text: 'Synthetic retained provisional.' }); emit({ type: 'replace', text: 'Synthetic correction.' });
  }, apiAnswer: async () => { apiCalls++; } });
  const save = f.store.save.bind(f.store);
  f.store.save = turn => {
    if (turn.status === 'running' && turn.answer === 'Synthetic correction.') throw new PublicError('Synthetic failed correction save.', 503);
    save(turn);
  };
  const input = ask(), stream = events(await f.call('/ask', input, f.token));
  assert.equal(stream.some(event => ['replace', 'reset', 'done'].includes(event.type)), false); assert.equal(apiCalls, 0);
  const terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(terminal.answer, 'Synthetic retained provisional.'); assert.equal(terminal.status, 'interrupted');
  assert.deepEqual(f.store.byRequest(input.requestId), terminal);
});

test('synthetic over-budget or canceled replacements retain the last answer without new API requests', async t => {
  for (const mode of ['budget', 'cancel']) await t.test(mode, async t => {
    const entered = deferred(), release = deferred();
    const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => {
      emit({ type: 'delta', text: 'Synthetic retained answer.' });
      if (mode === 'cancel') { entered.resolve(); await release.promise; }
      emit({ type: 'replace', text: mode === 'budget' ? 's'.repeat(LIMITS.answerChars + 1) : 'Synthetic canceled correction.' });
    } });
    const pending = f.call('/ask', ask(), f.token);
    if (mode === 'cancel') { await entered.promise; f.server.abortActive(); release.resolve(); }
    const stream = events(await pending), terminal = stream.find(event => event.type === 'error').turn;
    assert.equal(stream.some(event => ['replace', 'reset', 'done'].includes(event.type)), false);
    assert.equal(terminal.answer, 'Synthetic retained answer.'); assert.equal(terminal.status, 'interrupted'); assert.equal(f.calls.length, 0);
  });
});

test('synthetic quota after text correction archives the corrected text in the existing fallback path', async t => {
  const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => {
    emit({ type: 'delta', text: 'Synthetic provisional.' }); emit({ type: 'replace', text: 'Synthetic corrected before quota.' }); throw quota();
  } });
  const stream = events(await f.call('/ask', ask(), f.token)), turn = stream.find(event => event.type === 'done').turn;
  assert.equal(turn.context.fallback.previousAnswer, 'Synthetic corrected before quota.');
  assert.equal(stream.filter(event => event.type === 'replace').length, 1); assert.equal(stream.filter(event => event.type === 'reset').length, 1);
  assert.equal(turn.context.provider, 'api'); assert.equal(f.calls.length, 1); validateBackup(f.store.export());
});

for (const [label, raw] of [['disabled switch', { ...rawConfig(), chatgptFallbackToApi: false }], ['unconfigured API', {}]]) {
  test(`quota never falls back with ${label}, at catalog or answer stage`, async t => {
    let stage = 'catalog', apiCalls = 0;
    const f = await httpFixture(t, { raw, resolveModel: async () => { if (stage === 'catalog') throw quota(); return 'synthetic-plan-model'; },
      chatgptAnswer: async ({ emit }) => { emit({ type: 'delta', text: 'Synthetic retained partial.' }); throw quota(); }, apiAnswer: async () => { apiCalls++; } });
    const catalog = await f.call('/ask', ask(), f.token); assert.equal(catalog.status, 429); assert.equal(f.store.export().turns.length, 0);
    stage = 'answer'; const response = await f.call('/ask', ask(), f.token), stream = events(response);
    assert.equal(stream.some(event => event.type === 'reset'), false); assert.equal(stream.find(event => event.type === 'error').turn.answer, 'Synthetic retained partial.');
    assert.equal(apiCalls, 0); assert.equal(f.runtime.provider, 'chatgpt');
  });
}

test('ordinary answer rate limit never clears partial text or calls the API', async t => {
  let apiCalls = 0;
  const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => { emit({ type: 'delta', text: 'Synthetic partial.' }); throw otherError(); },
    apiAnswer: async () => { apiCalls++; } });
  const response = await f.call('/ask', ask(), f.token), stream = events(response), terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(apiCalls, 0); assert.equal(stream.some(event => event.type === 'reset'), false);
  assert.equal(terminal.answer, 'Synthetic partial.'); assert.equal(terminal.context.provider, 'chatgpt'); assert.equal(terminal.context.fallback, undefined);
});

test('cancellation wins over a concurrent quota error and active answers lock fallback settings', async t => {
  const entered = deferred(), release = deferred(); let apiCalls = 0;
  const f = await httpFixture(t, { chatgptAnswer: async ({ emit }) => { emit({ type: 'delta', text: 'Synthetic canceled partial.' }); entered.resolve(); await release.promise; throw quota(); },
    apiAnswer: async () => { apiCalls++; } });
  const view = await f.runtime.getSettings(), pending = f.call('/ask', ask(), f.token); await entered.promise;
  try {
    assert.equal((await f.call('/settings/fallback', { revision: view.revision, enabled: false }, f.token)).status, 409);
    f.server.abortActive();
  } finally { release.resolve(); }
  const stream = events(await pending), terminal = stream.find(event => event.type === 'error').turn;
  assert.equal(apiCalls, 0); assert.equal(stream.some(event => event.type === 'reset'), false);
  assert.equal(terminal.status, 'interrupted'); assert.equal(terminal.answer, 'Synthetic canceled partial.'); assert.equal(terminal.context.fallback, undefined);
});

test('request deadline wins over a later quota failure without resetting the answer', async t => {
  let apiCalls = 0;
  const f = await httpFixture(t, { raw: { ...rawConfig(), timeoutMs: 1000 }, chatgptAnswer: async ({ signal, emit }) => {
    emit({ type: 'delta', text: 'Synthetic timed out partial.' });
    if (!signal.aborted) await new Promise(done => signal.addEventListener('abort', done, { once: true }));
    throw quota();
  }, apiAnswer: async () => { apiCalls++; } });
  const stream = events(await f.call('/ask', ask(), f.token)), terminal = stream.find(event => event.type === 'error');
  assert.equal(apiCalls, 0); assert.equal(stream.some(event => event.type === 'reset'), false);
  assert.match(terminal.message, /超时/); assert.equal(terminal.turn.status, 'interrupted'); assert.equal(terminal.turn.answer, 'Synthetic timed out partial.');
});

for (const stage of ['catalog', 'answer']) {
  test(`ask freezes API destination, key, model and fallback switch before ${stage} work`, async t => {
    const entered = deferred(), release = deferred(); let captured;
    const f = await httpFixture(t, { resolveModel: async () => {
      if (stage === 'catalog') { entered.resolve(); await release.promise; throw quota(); }
      return 'synthetic-plan-model';
    }, chatgptAnswer: async () => { entered.resolve(); await release.promise; throw quota(); },
    apiAnswer: async ({ config, emit }) => { captured = structuredClone(config); emit({ type: 'delta', text: 'Synthetic original API answer.' }); } });
    const pending = f.call('/ask', ask(), f.token); await entered.promise;
    try {
      // Simulates a settings refresh from an external file while this ask waits.
      // Mutate the existing object too: a shallow reference is not a snapshot.
      Object.assign(f.runtime.config, { baseURL: 'https://synthetic-new.invalid/v1', apiKey: 'SYNTHETIC_NEW_SECRET', modelId: 'synthetic-new-model', chatgptFallbackToApi: false });
      f.runtime.config.search.apiKey = 'SYNTHETIC_NEW_SEARCH';
    } finally { release.resolve(); }
    const turn = doneTurn(await pending); assert.ok(turn);
    assert.equal(captured.baseURL, rawConfig().baseURL); assert.equal(captured.apiKey, rawConfig().apiKey);
    assert.equal(captured.modelId, rawConfig().modelId); assert.equal(captured.chatgptFallbackToApi, true);
    assert.equal(captured.search.apiKey, rawConfig().search.apiKey); assert.equal(turn.context.model, rawConfig().modelId);
  });
}

test('fallback disabled at ask start cannot be enabled halfway through that answer', async t => {
  const entered = deferred(), release = deferred(); let apiCalls = 0;
  const f = await httpFixture(t, { raw: { ...rawConfig(), chatgptFallbackToApi: false }, chatgptAnswer: async () => { entered.resolve(); await release.promise; throw quota(); },
    apiAnswer: async () => { apiCalls++; } });
  const pending = f.call('/ask', ask(), f.token); await entered.promise;
  f.runtime.config.chatgptFallbackToApi = true; release.resolve();
  const stream = events(await pending); assert.equal(apiCalls, 0); assert.equal(stream.some(event => event.type === 'reset'), false);
  assert.equal(stream.find(event => event.type === 'error').turn.context.fallback, undefined);
});

test('fallback backup v2 retains all evidence and imports into SQLite layout v2', async t => {
  const f = await httpFixture(t, { chatgptAnswer: async ({ turn, emit }) => { turn.sources.push(extraSource()); turn.context.toolEvents.push(toolEvent()); emit({ type: 'delta', text: 'Synthetic archived partial.' }); throw quota(); } });
  const turn = doneTurn(await f.call('/ask', ask(), f.token)), backup = f.store.export();
  assert.equal(backup.schemaVersion, 2); validateBackup(backup); noSecrets(backup);
  const restored = new AiStore(':memory:'); t.after(() => restored.close());
  assert.deepEqual(restored.import(backup), { conversations: 1, turns: 1 });
  assert.equal(restored.db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.deepEqual(restored.turn(turn.id), turn); assert.deepEqual(restored.export().turns, backup.turns);
  assert.equal(restored.export().turns[0].context.fallback.previousAnswer, 'Synthetic archived partial.');
  assert.deepEqual(restored.export().turns[0].context.toolEvents, [toolEvent()]); assert.equal(restored.export().turns[0].sources.length, 2);
});

test('legacy backup v1 imports without invented provider metadata and exports as v2', async t => {
  const f = await httpFixture(t), turn = doneTurn(await f.call('/ask', ask(), f.token)), old = f.store.export();
  old.schemaVersion = 1; delete old.turns[0].context.provider; delete old.turns[0].context.fallback;
  validateBackup(old);
  const restored = new AiStore(':memory:'); t.after(() => restored.close()); restored.import(old);
  const upgraded = restored.export(); assert.equal(upgraded.schemaVersion, 2);
  assert.deepEqual(upgraded.turns, old.turns); assert.equal(restored.turn(turn.id).context.provider, undefined);
  assert.equal(restored.db.prepare('PRAGMA user_version').get().user_version, 2); validateBackup(upgraded);
});

test('backup rejects malformed provider/fallback metadata without importing partial records', async t => {
  const f = await httpFixture(t, { chatgptAnswer: async () => { throw quota(); } });
  await f.call('/ask', ask(), f.token); const valid = f.store.export();
  const mutations = [
    context => { context.provider = 'unknown'; },
    context => { context.fallback.reason = 'rate_limit'; },
    context => { context.fallback.stage = 'network'; },
    context => { context.fallback.fromModel = 42; },
    context => { context.fallback.fromModel = ''; },
    context => { context.provider = 'chatgpt'; },
    context => { context.fallback.previousAnswer = 'x'.repeat(LIMITS.answerChars + 1); },
    context => { context.fallback.previousToolCount = -1; },
    context => { context.fallback.previousToolCount = 1.5; },
    context => { context.fallback.previousToolCount = context.toolEvents.length + 1; },
    context => { context.fallback.stage = 'catalog'; context.fallback.previousAnswer = 'Synthetic unexpected catalog partial.'; },
    context => { context.fallback.extra = true; },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(valid); mutate(malformed.turns[0].context);
    assert.throws(() => validateContext(malformed.turns[0].context), PublicError);
    const restored = new AiStore(':memory:');
    try { assert.throws(() => restored.import(malformed), PublicError); assert.equal(restored.export().turns.length, 0); }
    finally { restored.close(); }
  }
});

function completion(delta, finishReason) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}

test('API retry spends only the remaining shared tool budget and receives acquired sources, never archived partial text', async () => {
  const input = ask(), prepared = content.prepare(input, [], normalizeConfig(rawConfig()));
  const turn = { answer: '', sources: [...prepared.sources, extraSource()], context: { ...prepared.context,
    toolEvents: Array.from({ length: LIMITS.toolCalls - 3 }, toolEvent), provider: 'api',
    fallback: { reason: 'subscription_quota', stage: 'answer', fromModel: 'synthetic-plan-model', previousAnswer: 'SYNTHETIC_ARCHIVED_PARTIAL', previousToolCount: LIMITS.toolCalls - 3 } } };
  const bodies = []; let localCalls = 0;
  await answer({ config: normalizeConfig(rawConfig()), content: { runLocal() { localCalls++; return { scope: 'Synthetic final tool result' }; } },
    prepared, request: input, turn, signal: new AbortController().signal, emit(event) { if (event.type === 'delta') turn.answer += event.text; }, persist() {},
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); bodies.push(body);
      if (bodies.length === 1) return completion({ tool_calls: Array.from({ length: 3 }, (_, index) => ({ index, id: `synthetic-tool-${index}`, type: 'function', function: { name: 'search_library', arguments: '{"query":"synthetic"}' } })) }, 'tool_calls');
      assert.equal(bodies.length, 2); return completion({ content: 'Synthetic final answer [L2].' }, 'stop');
    } });
  assert.ok(bodies[0].tools?.length); assert.equal(bodies[1].tools, undefined); assert.equal(localCalls, 3);
  assert.equal(turn.context.toolEvents.length, LIMITS.toolCalls);
  assert.ok(bodies[0].messages.some(message => String(message.content).includes('Synthetic acquired evidence.')));
  assert.equal(JSON.stringify(bodies).includes('SYNTHETIC_ARCHIVED_PARTIAL'), false);
});

test('exhausted shared tool budget prevents a fallback model from requesting more tools', async () => {
  const input = ask(), prepared = content.prepare(input, [], normalizeConfig(rawConfig())), turn = {
    answer: '', sources: prepared.sources, context: { ...prepared.context, toolEvents: Array.from({ length: LIMITS.toolCalls }, toolEvent) } };
  let localCalls = 0, requests = 0;
  await assert.rejects(answer({ config: normalizeConfig(rawConfig()), content: { runLocal() { localCalls++; } }, prepared, request: input, turn,
    signal: new AbortController().signal, emit() {}, persist() {}, fetchImpl: async (_url, options) => {
      requests++; assert.equal(JSON.parse(options.body).tools, undefined);
      return completion({ tool_calls: [{ index: 0, id: 'synthetic-forbidden', type: 'function', function: { name: 'search_library', arguments: '{"query":"synthetic"}' } }] }, 'tool_calls');
    } }), error => error instanceof PublicError && /预算/.test(error.message));
  assert.equal(requests, 1); assert.equal(localCalls, 0); assert.equal(turn.context.toolEvents.length, LIMITS.toolCalls);
});
