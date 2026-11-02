import type { Exploration } from '../src/records/types';
export interface ExplorationSyncWrite { explorationId:string; parents:string[]; record:Exploration|null }
export interface ExplorationRevision extends ExplorationSyncWrite { format:'paperdesk-exploration-revision'; schemaVersion:1 }
export interface ExplorationSyncHead { hash:string; parents:string[]; record:Exploration|null }
export interface ExplorationSyncEntry { explorationId:string; heads:ExplorationSyncHead[]; revisionHashes:string[] }
export interface ExplorationWorkspace { format:'paperdesk-exploration-workspace'; schemaVersion:1; explorations:ExplorationSyncEntry[] }
export const EXPLORATION_SYNC_FORMAT:'paperdesk-exploration-workspace';
export const EXPLORATION_REVISION_FORMAT:'paperdesk-exploration-revision';
export const EXPLORATION_SYNC_LIMITS:Readonly<{recordBytes:number;workspaceBytes:number;files:number;parents:number}>;
export function canonicalExplorationSync(value:unknown):string;
export function validateExplorationSyncWrite(value:unknown):ExplorationSyncWrite;
export function explorationRevisionData(input:ExplorationSyncWrite):ExplorationRevision;
export function validateExplorationRevision(value:unknown):ExplorationRevision;
export function explorationRevisionHash(value:ExplorationRevision):Promise<string>;
export function validateExplorationWorkspace(value:unknown):ExplorationWorkspace;
