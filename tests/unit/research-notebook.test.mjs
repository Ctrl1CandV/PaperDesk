import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendNotebookVersion, currentNotebook, validateResearchNotebook, validateNotebookDraft } from '../../shared/research-notebook.mjs';
import { createResearchSnapshot, emptyResearchState, validateResearchState, verifyResearchSnapshot } from '../../shared/research-contract.mjs';
import { parseCommand, validCommand, commandInstruction } from '../../shared/research-documents.mjs';
import { availableTools } from '../../server/ai/instructions.mjs';
import { prepareAssistantContext, researchToolsForTurn } from '../../server/ai/research.mjs';
import { validateAsk, validateContext } from '../../server/http/validation.mjs';

// All personal content and identifiers in this suite are synthetic.
const record = research => ({ id: randomUUID(), recordRevision: 1, title: 'SYNTHETIC topic', question: 'SYNTHETIC question', interpretation: '', unknowns: '', evidence: [], nextAction: null, research });
const requestFor = async topic => ({ requestId:randomUUID(), question: '/记录 SYNTHETIC 整理想法', webSearch: false, command: { name: 'notebook' }, conversationScope: { kind: 'exploration', explorationId: topic.id }, researchSnapshot: await createResearchSnapshot(topic) });

test('notebook versions preserve the full document and author, restoration appends instead of rewriting', () => {
  const first = appendNotebookVersion(undefined, 'SYNTHETIC reader question');
  const second = appendNotebookVersion(first, 'SYNTHETIC reader question\n\n〔待验证〕SYNTHETIC idea', { author: 'assistant', sourceTurnId: randomUUID() });
  const restored = appendNotebookVersion(second, first.versions[0].body, { restoredFrom: 1 });
  assert.deepEqual(restored.versions.slice(0, 2), second.versions);
  assert.equal(currentNotebook(restored).version, 3);
  assert.equal(currentNotebook(restored).restoredFrom, 1);
  assert.throws(() => appendNotebookVersion(first, 'x'.repeat(24001)), /24000/);
  assert.throws(() => appendNotebookVersion(first, 'x', { author: 'assistant' }));
  assert.throws(() => validateResearchNotebook({ versions: [{ ...first.versions[0], version: 2 }] }), /连续/);
  assert.throws(() => appendNotebookVersion(second, 'x', { author: 'assistant', sourceTurnId: second.versions[1].sourceTurnId }), /重复/);
  assert.throws(() => validateNotebookDraft({ body: ' ', summary: 'SYNTHETIC', baseNotebookVersion: 0 }));
  let full = first;
  for (let i = 1; i < 500; i++) full = appendNotebookVersion(full, `SYNTHETIC ${i}`);
  assert.throws(() => appendNotebookVersion(full, 'SYNTHETIC overflow'), /500/);
  assert.equal(full.versions.length, 500);
});

test('snapshots contain only the current notebook version, hash binds it, old state shape remains compatible', async () => {
  const topic = record(emptyResearchState());
  const old = await createResearchSnapshot(topic);
  assert.equal(Object.hasOwn(old, 'notebook'), false);
  const first = appendNotebookVersion(undefined, 'SYNTHETIC private historical thought');
  const second = appendNotebookVersion(first, 'SYNTHETIC current thought');
  topic.research.notebook = second;
  topic.research.readingAssignmentReceipts = [{ batchId: 'synthetic-batch', collectionId: 'synthetic-collection' }];
  validateResearchState(topic.research);
  const snapshot = await createResearchSnapshot(topic);
  assert.deepEqual(snapshot.notebook, second.versions[1]);
  assert.equal(JSON.stringify(snapshot).includes('historical thought'), false);
  assert.equal(Object.hasOwn(snapshot, 'readingAssignmentReceipts'), false);
  await verifyResearchSnapshot(snapshot);
  await assert.rejects(verifyResearchSnapshot({ ...snapshot, notebook: { ...snapshot.notebook, body: 'SYNTHETIC tamper' } }), /摘要/);
  assert.throws(() => validateResearchState({ ...topic.research, readingAssignmentReceipts: [...topic.research.readingAssignmentReceipts, ...topic.research.readingAssignmentReceipts] }), /重复/);
});

test('only an explicit linked notebook command exposes and accepts the notebook tool', async () => {
  assert.deepEqual(parseCommand('/记录 保留疑问'), { command: { name: 'notebook' }, rest: '保留疑问' });
  assert.equal(validCommand({ name: 'notebook' }), true);
  assert.equal(validCommand({ name: 'notebook', purpose: 'research' }), false);
  const toolNames = (research, command) => availableTools(false, research, command).map(tool => tool.function.name);
  assert.ok(toolNames(true, { name: 'notebook' }).includes('update_research_notebook'));
  assert.ok(!toolNames(true).includes('update_research_notebook'));
  assert.ok(!toolNames(false, { name: 'notebook' }).includes('update_research_notebook'));
  assert.match(commandInstruction({ name: 'notebook' }, { linked: true }), /未要求删除的旧内容应保留/);
  const request = await requestFor(record(emptyResearchState()));
  validateAsk(request);
  const prepared = prepareAssistantContext({}, request, [], { modelId: 'synthetic', contextTokenLimit: 32768, maxOutputTokens: 1000 });
  const turn = { id: randomUUID(), context: prepared.context, sources: [] };
  const run = researchToolsForTurn({}, turn);
  assert.match(run('update_research_notebook', { body: '', summary: 'SYNTHETIC' }).error, /无效/);
  assert.equal(run('update_research_notebook', { body: '〔待验证〕SYNTHETIC question', summary: 'SYNTHETIC update' }).status, 'notebook-drafted');
  assert.equal(turn.context.notebookDraft.baseNotebookVersion, 0);
  validateContext(turn.context);
  assert.match(run('update_research_notebook', { body: 'SYNTHETIC duplicate', summary: 'SYNTHETIC' }).error, /已有/);
  assert.throws(() => validateContext({ ...turn.context, command: undefined }), /指令|草稿/);
  assert.throws(() => validateContext({ ...turn.context, notebookDraft: { ...turn.context.notebookDraft, baseNotebookVersion: 1 } }), /基础版本/);
  const ordinary = { ...turn, context: { ...turn.context, command: undefined } };
  assert.throws(() => researchToolsForTurn({}, ordinary)('update_research_notebook', { body: 'SYNTHETIC', summary: 'SYNTHETIC' }), /只有/);
});

test('oversized notebook context is rejected explicitly before provider transmission, never silently shortened', async () => {
  const topic = record({ ...emptyResearchState(), notebook: appendNotebookVersion(undefined, '合成'.repeat(11000)) });
  const request = await requestFor(topic);
  assert.throws(() => prepareAssistantContext({}, request, [], { modelId: 'synthetic', contextTokenLimit: 32768, maxOutputTokens: 1000 }), /超过本轮上下文预算/);
  const prepared = prepareAssistantContext({}, request, [], { modelId: 'synthetic', contextTokenLimit: 131072, maxOutputTokens: 1000 });
  assert.equal(prepared.context.researchSnapshot.notebook.body, topic.research.notebook.versions[0].body);
});

test('the working paper starts from a paper-shaped outline and keeps a dated stage log', async () => {
  const { WORKING_PAPER_SECTIONS, workingPaperTemplate, stageEntries, appendStageEntry, withoutPlaceholders } = await import('../../shared/research-notebook.mjs');
  const draft = workingPaperTemplate({ motivation: 'SYNTHETIC 动机' });
  assert.deepEqual([...draft.matchAll(/^## (.+)$/gm)].map(match => match[1]), WORKING_PAPER_SECTIONS.map(section => section.heading));
  assert.match(draft, /## 问题与动机\n\nSYNTHETIC 动机/); assert.match(draft, /<!-- 文献已经说明了什么/);
  // The first entry replaces the untouched hint; later ones append in order; other sections stay put.
  const first = appendStageEntry(draft, '2026-10-30', 'SYNTHETIC  第一条\n收获');
  assert.doesNotMatch(first.split('## 阶段记录')[1], /<!--/);
  const second = appendStageEntry(first, '2026-10-31', 'SYNTHETIC 第二条');
  assert.deepEqual(stageEntries(second), [{ date: '2026-10-30', text: 'SYNTHETIC 第一条 收获' }, { date: '2026-10-31', text: 'SYNTHETIC 第二条' }]);
  assert.equal(second.split('## 实验设想')[0], first.split('## 实验设想')[0]);
  assert.equal(appendStageEntry('', '2026-10-30', 'SYNTHETIC'), '## 阶段记录\n\n- 2026-10-30 · SYNTHETIC\n');
  assert.equal(appendStageEntry('## 阶段记录\n\n- 2026-10-01 · a\n\n## 其他\n\nb', '2026-10-30', 'SYNTHETIC'), '## 阶段记录\n\n- 2026-10-01 · a\n- 2026-10-30 · SYNTHETIC\n\n## 其他\n\nb\n');
  assert.deepEqual(stageEntries('## 其他\n\n- 2026-10-01 · 不是阶段记录'), []);
  assert.doesNotMatch(withoutPlaceholders(second), /<!--/);
});

test('a version may carry a short note of what changed; older versions without one stay valid and hash the same', async () => {
  const noted = appendNotebookVersion(undefined, 'SYNTHETIC', { note: `  SYNTHETIC ${'改'.repeat(400)} ` });
  assert.equal(currentNotebook(noted).note.length, 300);
  assert.throws(() => validateResearchNotebook({ versions: [{ ...currentNotebook(noted), note: ' ' }] }));
  const plain = appendNotebookVersion(undefined, 'SYNTHETIC');
  assert.equal(Object.hasOwn(currentNotebook(plain), 'note'), false);
  const snapshot = await createResearchSnapshot(record({ ...emptyResearchState(), notebook: noted }));
  assert.equal(snapshot.notebook.note, currentNotebook(noted).note);
  assert.match(commandInstruction({ name: 'notebook' }, { linked: true }), /阶段记录/);
  assert.match(commandInstruction({ name: 'notebook' }, { linked: true }), /相关工作/);
});
