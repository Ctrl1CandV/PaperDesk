import { researchHash, researchObject, validateEvidenceRefs, validLocalId, validRevision } from './research-contract.mjs';
import { ARTIFACT_KINDS } from './research-artifacts.mjs';

export const RESEARCH_MATERIAL_LIMITS = Object.freeze({ notes:8, artifacts:3, bytes:48 * 1024 });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value,max=48000) => typeof value === 'string' && value.length <= max;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const requireValue = (condition,message='已选研究材料格式无效。') => { if (!condition) throw Error(message); };

export function validateResearchMaterials(value) {
  researchObject(value,['schemaVersion','explorationId','notes','artifacts','materialsSha256']);
  requireValue(value.schemaVersion===1 && uuid(value.explorationId) && typeof value.materialsSha256==='string' && /^[a-f0-9]{64}$/.test(value.materialsSha256));
  requireValue(Array.isArray(value.notes) && value.notes.length<=RESEARCH_MATERIAL_LIMITS.notes && Array.isArray(value.artifacts) && value.artifacts.length<=RESEARCH_MATERIAL_LIMITS.artifacts,'最多选择 8 条笔记和 3 份研究文档。');
  requireValue(new Set([...value.notes,...value.artifacts].map(item=>item?.id)).size===value.notes.length+value.artifacts.length,'已选研究材料包含重复编号。');
  for (const note of value.notes) {
    researchObject(note,['id','recordRevision','guideId','revision','unitId','text','status','updatedAt'],['quote']);
    requireValue(uuid(note.id) && validRevision(note.recordRevision) && validLocalId(note.guideId) && validRevision(note.revision) && validLocalId(note.unitId)
      && text(note.text) && (note.quote===undefined || text(note.quote)) && ['open','resolved'].includes(note.status) && time(note.updatedAt));
  }
  for (const artifact of value.artifacts) {
    researchObject(artifact,['id','recordRevision','kind','title','body','sourceRecordRevision','sourceTurnId','evidenceRefs','updatedAt']);
    requireValue(uuid(artifact.id) && validRevision(artifact.recordRevision) && ARTIFACT_KINDS.includes(artifact.kind) && text(artifact.title,300) && artifact.title.trim()
      && text(artifact.body) && validRevision(artifact.sourceRecordRevision) && (artifact.sourceTurnId===null || uuid(artifact.sourceTurnId)) && time(artifact.updatedAt));
    validateEvidenceRefs(artifact.evidenceRefs);
  }
  requireValue(new TextEncoder().encode(JSON.stringify(value)).byteLength<=RESEARCH_MATERIAL_LIMITS.bytes,'已选研究材料超过 48 KiB，请减少所选内容；材料不会被截断。');
  return value;
}

// Project explicit selections only. Task exports, receipts and other record fields
// are intentionally excluded; callers keep their original records unchanged.
export async function createResearchMaterials(explorationId,notes,artifacts) {
  requireValue(Array.isArray(notes) && Array.isArray(artifacts));
  const data={schemaVersion:1,explorationId,
    notes:notes.map(note=>({id:note.id,recordRevision:note.recordRevision,guideId:note.guideId,revision:note.revision,unitId:note.unitId,text:note.text,...(note.quote===undefined?{}:{quote:note.quote}),status:note.status,updatedAt:note.updatedAt})),
    artifacts:artifacts.map(artifact=>({id:artifact.id,recordRevision:artifact.recordRevision,kind:artifact.kind,title:artifact.title,body:artifact.body,sourceRecordRevision:artifact.sourceRecordRevision,sourceTurnId:artifact.sourceTurnId,evidenceRefs:structuredClone(artifact.evidenceRefs),updatedAt:artifact.updatedAt}))};
  validateResearchMaterials({...data,materialsSha256:'0'.repeat(64)});
  return {...data,materialsSha256:await researchHash(data)};
}
export async function verifyResearchMaterials(value) {
  validateResearchMaterials(value);
  const {materialsSha256,...data}=value;
  requireValue(await researchHash(data)===materialsSha256,'已选研究材料摘要不匹配。');
  return value;
}
