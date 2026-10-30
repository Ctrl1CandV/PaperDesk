export interface NotebookVersion { version:number; body:string; author:'reader'|'assistant'; createdAt:string; sourceTurnId?:string; restoredFrom?:number }
export interface ResearchNotebook { versions:NotebookVersion[] }
export interface NotebookDraft { body:string; summary:string; baseNotebookVersion:number }
export const NOTEBOOK_LIMITS:Readonly<{body:number;versions:number}>;
export function currentNotebook(notebook?:ResearchNotebook):NotebookVersion|undefined;
export function validateNotebookVersion(value:unknown):NotebookVersion;
export function validateResearchNotebook(value:unknown):ResearchNotebook;
export function validateNotebookDraft(value:unknown):NotebookDraft;
export function appendNotebookVersion(notebook:ResearchNotebook|undefined,body:string,options?:{author?:'reader'|'assistant';sourceTurnId?:string;restoredFrom?:number;createdAt?:string}):ResearchNotebook;
