import data from '../../content/glossary.json';
import englishData from '../../content/glossary-en.json';
import { termMatcher, termsIn, type GlossaryEntry } from '../../shared/glossary.mjs';

const entries = (data as { entries: GlossaryEntry[] }).entries;
const byId = new Map(entries.map(entry => [entry.id, entry]));
export const glossaryMatcher = termMatcher(entries);
export const glossaryEntry = (id: string) => byId.get(id);
/** Glossary entries mentioned in a guide body, in order of first appearance. */
export const glossaryTermsIn = (text: string) => termsIn(text, glossaryMatcher).map(id => byId.get(id)!);

// English cards are a separate reviewed layer. They never change the Chinese
// glossary or the immutable guide bodies.
const englishEntries = (englishData as { entries: GlossaryEntry[] }).entries;
const englishById = new Map(englishEntries.map(entry => [entry.id, entry]));
export const englishGlossaryMatcher = termMatcher(englishEntries);
export const englishGlossaryEntry = (id: string) => englishById.get(id);
