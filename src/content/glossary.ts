import data from '../../content/glossary.json';
import { termMatcher, termsIn, type GlossaryEntry } from '../../shared/glossary.mjs';

const entries = (data as { entries: GlossaryEntry[] }).entries;
const byId = new Map(entries.map(entry => [entry.id, entry]));
export const glossaryMatcher = termMatcher(entries);
export const glossaryEntry = (id: string) => byId.get(id);
/** Glossary entries mentioned in a guide body, in order of first appearance. */
export const glossaryTermsIn = (text: string) => termsIn(text, glossaryMatcher).map(id => byId.get(id)!);
