import type { GuideMetadata } from '../content/types';

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
    'NeurIPS 2020 · Advances in Neural Information Processing Systems 33',
    'NIPS 2017 · Advances in Neural Information Processing Systems 30',
  ], ccf: { level: 'A', year: 2026, source: ccf2026 } },
  { kind: 'conference', names: ['ICLR 2023 · International Conference on Learning Representations', 'ICLR 2024'], ccf: { level: 'A', year: 2026, source: ccf2026 } },
  { kind: 'journal', names: ['Frontiers of Computer Science', 'Frontiers of Computer Science 20 · Article 2012627'], ccf: { level: 'B', year: 2026, source: ccf2026 } },
  { kind: 'journal', names: ['ACM Computing Surveys 46(4), Article 44'], cas: {
    zone: 1, year: 2025, category: '计算机科学',
    source: 'https://www.sci365.cn/journals/acm-computing-surveys-03600300/',
  } },
];

export function venueRanking(metadata: Pick<GuideMetadata, 'orientation'>): { label: string; edition: string; source: string; description: string } | undefined {
  const bibliography = metadata.orientation?.bibliography;
  if (!bibliography?.venue) return;
  const name = bibliography.venue.toLowerCase();
  // Exact reviewed aliases prevent workshops and similarly named journals from
  // inheriting a main conference's or a different journal's classification.
  const venue = venues.find(item => item.kind === bibliography.publicationKind && item.names.some(alias => name === alias.toLowerCase()));
  if (venue?.ccf && ['A', 'B'].includes(venue.ccf.level)) return {
    label: `CCF-${venue.ccf.level}`, edition: `${venue.ccf.year}目录`, source: venue.ccf.source,
    description: `发表渠道参考：中国计算机学会 ${venue.ccf.year} 年第七版推荐目录。点击查看目录出处。`,
  };
  if (venue?.kind === 'journal' && venue.cas && venue.cas.zone <= 2) return {
    label: `CAS-${venue.cas.zone}`, edition: `${venue.cas.year}大类`, source: venue.cas.source,
    description: `中科院期刊分区 ${venue.cas.zone} 区，${venue.cas.year} 年升级版，${venue.cas.category}大类。年版据 SCI365 公开记录，分区与武汉大学图书馆记录交叉核对；非官方原表直查。`,
  };
}
