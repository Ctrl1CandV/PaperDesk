import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createResearchSnapshot } from '../../shared/research-contract.mjs';
import { createResearchMaterials, validateResearchMaterials, verifyResearchMaterials } from '../../shared/research-materials.mjs';
import { AiStore, validateBackup } from '../../server/storage/ai-store.mjs';
import { exportBackupStream, importBackupStream } from '../../server/storage/ai-backup.mjs';
import { validateAsk } from '../../server/http/validation.mjs';
import { prepareAssistantContext, assembleAssistantContext, researchToolsForTurn } from '../../server/ai/research.mjs';
import { answer } from '../../server/ai/providers/api.mjs';
import { answerWithChatGpt } from '../../server/ai/providers/chatgpt.mjs';
import { createAiServer } from '../../server/http/server.mjs';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { localResultBudget, checkPromptBudget } from '../../server/ai/prompt-budget.mjs';

// All records, model replies and credentials are synthetic; no live model call.
const config={modelId:'synthetic-model',baseURL:'https://example.test/v1',apiKey:'synthetic-key',toolsEnabled:true,searchAvailable:false,search:{apiKey:''},maxOutputTokens:1000,contextTokenLimit:32768};
const record=(id=randomUUID())=>({id,title:'Synthetic topic',question:'Synthetic question',interpretation:'',unknowns:'',recordRevision:1,evidence:[],nextAction:null,
  research:{scope:'Synthetic scope',constraints:'Synthetic constraint persists',candidates:'',deferred:'Synthetic deferred direction',decisions:[],appliedProposalIds:[]}});
async function input(topic=record(), extra={}) {return {requestId:randomUUID(),question:'Synthetic question',webSearch:false,conversationScope:{kind:'exploration',explorationId:topic.id},researchSnapshot:await createResearchSnapshot(topic),...extra};}
const content={prepare(request,previous,config){ return {history:previous, sources:[{id:'L1',kind:'guide',title:'Synthetic guide',text:'Synthetic evidence',guideId:request.guideId,revision:request.revision,unitId:request.unitId,url:`/read/${request.guideId}/${request.revision}#${request.unitId}`}],
  context:{guideId:request.guideId,revision:request.revision,bodySha256:request.bodySha256,unitId:request.unitId,selection:'',scope:'section',metadataJson:'{}',historyTurnIds:previous.map(t=>t.id),webSearch:false,model:config.modelId,toolEvents:[]}};}};
function begin(store,request){validateAsk(request);const prepared=prepareAssistantContext(content,request,request.conversationId?store.recentTurns(request.conversationId):[],config,store);const {turn}=store.begin(request,prepared.context,prepared.sources);prepared.runResearchTool=researchToolsForTurn(store,turn);return {turn,prepared};}
function finish(store,turn){turn.answer='Synthetic completed answer';turn.status='complete';store.save(turn);return turn;}
function fixture(t){const store=new AiStore(':memory:');t.after(()=>store.close());return store;}
const selectedNote=()=>({id:randomUUID(),recordRevision:2,guideId:'synthetic-guide',revision:1,unitId:'intro',text:'Synthetic selected personal note',quote:'Synthetic selected quote',status:'open',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-02T00:00:00.000Z'});
const selectedArtifact=()=>({id:randomUUID(),recordRevision:2,kind:'stage-plan',title:'Synthetic selected plan',body:'Synthetic precise plan revision',sourceRecordRevision:1,sourceTurnId:null,evidenceRefs:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-02T00:00:00.000Z',taskVersions:[],receipts:[]});
const withMaterials=async request=>({...request,researchMaterials:await createResearchMaterials(request.conversationScope.explorationId,[selectedNote()],[selectedArtifact()])});

test('synthetic selected materials freeze allowlisted revisions, enforce UTF-8 limits and reject tampering or unrelated scope',async()=>{
  const topic=record(),note=selectedNote(),artifact=selectedArtifact(),original=structuredClone({note,artifact});
  const materials=await createResearchMaterials(topic.id,[note],[artifact]);
  assert.deepEqual({note,artifact},original);assert.equal(materials.notes[0].createdAt,undefined);assert.equal(materials.artifacts[0].taskVersions,undefined);assert.equal(materials.artifacts[0].receipts,undefined);
  await verifyResearchMaterials(materials);note.text='Synthetic changed after selection';artifact.body='Synthetic changed after selection';
  assert.equal(materials.notes[0].text,original.note.text);assert.equal(materials.artifacts[0].body,original.artifact.body);
  await assert.rejects(()=>createResearchMaterials(topic.id,[original.note,original.note],[]),/重复/);
  await assert.rejects(()=>createResearchMaterials(topic.id,Array.from({length:9},selectedNote),[]),/8/);
  await assert.rejects(()=>createResearchMaterials(topic.id,[{...original.note,text:'合'.repeat(17000)}],[]),/48 KiB/);
  assert.throws(()=>validateResearchMaterials({...materials,notes:[{...materials.notes[0],extra:'Synthetic unexpected'}]}),/字段/);
  await assert.rejects(()=>verifyResearchMaterials({...materials,notes:[{...materials.notes[0],text:'Synthetic changed'}]}),/摘要/);
  const request=await input(topic,{researchMaterials:materials});validateAsk(request);
  assert.throws(()=>validateAsk({...request,researchMaterials:{...materials,materialsSha256:'f'.repeat(64)}}),/摘要/);
  assert.throws(()=>validateAsk({...request,researchMaterials:{...materials,explorationId:randomUUID()}}),/主题/);
  assert.throws(()=>validateAsk({requestId:randomUUID(),question:'Synthetic',webSearch:false,guideId:'synthetic-guide',revision:1,bodySha256:'a'.repeat(64),unitId:'intro',researchMaterials:materials}),/关联研究主题/);
});

test('synthetic multi-keyword Chinese history restores a bounded same-topic hint in new conversations',async t=>{
  const store=fixture(t),topic=record(),ids=[];
  for(const question of ['合成记忆冲突：实验基线如何选择','合成评估指标与反例','合成记忆消融实验']){
    const current=begin(store,await input(topic,{question}));current.turn.answer='合成结论：记忆冲突需要比较实验条件。'.repeat(30);current.turn.status='complete';store.save(current.turn);ids.push(current.turn.id);
  }
  const foreign=begin(store,await input(record(),{question:'Synthetic foreign 记忆冲突 实验基线'}));finish(store,foreign.turn);
  const request=await input(topic),current=begin(store,request),hint=current.turn.context.topicHistory;
  assert.equal(hint.explorationId,topic.id);assert.equal(hint.turns.length,2);assert.equal(hint.omittedCount,1);assert.equal(hint.omittedTurnIds[0],ids[0]);
  assert.ok(hint.turns.every(turn=>ids.includes(turn.turnId)&&turn.answerTruncated));assert.ok(Buffer.byteLength(JSON.stringify(hint))<=1800);
  assert.equal(current.prepared.history.length,0);assert.deepEqual(current.turn.context.historyTurnIds,[]);assert.deepEqual(current.turn.sources,[]);
  const results=current.prepared.runResearchTool('search_topic_history',{query:'如何研究记忆冲突 实验基线'});
  assert.ok(results.turns.some(turn=>turn.id===ids[0]));assert.ok(results.turns.every(turn=>ids.includes(turn.id)));
  assert.ok(current.prepared.runResearchTool('read_topic_turn',{turnId:results.turns[0].id}).answer);
  assert.equal(current.prepared.runResearchTool('read_topic_turn',{turnId:foreign.turn.id}).sources,undefined);
  const same=prepareAssistantContext(content,{...request,conversationId:current.turn.conversationId},[store.turn(ids[2])],config,store);
  assert.ok(!same.context.topicHistory?.turns.some(turn=>turn.turnId===ids[2]));
  const tight=prepareAssistantContext(content,request,[],{...config,contextTokenLimit:5000},store);assert.equal(tight.context.topicHistory,undefined);
  finish(store,current.turn);const copy=fixture(t);copy.import(store.export());assert.deepEqual(copy.turn(current.turn.id).context.topicHistory,hint);
});

test('synthetic selected material bytes are reserved and rejected before either provider sends an oversized prompt',async t=>{
  const store=fixture(t),request=await input();request.researchMaterials=await createResearchMaterials(request.conversationScope.explorationId,[{...selectedNote(),text:'合成'.repeat(4000)}],[]);
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('Synthetic request must not be sent');};
  for(const run of [answer,answerWithChatGpt]){
    const state=begin(store,{...request,requestId:randomUUID()});
    await assert.rejects(()=>run({config:{...config,contextTokenLimit:14000},content,request,turn:state.turn,prepared:state.prepared,signal:new AbortController().signal,emit:()=>{},persist:()=>{},fetchImpl,auth:{getAccessToken:async()=> 'synthetic-token'}}),/预算/);
  }
  assert.equal(calls,0);
});

test('synthetic topic continues across two guides and no guide, retains constraint after six rounds, isolates themes',async t=>{
  const store=fixture(t),topic=record();let id;
  for(let i=0;i<9;i++){
    const attachment=i<2?{guideId:i?'synthetic-b':'synthetic-a',revision:1,bodySha256:'a'.repeat(64),unitId:'intro'}:{};
    const request=await input(topic,{...attachment,...(id?{conversationId:id}:{})});const {turn,prepared}=begin(store,request);id=turn.conversationId;
    assert.equal(prepared.context.researchSnapshot.constraints,topic.research.constraints);assert.ok(prepared.history.length<=6);finish(store,turn);
  }
  assert.equal(store.topicPage(topic.id).conversations.length,1);assert.equal(store.turns(id).length,9);
  const foreign=await input(record(),{conversationId:id});assert.throws(()=>begin(store,foreign),/不同/);
  const last=store.turns(id).at(-1);assert.equal(last.context.guideId,null);assert.equal(last.context.scope,'research');
});

test('synthetic snapshots reject changed digest and cross-topic identity; partial attachments rejected',async()=>{
  const request=await input();assert.throws(()=>validateAsk({...request,researchSnapshot:{...request.researchSnapshot,constraints:'tampered'}}),/摘要/);
  assert.throws(()=>validateAsk({...request,conversationScope:{kind:'exploration',explorationId:randomUUID()}}),/不一致/);
  assert.throws(()=>validateAsk({...request,unitId:'intro'}),/不完整/);
});

test('synthetic topic history and proposals are scoped, source-bound and carry exact baseline identity',async t=>{
  const store=fixture(t),topic=record();const first=begin(store,await input(topic));finish(store,first.turn);
  const second=begin(store,await input(topic,{conversationId:first.turn.conversationId,guideId:'synthetic',revision:1,bodySha256:'a'.repeat(64),unitId:'intro'}));
  const tool=second.prepared.runResearchTool;
  assert.equal(tool('search_topic_history',{query:'Synthetic'}).turns.length,1);
  const foreign=begin(store,await input());finish(store,foreign.turn);assert.ok(tool('read_topic_turn',{turnId:foreign.turn.id}).error);
  assert.throws(()=>tool('propose_research_changes',{changes:[{kind:'set-field',field:'status',value:'read'}],rationale:'Synthetic',citationIds:[]}),/字段/);
  assert.throws(()=>tool('propose_research_changes',{changes:[{kind:'set-field',field:'constraints',value:'Synthetic'}],rationale:'Synthetic',citationIds:['O1']}),/未读取/);
  tool('propose_research_changes',{changes:[{kind:'add-decision',decision:{kind:'hypothesis',status:'adopted',text:'Synthetic hypothesis',rationale:'Synthetic investigation only'}}],rationale:'Synthetic',citationIds:['L1']});
  const p=second.turn.context.researchProposals[0];assert.equal(p.sourceTurnId,second.turn.id);assert.equal(p.baseSnapshotSha256,second.turn.context.researchSnapshot.snapshotSha256);assert.equal(p.evidenceRefs[0].source.text,'Synthetic evidence');
  finish(store,second.turn);validateBackup(store.export());
});

test('synthetic v4 JSON/stream backup round trip preserves topics, proposals and snapshot hashes; legacy downgrade rejected',async t=>{
  const store=fixture(t),restored=fixture(t);const current=begin(store,await withMaterials(await input()));finish(store,current.turn);
  const backup=store.export();assert.equal(backup.schemaVersion,4);assert.throws(()=>validateBackup({...backup,schemaVersion:3}),/版本 4/);
  restored.import(backup);assert.deepEqual(restored.turn(current.turn.id),current.turn);
  const corrupt=structuredClone(backup);corrupt.turns[0].context.researchMaterials.artifacts[0].body='Synthetic corrupt backup';assert.throws(()=>validateBackup(corrupt),/摘要/);
  const target=fixture(t),chunks=[];for await(const chunk of exportBackupStream(store))chunks.push(chunk);
  assert.equal(JSON.parse(chunks[0]).schemaVersion,4);await importBackupStream(target,(async function*(){yield* chunks;})());assert.deepEqual(target.turn(current.turn.id),current.turn);
});

test('synthetic SQLite v2 migration retains verified recovery copy and restart retains topic history',async t=>{
  const base=resolve('.cache/test-workspaces');mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,'research-backend-synthetic-'));t.after(()=>{assert.ok(resolve(dir).startsWith(base+sep));rmSync(dir,{recursive:true,force:true});});
  const file=join(dir,'synthetic.sqlite');let store=new AiStore(file,{minimumFreeBytes:0});
  // Construct an old layout from a new empty synthetic database, never user data.
  store.db.exec('DROP INDEX conversations_topic; ALTER TABLE conversations DROP COLUMN exploration_id; PRAGMA user_version=2;');store.close();
  store=new AiStore(file,{minimumFreeBytes:0});assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,3);
  const backup=readdirSync(dir).find(name=>name.includes('.pre-v3-'));assert.ok(backup);const before=new DatabaseSync(join(dir,backup));assert.equal(before.prepare('PRAGMA user_version').get().user_version,2);before.close();
  const current=begin(store,await input());finish(store,current.turn);store.close();store=new AiStore(file,{minimumFreeBytes:0});assert.deepEqual(store.turn(current.turn.id),current.turn);store.close();
});

for(const provider of ['api','chatgpt'])test(`synthetic ${provider} receives same research data and can produce a validated proposal`,async t=>{
  const store=fixture(t),request=await withMaterials(await input()),{turn,prepared}=begin(store,request);const seen=[];
  const args={changes:[{kind:'set-field',field:'constraints',value:'Synthetic updated constraint'}],rationale:'Synthetic instruction',citationIds:[]};let calls=0;
  const emit=event=>{if(event.type==='delta')turn.answer+=event.text;else if(event.type==='replace')turn.answer=event.text;};
  const fetchImpl=async(_url,options)=>{const body=JSON.parse(options.body);seen.push(body);let events;
    if(provider==='api')events=[{choices:[calls++?{delta:{content:'Synthetic final'},finish_reason:'stop'}:{delta:{tool_calls:[{index:0,id:'synthetic-call',type:'function',function:{name:'propose_research_changes',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}]}];
    else {const output=calls++?[{type:'message',id:'synthetic-message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic final',annotations:[]}]}]:[{type:'function_call',id:'synthetic-item',call_id:'synthetic-call',namespace:'paperdesk',name:'propose_research_changes',arguments:JSON.stringify(args),status:'completed'}];events=[{type:'response.completed',response:{id:'synthetic-response',status:'completed',output}}];}
    return new Response(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});};
  await (provider==='api'?answer:answerWithChatGpt)({config,content,request,turn,prepared,signal:new AbortController().signal,emit,persist:()=>store.save(turn),fetchImpl,auth:{getAccessToken:async()=> 'synthetic-token'}});
  finish(store,turn);assert.equal(turn.context.researchProposals.length,1);
  const messages=provider==='api'?seen[0].messages.slice(1):seen[0].input;assert.deepEqual(messages,assembleAssistantContext(prepared,request,{...turn,context:{...turn.context,researchProposals:[]}}));
  assert.match(messages[0].content,/Synthetic constraint persists/);assert.match(messages[0].content,/Synthetic selected personal note/);assert.match(messages[0].content,/Synthetic precise plan revision/);
  assert.deepEqual(turn.context.researchMaterials,request.researchMaterials);assert.equal(turn.context.researchProposals[0].baseSnapshotSha256,request.researchSnapshot.snapshotSha256);assert.equal(calls,2);
});

test('synthetic HTTP research fallback keeps exact snapshot and discards interrupted provider proposals',async t=>{
  const store=fixture(t);let captured;
  const runtime={config:{...config,timeoutMs:10000},status:()=>({configured:true,provider:'chatgpt',apiConfigured:true,searchAvailable:false,chatgpt:{loginPending:false}}),
    resolve:async()=>({provider:'chatgpt',config,run:async({prepared,emit})=>{prepared.runResearchTool('propose_research_changes',{changes:[{kind:'set-field',field:'constraints',value:'Synthetic interrupted proposal'}],rationale:'Synthetic',citationIds:[]});emit({type:'delta',text:'Synthetic partial'});throw Error('synthetic quota');}}),
    fallbackFor:()=>({config, fallback:{reason:'subscription_quota',stage:'answer',fromModel:'synthetic-model'},run:async({turn,emit})=>{captured=structuredClone(turn.context);emit({type:'delta',text:'Synthetic API completion'});}})};
  const server=createAiServer({config:runtime.config,content,store,runtime});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.abortActive();server.closeAllConnections();await new Promise(done=>server.close(done));});
  const call=(path,body,token)=>new Promise((done,fail)=>{const payload=body?JSON.stringify(body):null;const req=httpRequest({host:'127.0.0.1',port:server.address().port,path:'/api/ai'+path,method:payload?'POST':'GET',headers:{host:'127.0.0.1:4176',...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}),...(token?{'x-paperdesk-token':token}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>done({status:res.statusCode,text}));});req.on('error',fail);req.end(payload);});
  const token=JSON.parse((await call('/status')).text).csrfToken,request=await withMaterials(await input());const response=await call('/ask',request,token);
  assert.equal(response.status,200);const events=response.text.trim().split('\n').map(JSON.parse),turn=events.find(e=>e.type==='done')?.turn;assert.ok(turn);
  assert.deepEqual(captured.researchSnapshot,request.researchSnapshot);assert.deepEqual(captured.researchMaterials,request.researchMaterials);assert.deepEqual(captured.researchProposals,[]);assert.equal(turn.context.provider,'api');
  const list=await call('/conversations?explorationId='+request.conversationScope.explorationId,undefined,token);assert.equal(JSON.parse(list.text).conversations.length,1);
});

test('synthetic multilingual history tools fit remaining escaped payload budget and declare omissions',async t=>{
  const store=fixture(t),topic=record();let prior;
  for(let i=0;i<8;i++){
    const state=begin(store,await input(topic));prior=state.turn;
    prior.question='Synthetic '+ '合成"\\😀'.repeat(250);prior.answer='合成历史"\\😀'.repeat(3500);
    prior.sources=Array.from({length:16},(_,at)=>({id:`L${at+1}`,kind:'guide',title:'Synthetic source',text:'合成来源"\\😀'.repeat(300),guideId:`synthetic-${at}`,revision:1,unitId:'intro',url:`/read/synthetic-${at}/1#intro`}));
    prior.status='complete';store.save(prior);
  }
  const state=begin(store,await input(topic)),original=structuredClone(store.turn(prior.id));
  state.turn.context.budget={method:'utf8-bytes-upper-bound',limit:20000,inputTokens:10000,outputTokens:1000};
  const search=state.prepared.runResearchTool('search_topic_history',{query:'Synthetic'});
  assert.ok(!search.error);assert.ok(search.budgetLimited);assert.equal(search.returnedCount+search.omittedCount,8);assert.equal(search.omittedTurnIds.length,search.omittedCount);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(search)))<=localResultBudget(state.turn.context,true));
  const read=state.prepared.runResearchTool('read_topic_turn',{turnId:prior.id});
  assert.ok(!read.error);assert.ok(read.answerTruncated);assert.ok(read.budgetLimited);assert.equal(read.sources.length+read.omittedSources,16);assert.equal(read.omittedCitationIds.length,read.omittedSources);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(read)))<=localResultBudget(state.turn.context));
  assert.deepEqual(store.turn(prior.id),original);assert.deepEqual(state.turn.sources,[]);
  // A normal next provider preflight still fits after adding the bounded tool result.
  checkPromptBudget({messages:[{role:'user',content:'x'.repeat(9000)},{role:'tool',tool_call_id:'synthetic',content:JSON.stringify(read)}]}, {...config,contextTokenLimit:20000});
  state.turn.context.budget.inputTokens=18900;
  for(const [name,args] of [['search_topic_history',{query:'Synthetic'}],['read_topic_turn',{turnId:prior.id}]]){
    const result=state.prepared.runResearchTool(name,args);assert.ok(result.error);assert.equal(result.budgetLimited,true);assert.ok(JSON.stringify(result).length<180);
  }
});
