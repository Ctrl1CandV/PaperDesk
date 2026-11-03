export interface GlossaryEntry {
  id: string;
  term: string;
  aliases: string[];
  full?: string;
  zh?: string;
  field: string;
  explain: string;
  builds?: string;
  guide?: string;
  source?: { label: string; url: string };
}
export interface Glossary { schemaVersion: 1; entries: GlossaryEntry[] }
export interface TermMatch { start: number; end: number; id: string }
export interface TermMatcher { find(value: string): TermMatch[] }
export declare const GLOSSARY_LIMITS: Readonly<{ entries: number; aliases: number; text: number; explain: number; builds: number }>;
export declare function validateGlossary(data: unknown, guideTarget?: (id: string, revision: number, unitId?: string) => boolean): number;
export declare function termMatcher(entries: GlossaryEntry[]): TermMatcher;
export declare function splitTerms(value: string, matcher: TermMatcher, seen: Set<string>): { text: string; id?: string }[];
export declare function termsIn(value: string, matcher: TermMatcher): string[];
