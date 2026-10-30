import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResearchSnapshot, createSeedDiscussion, emptyResearchState, researchSnapshotData, validateDirectionDraft, validateResearchProposal, validateResearchState, SEED_DISCUSSION_LIMITS } from '../../shared/research-contract.mjs';
import { createResearchArtifact, validateResearchArtifacts } from '../../shared/research-artifacts.mjs';
import { checkDocumentSections, commandInstruction, documentPreamble, parseCommand, readingBriefTitle, READING_BRIEF, validCommand } from '../../shared/research-documents.mjs';

// All records are synthetic.
const record = (research = emptyResearchState()) => ({ id: randomUUID(), title: 'SYNTHETIC topic', question: 'SYNTHETIC question', interpretation: '', unknowns: '', recordRevision: 1, evidence: [], nextAction: null, research });
const proposal = changes => ({ id: randomUUID(), explorationId: randomUUID(), baseRecordRevision: 1, baseSnapshotSha256: 'a'.repeat(64), sourceTurnId: randomUUID(), changes, rationale: 'SYNTHETIC', evidenceRefs: [] });
const draft = extra => ({ title: 'SYNTHETIC 方向', question: 'SYNTHETIC 问题', interpretation: '', unknowns: '', scope: '', constraints: '', candidates: '', deferred: '', stage: 'narrow', nextAction: null, rationale: 'SYNTHETIC', ...extra });

test('commands are recognized only at the start of a message, with an optional purpose', () => {
  assert.deepEqual(parseCommand('/方向'), { command: { name: 'direction' }, rest: '' });
  assert.deepEqual(parseCommand('  /选文 推进 重点看评测'), { command: { name: 'reading-brief', purpose: 'research' }, rest: '重点看评测' });
  assert.deepEqual(parseCommand('/选文 想了解 Agent'), { command: { name: 'reading-brief' }, rest: '想了解 Agent' });
  assert.equal(parseCommand('/方向感'), null); assert.equal(parseCommand('请用 /方向'), null);
  assert.ok(validCommand({ name: 'reading-brief', purpose: 'accumulation' })); assert.ok(validCommand({ name: 'direction' }));
  assert.ok(!validCommand({ name: 'reading-brief' })); assert.ok(!validCommand({ name: 'direction', purpose: 'research' })); assert.ok(!validCommand({ name: 'shell' }));
});

test('command requirements ask the model to judge readiness, keep sections and never invent authority', () => {
  for (const purpose of ['accumulation', 'research']) {
    const text = commandInstruction({ name: 'reading-brief', purpose }, { linked: purpose === 'research' });
    for (const section of READING_BRIEF.sections) { assert.ok(text.includes(section.title)); assert.ok(text.includes(section.hint[purpose])); }
    assert.match(text, /不要输出文件/); assert.match(text, /待确认/); assert.match(text, /不虚构论文/);
  }
  assert.match(commandInstruction({ name: 'direction' }, { linked: false }), /create_research_direction/);
  assert.match(commandInstruction({ name: 'direction' }, { linked: true }), /propose_research_changes/);
});

test('only an answer that opens with the file heading counts as a generated file', () => {
  const full = `# ${READING_BRIEF.label}：SYNTHETIC 多智能体通信\n\n${READING_BRIEF.sections.map((section, index) => `## ${index + 1}. ${section.title}\n\nSYNTHETIC`).join('\n\n')}`;
  assert.equal(readingBriefTitle(full), 'SYNTHETIC 多智能体通信');
  assert.deepEqual(checkDocumentSections(full).missing, []);
  assert.equal(readingBriefTitle('信息还不够：你想弄清通信协议还是评测？'), null);
  assert.equal(readingBriefTitle(`先说明一下。\n\n# ${READING_BRIEF.label}：SYNTHETIC`), null);
  assert.equal(checkDocumentSections(`# x\n\n## ${READING_BRIEF.sections[0].title}`).missing.length, READING_BRIEF.sections.length - 1);
  const header = documentPreamble({ purpose: 'research', savedAt: '2026-10-29T00:00:00.000Z', containerTitle: 'SYNTHETIC 方向', workflows: [{ path: 'docs/content/workflows/CONTENT-WORKFLOW.md', sha256: 'b'.repeat(64) }] });
  assert.match(header, /推进研究方向“SYNTHETIC 方向”/); assert.match(header, /未明确允许的行动一律视为待确认/); assert.match(header, /CONTENT-WORKFLOW\.md/);
  assert.match(documentPreamble({ purpose: 'accumulation', savedAt: '2026-10-29T00:00:00.000Z', containerTitle: 'SYNTHETIC' }), /积累对“SYNTHETIC”的理解/);
});

test('directions carry an optional stage, files their purpose and library snapshot; older records keep their hash', async () => {
  validateDirectionDraft(draft());
  assert.throws(() => validateDirectionDraft(draft({ stage: 'done' })), /阶段/);
  assert.throws(() => validateDirectionDraft(draft({ title: ' ' })), /标题/);
  assert.throws(() => validateDirectionDraft(draft({ nextAction: { kind: 'read-guide', description: 'SYNTHETIC' } })), /导读位置/);
  validateResearchState({ ...emptyResearchState(), stage: 'question', purpose: 'accumulation', createdFromTurnId: randomUUID() });
  assert.throws(() => validateResearchState({ ...emptyResearchState(), purpose: 'research' }), /用途/);
  const plain = record();
  assert.equal(Object.hasOwn(researchSnapshotData(plain), 'stage'), false);
  assert.equal((await createResearchSnapshot(record({ ...emptyResearchState(), stage: 'narrow' }))).stage, 'narrow');
  const file = createResearchArtifact({ kind: 'reading-brief', title: 'SYNTHETIC', recordRevision: 1, purpose: 'research', librarySnapshot: ['agent-survey', 'react'] });
  validateResearchArtifacts([file]);
  assert.throws(() => validateResearchArtifacts([{ ...file, purpose: 'other' }]));
  assert.throws(() => validateResearchArtifacts([{ ...file, librarySnapshot: ['agent-survey', 'agent-survey'] }]));
  assert.equal(Object.hasOwn(createResearchArtifact({ title: 'SYNTHETIC', recordRevision: 1 }), 'purpose'), false);
});

test('proposals can change title, stage and next step within record rules', () => {
  validateResearchProposal(proposal([{ kind: 'set-field', field: 'title', value: 'SYNTHETIC 新标题' }, { kind: 'set-field', field: 'stage', value: 'question' }]));
  assert.throws(() => validateResearchProposal(proposal([{ kind: 'set-field', field: 'stage', value: 'finished' }])), /阶段/);
  assert.throws(() => validateResearchProposal(proposal([{ kind: 'set-field', field: 'title', value: '  ' }])), /标题/);
  validateResearchProposal(proposal([{ kind: 'set-next-action', action: { kind: 'search-literature', description: 'SYNTHETIC 查找评测综述' } }]));
  validateResearchProposal(proposal([{ kind: 'set-next-action', action: null }]));
  assert.throws(() => validateResearchProposal(proposal([{ kind: 'set-next-action', action: { kind: 'read-guide', description: 'SYNTHETIC' } }])), /导读位置/);
  assert.throws(() => validateResearchProposal(proposal([{ kind: 'set-field', field: 'status', value: 'archived' }])));
});

test('a carried guide discussion is short, chronological and bounded', () => {
  const turns = Array.from({ length: 5 }, (_, index) => ({ id: randomUUID(), question: `SYNTHETIC 问题 ${index} ${'问'.repeat(300)}`, answer: `SYNTHETIC 回答 ${index} ${'答'.repeat(900)}` }));
  const seed = createSeedDiscussion({ conversationId: randomUUID(), guideId: 'agent-survey', revision: 2, guideTitle: 'SYNTHETIC 导读', turns });
  assert.ok(seed.turns.length >= 1 && seed.turns.length <= SEED_DISCUSSION_LIMITS.turns);
  assert.deepEqual(seed.turns.map(turn => turn.turnId), turns.slice(-seed.turns.length).map(turn => turn.id));
  assert.ok(Buffer.byteLength(JSON.stringify(seed)) <= SEED_DISCUSSION_LIMITS.bytes);
  validateResearchState({ ...emptyResearchState(), seedDiscussion: seed });
  assert.equal(createSeedDiscussion({ conversationId: randomUUID(), guideId: 'agent-survey', revision: 2, guideTitle: 'SYNTHETIC', turns: [] }), undefined);
});
