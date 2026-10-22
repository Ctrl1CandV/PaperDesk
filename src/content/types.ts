export interface Citation {
  id: string; url: string; labels: string[]; role: 'primary' | 'background'; sourceVersion: string | null;
}
export interface GuideOrientation {
  shortTitle: string;
  topics: { id: string; label: string; aliases: string[] }[];
  summary: string; value: string; prerequisites: string[]; boundaries: string[];
  bibliography: {
    authors: string[]; year: number | null; venue: string | null;
    publicationKind: 'conference' | 'journal' | 'preprint' | 'unknown';
    url: string; preprintYear: number | null;
  };
  readingTargets: { unitId: string; purpose: string; concepts: string[]; limit: string }[];
}
export interface GuideMetadata {
  schemaVersion: 1 | 2; id: string; paperId: string; revision: number; title: string; paperTitle: string;
  language: string; type: string; mode: string; purpose: string;
  source: { id: string; version: string | null; url: string };
  bodyFile: string; bodySha256: string;
  units: { id: string; heading: string | null }[]; citations: Citation[];
  related: { guideId: string; relation: string }[];
  assets: { path: string; sha256: string; mime: string; alt: string; origin: string; rights: string }[];
  coverage: { scope: string; basis: string; sections: string[]; figuresViewed: string[]; limitations: string[]; reviewBasis: string };
  orientation?: GuideOrientation;
}
export interface Guide {
  metadata: GuideMetadata; body: string; bodyPath: string; packageDirectory: string;
  units: { id: string; heading: string | null; markdown: string }[];
}
export interface EditorialTarget { guideId: string; revision: number; unitId: string; purpose: string }
export interface EditorialLens {
  id: string; rank: number; title: string; whyNow: string; orientation: string;
  guideRefs: EditorialTarget[]; prompt: string; selfCheck: string;
  nextAction: { kind: 'read-guide'; description: string; target: EditorialTarget };
}
export interface ExplorationSeed {
  schemaVersion: 1; revision: number; kind: 'editorial-starting-points'; language: string;
  title: string; orientation: string; evidenceBoundary: string; lenses: EditorialLens[];
}
