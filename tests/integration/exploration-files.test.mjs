import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readdir, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExplorationFileStore } from '../../server/storage/exploration-files.mjs';
import { createExplorationSyncHandler } from '../../server/http/exploration-sync.mjs';
import { canonicalExplorationSync, explorationRevisionData, explorationRevisionHash } from '../../shared/exploration-sync.mjs';
import { emptyResearchState } from '../../shared/research-contract.mjs';
import { appendNotebookVersion } from '../../shared/research-notebook.mjs';

// Isolated, clearly synthetic records. Never reads the normal project workspace.
const boundary = resolve('.cache/test-workspaces');
async function fixture(t, options) {
  await mkdir(boundary, { recursive: true }); const directory = await mkdtemp(join(boundary, 'exploration-files-'));
  t.after(async () => { const absolute = resolve(directory); assert.ok(absolute.startsWith(boundary + sep)); await rm(absolute, { recursive: true, force: true }); });
  return { directory, store: new ExplorationFileStore(join(directory, 'explorations'), options) };
}
function record(id = randomUUID(), text = 'SYNTHETIC initial question') {
  return { id, title: 'SYNTHETIC topic', question: text, origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', nextAction: null, evidence: [], recordRevision: 1, createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', research: { ...emptyResearchState(), notebook: appendNotebookVersion(undefined, 'SYNTHETIC original notebook', { createdAt: '2026-11-02T00:00:00.000Z' }), relatedGuides: [{ guideId: 'synthetic-guide', revision: 2 }], readingAssignmentReceipts: [{ batchId: 'synthetic-batch', collectionId: 'synthetic-topic' }] } };
}

test('synthetic complete exploration roundtrip retains notebooks and explicit links without creating files on reads', async t => {
  const { store } = await fixture(t); assert.deepEqual((await store.read()).explorations, []);
  await assert.rejects(stat(store.directory), { code: 'ENOENT' });
  const source = record(), first = await store.write({ explorationId: source.id, parents: [], record: source });
  assert.deepEqual(first.heads[0].record, source);
  const clone = new ExplorationFileStore(store.directory);
  assert.deepEqual((await clone.read()).explorations, [first]);
  const retry = await clone.write({ explorationId: source.id, parents: [], record: source }); assert.deepEqual(retry, first);
  assert.equal((await readdir(join(store.directory, source.id))).length, 1);
  const saved = JSON.parse(await readFile(join(store.directory, source.id, first.heads[0].hash + '.json'), 'utf8'));
  assert.equal(saved.format, 'paperdesk-exploration-revision'); assert.deepEqual(saved.record.research, source.research);
});

test('synthetic competing writers use head CAS and leave immutable history; deletion never selects an older live record', async t => {
  const { store } = await fixture(t), source = record();
  const other = new ExplorationFileStore(store.directory);
  const attempts = await Promise.allSettled([store.write({ explorationId: source.id, parents: [], record: source }), other.write({ explorationId: source.id, parents: [], record: { ...source, question: 'SYNTHETIC competing text' } })]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  const failed = attempts.find(item => item.status === 'rejected'); assert.equal(failed.reason.code, 'workspace_conflict');
  const first = (await store.read()).explorations[0];
  const deletion = await store.write({ explorationId: source.id, parents: first.heads.map(item => item.hash), record: null });
  assert.equal(deletion.heads[0].record, null);
  assert.deepEqual(deletion.revisionHashes, [first.heads[0].hash, deletion.heads[0].hash].sort());
  await assert.rejects(other.write({ explorationId: source.id, parents: first.heads.map(item => item.hash), record: source }), error => error.code === 'workspace_conflict');
  assert.equal((await store.read()).explorations[0].heads[0].record, null);
  assert.equal((await readdir(join(store.directory, source.id))).length, 2);
});

test('synthetic Git branches preserve both heads and require explicit all-head merge', async t => {
  const { store } = await fixture(t), source = record();
  const base = await store.write({ explorationId: source.id, parents: [], record: source });
  const left = await store.write({ explorationId: source.id, parents: base.heads.map(item => item.hash), record: { ...source, question: 'SYNTHETIC left branch' } });
  // Simulate a second checkout commit arriving via Git; no timestamp ranking.
  const right = explorationRevisionData({ explorationId: source.id, parents: base.heads.map(item => item.hash), record: { ...source, question: 'SYNTHETIC right branch' } });
  const hash = await explorationRevisionHash(right); await writeFile(join(store.directory, source.id, hash + '.json'), canonicalExplorationSync(right));
  const entry = (await store.read()).explorations[0]; assert.equal(entry.heads.length, 2);
  assert.deepEqual(new Set(entry.heads.map(item => item.record.question)), new Set(['SYNTHETIC left branch', 'SYNTHETIC right branch']));
  await assert.rejects(store.write({ explorationId: source.id, parents: left.heads.map(item => item.hash), record: source }), error => error.status === 409);
  const merged = await store.write({ explorationId: source.id, parents: entry.heads.map(item => item.hash), record: { ...source, question: 'SYNTHETIC explicit merged result' } });
  assert.equal(merged.heads.length, 1); assert.equal(merged.heads[0].parents.length, 2);
  assert.deepEqual(merged.revisionHashes, [base.heads[0].hash, left.heads[0].hash, hash, merged.heads[0].hash].sort());
  assert.equal((await readdir(join(store.directory, source.id))).length, 4);
});

test('synthetic branch checkout exposes missing former head membership instead of pretending it is current', async t => {
  const { store } = await fixture(t), source = record();
  const a = await store.write({ explorationId: source.id, parents: [], record: source });
  const b = await store.write({ explorationId: source.id, parents: a.heads.map(item => item.hash), record: { ...source, question: 'SYNTHETIC newer browser baseline' } });
  assert.ok(b.revisionHashes.includes(a.heads[0].hash));
  await rm(join(store.directory, source.id, b.heads[0].hash + '.json'));
  const olderCheckout = (await store.read()).explorations[0];
  assert.deepEqual(olderCheckout.revisionHashes, [a.heads[0].hash]);
  assert.ok(!olderCheckout.revisionHashes.includes(b.heads[0].hash), 'client can reject importing this ancestor over its baseline');
});

test('synthetic validation rejects extra fields, invalid research, traversal, corruption and missing parents', async t => {
  const { store } = await fixture(t), source = record();
  for (const value of [{ explorationId: '../outside', parents: [], record: null }, { explorationId: source.id, parents: [], record: { ...source, apiKey: 'SYNTHETIC excluded field' } }, { explorationId: source.id, parents: [], record: { ...source, research: { ...source.research, notebook: { versions: [] } } } }]) await assert.rejects(store.write(value), error => error.code === 'workspace_invalid');
  const first = await store.write({ explorationId: source.id, parents: [], record: source }), path = join(store.directory, source.id, first.heads[0].hash + '.json');
  const original = await readFile(path, 'utf8'); await writeFile(path, original.replace('SYNTHETIC initial question', 'SYNTHETIC corrupt question'));
  await assert.rejects(store.read(), error => error.code === 'workspace_invalid_files'); await writeFile(path, original);
  const dangling = explorationRevisionData({ explorationId: source.id, parents: ['c'.repeat(64)], record: null });
  await writeFile(join(store.directory, source.id, await explorationRevisionHash(dangling) + '.json'), canonicalExplorationSync(dangling));
  await assert.rejects(store.read(), error => error.code === 'workspace_invalid_files');
});

test('synthetic workspace capacity errors retain all previously saved files', async t => {
  const { store } = await fixture(t, { maxFiles: 1 }), source = record();
  const first = await store.write({ explorationId: source.id, parents: [], record: source });
  await assert.rejects(store.write({ explorationId: source.id, parents: first.heads.map(item => item.hash), record: null }), error => error.code === 'workspace_capacity');
  assert.deepEqual((await store.read()).explorations, [first]);
});

test('synthetic linked workspace directories are rejected before reading or writing', async t => {
  const { directory } = await fixture(t), outside = join(directory, 'other'), linked = join(directory, 'linked'); await mkdir(outside);
  try { await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Directory links unavailable in this test environment'); return; } throw error; }
  const store = new ExplorationFileStore(join(linked, 'explorations'));
  await assert.rejects(store.read(), error => error.code === 'workspace_invalid_files');
  await assert.rejects(store.write({ explorationId: randomUUID(), parents: [], record: null }), error => error.code === 'workspace_invalid_files');
  assert.deepEqual(await readdir(outside), []);
});

test('synthetic HTTP adapter exposes only the workspace protocol and safe error messages', async t => {
  const { store } = await fixture(t), handler = createExplorationSyncHandler({ store }), outputs = [];
  const context = { json: (_response, status, value) => outputs.push({ status, value }), readJson: async () => ({ explorationId: '../outside', parents: [], record: null }) };
  assert.equal(await handler({ url: '/api/workspace/other', method: 'GET' }, {}, context), false);
  assert.equal(await handler({ url: '/api/workspace/explorations', method: 'GET' }, {}, context), true);
  assert.equal(outputs.at(-1).status, 200);
  await handler({ url: '/api/workspace/explorations', method: 'POST' }, {}, context);
  assert.deepEqual(outputs.at(-1), { status: 400, value: { code: 'workspace_invalid', message: '探索内容未通过完整性校验，项目文件未改写。' } });
});
