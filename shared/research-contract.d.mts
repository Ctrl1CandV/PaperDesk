export interface PersistentEvidenceRef { turnId: string; citationId: string; source: { id: string; kind: 'guide'|'original'|'web'; text: string; [key: string]: unknown } }
export interface ResearchDecision { id:string; kind:'interpretation'|'hypothesis'|'constraint'|'direction'|'next-step'; status:'adopted'|'deferred'|'rejected'; text:string; rationale:string; sourceTurnId:string|null; evidenceRefs:PersistentEvidenceRef[]; createdAt:string; supersedes?:string }
export interface ResearchState { scope:string; constraints:string; candidates:string; deferred:string; decisions:ResearchDecision[]; appliedProposalIds:string[]; appliedProposals?:ResearchProposal[]; artifacts?: import('./research-artifacts.mjs').ResearchArtifact[] }
export type ResearchField = 'question'|'interpretation'|'unknowns'|'scope'|'constraints'|'candidates'|'deferred';
export interface ResearchSnapshot { schemaVersion:1; explorationId:string; recordRevision:number; title:string; question:string; interpretation:string; unknowns:string; scope:string; constraints:string; candidates:string; deferred:string; decisions:ResearchDecision[]; evidence:unknown[]; nextAction:unknown; snapshotSha256:string; omitted?:{decisionIds:string[];evidenceIds:string[];reason:string} }
export interface ResearchProposal {id:string;explorationId:string;baseRecordRevision:number;baseSnapshotSha256:string;sourceTurnId:string;changes:({kind:'set-field';field:ResearchField;value:string}|{kind:'add-decision';decision:ResearchDecision})[];rationale:string;evidenceRefs:PersistentEvidenceRef[]}
export const RESEARCH_FIELDS: ResearchField[];
export function canonicalResearch(value:unknown):string;
export function researchHash(value:unknown):Promise<string>;
export function researchObject(value:unknown,required:string[],optional?:string[]):void;
export function validateResearchDecision(value:unknown):void;
export function validateEvidenceRefs(value:unknown):void;
export function validateResearchState(value:unknown):void;
export function emptyResearchState():ResearchState;
export function researchSnapshotData(record:any):Omit<ResearchSnapshot,'snapshotSha256'>;
export function createResearchSnapshot(record:any):Promise<ResearchSnapshot>;
export function validateResearchSnapshot(value:unknown):ResearchSnapshot;
export function verifyResearchSnapshot(value:unknown):Promise<ResearchSnapshot>;
export function validateResearchProposal(value:unknown):ResearchProposal;
