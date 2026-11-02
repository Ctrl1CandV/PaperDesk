import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { createAiServer } from '../../server/http/server.mjs';

test('synthetic workspace API works without model configuration and enforces origin/token isolation', async () => {
  const cache = resolve('.cache/test-workspaces'); await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'workspace-http-'));
  const server = createAiServer({ config: {}, content: {}, store: null, workspaceDirectory: join(directory, 'explorations') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const call = (path, { method = 'GET', token, host = '127.0.0.1:4173', origin = 'http://127.0.0.1:4173', body } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: { host, origin, ...(token ? { 'x-paperdesk-token': token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
    }); req.on('error', reject); req.end(body && JSON.stringify(body));
  });
  try {
    const status = await call('/api/workspace/status'); assert.equal(status.status, 200); assert.equal(typeof status.data.csrfToken, 'string');
    assert.equal((await call('/api/workspace/explorations')).status, 403);
    assert.equal((await call('/api/workspace/status', { origin: 'https://example.invalid' })).status, 403);
    assert.equal((await call('/api/workspace/status', { host: '127.0.0.1:4174', origin: 'http://127.0.0.1:4174' })).status, 403);
    const token = status.data.csrfToken;
    const read = await call('/api/workspace/explorations', { token }); assert.equal(read.status, 200); assert.deepEqual(read.data.explorations, []);
    const record = { id: '11111111-1111-4111-8111-111111111111', title: 'SYNTHETIC transfer', question: 'SYNTHETIC retained question', origin: 'reader', status: 'inbox', interpretation: '', unknowns: '', evidence: [], nextAction: null, recordRevision: 1, createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' };
    const saved = await call('/api/workspace/explorations', { method: 'POST', token, body: { explorationId: record.id, parents: [], record } });
    assert.equal(saved.status, 200); assert.deepEqual(saved.data.heads[0].record, record);
    assert.equal((await call('/api/workspace/explorations', { method: 'POST', token, body: { explorationId: record.id, parents: [], record: { ...record, title: 'SYNTHETIC stale write' } } })).status, 409);
    assert.equal((await call('/api/workspace/explorations', { token, origin: 'http://127.0.0.1:4174' })).status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
