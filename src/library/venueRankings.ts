import type { GuideMetadata } from '../content/types';
import { publicationName } from './briefs';

type VenueRanking = {
  kind: 'conference' | 'journal';
  names: string[];
  ccf?: { level: 'A' | 'B' | 'C'; year: number; source: string };
  cas?: { zone: 1 | 2 | 3 | 4; year: number; category: string; source: string };
};

const ccf2026 = 'https://www.ccf.org.cn/Academic_Evaluation/By_category/2026-03-05/861526.shtml';
// Venue-level reference editions, not grades assigned to individual papers.
// Verification and source limitations: docs/research/venue-rankings-2026-10-26.md.
const venues: VenueRanking[] = [
  { kind: 'conference', names: [
    'NeurIPS 2022 · Advances in Neural Information Processing Systems 35',
    'NeurIPS 2023 · Advances in Neural Information Processing Systems 36',
    'NeurIPS 2023',
    'NeurIPS 2020 · Advances in Neural Information Processing Systems 33',
    'NIPS 2017 · Advances in Neural Information Processing Systems 30',
  ], ccf: { level: 'A', year: 2026, source: ccf2026 } },
  { kind: 'conference', names: ['ICLR 2023 · International Conference on Learning Representations', 'ICLR 2024', 'ICLR 2025'], ccf: { level: 'A', year: 2026, source: ccf2026 } },
  { kind: 'journal', names: ['Frontiers of Computer Science', 'Frontiers of Computer Science 20 · Article 2012627'], ccf: { level: 'B', year: 2026, source: ccf2026 } },
  { kind: 'journal', names: ['ACM Computing Surveys 46(4), Article 44'], cas: {
    zone: 1, year: 2025, category: '计算机科学',
    source: 'https://www.sci365.cn/journals/acm-computing-surveys-03600300/',
  } },
];

type Kind = GuideMetadata['orientation'] extends infer O ? O extends { bibliography: { publicationKind: infer K } } ? K : never : never;

/**
 * Formal publications checked after a guide recorded a preprint or an incomplete venue.
 * The guide's own record stays unchanged; the guide still teaches from the version it names.
 * Checked 2026-11-20; sources and limits: docs/research/venue-rankings-2026-10-26.md.
 */
const formalPublications: Record<string, { kind: 'conference' | 'journal'; name: string; full?: string; detail?: string; year: number; source: string }> = {
  'multi-agent-communication-survey': { kind: 'journal', name: 'Frontiers of Computer Science', detail: '第 21 卷第 7 期，文章号 2107352，2026-05-29 在线发表', year: 2026, source: 'https://journal.hep.com.cn/fcs/EN/10.1007/s11704-026-50857-y' },
  'llm-evaluation-survey': { kind: 'journal', name: 'ACM Transactions on Intelligent Systems and Technology', detail: '第 15 卷第 3 期，文章 39', year: 2024, source: 'https://doi.org/10.1145/3641289' },
  agentprune: { kind: 'conference', name: 'ICLR 2025', full: 'International Conference on Learning Representations', year: 2025, source: 'https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html' },
  'tau-bench': { kind: 'conference', name: 'ICLR 2025', full: 'International Conference on Learning Representations', year: 2025, source: 'https://proceedings.iclr.cc/paper_files/paper/2025/file/1b126cc38b8638e07bef37e7b2bb72bf-Paper-Conference.pdf' },
  autogen: { kind: 'conference', name: 'Conference on Language Modeling (COLM)', year: 2024, source: 'https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications-via-multi-agent-conversation-framework/' },
};

// Journal names too long for a shelf row use the journal's own abbreviation.
const abbreviations: Record<string, string> = { 'Frontiers of Computer Science': 'Front. Comput. Sci.', 'ACM Transactions on Intelligent Systems and Technology': 'ACM TIST' };
const shortName = (name: string) => { const short = publicationName(name); return abbreviations[short] ?? short; };

export interface Publication {
  kind: Kind;
  /** The venue in full, for the brief. */
  name: string;
  /** A short form for a shelf row. */
  short: string;
  year: number | null;
  /** Volume, issue or the full conference name; shown on hover. */
  detail?: string;
  /** Which version the guide teaches from, when it is not the formal one. */
  basis?: string;
  source?: string;
}

/** Where the paper was published: a checked formal publication first, otherwise the guide's own record. */
export function publication(metadata: Pick<GuideMetadata, 'id' | 'orientation'>): Publication | undefined {
  const bibliography = metadata.orientation?.bibliography;
  if (!bibliography) return;
  const formal = formalPublications[metadata.id];
  const stored = bibliography.venue ?? '';
  // Notes such as "（本文采用 arXiv v2）" say which version the guide teaches from.
  const note = stored.match(/（([^）]*)）/)?.[1];
  const recorded = stored.replace(/（[^）]*）/g, '').trim();
  if (formal) {
    const basis = bibliography.publicationKind === 'preprint' ? `导读依据 ${recorded === 'arXiv' || !recorded ? 'arXiv 预印本' : recorded}${bibliography.year && bibliography.year !== formal.year ? `（${bibliography.year}）` : ''}` : undefined;
    const name = formal.name.replace(new RegExp(`\\s*${formal.year}$`), '');
    return { kind: formal.kind, name, short: shortName(name), year: formal.year, detail: [formal.full ?? '', formal.detail ?? ''].filter(Boolean).join('，') || undefined, basis, source: formal.source };
  }
  if (bibliography.publicationKind === 'preprint') return { kind: 'preprint', name: 'arXiv 预印本', short: 'arXiv', year: bibliography.year, detail: '截至 2026-11-20 未查到正式发表版本', basis: note ? `导读依据 ${note.replace(/^本文采用\s*/, '')}` : undefined };
  const name = recorded.replace(new RegExp(`\\s*${bibliography.year ?? 'NONE'}$`), '');
  return { kind: bibliography.publicationKind, name, short: shortName(name), year: bibliography.year, basis: note?.startsWith('本文采用') ? `导读依据 ${note.replace(/^本文采用\s*/, '')}` : undefined };
}

export function venueRanking(metadata: Pick<GuideMetadata, 'id' | 'orientation'>): { label: string; edition: string; source: string; description: string } | undefined {
  const bibliography = metadata.orientation?.bibliography;
  if (!bibliography?.venue) return;
  const formal = formalPublications[metadata.id];
  const kind = formal?.kind ?? bibliography.publicationKind;
  const name = (formal?.name ?? bibliography.venue.replace(/（[^）]*）/g, '').trim()).toLowerCase();
  // Exact reviewed aliases prevent workshops and similarly named journals from
  // inheriting a main conference's or a different journal's classification.
  const venue = venues.find(item => item.kind === kind && item.names.some(alias => name === alias.toLowerCase()));
  if (venue?.ccf && ['A', 'B'].includes(venue.ccf.level)) return {
    label: `CCF-${venue.ccf.level}`, edition: `${venue.ccf.year}目录`, source: venue.ccf.source,
    description: `发表渠道参考：中国计算机学会 ${venue.ccf.year} 年第七版推荐目录。点击查看目录出处。`,
  };
  if (venue?.kind === 'journal' && venue.cas && venue.cas.zone <= 2) return {
    label: `CAS-${venue.cas.zone}`, edition: `${venue.cas.year}大类`, source: venue.cas.source,
    description: `中科院期刊分区 ${venue.cas.zone} 区，${venue.cas.year} 年升级版，${venue.cas.category}大类。年版据 SCI365 公开记录，分区与武汉大学图书馆记录交叉核对；非官方原表直查。`,
  };
}
