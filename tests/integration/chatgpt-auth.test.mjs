// All identities, tokens, files and OAuth responses in this suite are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { ChatGptAuth } from '../../server/ai/providers/chatgpt/auth.mjs';
import { ChatGptStorage } from '../../server/ai/providers/chatgpt/storage.mjs';

const origin = 'https://auth.openai.com', resource = 'https://api.openai.com/v1';
const keys = await generateKeyPair('RS256'), otherKeys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
const discovery = { issuer: origin, authorization_endpoint: `${origin}/api/accounts/authorize`, token_endpoint: `${origin}/api/accounts/oauth/token`, revocation_endpoint: `${origin}/api/accounts/oauth/revoke`, jwks_uri: `${origin}/.well-known/jwks.json`, id_token_signing_alg_values_supported: ['RS256'] };
class MemoryStorage {
  async initialize() {}
  async read() { return this.value ? structuredClone(this.value) : null; }
  async write(value) { this.value = structuredClone(value); }
}

for (const sample of [
  { name: '403 HTML rejection', reply: () => new Response('<!doctype html><html>SYNTHETIC_PRIVATE_DETAIL</html>', { status: 403, headers: { 'content-type': 'text/html' } }), code: 'oauth_html_response', status: 502, message: /授权配置.*HTTP 403.*HTML/ },
  { name: '403 JSON rejection', reply: () => Response.json({ detail: 'SYNTHETIC_PRIVATE_DETAIL' }, { status: 403 }), code: 'oauth_http_error', status: 502, message: /授权配置.*HTTP 403/ },
  { name: '429 rate limit', reply: () => Response.json({ error: 'SYNTHETIC_PRIVATE_DETAIL' }, { status: 429 }), code: 'oauth_http_error', status: 429, message: /HTTP 429/ },
  { name: '503 upstream failure', reply: () => Response.json({ error: 'SYNTHETIC_PRIVATE_DETAIL' }, { status: 503 }), code: 'oauth_http_error', status: 503, message: /HTTP 503/ },
  { name: 'explicit browser challenge', reply: () => new Response('SYNTHETIC_PRIVATE_DETAIL', { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } }), code: 'oauth_html_challenge', status: 502, message: /浏览器验证页面/ },
  { name: 'HTML with misleading JSON media type', reply: () => new Response('<html>SYNTHETIC_PRIVATE_DETAIL</html>', { headers: { 'content-type': 'application/json' } }), code: 'oauth_html_response', status: 502, message: /HTTP 200.*HTML/ },
  { name: 'non-JSON media type', reply: () => new Response('SYNTHETIC_PRIVATE_DETAIL', { headers: { 'content-type': 'text/plain' } }), code: 'oauth_content_type', status: 502, message: /非 JSON 类型/ },
  { name: 'malformed JSON', reply: () => new Response('{SYNTHETIC_PRIVATE_DETAIL', { headers: { 'content-type': 'application/json' } }), code: 'oauth_invalid_json', status: 502, message: /不是有效 JSON/ },
  { name: 'empty response', reply: () => new Response(null, { status: 204 }), code: 'oauth_empty_response', status: 502, message: /空响应/ },
  { name: 'array JSON schema', reply: () => Response.json(['SYNTHETIC_PRIVATE_DETAIL']), code: 'oauth_json_schema', status: 502, message: /结构不符合协议/ },
  { name: 'wrong issuer schema', reply: () => Response.json({ ...discovery, issuer: 'https://synthetic.invalid' }), code: 'oauth_discovery_schema', status: 502, message: /不符合 OIDC 协议/ },
  { name: 'untrusted endpoint schema', reply: () => Response.json({ ...discovery, token_endpoint: 'https://synthetic.invalid/token' }), code: 'oauth_discovery_schema', status: 502, message: /不允许的服务地址/ },
  { name: 'string instead of algorithm array', reply: () => Response.json({ ...discovery, id_token_signing_alg_values_supported: 'RS256' }), code: 'oauth_discovery_schema', status: 502, message: /不符合 OIDC 协议/ },
  { name: 'network failure', reply: () => { throw Error('SYNTHETIC_PRIVATE_DETAIL'); }, code: 'oauth_network_error', status: 503, message: /网络、DNS 与 TLS/ },
  { name: 'interrupted body', reply: () => new Response(new ReadableStream({ start(controller) { controller.error(Error('SYNTHETIC_PRIVATE_DETAIL')); } }), { headers: { 'content-type': 'application/json' } }), code: 'oauth_response_interrupted', status: 502, message: /连接中断/ },
  { name: 'oversized body', reply: () => new Response('x'.repeat(512 * 1024 + 1), { headers: { 'content-type': 'application/json' } }), code: 'oauth_response_size', status: 502, message: /大小限制/ },
]) {
  test(`synthetic discovery distinguishes ${sample.name} without exposing provider details or starting login`, async t => {
    let requests = 0;
    const auth = new ChatGptAuth({ storage: new MemoryStorage(), fetchImpl: async (url, options) => {
      requests++; assert.equal(url, `${origin}/.well-known/openid-configuration`);
      assert.equal(new Headers(options.headers).get('accept'), 'application/json'); assert.equal(options.redirect, 'error');
      return sample.reply();
    } });
    t.after(() => auth.close());
    await assert.rejects(auth.beginLogin(), error => {
      assert.equal(error.code, sample.code); assert.equal(error.status, sample.status); assert.match(error.message, sample.message);
      assert.equal(error.message.includes('SYNTHETIC_PRIVATE_DETAIL'), false); return true;
    });
    assert.equal(requests, 1); assert.equal(auth.status().pending, false); assert.equal(auth.status().connected, false);
    assert.equal(auth.state.registrations.length, 0); assert.equal(auth.discoveryPromise, null);
    assert.equal(auth.status().error.includes('SYNTHETIC_PRIVATE_DETAIL'), false);
  });
}

test('synthetic failed discovery can be deliberately retried and does not cache rejected metadata', async t => {
  let denied = true;
  const auth = new ChatGptAuth({ storage: new MemoryStorage(), fetchImpl: async () => denied
    ? new Response('<html>SYNTHETIC BLOCK</html>', { status: 403, headers: { 'content-type': 'text/html' } }) : Response.json(discovery) });
  t.after(() => auth.close());
  await assert.rejects(auth.beginLogin(), error => error.code === 'oauth_html_response');
  denied = false; const login = await auth.beginLogin();
  assert.equal(new URL(login.authorizationUrl).origin, origin); assert.equal(auth.status().pending, true); assert.equal(auth.status().error, undefined);
});

test('synthetic cancellation while reading authorization JSON remains distinguishable', async t => {
  const auth = new ChatGptAuth({ storage: new MemoryStorage(), fetchImpl: async () => new Response(new ReadableStream(), { headers: { 'content-type': 'application/json' } }) });
  t.after(() => auth.close()); const controller = new AbortController();
  const response = await auth.remote(`${origin}/.well-known/openid-configuration`, { signal: controller.signal });
  const pending = auth.json(response, { stage: '授权配置' }); controller.abort();
  await assert.rejects(pending, error => error.code === 'oauth_cancelled' && error.status === 409);
});

test('synthetic network timeout is distinguished from a rejected HTTP response', async t => {
  t.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('SYNTHETIC_TIMEOUT', 'TimeoutError')));
  const auth = new ChatGptAuth({ storage: new MemoryStorage(), fetchImpl: async (_url, options) => { options.signal.throwIfAborted(); } });
  t.after(() => auth.close());
  await assert.rejects(auth.beginLogin(), error => error.code === 'oauth_timeout' && error.status === 504 && /授权配置超时/.test(error.message));
  assert.equal(auth.status().pending, false);
});

test('synthetic stalled authorization body obeys the same network deadline', async t => {
  const timeout = new AbortController(); t.mock.method(AbortSignal, 'timeout', () => timeout.signal);
  const auth = new ChatGptAuth({ storage: new MemoryStorage(), fetchImpl: async () => new Response(new ReadableStream(), { headers: { 'content-type': 'application/json' } }) });
  t.after(() => auth.close());
  const response = await auth.remote(`${origin}/.well-known/openid-configuration`);
  const pending = auth.json(response, { stage: '授权配置' }); timeout.abort();
  await assert.rejects(pending, error => error.code === 'oauth_timeout' && error.status === 504);
});

async function fixture(options = {}) {
  let time = Date.now(), calls = 0, revoked = 0;
  const storage = options.storage ?? new MemoryStorage();
  const controls = { nonce: '', subject: 'synthetic-subject', overrides: {}, signKey: keys.privateKey, refreshError: null, jwksDown: false, refreshWait: null, revocationStatus: 200, newKey: false, identityOnly: false };
  async function idToken(refresh) {
    return new SignJWT({ sub: controls.subject, ...(!refresh ? { nonce: controls.nonce } : {}), ...controls.overrides })
      .setProtectedHeader({ alg: 'RS256', kid: controls.newKey ? 'synthetic-key-rotated' : jwk.kid })
      .setIssuer(controls.overrides.iss ?? origin).setAudience(controls.overrides.aud ?? 'oaiapp_synthetic')
      .setIssuedAt(controls.overrides.iat ?? Math.floor(time / 1000)).setExpirationTime(controls.overrides.exp ?? Math.floor(time / 1000) + 3600)
      .sign(controls.signKey);
  }
  const requests = [];
  const fetchImpl = async (url, request = {}) => {
    assert.equal(request.redirect, 'error'); requests.push({ url: String(url), body: request.body ? new URLSearchParams(request.body) : null });
    if (url.endsWith('openid-configuration')) return Response.json(discovery);
    if (url.endsWith('jwks.json')) return controls.jwksDown ? Response.json({}, { status: 503 }) : Response.json({ keys: [{ ...jwk, kid: controls.newKey ? 'synthetic-key-rotated' : jwk.kid }] });
    if (url.endsWith('/oauth/revoke')) { revoked++; return new Response('', { status: controls.revocationStatus }); }
    assert.equal(String(url), discovery.token_endpoint);
    const form = new URLSearchParams(request.body), refresh = form.get('grant_type') === 'refresh_token';
    assert.equal(form.get('client_id'), 'oaiapp_synthetic'); assert.equal(form.get('resource'), resource);
    if (refresh) { calls++; if (controls.refreshWait) await controls.refreshWait; if (controls.refreshError) return Response.json({ error: controls.refreshError }, { status: controls.refreshError === 'invalid_grant' ? 400 : 503 }); }
    if (controls.identityOnly) return Response.json({ id_token: await idToken(refresh), scope: 'openid profile email' });
    return Response.json({ access_token: `SYNTHETIC_ACCESS_${calls}`, refresh_token: `SYNTHETIC_REFRESH_${calls}`, id_token: await idToken(refresh), token_type: 'Bearer', expires_in: 3600,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', earliest_refresh_at: Math.floor(time / 1000) });
  };
  const auth = new ChatGptAuth({ storage, fetchImpl, now: () => time, ...options });
  await auth.initialize();
  return { auth, storage, controls, requests, fetchImpl, advance: delta => { time += delta; }, now: () => time, calls: () => calls, revoked: () => revoked };
}
function callback(url) {
  return new Promise((resolveResult, reject) => { const request = get(url, response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolveResult({ status: response.statusCode, body })); }); request.on('error', reject); request.setTimeout(10000, () => request.destroy(Error('synthetic callback timed out'))); });
}
async function begin(f) {
  const login = await f.auth.beginLogin(); const url = new URL(login.authorizationUrl);
  f.controls.nonce = url.searchParams.get('nonce');
  const target = new URL(url.searchParams.get('redirect_uri'));
  target.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'SYNTHETIC_CODE', client_id: 'oaiapp_synthetic' }).toString();
  return { login, url, target };
}
async function connect(f) { const flow = await begin(f); assert.equal((await callback(flow.target)).status, 200); return flow; }

test('synthetic PKCE registration, one-time state, stable host and server-only credentials', async t => {
  const f = await fixture(); t.after(() => f.auth.close());
  assert.equal(f.auth.status().needsLogin, false);
  const flow = await begin(f);
  assert.equal(flow.url.origin, origin); assert.equal(flow.url.searchParams.get('client_id'), 'dynamic_agent_client'); assert.equal(flow.url.searchParams.get('agent_name_hint'), 'PaperDesk');
  assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(flow.target.hostname, '127.0.0.1'); assert.equal(flow.target.pathname, '/auth/callback');
  const wrong = new URL(flow.target); wrong.searchParams.set('state', 'SYNTHETIC_WRONG');
  assert.equal((await callback(wrong)).status, 400); assert.equal(f.auth.status().pending, true); assert.equal(f.requests.filter(item => item.url.endsWith('/oauth/token')).length, 0);
  assert.equal((await callback(flow.target)).status, 200);
  assert.equal(await f.auth.getAccessToken(), 'SYNTHETIC_ACCESS_0');
  const safe = JSON.stringify(f.auth.status()); assert.equal(safe.includes('SYNTHETIC_'), false); assert.equal(safe.includes('oaiapp_'), false); assert.equal(safe.includes('urn:uuid'), false);
  const repeat = await begin(f); assert.equal(repeat.url.searchParams.get('client_id'), 'oaiapp_synthetic'); assert.equal(repeat.url.searchParams.has('agent_name_hint'), false); assert.equal(repeat.url.searchParams.has('id_token_hint'), false);
  assert.equal(repeat.url.searchParams.has('prompt'), false);
  assert.equal(repeat.url.searchParams.get('ext_agent_host_id'), flow.url.searchParams.get('ext_agent_host_id'));
  await f.auth.cancelLogin(); assert.equal(f.auth.status().pending, false); assert.equal(f.auth.status().connected, true);
});

test('synthetic identity-only login requests consent when the reader explicitly reconnects', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); f.controls.identityOnly = true;
  await connect(f); assert.equal(f.auth.status().connected, true); assert.equal(f.auth.status().planEnabled, false);
  await assert.rejects(f.auth.getAccessToken(), error => error.status === 403);
  const retry = await begin(f);
  assert.equal(retry.url.searchParams.get('client_id'), 'oaiapp_synthetic');
  assert.equal(retry.url.searchParams.get('prompt'), 'consent');
  assert.ok(retry.url.searchParams.get('scope').split(' ').includes('chatgpt.tokens.use.direct'));
  f.controls.identityOnly = false; assert.equal((await callback(retry.target)).status, 200);
  assert.equal(await f.auth.getAccessToken(), 'SYNTHETIC_ACCESS_0');
});

test('synthetic invalid JWT signature, issuer, audience, nonce, expiry and future issuance are rejected', async t => {
  for (const invalid of [{ signKey: otherKeys.privateKey }, { overrides: { iss: 'https://synthetic.invalid' } }, { overrides: { aud: 'oaiapp_wrong' } }, { overrides: { nonce: 'SYNTHETIC_WRONG' } }, { overrides: { exp: 1 } }, { overrides: { iat: 9999999999 } }]) {
    const f = await fixture(); t.after(() => f.auth.close()); Object.assign(f.controls, invalid);
    const flow = await begin(f); assert.equal((await callback(flow.target)).status, 400); assert.equal(f.auth.status().connected, false);
    assert.equal(f.storage.value.registrations[0].tokens, null);
  }
});

test('synthetic returning account mismatch preserves the verified existing session', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f);
  f.controls.subject = 'synthetic-other-subject'; const flow = await begin(f);
  assert.equal((await callback(flow.target)).status, 400); assert.equal(await f.auth.getAccessToken(), 'SYNTHETIC_ACCESS_0');
  assert.equal(f.storage.value.registrations[0].subject, 'synthetic-subject');
});

test('synthetic refresh rotates once for simultaneous callers and survives restart', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000);
  assert.deepEqual(await Promise.all([f.auth.getAccessToken(), f.auth.getAccessToken(), f.auth.getAccessToken()]), Array(3).fill('SYNTHETIC_ACCESS_1'));
  assert.equal(f.calls(), 1); assert.equal(f.storage.value.registrations[0].tokens.refreshToken, 'SYNTHETIC_REFRESH_1');
  await f.auth.close(); const next = new ChatGptAuth({ storage: f.storage, fetchImpl: f.fetchImpl, now: f.now }); t.after(() => next.close()); await next.initialize();
  assert.equal(await next.getAccessToken(), 'SYNTHETIC_ACCESS_1'); assert.equal(f.calls(), 1);
});

test('synthetic JWKS outage preserves quarantined rotation and resumes verification without refreshing twice', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000); f.controls.newKey = true; f.controls.jwksDown = true;
  await assert.rejects(f.auth.getAccessToken(), error => error.status === 503);
  assert.equal(f.calls(), 1); assert.ok(f.storage.value.registrations[0].pendingRotation);
  f.controls.jwksDown = false; assert.equal(await f.auth.getAccessToken(), 'SYNTHETIC_ACCESS_1'); assert.equal(f.calls(), 1);
  assert.equal(f.storage.value.registrations[0].pendingRotation, null);
});

test('synthetic quarantine write failure retains rotation in memory and retries persistence without refreshing twice', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000);
  const write = f.storage.write.bind(f.storage); let failNext = true;
  f.storage.write = async value => {
    if (failNext && value.registrations[0].pendingRotation) { failNext = false; throw Error('SYNTHETIC_DISK_FAILURE'); }
    await write(value);
  };
  await assert.rejects(f.auth.getAccessToken(), error => error.status === 503);
  assert.equal(f.calls(), 1); assert.equal(f.storage.value.registrations[0].pendingRotation, null);
  assert.ok(f.auth.current().pendingRotation);
  assert.equal(await f.auth.getAccessToken(), 'SYNTHETIC_ACCESS_1'); assert.equal(f.calls(), 1);
  assert.equal(f.storage.value.registrations[0].tokens.refreshToken, 'SYNTHETIC_REFRESH_1');
});

test('synthetic transient refresh error preserves tokens; terminal invalid_grant clears only tokens', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000);
  f.controls.refreshError = 'server_error'; await assert.rejects(f.auth.getAccessToken(), error => error.status === 503); assert.ok(f.storage.value.registrations[0].tokens);
  f.controls.refreshError = 'invalid_grant'; await assert.rejects(f.auth.getAccessToken(), error => error.status === 401);
  assert.equal(f.auth.status().needsLogin, true); assert.equal(f.storage.value.registrations[0].tokens, null);
  const flow = await begin(f); assert.equal(flow.url.searchParams.get('client_id'), 'oaiapp_synthetic');
});

test('synthetic unexpected HTML 401 during refresh preserves existing credentials', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000);
  const original = f.auth.fetchImpl;
  f.auth.fetchImpl = (url, options) => url.endsWith('/oauth/token')
    ? Promise.resolve(new Response('<html>SYNTHETIC ACCESS DENIED</html>', { status: 401, headers: { 'content-type': 'text/html' } }))
    : original(url, options);
  await assert.rejects(f.auth.getAccessToken(), error => error.code === 'oauth_html_response' && /登录续期.*HTTP 401/.test(error.message));
  assert.ok(f.storage.value.registrations[0].tokens); assert.equal(f.auth.status().needsLogin, false);
});

test('synthetic disconnect waits for rotation, revokes latest token, and preserves registration', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); await connect(f); f.advance(3550000);
  let release; f.controls.refreshWait = new Promise(resolve => { release = resolve; });
  const access = f.auth.getAccessToken(); const rejected = assert.rejects(access, error => error.status === 409);
  await new Promise(resolve => setTimeout(resolve, 10)); const disconnect = f.auth.disconnect(); release();
  assert.equal((await disconnect).revocationConfirmed, true); await rejected;
  const revoke = f.requests.find(item => item.url.endsWith('/oauth/revoke')); assert.equal(revoke.body.get('token'), 'SYNTHETIC_REFRESH_1');
  assert.equal(f.storage.value.registrations[0].tokens, null); assert.equal(f.storage.value.registrations[0].clientId, 'oaiapp_synthetic');
});

test('synthetic expired/cancelled callbacks do not exchange a code', async t => {
  const f = await fixture(); t.after(() => f.auth.close()); const flow = await begin(f); f.advance(600001);
  assert.equal((await callback(flow.target)).status, 400); assert.equal(f.auth.status().pending, false);
  assert.equal(f.requests.filter(item => item.url.endsWith('/oauth/token')).length, 0);
});

test('synthetic storage failure leaves safe status and refuses login without resetting credentials', async () => {
  let writes = 0;
  const auth = new ChatGptAuth({ storage: { initialize: async () => {}, read: async () => { throw Error('SYNTHETIC_PRIVATE_DETAIL'); }, write: async () => { writes++; } } });
  await auth.initialize(); assert.equal(auth.status().connected, false); assert.match(auth.status().error, /凭据存储不可用/); assert.equal(auth.status().error.includes('SYNTHETIC'), false);
  await assert.rejects(auth.beginLogin()); assert.equal(writes, 0); await auth.close();
});

test('synthetic Windows DPAPI storage encrypts bytes and round-trips atomically', { skip: process.platform !== 'win32' }, async () => {
  const base = resolve('.cache/test-workspaces'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'chatgpt-dpapi-synthetic-'));
  const storage = new ChatGptStorage(directory); await storage.initialize();
  const record = { fixture: 'SYNTHETIC ONLY', accessToken: 'SYNTHETIC_NEVER_LOG_TOKEN' };
  await storage.write(record); assert.equal((await readFile(storage.file, 'utf8')).includes(record.accessToken), false);
  assert.deepEqual(await storage.read(), record); await storage.write({ ...record, refreshed: true }); assert.equal((await storage.read()).refreshed, true);
});
