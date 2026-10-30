import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResearchSnapshot, createSeedDiscussion, emptyResearchState } from '../../shared/research-contract.mjs';
import { commandInstruction } from '../../shared/research-documents.mjs';
import { AiStore } from '../../server/storage/ai-store.mjs';
import { validateAsk } from '../../server/http/validation.mjs';
import { prepareAssistantContext, assembleAssistantContext, researchToolsForTurn } from '../../server/ai/research.mjs';
import { RESEARCH_GUIDANCE, availableTools } from '../../server/ai/instructions.mjs';

// Synthetic records, a synthetic content adapter and no model or network call.
const config = { modelId: 'synthetic-model', toolsEnabled: true, maxOutputTokens: 1000, contextTokenLimit: 32768 };
const library = [{ guideId: 'synthetic-survey', revision: 1, type: 'survey', paperTitle: 'SYNTHETIC Survey Title', guideTitle: 'SYNTHETIC 综述', source: 'arxiv:0000.00000', version: 'v1', topics: ['SYNTHETIC 主题'] }];
const content = {
  libraryOverview: () => library,
  prepare(request, previous, options) {
    return { history: previous, sources: [{ id: 'L1', kind: 'guide', title: 'Synthetic guide', text: 'Synthetic evidence', guideId: request.guideId, revision: request.revision, unitId: request.unitId, url: `/read/${request.guideId}/${request.revision}#${request.unitId}` }],
      context: { guideId: request.guideId, revision: request.revision, bodySha256: request.bodySha256, unitId: request.unitId, selection: '', scope: 'section', metadataJson: '{}', historyTurnIds: previous.map(turn => turn.id), webSearch: false, model: options.modelId, toolEvents: [] } };
  },
};
const guide = { guideId: 'synthetic-guide', revision: 1, bodySha256: 'a'.repeat(64), unitId: 'intro' };
const topic = (research = emptyResearchState()) => ({ id: randomUUID(), title: 'SYNTHETIC topic', question: 'SYNTHETIC question', interpretation: '', unknowns: '', recordRevision: 1, evidence: [], nextAction: null, research });
const ask = async (record, extra = {}) => ({ requestId: randomUUID(), question: 'SYNTHETIC research question', webSearch: false, conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: await createResearchSnapshot(record), ...extra });
const plain = (extra = {}) => ({ requestId: randomUUID(), question: 'SYNTHETIC guide question', webSearch: false, ...guide, ...extra });
function fixture(t) { const store = new AiStore(':memory:'); t.after(() => store.close()); return store; }
function begin(store, request) {
  validateAsk(request);
  const prepared = prepareAssistantContext(content, request, request.conversationId ? store.recentTurns(request.conversationId) : [], config, store);
  const { turn } = store.begin(request, prepared.context, prepared.sources);
  prepared.runResearchTool = researchToolsForTurn(store, turn);
  return { turn, prepared };
}
const complete = (store, turn, answer = 'SYNTHETIC completed answer') => { turn.answer = answer; turn.status = 'complete'; store.save(turn); return turn; };
const progress = [{ guideId: 'synthetic-survey', revision: 1, guide: 'read', original: null }];

test('commands are explicit, recorded with the turn, and reading marks travel only with /选文', async t => {
  const store = fixture(t), record = topic();
  const accumulation = plain({ question: '/选文 积累 想了解 Agent 如何工作', command: { name: 'reading-brief', purpose: 'accumulation' }, readingProgress: progress });
  const { turn, prepared } = begin(store, accumulation);
  assert.deepEqual(turn.context.command, accumulation.command); assert.deepEqual(turn.context.readingProgress, progress);
  const messages = assembleAssistantContext(prepared, accumulation, turn);
  assert.equal(messages.at(-1).content, accumulation.question);
  assert.ok(messages.at(-2).content.startsWith(commandInstruction(accumulation.command, { linked: false })));
  assert.match(messages.at(-2).content, /SYNTHETIC Survey Title/); assert.match(messages.at(-2).content, /synthetic-survey r1：导读已读/);
  assert.ok(!messages.some(message => message.content.includes(RESEARCH_GUIDANCE)), 'ordinary reading keeps its prompt');
  complete(store, turn, '# 选文实施文件：SYNTHETIC');
  const copy = fixture(t); copy.import(store.export());
  assert.deepEqual(copy.turn(turn.id).context.command, accumulation.command);
  assert.throws(() => validateAsk(plain({ command: { name: 'reading-brief', purpose: 'research' } })), /方向/);
  assert.throws(() => validateAsk(plain({ readingProgress: progress })), /选文/);
  assert.throws(() => validateAsk(plain({ command: { name: 'run-shell' } })), /指令/);
  assert.throws(() => validateAsk(plain({ command: { name: 'reading-brief', purpose: 'accumulation' }, readingProgress: [{ ...progress[0], guide: 'mastered' }] })), /阅读标记/);
  const research = await ask(record, { question: '/选文 推进', command: { name: 'reading-brief', purpose: 'research' }, readingProgress: [] });
  const linked = begin(store, research);
  const text = assembleAssistantContext(linked.prepared, research, linked.turn).at(-2).content;
  assert.match(text, /目的：推进/); assert.match(text, /尚未在本库标记阅读状态/);
});

test('/方向 in ordinary reading may create one validated direction draft; nothing else can', async t => {
  const store = fixture(t);
  assert.ok(!availableTools(false, false).some(tool => tool.function.name === 'create_research_direction'));
  assert.ok(availableTools(false, false, { name: 'direction' }).some(tool => tool.function.name === 'create_research_direction'));
  assert.ok(!availableTools(false, true, { name: 'direction' }).some(tool => tool.function.name === 'create_research_direction'), 'a linked direction is updated instead');
  const earlier = complete(store, begin(store, plain()).turn, 'SYNTHETIC 普通回答');
  const request = plain({ question: '/方向', command: { name: 'direction' }, conversationId: earlier.conversationId });
  const { turn, prepared } = begin(store, request);
  assert.match(prepared.runResearchTool('create_research_direction', { title: '', question: 'SYNTHETIC', stage: 'narrow' }).error, /标题/);
  assert.match(prepared.runResearchTool('create_research_direction', { title: 'SYNTHETIC', question: 'SYNTHETIC', stage: 'narrow', nextAction: { kind: 'read-guide', description: 'SYNTHETIC', target: { guideId: 'elsewhere', revision: 1, unitId: 'intro' } } }).error, /本轮已读取/);
  const ok = prepared.runResearchTool('create_research_direction', { title: 'SYNTHETIC 方向', question: 'SYNTHETIC 核心问题', interpretation: 'SYNTHETIC 认识', candidates: 'SYNTHETIC 候选', unknowns: '', stage: 'narrow', rationale: 'SYNTHETIC',
    nextAction: { kind: 'read-guide', description: 'SYNTHETIC 回到本节', target: { guideId: guide.guideId, revision: guide.revision, unitId: guide.unitId } } });
  assert.equal(ok.status, 'direction-drafted');
  assert.match(prepared.runResearchTool('create_research_direction', { title: 'SYNTHETIC again', question: 'SYNTHETIC', stage: 'broaden' }).error, /已经/);
  assert.equal(turn.context.directionDraft.scope, ''); assert.equal(turn.context.directionDraft.nextAction.target.unitId, 'intro');
  complete(store, turn, 'SYNTHETIC 已建立方向');
  const copy = fixture(t); copy.import(store.export());
  assert.equal(copy.turn(turn.id).context.directionDraft.title, 'SYNTHETIC 方向');
  const ordinary = begin(store, plain());
  assert.throws(() => ordinary.prepared.runResearchTool('create_research_direction', { title: 'SYNTHETIC', question: 'SYNTHETIC', stage: 'broaden' }), /指令/);
});

test('linked /方向 updates through proposals that may change stage, title and next step; long arguments persist', async t => {
  const store = fixture(t), record = topic();
  const request = await ask(record, { ...guide, question: '/方向', command: { name: 'direction' } }), { turn, prepared } = begin(store, request);
  assert.match(assembleAssistantContext(prepared, request, turn).at(-2).content, /更新当前研究方向/);
  const args = { changes: [
    { kind: 'set-field', field: 'title', value: 'SYNTHETIC 更清楚的标题' }, { kind: 'set-field', field: 'stage', value: 'question' },
    { kind: 'set-field', field: 'candidates', value: `SYNTHETIC 候选方向 ${'很长的比较说明，'.repeat(400)}` },
    { kind: 'set-next-action', action: { kind: 'search-literature', description: 'SYNTHETIC 找评测综述' } },
  ], rationale: 'SYNTHETIC', citationIds: [] };
  const argumentsJson = JSON.stringify(args); assert.ok(argumentsJson.length > 2000);
  assert.equal(prepared.runResearchTool('propose_research_changes', args).status, 'proposal-only');
  turn.context.toolEvents.push({ name: 'propose_research_changes', argumentsJson, resultJson: '{"status":"proposal-only"}' });
  complete(store, turn);
  assert.deepEqual(store.turn(turn.id).context.researchProposals[0].changes.map(change => change.field ?? change.kind), ['title', 'stage', 'candidates', 'set-next-action']);
  assert.throws(() => prepared.runResearchTool('propose_research_changes', { changes: [{ kind: 'set-field', field: 'stage', value: 'done' }], rationale: 'SYNTHETIC', citationIds: [] }), /结构校验/);
});

test('a topic summary counts its discussions and the guides read or cited there', async t => {
  const store = fixture(t), record = topic();
  for (const question of ['SYNTHETIC 一', 'SYNTHETIC 二']) complete(store, begin(store, await ask(record, { ...guide, question })).turn);
  complete(store, begin(store, await ask(record, { question: 'SYNTHETIC 无论文' })).turn);
  complete(store, begin(store, await ask(topic(), { ...guide })).turn);
  const summary = store.topicSummary(record.id);
  assert.equal(summary.conversations, 3); assert.equal(summary.turns, 3); assert.ok(summary.lastTurnAt);
  assert.deepEqual(summary.guides, [{ guideId: guide.guideId, revision: guide.revision, askedWhileReading: 2, cited: 2 }]);
  assert.deepEqual(store.topicSummary(randomUUID()), { conversations: 0, turns: 0, lastTurnAt: null, guides: [] });
});

test('only guide turns the reader carried into a direction become readable from it', async t => {
  const store = fixture(t);
  const carried = complete(store, begin(store, plain({ question: 'SYNTHETIC 普通导读问题' })).turn, 'SYNTHETIC 普通导读回答');
  const other = complete(store, begin(store, plain({ question: 'SYNTHETIC 未带入的问题', conversationId: carried.conversationId })).turn);
  const seed = createSeedDiscussion({ conversationId: carried.conversationId, guideId: guide.guideId, revision: guide.revision, guideTitle: 'SYNTHETIC 导读', turns: [{ id: carried.id, question: carried.question, answer: carried.answer }] });
  const { prepared } = begin(store, await ask(topic({ ...emptyResearchState(), seedDiscussion: seed })));
  assert.equal(prepared.runResearchTool('read_topic_turn', { turnId: carried.id }).answer, 'SYNTHETIC 普通导读回答');
  assert.ok(prepared.runResearchTool('read_topic_turn', { turnId: other.id }).error);
});
