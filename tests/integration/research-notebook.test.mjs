import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResearchSnapshot, emptyResearchState } from '../../shared/research-contract.mjs';
import { appendNotebookVersion } from '../../shared/research-notebook.mjs';
import { AiStore } from '../../server/storage/ai-store.mjs';
import { prepareAssistantContext, researchToolsForTurn } from '../../server/ai/research.mjs';
import { answer } from '../../server/ai/providers/api.mjs';
import { answerWithChatGpt } from '../../server/ai/providers/chatgpt.mjs';

// Synthetic records, mocked provider streams, no model or network requests.
const config = { modelId:'synthetic-model', baseURL:'https://example.test/v1', apiKey:'synthetic-key', toolsEnabled:true, searchAvailable:false, search:{apiKey:''}, maxOutputTokens:1000, contextTokenLimit:32768 };
for (const provider of ['api', 'chatgpt']) test(`synthetic ${provider} notebook draft routes, persists and survives AI backup`, async t => {
  const store = new AiStore(':memory:'); t.after(() => store.close());
  const record = { id:randomUUID(), title:'SYNTHETIC topic', question:'SYNTHETIC question', interpretation:'', unknowns:'', recordRevision:3, evidence:[], nextAction:null,
    research:{...emptyResearchState(), notebook:appendNotebookVersion(undefined, 'SYNTHETIC reader question')} };
  const request = {requestId:randomUUID(), question:'/记录 SYNTHETIC add an uncertain idea', webSearch:false, command:{name:'notebook'}, conversationScope:{kind:'exploration',explorationId:record.id}, researchSnapshot:await createResearchSnapshot(record)};
  const prepared = prepareAssistantContext({}, request, [], config, store);
  const {turn} = store.begin(request, prepared.context, prepared.sources);
  prepared.runResearchTool = researchToolsForTurn(store, turn);
  const args = {body:'SYNTHETIC reader question\n\n〔待验证〕SYNTHETIC new idea', summary:'SYNTHETIC add uncertainty'};
  let calls = 0;
  const seen = [];
  const fetchImpl = async (_url, options) => {
    seen.push(JSON.parse(options.body));
    let events;
    if (provider === 'api') events = [{choices:[calls++ ? {delta:{content:args.body},finish_reason:'stop'} : {delta:{tool_calls:[{index:0,id:'synthetic-call',type:'function',function:{name:'update_research_notebook',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}]}];
    else {
      const output = calls++ ? [{type:'message',id:'synthetic-message',role:'assistant',status:'completed',content:[{type:'output_text',text:args.body,annotations:[]}]}] : [{type:'function_call',id:'synthetic-item',call_id:'synthetic-call',namespace:'paperdesk',name:'update_research_notebook',arguments:JSON.stringify(args),status:'completed'}];
      events = [{type:'response.completed',response:{id:'synthetic-response',status:'completed',output}}];
    }
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {headers:{'content-type':'text/event-stream'}});
  };
  const emit = event => { if (event.type === 'delta') turn.answer += event.text; else if (event.type === 'replace') turn.answer = event.text; };
  await (provider === 'api' ? answer : answerWithChatGpt)({config, content:{}, request, turn, prepared, signal:new AbortController().signal, emit, persist:()=>store.save(turn), fetchImpl, auth:{getAccessToken:async()=>'synthetic-token'}});
  turn.status = 'complete'; store.save(turn);
  assert.equal(calls, 2);
  assert.deepEqual(turn.context.notebookDraft, {...args,baseNotebookVersion:1});
  assert.equal(turn.context.researchSnapshot.notebook.body, 'SYNTHETIC reader question');
  assert.equal(turn.context.researchSnapshot.recordRevision, 3);
  assert.ok(JSON.stringify(seen[0]).includes('update_research_notebook'));
  assert.equal(record.research.notebook.versions.length, 1, 'provider never writes personal state');
  const restored = new AiStore(':memory:'); t.after(() => restored.close());
  restored.import(store.export());
  assert.deepEqual(restored.turn(turn.id).context.notebookDraft, turn.context.notebookDraft);
});
