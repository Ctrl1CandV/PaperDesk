import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { ContentIndex } from '../../server/content/index.mjs';
import { normalizeConfig } from '../../server/config.mjs';
import { AiStore } from '../../server/storage/ai-store.mjs';
import { prepareAssistantContext, researchToolsForTurn } from '../../server/ai/research.mjs';
import { availableTools } from '../../server/ai/instructions.mjs';
import { localResultBudget, pendingResearchWriteReserve } from '../../server/ai/prompt-budget.mjs';
import { answer } from '../../server/ai/providers/api.mjs';
import { answerWithChatGpt } from '../../server/ai/providers/chatgpt.mjs';
import { createResearchSnapshot, emptyResearchState, validateEvidenceRefs } from '../../shared/research-contract.mjs';
import { createResearchMaterials } from '../../shared/research-materials.mjs';
import { workingPaperTemplate, appendNotebookVersion } from '../../shared/research-notebook.mjs';

// The library is public reviewed content. Research, notes, credentials and
// transports are synthetic; the fixture cannot open the private material store.
const parent = resolve('.cache/test-workspaces');
const config = normalizeConfig({ baseURL: 'https://synthetic-api.invalid/v1', apiKey: 'SYNTHETIC_ONLY', modelId: 'synthetic-research-budget', toolsEnabled: true, contextTokenLimit: 32768, maxOutputTokens: 3000 });
const auth = { async getAccessToken() { return 'SYNTHETIC_AUTH_ONLY'; } };
const sse = values => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
async function fixture(t) {
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'synthetic-research-command-budget-'));
  let content;
  t.after(() => { content?.close(); const child = relative(parent, root); assert.ok(child && !child.startsWith('..') && !isAbsolute(child)); rmSync(root, { recursive: true, force: true }); });
  content = await ContentIndex.load({ rootDir: resolve('.'), readingDirectory: join(root, 'synthetic-empty-reading'), indexFile: join(root, 'synthetic-index.sqlite') });
  return content;
}
const topic = content => ({ id: randomUUID(), title: 'SYNTHETIC 资源开销的机制比较', question: 'SYNTHETIC 缓存共享与专家激活分别减少哪种资源负担？', interpretation: 'SYNTHETIC 两种机制可能组合，仍须核对实际条件。', unknowns: 'SYNTHETIC 硬件与序列长度的影响。', recordRevision: 1, evidence: [], nextAction: null,
  research: { ...emptyResearchState(), relatedGuides: ['transformer', 'llm-survey'].map(guideId => ({ guideId, revision: content.catalog.currentRevisions[guideId] })), notebook: appendNotebookVersion(undefined, workingPaperTemplate({ motivation: 'SYNTHETIC 只比较资源开销机制，未授权实验。', known: 'SYNTHETIC 已有导读给出机制区分，仍需逐条回查。', judgement: 'SYNTHETIC 〔假设〕收益依赖硬件和序列。', unknowns: 'SYNTHETIC 比较条件如何对齐。', log: '- 2026-11-06 · SYNTHETIC 建立比较问题。' })) } });
function toolResponse(provider, round, name, args) {
  const id = `synthetic-call-${round}`;
  return provider === 'api' ? sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }])
    : sse([{ type: 'response.completed', response: { id: `synthetic-response-${round}`, status: 'completed', output: [{ type: 'function_call', id: `synthetic-item-${round}`, call_id: id, namespace: 'paperdesk', name, arguments: JSON.stringify(args), status: 'completed' }] } }]);
}
const finalResponse = provider => provider === 'api' ? sse([{ choices: [{ delta: { content: 'SYNTHETIC complete [L2].' }, finish_reason: 'stop' }] }])
  : sse([{ type: 'response.completed', response: { id: 'synthetic-final', status: 'completed', output: [{ type: 'message', id: 'synthetic-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'SYNTHETIC complete [L2].', annotations: [] }] }] } }]);
const outputFor = (provider, body, id) => JSON.parse(provider === 'api' ? body.messages.find(message => message.role === 'tool' && message.tool_call_id === id).content : body.input.find(item => item.type === 'function_call_output' && item.call_id === id).output);
const snapshotIn = (provider, body) => {
  const message = (provider === 'api' ? body.messages : body.input).find(item => item.role === 'user' && typeof item.content === 'string' && item.content.includes('\n{"researchSnapshot":'));
  return JSON.parse(message.content.slice(message.content.lastIndexOf('\n{') + 1));
};

test('default-budget research commands retain the eighteen-guide catalog and complete read/write/final rounds through both actual adapters', async t => {
  const content = await fixture(t), library = content.libraryOverview();
  assert.equal(library.length, 18);
  const guide = content.get('llm-survey', content.catalog.currentRevisions['llm-survey']), active = guide.units.find(unit => unit.id === 'architecture');
  const record = topic(content), snapshot = await createResearchSnapshot(record);
  const materials = await createResearchMaterials(record.id, [{ id: randomUUID(), recordRevision: 1, guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: active.id, text: 'SYNTHETIC 本轮明确选中的笔记。保留完整问题与条件。', status: 'open', updatedAt: '2026-11-06T00:00:00.000Z' }], []);
  const cases = [
    ['create-direction', { name: 'direction' }, false], ['update-direction', { name: 'direction' }, true],
    ['accumulation', { name: 'reading-brief', purpose: 'accumulation' }, false], ['research-brief', { name: 'reading-brief', purpose: 'research' }, true], ['notebook', { name: 'notebook' }, true],
  ];
  for (const [name, command, linked] of cases) for (const provider of ['api', 'chatgpt']) await t.test(`${name} / ${provider}`, async subtest => {
    const request = { requestId: randomUUID(), guideId: guide.metadata.id, revision: guide.metadata.revision, bodySha256: guide.metadata.bodySha256, unitId: active.id, question: `SYNTHETIC ${name} 请保留条件并补读后完成本轮指令。`, webSearch: false, command,
      ...(linked ? { conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: snapshot, researchMaterials: materials } : {}) };
    const store = new AiStore(':memory:'); subtest.after(() => store.close());
    const prepared = prepareAssistantContext(content, request, [], config, store);
    const turn = store.begin(request, prepared.context, prepared.sources).turn;
    prepared.runResearchTool = researchToolsForTurn(store, turn);
    const originalSources = structuredClone(turn.sources), budgets = [];
    let calls = 0;
    const transport = async (url, init) => {
      assert.equal(String(url), provider === 'api' ? 'https://synthetic-api.invalid/v1/chat/completions' : 'https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body), payload = provider === 'api' ? { messages: body.messages, tools: body.tools ?? [] } : { instructions: body.instructions, input: body.input, tools: body.tools ?? [] };
      const measured = Buffer.byteLength(JSON.stringify(payload)) + 512;
      assert.equal(turn.context.budget.inputTokens, measured);
      assert.ok(measured + config.maxOutputTokens <= 32768, 'Every actual serialized provider round fits the unchanged limit.');
      budgets.push(measured + config.maxOutputTokens); calls++;
      if (calls === 1) {
        assert.ok(32768 - measured - config.maxOutputTokens >= 2000, 'The initial prompt leaves meaningful room for the following actual source read/write rounds.');
        const data = snapshotIn(provider, body);
        assert.deepEqual(data.metadata.coverage, guide.metadata.coverage);
        assert.deepEqual(data.metadata.source, guide.metadata.source);
        if (linked) {
          assert.deepEqual(data.researchSnapshot, snapshot);
          assert.deepEqual(data.researchMaterials, materials, 'Selected private material is never silently shortened.');
          for (const item of data.metadata.relatedGuides) {
            if (item.metadataRef==='metadata') assert.equal(item.coverageRef, 'metadata.coverage');
            else if (item.metadataRef==='command.library') { assert.equal(item.omittedCoverage, true); assert.ok(library.some(entry=>entry.guideId===item.guideId&&entry.revision===item.revision)); }
            else {
              assert.deepEqual(item.source, content.get(item.guideId, item.revision).metadata.source);
              assert.equal(item.metadataProjection.omittedUnits, content.get(item.guideId, item.revision).metadata.units.length);
              assert.equal(item.metadataProjection.omittedCoverage, true);
            }
            assert.equal(item.units, undefined);
          }
        }
        if (command.name === 'reading-brief') {
          const messages = provider === 'api' ? body.messages : body.input;
          const requirements = messages.find(message => typeof message.content === 'string' && message.content.startsWith('应用附加的指令要求'));
          const catalog = JSON.parse(requirements.content.split('\n').find(line => line.startsWith('[[')));
          assert.deepEqual(catalog, library.map(item => [item.guideId, item.revision, item.type === 'survey' ? '综述' : '论文', item.paperTitle, item.source, item.version]));
          assert.match(requirements.content, /未发送逐篇正文、章节目录或覆盖核验/);
          assert.match(requirements.content, /不证明原文已导入本地或读者已读/);
          assert.match(requirements.content, /未检查时标为未确认/);
        }
        return toolResponse(provider, 1, 'read_section', { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: active.id, offset: Math.min(1800, active.text.length - 100), maxChars: command.name==='direction'?1600:200 });
      }
      if (calls === 2) {
        const read = outputFor(provider, body, 'synthetic-call-1');
        if (read.error) {
          assert.notEqual(command.name,'reading-brief','Read-only file planning retains its source-read allowance.');
          assert.match(read.error,/预算不足/);
          assert.deepEqual(turn.sources,originalSources,'Reserving a pending write must report an unread range honestly without adding evidence.');
        } else {
          assert.equal(read.source.kind, 'guide');
          const retained = turn.sources.find(source=>source.id===read.source.id);
          assert.equal(retained.unitId, active.id); assert.equal(retained.bodySha256, guide.metadata.bodySha256);
          if (read.sourceRef) assert.ok(originalSources.some(source=>source.id===read.sourceRef.sourceId&&source.unitId===active.id), 'Compact identity references resolve to an actually supplied initial source.');
          assert.equal(read.source.text, active.text.slice(read.range.start, read.range.end));
        }
        const citationId=read.source?.id??originalSources.find(source=>source.unitId===active.id).id;
        if (command.name === 'direction') {
          // A previous live failure used 5851 bytes of direction arguments.
          // Exercise that scale, not a tiny draft that hides continuation cost.
          const args=linked
            ? { changes:[{kind:'set-field',field:'unknowns',value:'SYNTHETIC '+ '合成条件与限制。'.repeat(30)}],rationale:'SYNTHETIC 读者要求更新。',citationIds:[citationId] }
            : {title:'SYNTHETIC 资源比较',question:'SYNTHETIC 机制怎样影响开销？',interpretation:'SYNTHETIC '+ '合成机制与条件。'.repeat(80),candidates:'SYNTHETIC '+ '合成候选与疑点。'.repeat(80),unknowns:'SYNTHETIC '+ '合成硬件与限制。'.repeat(80),stage:'broaden',rationale:'SYNTHETIC 已有明确比较问题。'};
          assert.ok(Buffer.byteLength(JSON.stringify(args))>=(linked?800:5800));
          return toolResponse(provider,2,linked?'propose_research_changes':'create_research_direction',args);
        }
        if (command.name === 'notebook') return toolResponse(provider, 2, 'update_research_notebook', { body: snapshot.notebook.body + `\n\nSYNTHETIC 新增待验证认识，来源 /read/${guide.metadata.id}/${guide.metadata.revision}#${active.id}。`, summary: 'SYNTHETIC 按节追加。' });
        return finalResponse(provider);
      }
      assert.equal(outputFor(provider, body, 'synthetic-call-2').error, undefined);
      return finalResponse(provider);
    };
    const emit = event => { if (event.type === 'delta') turn.answer += event.text; if (event.type === 'replace') turn.answer = event.text; };
    await (provider === 'api' ? answer : answerWithChatGpt)({ config, content, prepared, request, turn, auth, signal: new AbortController().signal, emit, persist: () => store.save(turn), fetchImpl: transport });
    assert.equal(calls, command.name === 'reading-brief' ? 2 : 3);
    for (const source of originalSources) assert.ok(turn.sources.some(item => item.id === source.id && item.bodySha256 === source.bodySha256));
    assert.match(turn.answer, /SYNTHETIC complete/);
    turn.status = 'complete'; store.save(turn);
    const copy = new AiStore(':memory:'); subtest.after(() => copy.close()); copy.import(store.export());
    assert.deepEqual(copy.turn(turn.id), turn, 'Research/tool sources and selected snapshots survive backup validation.');
    subtest.diagnostic(`Actual conservative input plus output reserve: ${budgets.join(', ')} / 32768.`);
  });
});

test('notebook and reading-file turns offer no unrelated direction mutation; ordinary discussion still can propose', () => {
  for (const command of [{ name: 'notebook' }, { name: 'reading-brief', purpose: 'research' }]) {
    const names = availableTools(false, true, command).map(tool => tool.function.name);
    assert.ok(!names.includes('propose_research_changes')); assert.ok(names.includes('search_topic_history')); assert.ok(names.includes('read_section'));
  }
  for (const command of [undefined, { name: 'direction' }]) assert.ok(availableTools(false, true, command).some(tool => tool.function.name === 'propose_research_changes'));
});

test('source retrieval reserves pending direction/notebook arguments and releases room only after a draft exists', () => {
  const budget={limit:32768,outputTokens:3000,inputTokens:19000}, base=localResultBudget({budget});
  const direction={budget,command:{name:'direction'}};
  assert.equal(pendingResearchWriteReserve(direction),6000);
  assert.equal(localResultBudget(direction),base-6000);
  assert.equal(localResultBudget({...direction,directionDraft:{title:'SYNTHETIC'}}),base);
  assert.equal(localResultBudget({...direction,researchProposals:[{id:'SYNTHETIC'}]}),base);
  const notebook={budget,command:{name:'notebook'},researchSnapshot:{notebook:{body:'SYNTHETIC '+ '合成'.repeat(1500)}}};
  assert.ok(pendingResearchWriteReserve(notebook)>Buffer.byteLength(JSON.stringify(notebook.researchSnapshot.notebook.body)));
  assert.equal(pendingResearchWriteReserve({...notebook,notebookDraft:{body:'SYNTHETIC'}}),0);
  assert.equal(pendingResearchWriteReserve({command:{name:'reading-brief',purpose:'research'}}),0);
});

test('an oversized six-kilobyte linked update is rejected without pretending to read more evidence or submitting a proposal', async t => {
  const content=await fixture(t),record=topic(content),snapshot=await createResearchSnapshot(record),guide=content.get('llm-survey',content.catalog.currentRevisions['llm-survey']);
  const materials=await createResearchMaterials(record.id,[{id:randomUUID(),recordRevision:1,guideId:guide.metadata.id,revision:guide.metadata.revision,unitId:'architecture',text:'SYNTHETIC 本轮明确选中的笔记。保留完整问题与条件。',status:'open',updatedAt:'2026-11-06T00:00:00.000Z'}],[]);
  for(const provider of ['api','chatgpt']) await t.test(provider,async subtest=>{
    const request={requestId:randomUUID(),question:'SYNTHETIC update-direction 请保留条件并补读后完成本轮指令。',webSearch:false,command:{name:'direction'},conversationScope:{kind:'exploration',explorationId:record.id},researchSnapshot:snapshot,researchMaterials:materials,
      guideId:guide.metadata.id,revision:guide.metadata.revision,bodySha256:guide.metadata.bodySha256,unitId:'architecture'};
    const store=new AiStore(':memory:');subtest.after(()=>store.close());
    const prepared=prepareAssistantContext(content,request,[],config,store),turn=store.begin(request,prepared.context,prepared.sources).turn;
    prepared.runResearchTool=researchToolsForTurn(store,turn);
    const sources=structuredClone(turn.sources);let calls=0,read;
    const args={changes:[{kind:'set-field',field:'unknowns',value:'SYNTHETIC '+ '合成条件与限制。'.repeat(260)}],rationale:'SYNTHETIC 压力回归，不授权覆盖记录。',citationIds:[sources.find(source=>source.unitId==='architecture').id]};
    assert.ok(Buffer.byteLength(JSON.stringify(args))>6000);
    const transport=async(_url,init)=>{
      calls++;
      if(calls===1)return toolResponse(provider,1,'read_section',{guideId:guide.metadata.id,revision:guide.metadata.revision,unitId:'architecture',offset:1800,maxChars:1600});
      read=outputFor(provider,JSON.parse(init.body),'synthetic-call-1');
      return toolResponse(provider,2,'propose_research_changes',args);
    };
    await assert.rejects(()=>(provider==='api'?answer:answerWithChatGpt)({config,content,prepared,request,turn,auth,signal:new AbortController().signal,emit:()=>{},persist:()=>store.save(turn),fetchImpl:transport}),/预算/);
    assert.equal(calls,2,'The oversized proposal never reaches a third provider request.');
    assert.match(read.error,/预算不足/);
    assert.deepEqual(turn.sources,sources);
    assert.deepEqual(turn.context.researchProposals,[],'The guard rejects before accepting the proposed write.');
    assert.deepEqual(turn.context.researchSnapshot,snapshot);
    assert.deepEqual(turn.context.toolEvents.map(event=>event.name),['read_section']);
  });
});

test('oversized selected research material remains whole and is rejected before either transport', async t => {
  const content = await fixture(t), guide = content.get('llm-survey', content.catalog.currentRevisions['llm-survey']), record = topic(content);
  const snapshot = await createResearchSnapshot(record);
  const materials = await createResearchMaterials(record.id, [{ id: randomUUID(), recordRevision: 1, guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: 'architecture', text: 'SYNTHETIC ' + '合成'.repeat(5000), status: 'open', updatedAt: '2026-11-06T00:00:00.000Z' }], []);
  const request = { requestId: randomUUID(), question: '/记录 SYNTHETIC 不允许静默截断选中材料', webSearch: false, command: { name: 'notebook' }, conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: snapshot,
    guideId: guide.metadata.id, revision: guide.metadata.revision, bodySha256: guide.metadata.bodySha256, unitId: 'architecture', researchMaterials: materials };
  const original = structuredClone(request);
  assert.throws(() => prepareAssistantContext(content, request, [], config), /预算/);
  assert.deepEqual(request, original);
  // The final guard independently rejects the same intact data even if a
  // caller bypasses preparation. No saved setting or tokenizer limit changes.
  for (const provider of ['api', 'chatgpt']) {
    const prepared = prepareAssistantContext(content, { ...request, researchMaterials: undefined }, [], config);
    prepared.context.researchMaterials = structuredClone(materials);
    const turn = { id: randomUUID(), answer: '', sources: prepared.sources, context: prepared.context };
    let calls = 0;
    await assert.rejects(() => (provider === 'api' ? answer : answerWithChatGpt)({ config, content, prepared, request, turn, auth, signal: new AbortController().signal,
      emit: () => {}, persist: () => {}, fetchImpl: () => { calls++; throw Error('SYNTHETIC oversized material must not reach transport.'); } }), /预算/);
    assert.equal(calls, 0); assert.deepEqual(turn.context.researchMaterials, materials);
  }
});

test('guide range evidence is versioned, bounded and may widen without invalidating earlier proposal excerpts', async () => {
  const record = { ...topic({ catalog: { currentRevisions: { transformer: 1, 'llm-survey': 1 } } }), research: emptyResearchState() }, snapshot = await createResearchSnapshot(record);
  const request = { requestId: randomUUID(), question: 'SYNTHETIC proposal source widening', webSearch: false, conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: snapshot };
  const prepared = prepareAssistantContext({}, request, [], config), store = new AiStore(':memory:');
  const first = { id: 'L1', kind: 'guide', title: 'SYNTHETIC guide', text: 'SYNTHETIC first', guideId: 'synthetic-guide', revision: 1, unitId: 'intro', bodySha256: 'a'.repeat(64), url: '/read/synthetic-guide/1#intro', readRanges: [{ start: 0, end: 15, total: 200 }] };
  prepared.sources = [first];
  const turn = store.begin(request, prepared.context, prepared.sources).turn;
  researchToolsForTurn(store, turn)('propose_research_changes', { changes: [{ kind: 'set-field', field: 'unknowns', value: 'SYNTHETIC pending' }], rationale: 'SYNTHETIC', citationIds: ['L1'] });
  turn.sources[0] = { ...first, text: '[导读章节字符 0–15/200]\nSYNTHETIC first\n\n[导读章节字符 100–116/200]\nSYNTHETIC second', readRanges: [...first.readRanges, { start: 100, end: 116, total: 200 }] };
  try {
    turn.status = 'complete'; turn.answer = 'SYNTHETIC final'; store.save(turn);
    const copy = new AiStore(':memory:'); try { copy.import(store.export()); assert.deepEqual(copy.turn(turn.id), turn); } finally { copy.close(); }
    const ref = structuredClone(turn.context.researchProposals[0].evidenceRefs[0]);
    validateEvidenceRefs([ref]);
    for (const ranges of [[], [{ start: 8, end: 7, total: 200 }], [{ start: 0, end: 15, total: 200 }, { start: 10, end: 20, total: 200 }]]) assert.throws(() => validateEvidenceRefs([{ ...ref, source: { ...ref.source, readRanges: ranges } }]));
    const forged = structuredClone(turn); forged.context.researchProposals[0].evidenceRefs[0].source.text = 'SYNTHETIC unread text';
    assert.throws(() => store.save(forged), /证据不属于本轮/);
  } finally { store.close(); }
});
