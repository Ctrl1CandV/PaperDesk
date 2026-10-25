// Explicit launcher smoke test. Copies only public project inputs; credentials,
// configuration and private records in the working project are never read.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer, get } from 'node:http';
import { cp, copyFile, mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = join(project, '.cache', 'test-workspaces');
const evidenceFile = join(project, '.cache', 'test-results', 'launcher-oauth-smoke.json');
const results = [];
const pause = ms => new Promise(resolveDone => setTimeout(resolveDone, ms));

function listen(server, port) {
  return new Promise((resolveDone, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveDone);
  });
}
async function closeServer(server) {
  if (!server.listening) return;
  const closed = new Promise(resolveDone => server.close(resolveDone));
  server.closeAllConnections(); await closed;
}
async function assertFree(port) {
  const server = createServer();
  try { await listen(server, port); }
  catch { throw Error(`Required test port ${port} is occupied; the existing service was preserved.`); }
  finally { await closeServer(server); }
}
async function assertEventuallyFree(port) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try { await assertFree(port); return; } catch { await pause(100); }
  }
  throw Error(`Owned test service did not release port ${port}.`);
}
function request(port, path) {
  return new Promise((resolveDone, reject) => {
    const req = get({ hostname: '127.0.0.1', port, path, agent: false }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk.toString('utf8'); });
      response.once('end', () => resolveDone({ status: response.statusCode, body }));
    });
    req.once('error', reject); req.setTimeout(2500, () => req.destroy(Error('Synthetic local request timed out.')));
  });
}
async function fixture(label) {
  await mkdir(workspace, { recursive: true });
  const directory = await mkdtemp(join(workspace, `launcher-oauth-synthetic-${label}-`));
  for (const folder of ['scripts', 'server']) {
    await mkdir(join(directory, folder), { recursive: true });
    for (const entry of await readdir(join(project, folder), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.mjs')) await copyFile(join(project, folder, entry.name), join(directory, folder, entry.name));
    }
  }
  for (const folder of ['content', 'schemas', 'dist']) await cp(join(project, folder), join(directory, folder), { recursive: true, errorOnExist: true });
  for (const file of ['package.json', 'vite.config.ts']) await copyFile(join(project, file), join(directory, file));
  // Blank synthetic configuration: no OAuth action or model request is made.
  await writeFile(join(directory, 'server', 'config.local.json'), JSON.stringify({ baseURL: 'https://api.openai.com/v1', apiKey: '', modelId: '', chatgptModelId: '', toolsEnabled: true, maxOutputTokens: 3000, timeoutMs: 120000, search: { apiKey: '' } }));
  return directory;
}
function start(directory) {
  const child = fork(join(directory, 'scripts', 'start-local.mjs'), ['--mode', 'preview', '--port', '4174', '--no-open'], {
    cwd: directory, execArgv: [], windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '', errorOutput = '';
  child.stdout.on('data', chunk => { output = (output + chunk.toString('utf8')).slice(-10000); });
  child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk.toString('utf8')).slice(-10000); });
  const exit = new Promise(resolveDone => {
    child.once('error', () => resolveDone({ code: -1 }));
    child.once('exit', (code, signal) => resolveDone({ code, signal }));
  });
  return { child, exit, ready: () => output.includes('网站与本机 AI 服务已就绪'), failure: () => /AI 后端.*(失败|退出)/u.test(errorOutput) };
}
async function waitForReady(processInfo) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (processInfo.ready()) return;
    if (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null) throw Error('Synthetic launcher exited before ready.');
    await pause(100);
  }
  throw Error('Synthetic launcher did not become ready in 20 seconds.');
}
async function waitForExit(processInfo, timeoutMs) {
  let timer;
  try {
    return await Promise.race([processInfo.exit, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Synthetic launcher exit timed out.')), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}
async function stop(processInfo) {
  if (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null) return;
  if (processInfo.child.connected) processInfo.child.send('paperdesk:shutdown');
  try { await waitForExit(processInfo, 65000); }
  catch { processInfo.child.kill(); await waitForExit(processInfo, 5000); throw Error('Owned synthetic launcher required forced cleanup.'); }
}
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

async function main() {
  await assertFree(4174); await assertFree(4176);

  const normal = await fixture('ready'), first = start(normal), normalAt = Date.now();
  try {
    await waitForReady(first);
    assert.equal((await request(4174, '/library')).status, 200, 'Synthetic preview serves the library.');
    assert.equal((await request(4174, '/api/ai/status')).status, 503, 'Test-origin API isolation remains active.');
    const response = await request(4176, '/api/ai/status'), status = JSON.parse(response.body);
    assert.equal(response.status, 200); assert.equal(status.configured, false); assert.equal(status.provider, 'api');
    assert.deepEqual(status.chatgpt, { connected: false, loginPending: false, needsLogin: false, fallbackToApi: true,
      availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } });
    const credentialFile = process.platform === 'win32' ? 'credentials.dpapi.json' : 'credentials.json';
    assert.equal(await exists(join(normal, 'private', 'ai', 'chatgpt', credentialFile)), true, 'Fresh auth storage initialized in the synthetic copy.');
    first.child.send('paperdesk:shutdown');
    assert.equal((await waitForExit(first, 10000)).code, 0, 'IPC shutdown exits cleanly.');
    await assertEventuallyFree(4174); await assertEventuallyFree(4176);
    results.push({ check: 'fresh-auth-ready-and-ipc-shutdown', passed: true, durationMs: Date.now() - normalAt, fixture: relative(project, normal).replaceAll('\\', '/') });
  } finally { await stop(first); }

  const corrupted = await fixture('corrupt');
  await mkdir(join(corrupted, 'private', 'ai'), { recursive: true });
  await writeFile(join(corrupted, 'private', 'ai', 'provider.json'), '{SYNTHETIC_INVALID_PROVIDER');
  const second = start(corrupted), failureAt = Date.now();
  try {
    assert.equal((await waitForExit(second, 10000)).code, 1, 'Malformed synthetic provider data fails quickly.');
    assert.equal(second.ready(), false); assert.equal(second.failure(), true);
    assert.equal(await exists(join(corrupted, 'private', 'ai', 'paperdesk.sqlite')), false, 'Failed initialization does not open the conversation database.');
    await assertEventuallyFree(4174); await assertEventuallyFree(4176);
    results.push({ check: 'async-provider-failure-cleanup', passed: true, durationMs: Date.now() - failureAt, fixture: relative(project, corrupted).replaceAll('\\', '/') });
  } finally { await stop(second); }

  const occupied = await fixture('occupied');
  const held = createServer((_request, response) => { response.end('SYNTHETIC_EXISTING_SERVICE'); });
  await listen(held, 4176);
  const third = start(occupied), occupiedAt = Date.now();
  try {
    assert.equal((await waitForExit(third, 10000)).code, 1, 'Occupied AI port fails quickly.');
    assert.equal(third.ready(), false); assert.equal((await request(4176, '/')).body, 'SYNTHETIC_EXISTING_SERVICE');
    assert.equal(await exists(join(occupied, 'private', 'ai')), false, 'Duplicate launch does not initialize or recover private state.');
    await assertEventuallyFree(4174);
    results.push({ check: 'occupied-ai-port-preserves-existing-service', passed: true, durationMs: Date.now() - occupiedAt, fixture: relative(project, occupied).replaceAll('\\', '/') });
  } finally { await stop(third); await closeServer(held); }
  await assertEventuallyFree(4174); await assertEventuallyFree(4176);
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, JSON.stringify({ schemaVersion: 1, syntheticOnly: true, command: 'node tests/launcher-synthetic.mjs', autoOpenTested: false, oauthNetworkUsed: false, checks: results }, null, 2) + '\n');
  for (const result of results) console.log(`PASS ${result.check} (${result.durationMs} ms)`);
  console.log('PASS 3 synthetic launcher checks; owned ports released; no real OAuth, credentials or records used.');
}

main().catch(error => { console.error(error instanceof assert.AssertionError ? 'FAIL synthetic launcher assertion.' : error.message); process.exitCode = 1; });
