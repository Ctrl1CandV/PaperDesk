import data from '../../content/library-briefs.json';
import type { GuideMetadata } from '../content/types';

type LibraryBrief = {
  guideId: string;
  guideRevision: number;
  overview: string;
  value: string;
  advice: string;
  chapterLabels: Record<string, string | undefined>;
  sourceUpdatedAt: string | null;
  sourceRecordUrl: string | null;
};

const briefs: LibraryBrief[] = data.entries;

// A brief describes one approved revision; a newly imported guide must never
// inherit prose, chapter labels or dates from a different revision.
export function libraryBrief(metadata: GuideMetadata): LibraryBrief {
  return briefs.find(brief => brief.guideId === metadata.id && brief.guideRevision === metadata.revision) ?? {
    guideId: metadata.id,
    guideRevision: metadata.revision,
    overview: metadata.orientation?.summary ?? metadata.purpose,
    value: metadata.orientation?.value ?? '',
    advice: [...(metadata.orientation?.prerequisites ?? []), ...(metadata.orientation?.boundaries ?? metadata.coverage.limitations)].join(''),
    chapterLabels: {},
    sourceUpdatedAt: null,
    sourceRecordUrl: null,
  };
}

export function publicationName(venue: string | null | undefined): string {
  if (!venue) return '';
  const abbreviation = venue.match(/\(([A-Z][A-Z0-9-]{1,12})\)/)?.[1];
  const conference = venue.match(/^(NeurIPS|NIPS|ICLR|ICML|ACL|EMNLP)\b/)?.[1];
  const journal = venue.match(/^(Frontiers of Computer Science|ACM Computing Surveys)\b/)?.[1];
  return abbreviation ?? conference ?? journal ?? venue;
}

export function sourceVersionLabel(version: string | null): string {
  if (!version) return '版本未指定';
  if (version === 'Frontiers of Computer Science 2026, formal journal PDF (40 pages)') return '2026 正式期刊版（40 页）';
  if (version === 'author accepted manuscript; 44 pages; SHA-256 prefix 3bb1c56b9eea') return '作者接收稿（44 页）';
  return version.replace('camera-ready', '会议定稿').replace('conference paper', '会议版');
}
