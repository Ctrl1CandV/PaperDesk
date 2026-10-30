import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResearchSnapshot, emptyResearchState, validateResearchState, verifyResearchSnapshot, validateRelatedGuides } from '../../shared/research-contract.mjs';
import { prepareAssistantContext, assembleAssistantContext } from '../../server/ai/research.mjs';

// Synthetic associations only; no real reading marks or private notes.
const record = research => ({ id: randomUUID(), recordRevision: 1, title: 'SYNTHETIC', question: 'SYNTHETIC question', interpretation: '', unknowns: '', evidence: [], nextAction: null, research });

test('explicit guide links are bounded and optional; existing snapshots retain their shape', async () => {
  const base = record(emptyResearchState());
  const previous = await createResearchSnapshot(base);
  assert.equal(Object.hasOwn(previous, 'relatedGuides'), false);
  const relatedGuides = [{ guideId: 'synthetic-survey', revision: 2 }];
  const research = { ...base.research, relatedGuides };
  validateResearchState(research);
  const next = await createResearchSnapshot({ ...base, research });
  assert.deepEqual((await verifyResearchSnapshot(next)).relatedGuides, relatedGuides);
  assert.notEqual(next.snapshotSha256, previous.snapshotSha256);
  await assert.rejects(verifyResearchSnapshot({ ...next, relatedGuides: [] }), /摘要/);
  assert.throws(() => validateRelatedGuides([...relatedGuides, { ...relatedGuides[0], revision: 3 }]), /一次/);
  assert.throws(() => validateRelatedGuides([{ guideId: '../escape', revision: 1 }]));
  assert.throws(() => validateRelatedGuides([{ ...relatedGuides[0], read: true }]));
  validateRelatedGuides([]);
});

test('associated metadata is available in discussion without asserting reading or source evidence', async () => {
  const relatedGuides = [{ guideId: 'synthetic-survey', revision: 2 }, { guideId: 'synthetic-missing', revision: 1 }];
  const topic = record({ ...emptyResearchState(), relatedGuides });
  const request = { question: 'SYNTHETIC discuss', webSearch: false, conversationScope: { kind: 'exploration', explorationId: topic.id }, researchSnapshot: await createResearchSnapshot(topic) };
  const content = { get: (id, revision) => id === 'synthetic-survey' && revision === 2 ? { metadata: { title: 'SYNTHETIC survey', paperTitle: 'SYNTHETIC paper', source: { id: 'synthetic:paper', version: 'v2', url: 'https://example.test/paper' }, units: [{ id: 'orientation', heading: null }] } } : undefined };
  const prepared = prepareAssistantContext(content, request, [], { modelId: 'synthetic', contextTokenLimit: 32768, maxOutputTokens: 1000 });
  assert.deepEqual(prepared.sources, []);
  const metadata = JSON.parse(prepared.context.metadataJson);
  assert.equal(metadata.relatedGuides[0].revision, 2);
  assert.match(metadata.relatedGuides[0].scope, /未因此标记已读/);
  assert.equal(metadata.relatedGuides[1].unavailable, true);
  const messages = assembleAssistantContext(prepared, request, { context: prepared.context, sources: [] });
  assert.ok(messages.some(message => message.content.includes('SYNTHETIC survey')));
});
