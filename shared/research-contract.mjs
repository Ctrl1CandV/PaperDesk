// Shared, data-only research protocol. No provider or storage dependencies.
import { validateResearchArtifacts } from './research-artifacts.mjs';
export const RESEARCH_FIELDS = ['question', 'interpretation', 'unknowns', 'scope', 'constraints', 'candidates', 'deferred'];
export function canonicalResearch(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalResearch).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalResearch(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function researchHash(value) {
  const bytes = new TextEncoder().encode(canonicalResearch(value));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max = 12000) => typeof value === 'string' && value.length <= max;
export function researchObject(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value,key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw Error('研究数据字段无效。');
}
const assert = (condition, message = '研究数据格式无效。') => { if (!condition) throw Error(message); };
export function validateResearchDecision(value) {
  researchObject(value, ['id','kind','status','text','rationale','sourceTurnId','evidenceRefs','createdAt'], ['supersedes']);
  assert(uuid(value.id) && ['interpretation','hypothesis','constraint','direction','next-step'].includes(value.kind) && ['adopted','deferred','rejected'].includes(value.status));
  assert(text(value.text) && value.text.trim() && text(value.rationale) && (value.sourceTurnId === null || uuid(value.sourceTurnId)));
  assert(typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) && new Date(value.createdAt).toISOString() === value.createdAt);
  assert(value.supersedes === undefined || uuid(value.supersedes));
  validateEvidenceRefs(value.evidenceRefs);
}
export function validateEvidenceRefs(refs) {
  assert(Array.isArray(refs) && refs.length <= 40);
  for (const ref of refs) {
    researchObject(ref, ['turnId','citationId','source']);
    assert(uuid(ref.turnId) && /^[LOW][1-9]\d{0,3}$/.test(ref.citationId));
    const s=ref.source;
    researchObject(s,['id','kind','title','text'],['url','guideId','revision','unitId','bodySha256','version','paperId','sourceRevisionId','materialSha256','parserRevision','sourceUnitId','locator','gaps','verification','readRanges']);
    assert(s.id === ref.citationId && ['guide','original','web'].includes(s.kind) && text(s.text,100000) && text(s.title,1000));
    assert(s.version === undefined || s.version === null || text(s.version,1000));
    if(s.kind === 'guide') {
      assert(/^L/.test(s.id) && validLocalId(s.guideId) && validRevision(s.revision) && validLocalId(s.unitId) && s.url === `/read/${s.guideId}/${s.revision}#${s.unitId}` && (s.bodySha256 === undefined || hash(s.bodySha256)));
      assert(!['paperId','sourceRevisionId','materialSha256','parserRevision','sourceUnitId','locator','gaps','verification','readRanges'].some(k=>Object.hasOwn(s,k)));
    } else {
      assert(safeResearchUrl(s.url) && s.guideId === undefined && s.revision === undefined && s.unitId === undefined && s.bodySha256 === undefined);
      if(s.kind === 'web') assert(/^W/.test(s.id) && !['paperId','sourceRevisionId','materialSha256','parserRevision','sourceUnitId','locator','gaps','verification','readRanges'].some(k=>Object.hasOwn(s,k)));
      else {
        assert(/^O/.test(s.id) && text(s.paperId,200) && s.paperId && validLocalId(s.sourceRevisionId) && hash(s.materialSha256) && hash(s.parserRevision) && validLocalId(s.sourceUnitId));
        validateResearchLocator(s.locator);assert(['unreviewed','text-checked','visually-checked'].includes(s.verification) && Array.isArray(s.gaps) && s.gaps.length<=20 && s.gaps.every(g=>text(g,1000)));
        if(s.readRanges!==undefined){assert(Array.isArray(s.readRanges)&&s.readRanges.length<=32);let end=-1,total;for(const r of s.readRanges){researchObject(r,['start','end','total']);assert([r.start,r.end,r.total].every(Number.isSafeInteger)&&r.start>=0&&r.end>r.start&&r.end<=r.total&&r.total<=100000&&r.start>end&&(total===undefined||total===r.total));end=r.end;total=r.total;}}
      }
    }
    assert(JSON.stringify(s).length <= 130000);
  }
}
export const validLocalId=value=>typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
export const validRevision=value=>Number.isSafeInteger(value)&&value>0;
export function safeResearchUrl(value){try{const u=new URL(value);return text(value,4096)&&['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
export function validateResearchLocator(value){researchObject(value,['label','physicalPage','printedPageLabel','anchor']);assert(text(value.label,1000)&&(value.physicalPage===null||validRevision(value.physicalPage))&&(value.printedPageLabel===null||text(value.printedPageLabel,100))&&(value.anchor===null||text(value.anchor,300)));}
export function validateResearchState(value) {
  researchObject(value, ['scope','constraints','candidates','deferred','decisions','appliedProposalIds'], ['artifacts','appliedProposals']);
  for (const field of ['scope','constraints','candidates','deferred']) assert(text(value[field]));
  assert(Array.isArray(value.decisions) && value.decisions.length <= 200);
  value.decisions.forEach(validateResearchDecision);
  assert(new Set(value.decisions.map(d => d.id)).size === value.decisions.length);
  assert(Array.isArray(value.appliedProposalIds) && value.appliedProposalIds.length <= 1000 && value.appliedProposalIds.every(uuid));
  assert(new Set(value.appliedProposalIds).size === value.appliedProposalIds.length);
  if (value.appliedProposals !== undefined) {
    assert(Array.isArray(value.appliedProposals) && value.appliedProposals.length <= 1000);
    value.appliedProposals.forEach(validateResearchProposal);
    assert(new Set(value.appliedProposals.map(p=>p.id)).size === value.appliedProposals.length && value.appliedProposals.every(p=>value.appliedProposalIds.includes(p.id)));
  }
  if (value.artifacts !== undefined) validateResearchArtifacts(value.artifacts);
}
export const emptyResearchState = () => ({scope:'',constraints:'',candidates:'',deferred:'',decisions:[],appliedProposalIds:[]});
export function researchSnapshotData(record) {
  const research = record.research ?? emptyResearchState();
  const superseded=new Set(research.decisions.flatMap(d=>d.supersedes?[d.supersedes]:[]));
  const data={ schemaVersion:1, explorationId:record.id, recordRevision:record.recordRevision, title:record.title, question:record.question, interpretation:record.interpretation, unknowns:record.unknowns,
    scope:research.scope, constraints:research.constraints, candidates:research.candidates, deferred:research.deferred, decisions:research.decisions.filter(d=>!superseded.has(d.id)), evidence:[], nextAction:record.nextAction,
    omitted:{decisionIds:research.decisions.filter(d=>superseded.has(d.id)).map(d=>d.id),evidenceIds:record.evidence.map(e=>e.id),reason:'superseded-decisions-and-14000-byte-evidence-budget'} };
  // Preserve all effective decisions and explicit fields. Admit whole evidence
  // newest first; record every omission rather than silently shortening quotes.
  for(const evidence of [...record.evidence].reverse()){
    const candidate={...data,evidence:[evidence,...data.evidence],omitted:{...data.omitted,evidenceIds:data.omitted.evidenceIds.filter(id=>id!==evidence.id)}};
    if(new TextEncoder().encode(JSON.stringify(candidate)).byteLength<=14000){data.evidence=candidate.evidence;data.omitted=candidate.omitted;}
  }
  return data;
}
export async function createResearchSnapshot(record) { const data = researchSnapshotData(record); return {...data,snapshotSha256:await researchHash(data)}; }
export function validateResearchSnapshot(value) {
  researchObject(value, ['schemaVersion','explorationId','recordRevision','title',...RESEARCH_FIELDS,'decisions','evidence','nextAction','snapshotSha256'],['omitted']);
  assert(value.schemaVersion === 1 && uuid(value.explorationId) && Number.isSafeInteger(value.recordRevision) && value.recordRevision > 0 && hash(value.snapshotSha256));
  for (const field of ['title',...RESEARCH_FIELDS]) assert(text(value[field]));
  assert(Array.isArray(value.decisions) && value.decisions.length <= 200); value.decisions.forEach(validateResearchDecision);
  assert(Array.isArray(value.evidence) && value.evidence.length <= 100 && JSON.stringify(value).length <= 160000, '研究上下文过大，请缩小已选材料。');
  const target=t=>{researchObject(t,['guideId','revision','unitId']);assert(validLocalId(t.guideId)&&validRevision(t.revision)&&validLocalId(t.unitId));};
  for(const e of value.evidence){
    const required=['id','provenance','text'];
    if(e.provenance==='guide-excerpt')required.push('target','sources');
    else if(e.provenance==='original-excerpt')required.push('source');
    else assert(e.provenance==='reader-observation');
    researchObject(e,required,['target','comment','relatedNoteId','blockFingerprint']);assert(uuid(e.id)&&text(e.text,20000)&&e.text.length>0);
    if(e.target!==undefined)target(e.target);if(e.comment!==undefined)assert(text(e.comment,20000));if(e.relatedNoteId!==undefined)assert(uuid(e.relatedNoteId));if(e.blockFingerprint!==undefined)assert(text(e.blockFingerprint,200));
    if(e.provenance==='guide-excerpt'){assert(Array.isArray(e.sources)&&e.sources.length<=100);for(const s of e.sources){researchObject(s,['url','label','version']);assert(safeResearchUrl(s.url)&&text(s.label,600)&&(s.version===null||text(s.version,100)));}}
    if(e.provenance==='original-excerpt'){researchObject(e.source,['identity','locator','version']);assert(text(e.source.identity,4096)&&e.source.identity.trim()&&!/^(?:javascript|data|file):/i.test(e.source.identity)&&(!/^https?:/i.test(e.source.identity)||safeResearchUrl(e.source.identity))&&text(e.source.locator,600)&&(e.source.version===null||text(e.source.version,100)));}
  }
  assert(new Set(value.evidence.map(e=>e.id)).size===value.evidence.length);
  if(value.nextAction!==null){researchObject(value.nextAction,['kind','description'],['target']);assert(['read-guide','check-concept','compare-evidence','search-literature'].includes(value.nextAction.kind)&&text(value.nextAction.description,2000)&&value.nextAction.description.trim());if(value.nextAction.target!==undefined)target(value.nextAction.target);if(value.nextAction.kind==='read-guide')assert(value.nextAction.target);}
  if(value.omitted!==undefined){researchObject(value.omitted,['decisionIds','evidenceIds','reason']);assert(value.omitted.reason==='superseded-decisions-and-14000-byte-evidence-budget');for(const field of ['decisionIds','evidenceIds'])assert(Array.isArray(value.omitted[field])&&value.omitted[field].length<=200&&value.omitted[field].every(uuid)&&new Set(value.omitted[field]).size===value.omitted[field].length);assert(!value.omitted.evidenceIds.some(id=>value.evidence.some(e=>e.id===id))&&!value.omitted.decisionIds.some(id=>value.decisions.some(d=>d.id===id)));}
  return value;
}
export async function verifyResearchSnapshot(value) {
  validateResearchSnapshot(value); const { snapshotSha256, ...data } = value;
  assert(await researchHash(data) === snapshotSha256, '研究快照摘要不匹配。'); return value;
}
export function validateResearchProposal(value) {
  researchObject(value, ['id','explorationId','baseRecordRevision','baseSnapshotSha256','sourceTurnId','changes','rationale','evidenceRefs']);
  assert(uuid(value.id) && uuid(value.explorationId) && uuid(value.sourceTurnId) && Number.isSafeInteger(value.baseRecordRevision) && value.baseRecordRevision > 0 && hash(value.baseSnapshotSha256));
  assert(text(value.rationale) && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= 12);
  for (const change of value.changes) {
    if (change.kind === 'set-field') { researchObject(change,['kind','field','value']); assert(RESEARCH_FIELDS.includes(change.field) && text(change.value)); }
    else { researchObject(change,['kind','decision']); assert(change.kind === 'add-decision'); validateResearchDecision(change.decision); assert(change.decision.sourceTurnId === value.sourceTurnId); }
  }
  validateEvidenceRefs(value.evidenceRefs); return value;
}
