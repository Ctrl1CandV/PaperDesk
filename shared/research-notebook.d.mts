export interface NotebookVersion { version:number; body:string; author:'reader'|'assistant'; createdAt:string; sourceTurnId?:string; restoredFrom?:number; note?:string }
export interface ResearchNotebook { versions:NotebookVersion[] }
export interface NotebookDraft { body:string; summary:string; baseNotebookVersion:number }
export const NOTEBOOK_LIMITS:Readonly<{body:number;versions:number;note:number}>;
export interface WorkingPaperSection { heading:string; becomes:string; hint:string }
export const WORKING_PAPER_SECTIONS:readonly WorkingPaperSection[];
export function workingPaperTemplate(fields?:{motivation?:string;known?:string;judgement?:string;unknowns?:string;experiments?:string;log?:string}):string;
export function stageEntries(body?:string):{date:string;text:string}[];
export function appendStageEntry(body:string|undefined,date:string,text:string):string;
export function withoutPlaceholders(body?:string):string;
export function currentNotebook(notebook?:ResearchNotebook):NotebookVersion|undefined;
export function validateNotebookVersion(value:unknown):NotebookVersion;
export function validateResearchNotebook(value:unknown):ResearchNotebook;
export function validateNotebookDraft(value:unknown):NotebookDraft;
export function appendNotebookVersion(notebook:ResearchNotebook|undefined,body:string,options?:{author?:'reader'|'assistant';sourceTurnId?:string;restoredFrom?:number;note?:string;createdAt?:string}):ResearchNotebook;
