// Entirely synthetic scale fixtures. Never opens private/ai or provider configuration.
import { mkdirSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AiStore } from '../server/store.mjs';
import { ContentIndex } from '../server/content.mjs';
import { RetrievalIndex, digest, RETRIEVAL_VERSION } from '../server/retrieval-index.mjs';
import { exportBackupStream, importBackupStream } from '../server/backup.mjs';

const base = resolve('.cache/upgrade'); mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, 'benchmark-synthetic-')), output = [];
const percentile = (list, p) => [...list].sort((a,b) => a-b)[Math.ceil(list.length * p) - 1];
function measure(run) { for (let i=0;i<10;i++) run(i); const times=[]; for(let i=0;i<100;i++){const start=performance.now();run(i);times.push(performance.now()-start);} return {samples:100,p50:percentile(times,.5),p95:percentile(times,.95)}; }
function library(count) {
  const guides=[], currentRevisions={}, entries=[];
  const themes=['attention sink 缓存 cache','retrieval query encoder 检索','memory evaluation 记忆','training ablation 消融','baseline metric 条件','marginalization RAG Sequence Token'];
  for(let i=0;i<count;i++) {
    const id=`synthetic-paper-${i}`, units=[{id:'intro',heading:null}], paragraphs=[`Synthetic scale fixture ${i}; not scholarly evidence.\n`];
    for(let j=0;j<6+i%7;j++){const heading=`Synthetic experiment ${j} ${themes[(i+j)%themes.length]}`;units.push({id:`u${j}`,heading});paragraphs.push(`## ${heading}\n\n`+Array.from({length:8+j%4},(_,k)=>`Synthetic condition ${k}: model M${i%19}, dataset D${j%7}, budget ${128+i*3}, metric ${i%11}. ${themes[(i+j+k)%themes.length]}. No actual experiment was run. 固定版本与比较条件，合成测试段落。`).join('\n')+'\n');}
    const body=paragraphs.join('\n'), metadata={id,revision:1,paperId:`synthetic:${i}`,title:`Synthetic paper ${i}`,paperTitle:`Synthetic ${i}`,bodySha256:digest(body),units,source:{version:'synthetic-v1'},coverage:{scope:'mainline'},citations:[]};
    guides.push({metadata,body});currentRevisions[id]=1;entries.push({guideId:id,revision:1});
  } return {catalog:{currentRevisions,entries},guides};
}
const store=new AiStore(join(root,'history.sqlite'));let latest, mainConversationId, count=0;
function context(){return {guideId:'synthetic-paper-0',revision:1,bodySha256:'a'.repeat(64),unitId:'intro',selection:'',scope:'section',metadataJson:'{}',historyTurnIds:[],webSearch:false,model:'synthetic-model',toolEvents:[{name:'read_section',argumentsJson:'{}',resultJson:JSON.stringify({scope:'Synthetic evidence snapshot; no scholarly result',text:'Synthetic cached evidence conditions baseline dataset. '.repeat(550)})}]};}
function add(){const request={requestId:randomUUID(),guideId:'synthetic-paper-0',revision:1,bodySha256:'a'.repeat(64),unitId:'intro',question:`Synthetic history ${count++}`,webSearch:false,...(mainConversationId && (count%3===0 || count<150) ? {conversationId:mainConversationId}: {})};const source={id:'L1',kind:'guide',guideId:request.guideId,revision:1,unitId:'intro',url:'/read/synthetic-paper-0/1#intro',title:'Synthetic source',text:'Synthetic source: varied model, dataset, baseline and evaluation conditions. '.repeat(500)};const {turn}=store.begin(request,context(),[source]);mainConversationId??=turn.conversationId;turn.answer='Synthetic answer with [L1], not a scientific result. '.repeat(650);turn.status='complete';store.save(turn);latest=turn;}
const indexes=[];
try {
 for(const size of [14,100,1000]){
  const start=performance.now(),data=library(size), file=join(root,`index-${size}.sqlite`);
  const materials=data.guides.map((g,i)=>({sourceRevisionId:`synthetic-original-${i}`,parserRevision:'a'.repeat(64),status:'partial',unitCount:1,paperId:g.metadata.paperId}));
  const reading={list:()=>materials,evidence:()=>[],documents:m=>[{id:`original:${m.sourceRevisionId}:${m.parserRevision}:p1`,kind:'original',paperId:m.paperId,sourceRevisionId:m.sourceRevisionId,parserRevision:m.parserRevision,materialSha256:'b'.repeat(64),sourceUnitId:'p1',title:'Synthetic original varied evidence',version:'synthetic-v1',text:data.guides[Number(m.sourceRevisionId.split('-').at(-1))].body.slice(0,6000),locator:{label:'Synthetic physical page 1',physicalPage:1,printedPageLabel:null,anchor:null},verification:'unreviewed',gaps:['Synthetic source only'],url:'https://example.test/synthetic.pdf#page=1'}]};
  const initial=new ContentIndex(data,{reading,index:new RetrievalIndex(file)}),buildMs=performance.now()-start;initial.close();
  const reopenStart=performance.now(),index=new ContentIndex(data,{reading,index:new RetrievalIndex(file)}),reopenMs=performance.now()-reopenStart;
  indexes.push({size,index,buildMs,reopenMs,guideBytes:data.guides.reduce((n,g)=>n+Buffer.byteLength(g.body),0),metadataBytes:Buffer.byteLength(JSON.stringify(data.catalog))+data.guides.reduce((n,g)=>n+Buffer.byteLength(JSON.stringify(g.metadata)),0),units:data.guides.reduce((n,g)=>n+g.metadata.units.length,0)});console.log(`Synthetic index ${size}: ready`);
 }
 for(const mib of [10,64,256]){
  while(store.usage().bytes<mib*1024*1024)add();
  for(const lib of indexes){let sourceCount=0;const search=measure(i=>{const result=lib.index.runLocal('search_library',{query:['缓存 attention sink','检索 query encoder','RAG baseline dataset','记忆 evaluation conditions'][i%4]},[],{indexGeneration:lib.index.generation});sourceCount+=result.results.length;});
   const conversations=measure(()=>store.listPage('synthetic-paper-0',1,{limit:100}));
   const originalSearch=measure(i=>lib.index.runLocal('search_sources',{query:['缓存 attention sink','检索 query encoder','RAG baseline dataset','记忆 evaluation conditions'][i%4],limit:12},[],{indexGeneration:lib.index.generation}));
   const page=measure(()=>store.turnSummariesPage(mainConversationId,{limit:100}));
   const checkpoint=measure(i=>{latest.answer=latest.answer.slice(0,-4)+String(i).padStart(4,'0');store.save(latest);});
   output.push({guides:lib.size,revisions:lib.size,guideUnits:lib.units,originalUnits:lib.size,guideBytes:lib.guideBytes,metadataBytes:lib.metadataBytes,assetBytes:0,historyMiB:mib,actualHistoryBytes:store.usage().bytes,turns:store.usage().turns,indexBuildMs:lib.buildMs,persistentIndexReopenMs:lib.reopenMs,search,originalSearch,page,conversations,checkpoint,errorCount:0,samples:100,sourceCount});console.log(`Synthetic grid ${lib.size}/${mib}: guide ${search.p95.toFixed(2)} ms, original ${originalSearch.p95.toFixed(2)}, page ${page.p95.toFixed(2)}, save ${checkpoint.p95.toFixed(2)}`);
  }
 }
 const restored=new AiStore(join(root,'restored.sqlite'));const restoreStart=performance.now();
 async function* bytes(){for await(const chunk of exportBackupStream(store))yield Buffer.from(chunk);}
 await importBackupStream(restored,bytes());
 if(restored.usage().turns!==store.usage().turns||restored.turn(latest.id).answer!==latest.answer)throw Error('Synthetic large restore mismatch');
 const restore={bytes:store.usage().bytes,turns:store.usage().turns,elapsedMs:performance.now()-restoreStart,status:'passed'};restored.close();
 const report={fixture:'synthetic mixed-language varied conditions; one parsed original unit per paper; no model requests',seed:'paperdesk-scale-2',node:process.versions.node,sqlite:store.db.prepare('SELECT sqlite_version() AS version').get().version,application:'0.1.0',indexer:`SQLite FTS5 + explicit bilingual terms ${RETRIEVAL_VERSION}`,rows:output,largeRestore:restore,maxRSSKiB:process.resourceUsage().maxRSS};
 writeFileSync(join(base,'scale-results.json'),JSON.stringify(report,null,2)+'\n');console.log('Synthetic scale report: .cache/upgrade/scale-results.json');
}finally{for(const item of indexes)item.index.close();store.close();}
