import type { PersistentEvidenceRef } from './research-contract.mjs';
import type { ResearchArtifact } from './research-artifacts.mjs';
export interface ResearchMaterialNote { id:string; recordRevision:number; guideId:string; revision:number; unitId:string; text:string; quote?:string; status:'open'|'resolved'; updatedAt:string }
export type ResearchMaterialArtifact = Pick<ResearchArtifact,'id'|'recordRevision'|'kind'|'title'|'body'|'sourceRecordRevision'|'sourceTurnId'|'updatedAt'> & { evidenceRefs:PersistentEvidenceRef[] };
export interface ResearchMaterials { schemaVersion:1; explorationId:string; notes:ResearchMaterialNote[]; artifacts:ResearchMaterialArtifact[]; materialsSha256:string }
export const RESEARCH_MATERIAL_LIMITS: Readonly<{notes:8;artifacts:3;bytes:49152}>;
export function createResearchMaterials(explorationId:string,notes:readonly ResearchMaterialNote[],artifacts:readonly ResearchMaterialArtifact[]):Promise<ResearchMaterials>;
export function validateResearchMaterials(value:unknown):ResearchMaterials;
export function verifyResearchMaterials(value:unknown):Promise<ResearchMaterials>;
