export interface ReadingAssignmentBatch { id:string; collectionId:string; titleAliases:string[]; guides:{guideId:string;revision:number}[] }
export interface ReadingAssignmentManifest { batches:ReadingAssignmentBatch[]; activeBatchIds:string[] }
export interface ReadingAssignmentIssue { batchId:string; reason:'ambiguous'|'unavailable'|'capacity'|'conflict' }
export interface ReadingAssignmentResult { saved:number; added:number; issues:ReadingAssignmentIssue[] }
export function normalizeAssignmentTitle(value:string):string;
export function validateReadingAssignments(value:unknown, hasGuide?:(id:string,revision:number)=>boolean):void;
export function planReadingAssignments(records:any[], manifest?:ReadingAssignmentManifest, hasGuide?:(id:string,revision:number)=>boolean):{updates:{record:any;expectedRevision:number;added:number}[];issues:ReadingAssignmentIssue[]};
export function consumeReadingAssignments(options:{manifest?:ReadingAssignmentManifest;list:()=>Promise<any[]>;save:(record:any,expectedRevision:number)=>Promise<unknown>;hasGuide?:(id:string,revision:number)=>boolean;isConflict?:(error:unknown)=>boolean}):Promise<ReadingAssignmentResult>;
