// Synthetic resolvers, processes and local HTTP only. No system proxy lookup,
// inherited environment, real credentials, private files or public requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { EnvHttpProxyAgent } from 'undici';
import { createBackendNetwork, resolveWindowsSystemProxy } from '../server/network.mjs';
import { PublicError } from '../server/validation.mjs';

function dispatcher(kind, value) { return { kind, value, closed: 0, destroyed: 0, async close() { this.closed++; }, async destroy() { this.destroyed++; } }; }
function fixture(t, options = {}) {
  const calls = [], resolutions = [], created = [];
  const make = (kind, value) => { const item = dispatcher(kind, value); created.push(item); return item; };
  const network = createBackendNetwork({ platform: 'win32', env: {},
    fetchImpl: async (input, init) => { calls.push({ input, init }); return new Response('synthetic'); },
    resolveSystemProxy: async url => { resolutions.push(url); return { proxy: null }; },
    createDirectDispatcher: () => make('direct'), createProxyDispatcher: uri => make('proxy', uri),
    createEnvDispatcher: settings => make('environment', settings), ...options });
  t.after(() => network.close());
  return { network, calls, resolutions, created };
}
function safeRoutingError(error) {
  assert.ok(error instanceof PublicError); assert.equal(error.status, 503);
  assert.match(error.message, /系统代理/); assert.equal(error.message.includes('SYNTHETIC_SECRET'), false); return true;
}

test('synthetic Windows resolves the complete URL and honors system DIRECT', async t => {
  const f = fixture(t); const url = 'https://synthetic.invalid/full/path?route=one';
  const response = await f.network.fetch(url, { redirect: 'follow', dispatcher: 'SYNTHETIC_OVERRIDE' });
  assert.equal(await response.text(), 'synthetic'); assert.deepEqual(f.resolutions, [url]);
  assert.equal(f.calls[0].init.dispatcher.kind, 'direct'); assert.equal(f.calls[0].init.redirect, 'error');
});

test('synthetic HTTP and HTTPS system proxies need no fixed local address or port', async t => {
  const routes = ['http://synthetic-proxy.invalid:8787/', 'https://synthetic-secure-proxy.invalid/'];
  const f = fixture(t, { resolveSystemProxy: async () => ({ proxy: routes.shift() }) });
  await f.network.fetch('https://synthetic.invalid/one'); await f.network.fetch('https://synthetic.invalid/two');
  assert.deepEqual(f.calls.map(call => call.init.dispatcher.value), ['http://synthetic-proxy.invalid:8787/', 'https://synthetic-secure-proxy.invalid/']);
});

test('synthetic loopback bypasses system resolution and inherited proxies', async t => {
  const f = fixture(t, { env: { HTTPS_PROXY: 'http://synthetic-proxy.invalid:8181' }, resolveSystemProxy: () => { throw Error('must not resolve'); } });
  for (const url of ['http://localhost:4176/a', 'http://localhost.:4176/a', 'http://127.0.0.1:4176', 'http://127.3.2.1:4176', 'http://[::1]:4176']) await f.network.fetch(url);
  assert.equal(f.created.length, 1); assert.equal(f.created[0].kind, 'direct');
});

test('synthetic explicit environment proxy has priority and preserves NO_PROXY without mutation', async t => {
  const env = Object.freeze({ HTTP_PROXY: 'http://synthetic-upper.invalid:8080', http_proxy: 'http://synthetic-lower.invalid:8081',
    Https_Proxy: 'https://synthetic-secure.invalid', no_proxy: 'synthetic-bypass.invalid,localhost' });
  const f = fixture(t, { env, resolveSystemProxy: () => { throw Error('must not resolve'); } });
  await f.network.fetch('https://synthetic.invalid/request');
  assert.deepEqual(f.created[0].value, { httpProxy: 'http://synthetic-lower.invalid:8081/', httpsProxy: 'https://synthetic-secure.invalid/', noProxy: 'synthetic-bypass.invalid,localhost' });
  assert.equal(env.http_proxy, 'http://synthetic-lower.invalid:8081');
});

test('synthetic omitted environment fields are explicit empty strings, avoiding ambient fallback', async t => {
  const f = fixture(t, { env: { HTTPS_PROXY: 'http://synthetic-proxy.invalid:8080' } });
  await f.network.fetch('https://synthetic.invalid');
  assert.deepEqual(f.created[0].value, { httpProxy: '', httpsProxy: 'http://synthetic-proxy.invalid:8080/', noProxy: '' });
});

test('synthetic non-Windows direct or TUN routing never resolves Windows settings', async t => {
  for (const platform of ['linux', 'darwin']) {
    const f = fixture(t, { platform, resolveSystemProxy: () => { throw Error('must not resolve'); } });
    await f.network.fetch('https://synthetic.invalid'); assert.equal(f.calls[0].init.dispatcher.kind, 'direct');
  }
});

test('synthetic PAC paths and changed rules are evaluated afresh for every URL', async t => {
  const urls = [], results = [{ proxy: 'http://synthetic-proxy.invalid:8080' }, { proxy: null }, { proxy: null }];
  const f = fixture(t, { resolveSystemProxy: async url => { urls.push(url); return results.shift(); } });
  for (const path of ['/one?route=a', '/two?route=b', '/one?route=a']) await f.network.fetch(`https://synthetic.invalid${path}`);
  assert.deepEqual(urls, ['https://synthetic.invalid/one?route=a', 'https://synthetic.invalid/two?route=b', 'https://synthetic.invalid/one?route=a']);
  assert.deepEqual(f.calls.map(call => call.init.dispatcher.kind), ['proxy', 'direct', 'direct']);
});

test('synthetic failed, malformed or credentialed system result never becomes DIRECT', async t => {
  for (const result of [null, undefined, [], {}, { proxy: null, extra: 'SYNTHETIC_SECRET' }, { proxy: 42 },
    { proxy: 'socks5://synthetic.invalid:1080' }, { proxy: 'http://user:SYNTHETIC_SECRET@synthetic.invalid' },
    { proxy: 'http://synthetic.invalid/path' }, { proxy: 'http://synthetic.invalid/?SYNTHETIC_SECRET' }, { proxy: 'http://synthetic.invalid/#SYNTHETIC_SECRET' }]) {
    const f = fixture(t, { resolveSystemProxy: async () => result });
    await assert.rejects(f.network.fetch('https://synthetic.invalid'), safeRoutingError); assert.equal(f.calls.length, 0);
  }
  const f = fixture(t, { resolveSystemProxy: async () => { throw Error('SYNTHETIC_SECRET'); } });
  await assert.rejects(f.network.fetch('https://synthetic.invalid'), safeRoutingError); assert.equal(f.calls.length, 0);
});

test('synthetic invalid inherited proxy fails without system lookup or fallback', async t => {
  const f = fixture(t, { env: { HTTPS_PROXY: 'http://SYNTHETIC_SECRET@synthetic.invalid' } });
  await assert.rejects(f.network.fetch('https://synthetic.invalid'), safeRoutingError);
  assert.equal(f.calls.length, 0); assert.equal(f.resolutions.length, 0);
});

test('synthetic invalid destinations are rejected before resolution', async t => {
  const f = fixture(t);
  for (const url of ['file:///synthetic', 'data:text/plain,synthetic', 'https://user:SYNTHETIC_SECRET@synthetic.invalid']) await assert.rejects(f.network.fetch(url), safeRoutingError);
  assert.equal(f.resolutions.length, 0); assert.equal(f.calls.length, 0);
});

test('synthetic cancellation stops pending resolution before an upstream request', async t => {
  let resolverSignal, started; const ready = new Promise(resolve => { started = resolve; });
  const f = fixture(t, { resolveSystemProxy: (_url, { signal }) => { resolverSignal = signal; started(); return new Promise(() => {}); } });
  const controller = new AbortController(), pending = f.network.fetch('https://synthetic.invalid', { signal: controller.signal });
  await ready; controller.abort(); await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(resolverSignal.aborted, true); assert.equal(f.calls.length, 0);
});

test('synthetic Request signal and already-canceled calls cannot start network work', async t => {
  const f = fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.network.fetch(new Request('https://synthetic.invalid', { signal: controller.signal })), error => error.name === 'AbortError');
  assert.equal(f.calls.length, 0); assert.equal(f.resolutions.length, 0);
  let spawned = 0;
  assert.throws(() => resolveWindowsSystemProxy('https://synthetic.invalid', { signal: controller.signal, spawnImpl: () => { spawned++; } }), error => error.name === 'AbortError');
  assert.equal(spawned, 0);
});

test('synthetic close aborts resolution, destroys dispatchers and is idempotent', async t => {
  let resolverSignal;
  const f = fixture(t, { resolveSystemProxy: (_url, { signal }) => { resolverSignal = signal; return new Promise(() => {}); } });
  await f.network.fetch('http://127.0.0.1:4176');
  const pending = f.network.fetch('https://synthetic.invalid');
  const rejected = assert.rejects(pending, error => error instanceof PublicError && /已关闭/.test(error.message));
  const first = f.network.close(), second = f.network.close(); assert.equal(first, second);
  await first; await rejected; assert.equal(resolverSignal.aborted, true); assert.equal(f.created[0].destroyed, 1);
  await assert.rejects(f.network.fetch('http://127.0.0.1:4176'), /已关闭/);
});

test('synthetic caller abort and network close remain effective after response headers', async t => {
  const f = fixture(t), controller = new AbortController();
  await f.network.fetch('http://localhost:4176', { signal: controller.signal });
  controller.abort(); assert.equal(f.calls[0].init.signal.aborted, true);
  await f.network.fetch('http://localhost:4176'); await f.network.close(); assert.equal(f.calls[1].init.signal.aborted, true);
});

test('synthetic failed POST is not replayed and the next request resolves its route again', async t => {
  let resolved = 0, posted = 0;
  const f = fixture(t, { resolveSystemProxy: async () => { resolved++; return { proxy: null }; }, fetchImpl: async () => { posted++; throw Error('synthetic unavailable'); } });
  for (let i = 0; i < 2; i++) await assert.rejects(f.network.fetch('https://synthetic.invalid/token', { method: 'POST', body: 'synthetic-body' }));
  assert.equal(posted, 2); assert.equal(resolved, 2);
});

test('synthetic proxy dispatcher cache is bounded and eviction closes gracefully', async t => {
  let index = 0, finishFirst; const created = [];
  const f = fixture(t, { resolveSystemProxy: async () => ({ proxy: `http://synthetic-${index++}.invalid:8080` }),
    createProxyDispatcher: uri => { const item = dispatcher('proxy', uri); if (!created.length) item.close = () => { item.closed++; return new Promise(resolve => { finishFirst = resolve; }); }; created.push(item); return item; } });
  for (let i = 0; i < 17; i++) await f.network.fetch('https://synthetic.invalid');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(created[0].closed, 1); assert.equal(created[0].destroyed, 0);
  finishFirst(); await new Promise(resolve => setImmediate(resolve)); await f.network.close();
  assert.equal(created[0].destroyed, 0); assert.equal(created.slice(1).every(item => item.destroyed === 1), true);
});

function syntheticProcess(output, exitCode = 0, { hang = false } = {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.killed = 0; let input = '';
  child.stdin.on('data', part => { input += part; });
  child.kill = () => { child.killed++; queueMicrotask(() => child.emit('close', 1)); return true; };
  child.stdin.on('finish', () => { if (!hang) queueMicrotask(() => { child.stdout.write(output); child.emit('close', exitCode); }); });
  return { child, input: () => input };
}

test('synthetic Windows helper uses a fixed hidden command and URL-only stdin', async () => {
  const f = syntheticProcess('{"proxy":"http://synthetic-proxy.invalid:8080/"}'); let invocation;
  const result = await resolveWindowsSystemProxy('https://synthetic.invalid/path?rule=one', { spawnImpl: (...args) => { invocation = args; return f.child; } });
  assert.deepEqual(result, { proxy: 'http://synthetic-proxy.invalid:8080/' });
  assert.equal(invocation[0], 'powershell.exe'); assert.deepEqual(invocation[1].slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(invocation[1].some(value => value.includes('https://synthetic.invalid')), false);
  assert.deepEqual(invocation[2], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
  assert.equal(f.input(), 'https://synthetic.invalid/path?rule=one');
  assert.match(invocation[1][3], /GetSystemWebProxy/); assert.match(invocation[1][3], /\$null -eq \$resolved/); assert.match(invocation[1][3], /\.Equals\(\$destination\)/);
});

test('synthetic helper accepts explicit DIRECT and rejects null, failure and oversized output', async () => {
  assert.deepEqual(await resolveWindowsSystemProxy('https://synthetic.invalid', { spawnImpl: () => syntheticProcess('{"proxy":null}').child }), { proxy: null });
  for (const [output, exitCode] of [['null', 0], ['{SYNTHETIC_SECRET', 0], ['{"proxy":null}', 1], ['x'.repeat(8193), 0]]) {
    const f = syntheticProcess(output, exitCode);
    await assert.rejects(resolveWindowsSystemProxy('https://synthetic.invalid', { spawnImpl: () => f.child }), safeRoutingError); assert.equal(f.child.killed, 1);
  }
});

test('synthetic helper cancellation and timeout terminate only its own process', async () => {
  const controller = new AbortController(), canceled = syntheticProcess('', 0, { hang: true });
  const pending = resolveWindowsSystemProxy('https://synthetic.invalid', { signal: controller.signal, spawnImpl: () => canceled.child });
  controller.abort(); await assert.rejects(pending, error => error.name === 'AbortError'); assert.equal(canceled.child.killed, 1);
  const timed = syntheticProcess('', 0, { hang: true });
  await assert.rejects(resolveWindowsSystemProxy('https://synthetic.invalid', { timeoutMs: 10, spawnImpl: () => timed.child }), safeRoutingError); assert.equal(timed.child.killed, 1);
});

test('synthetic helper spawn and stdin failures stay sanitized', async () => {
  await assert.rejects(resolveWindowsSystemProxy('https://synthetic.invalid', { spawnImpl: () => { throw Error('SYNTHETIC_SECRET'); } }), safeRoutingError);
  const f = syntheticProcess('', 0, { hang: true }); const pending = resolveWindowsSystemProxy('https://synthetic.invalid', { spawnImpl: () => f.child });
  f.child.stdin.emit('error', Error('SYNTHETIC_SECRET')); await assert.rejects(pending, safeRoutingError);
});

test('synthetic real fetch uses the local proxy, streams and bypasses loopback', { timeout: 20000 }, async t => {
  const sockets = new Set(), destinations = [], paths = [];
  const target = createServer((req, res) => { paths.push(req.url); res.writeHead(200, { 'content-type': 'text/plain', connection: 'close' }); res.write('synthetic-'); setTimeout(() => res.end('stream'), 5); });
  const proxy = createServer((_req, res) => { res.writeHead(500); res.end(); }); let network, inherited;
  t.after(async () => { await network?.close(); await inherited?.close(); for (const socket of sockets) socket.destroy(); await Promise.all([target, proxy].map(server => new Promise(done => server.close(() => done())))); });
  for (const server of [target, proxy]) server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  proxy.on('connect', (req, socket, head) => {
    destinations.push(req.url); if (req.url !== 'synthetic-proxy.invalid:80') { socket.destroy(); return; }
    const upstream = connect(target.address().port, '127.0.0.1'); sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
    upstream.once('connect', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket); });
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening'); let resolved = 0;
  network = createBackendNetwork({ platform: 'win32', env: {}, resolveSystemProxy: async () => { resolved++; return { proxy: `http://127.0.0.1:${proxy.address().port}` }; } });
  assert.equal(await (await network.fetch('http://synthetic-proxy.invalid/proxied', { signal: AbortSignal.timeout(4000) })).text(), 'synthetic-stream');
  assert.equal(await (await network.fetch(`http://127.0.0.1:${target.address().port}/direct`, { signal: AbortSignal.timeout(4000) })).text(), 'synthetic-stream');
  assert.equal(resolved, 1); assert.deepEqual(destinations, ['synthetic-proxy.invalid:80']); assert.deepEqual(paths, ['/proxied', '/direct']);
  inherited = createBackendNetwork({ platform: 'win32', env: { HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, NO_PROXY: 'synthetic-direct.invalid' },
    resolveSystemProxy: () => { throw Error('Environment route must not query the system'); },
    createEnvDispatcher: options => new EnvHttpProxyAgent({ ...options, connect: { lookup: (_host, options, callback) => {
      if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }]); else callback(null, '127.0.0.1', 4);
    } } }) });
  assert.equal(await (await inherited.fetch('http://synthetic-proxy.invalid/env-proxy', { signal: AbortSignal.timeout(4000) })).text(), 'synthetic-stream');
  assert.equal(await (await inherited.fetch(`http://synthetic-direct.invalid:${target.address().port}/env-bypass`, { signal: AbortSignal.timeout(4000) })).text(), 'synthetic-stream');
  assert.deepEqual(destinations, ['synthetic-proxy.invalid:80', 'synthetic-proxy.invalid:80']);
  assert.deepEqual(paths, ['/proxied', '/direct', '/env-proxy', '/env-bypass']);
});
