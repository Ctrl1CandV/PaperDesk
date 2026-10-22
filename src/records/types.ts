export type ReadingStatus = 'unread' | 'reading' | 'read' | 'deferred';
export interface GuideTarget { guideId: string; revision: number; unitId: string }
export interface SourceSnapshot { url: string; label: string; version: string | null }
export interface ResumeRecord extends GuideTarget { offset: number; updatedAt: string; blockFingerprint?: string }
export interface GuideState { guideId: string; revision: number; status: ReadingStatus; updatedAt: string }
export interface OriginalState { sourceId: string; sourceVersion: string | null; status: ReadingStatus; updatedAt: string }
export interface Note extends GuideTarget {
  id: string; text: string; quote?: string; blockFingerprint?: string;
  status: 'open' | 'resolved'; recordRevision: number; createdAt: string; updatedAt: string;
}
interface EvidenceBase { id: string; text: string; comment?: string; relatedNoteId?: string; blockFingerprint?: string }
export interface GuideEvidence extends EvidenceBase {
  provenance: 'guide-excerpt'; target: GuideTarget; sources: SourceSnapshot[];
}
export interface OriginalEvidence extends EvidenceBase {
  provenance: 'original-excerpt'; source: { identity: string; locator: string; version: string | null }; target?: GuideTarget;
}
export interface ReaderEvidence extends EvidenceBase { provenance: 'reader-observation'; target?: GuideTarget }
export type Evidence = GuideEvidence | OriginalEvidence | ReaderEvidence;
export interface NextAction {
  kind: 'read-guide' | 'check-concept' | 'compare-evidence' | 'search-literature';
  description: string; target?: GuideTarget;
}
export interface Exploration {
  id: string; title: string; question: string; origin: 'reader' | 'adapted-editorial';
  seedRef?: { revision: number; lensId: string };
  status: 'inbox' | 'exploring' | 'deferred' | 'archived'; interpretation: string; unknowns: string;
  nextAction: NextAction | null; evidence: Evidence[]; recordRevision: number; createdAt: string; updatedAt: string;
}
export interface Preferences { fontSize?: number; theme?: 'light' | 'dark' | 'system' }
export interface RecordMap { notes: Note; explorations: Exploration; resume: ResumeRecord; guideStates: GuideState; originalStates: OriginalState }
export type StoreName = keyof RecordMap;
export type NoteDraft = Omit<Note, 'recordRevision' | 'createdAt' | 'updatedAt'> & Partial<Pick<Note, 'recordRevision' | 'createdAt' | 'updatedAt'>>;
export type ExplorationDraft = Omit<Exploration, 'recordRevision' | 'createdAt' | 'updatedAt'> & Partial<Pick<Exploration, 'recordRevision' | 'createdAt' | 'updatedAt'>>;
export interface PersonalBackup {
  format: 'paperdesk-personal-backup'; schemaVersion: 1; exportedAt: string;
  resume: ResumeRecord[]; guideStates: GuideState[]; originalStates: OriginalState[];
  notes: Note[]; explorations: Exploration[]; preferences: Preferences;
}
export type ImportChoice = 'keep-local' | 'use-imported' | 'keep-both';
export interface ImportConflict { key: string; store: StoreName | 'preferences'; local: unknown; incoming: unknown; canKeepBoth: boolean }
export interface ImportPreview {
  backup: PersonalBackup; baseline: PersonalBackup;
  counts: Record<StoreName, number>; duplicates: number; conflicts: ImportConflict[];
  unavailable: string[]; missingNotes: string[];
}
