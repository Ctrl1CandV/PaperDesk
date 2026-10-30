export interface PersistentEvidenceRef { turnId: string; citationId: string; source: { id: string; kind: 'guide'|'original'|'web'; text: string; [key: string]: unknown } }
export interface ResearchDecision { id:string; kind:'interpretation'|'hypothesis'|'constraint'|'direction'|'next-step'; status:'adopted'|'deferred'|'rejected'; text:string; rationale:string; sourceTurnId:string|null; evidenceRefs:PersistentEvidenceRef[]; createdAt:string; supersedes?:string }
export interface SeedDiscussion { conversationId:string; guideId:string; revision:number; guideTitle:string; turns:{turnId:string;question:string;answer:string;answerTruncated:boolean}[]; createdAt:string }
export type ResearchStage = 'broaden'|'narrow'|'question'|'validate'|'write';
export interface ResearchState { scope:string; constraints:string; candidates:string; deferred:string; decisions:ResearchDecision[]; appliedProposalIds:string[]; appliedProposals?:ResearchProposal[]; artifacts?: import('./research-artifacts.mjs').ResearchArtifact[]; seedDiscussion?:SeedDiscussion; stage?:ResearchStage; purpose?:'accumulation'; createdFromTurnId?:string; relatedGuides?:RelatedGuide[]; notebook?:import('./research-notebook.mjs').ResearchNotebook; readingAssignmentReceipts?:{batchId:string;collectionId:string}[] }
export type ResearchField = 'question'|'interpretation'|'unknowns'|'scope'|'constraints'|'candidates'|'deferred';
export type ProposalField = 'title'|'stage'|ResearchField;
export type NextActionKind = 'read-guide'|'check-concept'|'compare-evidence'|'search-literature';
export interface ProposedNextAction { kind:NextActionKind; description:string; target?:{guideId:string;revision:number;unitId:string} }
export interface ResearchSnapshot { schemaVersion:1; explorationId:string; recordRevision:number; title:string; question:string; interpretation:string; unknowns:string; scope:string; constraints:string; candidates:string; deferred:string; decisions:ResearchDecision[]; evidence:unknown[]; nextAction:unknown; snapshotSha256:string; seedDiscussion?:SeedDiscussion; stage?:ResearchStage; relatedGuides?:RelatedGuide[]; notebook?:import('./research-notebook.mjs').NotebookVersion; omitted?:{decisionIds:string[];evidenceIds:string[];reason:string} }
export type ResearchChange = {kind:'set-field';field:ProposalField;value:string}|{kind:'set-next-action';action:ProposedNextAction|null}|{kind:'add-decision';decision:ResearchDecision};
export interface ResearchProposal {id:string;explorationId:string;baseRecordRevision:number;baseSnapshotSha256:string;sourceTurnId:string;changes:ResearchChange[];rationale:string;evidenceRefs:PersistentEvidenceRef[]}
export const RESEARCH_FIELDS: ResearchField[];
export const PROPOSAL_FIELDS: ProposalField[];
export const RESEARCH_STAGES: ResearchStage[];
export interface DirectionDraft { title:string; question:string; interpretation:string; unknowns:string; scope:string; constraints:string; candidates:string; deferred:string; stage:ResearchStage; nextAction:ProposedNextAction|null; rationale:string }
export function validateDirectionDraft(value:unknown):DirectionDraft;
export const NEXT_ACTION_KINDS: NextActionKind[];
export const SEED_DISCUSSION_LIMITS: Readonly<{turns:number;question:number;answer:number;bytes:number}>;
export function canonicalResearch(value:unknown):string;
export function researchHash(value:unknown):Promise<string>;
export function researchObject(value:unknown,required:string[],optional?:string[]):void;
export function validateResearchDecision(value:unknown):void;
export function validateEvidenceRefs(value:unknown):void;
export function validateNextAction(value:unknown):void;
export function validateSeedDiscussion(value:unknown):void;
export function createSeedDiscussion(input:{conversationId:string;guideId:string;revision:number;guideTitle:string;turns:{id:string;question:string;answer:string}[]}):SeedDiscussion|undefined;
export interface RelatedGuide { guideId:string; revision:number }
export function validateRelatedGuides(value:unknown):void;
export function validateResearchState(value:unknown):void;
export function emptyResearchState():ResearchState;
export function researchSnapshotData(record:any):Omit<ResearchSnapshot,'snapshotSha256'>;
export function createResearchSnapshot(record:any):Promise<ResearchSnapshot>;
export function validateResearchSnapshot(value:unknown):ResearchSnapshot;
export function verifyResearchSnapshot(value:unknown):Promise<ResearchSnapshot>;
export function validateResearchProposal(value:unknown):ResearchProposal;
