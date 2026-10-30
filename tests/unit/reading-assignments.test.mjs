import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consumeReadingAssignments, planReadingAssignments, validateReadingAssignments } from '../../shared/reading-assignments.mjs';

// Entirely synthetic records. Public topic labels below exercise shipped delivery metadata.
const batch = { id: 'synthetic-delivery-1', collectionId: 'synthetic-collection', titleAliases: ['Synthetic Direction'], guides: [{ guideId: 'synthetic-guide', revision: 1 }] };
const manifest = { batches: [batch], activeBatchIds: [batch.id] };
const record = (overrides = {}) => ({ id: 'synthetic-direction', title: 'Synthetic Direction', question: 'Synthetic test-only question', status: 'inbox', recordRevision: 1, evidence: [], ...overrides });

test('delivery uses a unique exact alias, pins versions and preserves existing research', () => {
  const prior = record({ research: { scope: 'Synthetic scope', relatedGuides: [{ guideId: 'synthetic-guide', revision: 2 }] } });
  const plan = planReadingAssignments([prior], manifest);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].record.research.scope, 'Synthetic scope');
  assert.deepEqual(plan.updates[0].record.research.relatedGuides, prior.research.relatedGuides);
  assert.deepEqual(plan.updates[0].record.research.readingAssignmentReceipts, [{ batchId: batch.id, collectionId: batch.collectionId }]);
  assert.equal(planReadingAssignments([record({ title: 'About Synthetic Direction' })], manifest).updates.length, 0);
  assert.equal(planReadingAssignments([record({ title: '  SYNTHETIC   Direction  ' })], manifest).updates.length, 1);
});

test('consumed delivery stays removed manually; renamed direction receives only later batches', () => {
  const saved = planReadingAssignments([record()], manifest).updates[0].record;
  saved.research.relatedGuides = [];
  saved.title = 'Synthetic new title';
  assert.equal(planReadingAssignments([saved], manifest).updates.length, 0);
  const later = { ...batch, id: 'synthetic-delivery-2', guides: [{ guideId: 'synthetic-next-guide', revision: 3 }] };
  const plan = planReadingAssignments([saved], { batches: [batch, later], activeBatchIds: [batch.id, later.id] });
  assert.deepEqual(plan.updates[0].record.research.relatedGuides, later.guides);
  assert.equal(plan.updates[0].record.research.readingAssignmentReceipts.length, 2);
});

test('ambiguous aliases, duplicate bindings, archived topics and inactive batches never write', () => {
  assert.equal(planReadingAssignments([record(), record({ id: 'synthetic-second' })], manifest).issues[0].reason, 'ambiguous');
  const saved = planReadingAssignments([record()], manifest).updates[0].record;
  const later = { ...manifest, batches: [{ ...batch, id: 'synthetic-next-batch' }], activeBatchIds: ['synthetic-next-batch'] };
  assert.equal(planReadingAssignments([saved, { ...saved, id: 'synthetic-copy', title: 'Synthetic copied title' }], later).issues[0].reason, 'ambiguous');
  assert.equal(planReadingAssignments([record({ status: 'archived' })], manifest).updates.length, 0);
  assert.equal(planReadingAssignments([record()], { ...manifest, activeBatchIds: [] }).updates.length, 0);
});

test('missing revisions and capacity fail the whole batch without consuming a receipt', () => {
  assert.equal(planReadingAssignments([record()], manifest, () => false).issues[0].reason, 'unavailable');
  const full = record({ research: { relatedGuides: Array.from({ length: 50 }, (_, i) => ({ guideId: `synthetic-${i}`, revision: 1 })) } });
  const plan = planReadingAssignments([full], manifest);
  assert.equal(plan.updates.length, 0); assert.equal(plan.issues[0].reason, 'capacity');
});

test('delivery retries a stale revision against current user edits, then becomes a no-op', async () => {
  let current = record(), calls = 0;
  const options = { manifest, list: async () => [structuredClone(current)], save: async (value, expected) => {
    calls++;
    if (calls === 1) { current = { ...current, question: 'Synthetic concurrent user edit', recordRevision: 2 }; throw Object.assign(new Error('Synthetic conflict'), { name: 'ConflictError' }); }
    assert.equal(expected, current.recordRevision);
    current = { ...value, recordRevision: expected + 1 };
  } };
  assert.equal((await consumeReadingAssignments(options)).saved, 1);
  assert.equal(current.question, 'Synthetic concurrent user edit');
  assert.equal((await consumeReadingAssignments(options)).saved, 0);
  assert.equal(calls, 2);
});

test('invalid manifest and unavailable pinned targets are rejected', () => {
  assert.throws(() => validateReadingAssignments({ ...manifest, activeBatchIds: ['missing'] }), /selection/);
  assert.throws(() => validateReadingAssignments({ ...manifest, batches: [batch, batch] }), /identity/);
  assert.throws(() => validateReadingAssignments(manifest, () => false), /unavailable/);
  assert.throws(() => validateReadingAssignments({ ...manifest, batches: [{ ...batch, privateQuestion: 'Synthetic forbidden field' }] }), /identity/);
});

test('public delivery metadata supplies two surveys and three papers to each matching synthetic direction', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../content/catalog.json', import.meta.url), 'utf8'));
  const plan = planReadingAssignments([
    record({ title: 'Muti-Agent Communication' }),
    record({ id: 'synthetic-evaluation', title: 'Agent/Modle Evaluation' }),
  ], catalog.readingAssignments, (id, revision) => catalog.entries.some(entry => entry.guideId === id && entry.revision === revision));
  assert.equal(plan.updates.length, 2);
  for (const update of plan.updates) {
    assert.equal(update.record.research.relatedGuides.length, 5);
    const types = await Promise.all(update.record.research.relatedGuides.map(async ref => {
      const entry = catalog.entries.find(entry => entry.guideId === ref.guideId && entry.revision === ref.revision);
      return JSON.parse(await readFile(new URL(`../../content/${entry.metadataFile}`, import.meta.url), 'utf8')).type;
    }));
    assert.equal(types.filter(type => type === 'survey').length, 2);
    assert.equal(types.filter(type => type !== 'survey').length, 3);
  }
});
