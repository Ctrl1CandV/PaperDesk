import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { canonicalExplorationSync, explorationRevisionData, explorationRevisionHash, validateExplorationRevision, validateExplorationWorkspace } from '../../shared/exploration-sync.mjs';

// Synthetic data only; no existing browser records or local credentials.
test('synthetic exploration revisions have canonical portable hashes and explicit tombstones', async () => {
  const id = randomUUID(), input = { explorationId: id, parents: [], record: { id, question: 'SYNTHETIC question', title: 'SYNTHETIC topic' } };
  const revision = explorationRevisionData(input), hash = await explorationRevisionHash(revision);
  assert.equal(hash, createHash('sha256').update(canonicalExplorationSync(revision)).digest('hex'));
  assert.equal(hash, await explorationRevisionHash({ ...revision, record: { title: 'SYNTHETIC topic', id, question: 'SYNTHETIC question' } }));
  const deletion = explorationRevisionData({ explorationId: id, parents: [hash], record: null });
  assert.notEqual(await explorationRevisionHash(deletion), hash);
  assert.equal(deletion.record, null);
  const deletedHash = await explorationRevisionHash(deletion);
  assert.equal(validateExplorationWorkspace({ format: 'paperdesk-exploration-workspace', schemaVersion: 1, explorations: [{ explorationId: id, heads: [{ hash: deletedHash, parents: [hash], record: null }], revisionHashes: [hash, deletedHash].sort() }] }).explorations.length, 1);
});

test('synthetic revision and workspace validators reject path identities, duplicate parents and unknown fields', () => {
  const id = randomUUID(), base = explorationRevisionData({ explorationId: id, parents: [], record: { id } }), parent = 'a'.repeat(64);
  for (const value of [{ ...base, explorationId: '../outside' }, { ...base, record: { id: randomUUID() } }, { ...base, parents: [parent, parent] }, { ...base, parents: ['b'.repeat(64), parent] }, { ...base, credentials: 'SYNTHETIC not allowed' }, { ...base, format: 'unsupported' }]) assert.throws(() => validateExplorationRevision(value));
  assert.throws(() => validateExplorationWorkspace({ format: 'paperdesk-exploration-workspace', schemaVersion: 1, explorations: [{ explorationId: id, heads: [], revisionHashes: [] }] }));
  assert.throws(() => validateExplorationWorkspace({ format: 'paperdesk-exploration-workspace', schemaVersion: 1, explorations: [{ explorationId: id, heads: [{ hash: parent, parents: [], record: null }], revisionHashes: ['b'.repeat(64)] }] }));
});
