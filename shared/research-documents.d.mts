import type { BriefPurpose } from './research-artifacts.mjs';
import type { ResearchStage } from './research-contract.mjs';
export type ResearchCommand = { name: 'direction' } | { name: 'reading-brief'; purpose: BriefPurpose };
export type ParsedCommand = { command: { name: 'direction' } | { name: 'reading-brief'; purpose?: BriefPurpose }; rest: string };
export interface ReadingBriefSection { title:string; keywords:string[]; hint:Record<BriefPurpose,string> }
export const BRIEF_PURPOSES: Readonly<Record<BriefPurpose,{label:string;description:string}>>;
export const STAGE_LABELS: Readonly<Record<ResearchStage,{label:string;doing:string;done:string}>>;
export const READING_BRIEF: Readonly<{label:string;fileName:string;sections:ReadingBriefSection[]}>;
export function parseCommand(text:string):ParsedCommand|null;
export function validCommand(value:unknown):value is ResearchCommand;
export function commandInstruction(command:ResearchCommand, options:{linked:boolean}):string;
export function readingBriefTitle(markdown:string):string|null;
export function checkDocumentSections(markdown:string):{present:string[];missing:string[]};
export function documentPreamble(input:{purpose?:BriefPurpose;savedAt:string;containerTitle:string;workflows?:{path:string;sha256:string}[]}):string;
