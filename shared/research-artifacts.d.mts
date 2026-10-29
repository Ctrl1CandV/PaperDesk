import type { PersistentEvidenceRef, ResearchSnapshot } from './research-contract.mjs';
export type ArtifactKind='evidence-synthesis'|'direction-comparison'|'reading-plan'|'experiment-plan'|'stage-plan'|'harness-task';
export interface PortableSource {identity:string;title:string;url:string;version:string|null;locator:string;excerpt:string;provenance:string;gaps:string[];guideRef?:unknown;originalRef?:unknown;turnRef?:unknown}
export interface TaskItem {id:string;question:string;inputs:string[];dependsOn:string[];deliverables:string[];acceptanceCriteria:string[];stopConditions:string[]}
export interface TaskBriefVersion {format:'paperdesk-task-brief';schemaVersion:1;taskId:string;version:number;snapshotSha256:string;explorationRef:{id:string;recordRevision:number};goal:string;context:ResearchSnapshot;sources:PortableSource[];tasks:TaskItem[];executionLimits:string;requiredWorkflows:{path:string;sha256:string}[];acceptanceCriteria:string[];createdAt:string}
export interface ExecutionReceipt {format:'paperdesk-execution-receipt';schemaVersion:1;runId:string;taskRef:{taskId:string;version:number;snapshotSha256:string};status:'completed'|'partial'|'blocked'|'failed'|'cancelled';taskResults:{taskItemId:string;summary:string;outputs:string[];evidence:string[];unmetCriteria:string[];blockers:string[];contentStatus:'not-applicable'|'prepared'|'validated'|'imported'}[];unresolvedQuestions:string[];suggestedNextActions:string[];createdAt:string}
export interface ResearchArtifact {id:string;kind:ArtifactKind;title:string;body:string;recordRevision:number;sourceRecordRevision:number;sourceTurnId:string|null;evidenceRefs:PersistentEvidenceRef[];createdAt:string;updatedAt:string;taskVersions:TaskBriefVersion[];receipts:ExecutionReceipt[]}
export const ARTIFACT_KINDS: ArtifactKind[];
export function validateTaskBrief(value:unknown):TaskBriefVersion;
export function verifyTaskBrief(value:unknown):Promise<TaskBriefVersion>;
export function validateReceipt(value:unknown,task?:TaskBriefVersion):ExecutionReceipt;
export function validateResearchArtifacts(value:unknown):void;
export function createResearchArtifact(input:{kind?:ArtifactKind;title:string;body?:string;recordRevision:number;sourceTurnId?:string|null;evidenceRefs?:PersistentEvidenceRef[]}):ResearchArtifact;
export function freezeTaskBrief(input:{artifact:ResearchArtifact;snapshot:ResearchSnapshot;sources:PortableSource[];tasks:TaskItem[];executionLimits:string;acceptanceCriteria:string[];requiredWorkflows:{path:string;sha256:string}[]}):Promise<TaskBriefVersion>;
export function receiveExecutionReceipt(artifact:ResearchArtifact,receipt:unknown):ResearchArtifact;
export function receiptTemplate(task:TaskBriefVersion):ExecutionReceipt;
export function renderTaskBrief(task:TaskBriefVersion):string;
