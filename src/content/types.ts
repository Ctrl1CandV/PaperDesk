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
export interface GuideTranslationAsset { path: string; alt: string; rights: string }
export interface GuideTranslationInfo {
  title: string; bodyPath: string; bodySha256: string; assets: GuideTranslationAsset[];
}
export interface Guide {
  metadata: GuideMetadata; body: string; bodyPath: string; packageDirectory: string;
  units: { id: string; heading: string | null; markdown: string }[];
}
/** Navigation and orientation data only; no body, citations, assets or review inventory. */
export interface GuideSummary {
  metadata: Pick<GuideMetadata, 'id' | 'paperId' | 'revision' | 'title' | 'paperTitle' | 'type' | 'purpose' | 'source' | 'orientation' | 'related'> & {
    coverage: Pick<GuideMetadata['coverage'], 'limitations'>;
  };
  units: GuideMetadata['units'];
  /** Declared figure assets with intrinsic sizes, derived by build-index. */
  figures: FigureInfo[];
  bodyPath: string;
  packageDirectory: string;
  /** Optional reviewed alternate-language bodies; the `en` key is currently used. */
  translations?: { en?: GuideTranslationInfo };
  /** Optional talk outline prepared from this revision. */
  presentation?: PresentationInfo;
}
export interface PresentationInfo { path: string; sha256: string; title: string; minutes: number; stops: number }
export interface TalkPoint { key?: string; text: string }
export interface TalkSource { label: string; url: string }
/** One stop on the talk's map: a branch leaf with its own web content. */
export interface TalkStop {
  id: string; title: string; label: string; minutes: number; unitId?: string; message: string;
  points?: TalkPoint[]; figure?: { asset: string; caption: string };
  table?: { columns: string[]; rows: string[][]; note?: string };
  notes: string[]; sources?: TalkSource[];
}
export interface TalkPart { id: string; title: string; summary: string; stops: TalkStop[] }
export interface Presentation {
  schemaVersion: 1; guideId: string; revision: number; title: string; minutes: number; thesis: string; review: string;
  opening: { minutes: number; message: string; unitId?: string; notes: string[]; sources?: TalkSource[] };
  parts: TalkPart[];
  closing: { title: string; minutes: number; message: string; unitId?: string; points: TalkPoint[]; notes: string[]; sources?: TalkSource[] };
}
export interface FigureInfo { path: string; alt: string; origin: string; rights: string; width?: number; height?: number }
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
