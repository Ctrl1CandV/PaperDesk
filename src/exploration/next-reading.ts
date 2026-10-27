import type { GuideSummary, GuideOrientation } from '../content/types';
import type { GuideTarget } from '../records/types';

/** This is explicit catalog matching, not semantic inference about a reader. */
export type ReadingTopic = GuideOrientation['topics'][number];
export interface ReadingRequest { text: string; topicIds: string[] }
export interface ReadingCandidate {
  guide: GuideSummary; target: GuideTarget; heading: string; purpose: string; limit: string;
  matchedTopics: string[]; matchedConcepts: string[];
}
export function orientationFor(guide: GuideSummary) { return guide.metadata.orientation; }

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export function containsConcept(text: string, concept: string) {
  const haystack = normalize(text), needle = normalize(concept);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = /^[a-z0-9]/.test(needle) ? '(^|[^a-z0-9])' : '';
  const end = /[a-z0-9]$/.test(needle) ? '($|[^a-z0-9])' : '';
  return new RegExp(`${start}${escaped}${end}`, 'u').test(haystack);
}

export function findNextReadings(guides: GuideSummary[], request: ReadingRequest): ReadingCandidate[] {
  const candidates: { candidate: ReadingCandidate; rank: number; order: number }[] = [];
  guides.forEach((guide, order) => {
    const orientation = orientationFor(guide);
    if (!orientation) return;
    const matchedTopics = orientation.topics.filter(topic => request.topicIds.includes(topic.id)
      || [topic.label, ...topic.aliases].some(term => containsConcept(request.text, term))).map(topic => topic.label);
    const targets = orientation.readingTargets.map((target, targetOrder) => ({ target, targetOrder,
      matchedConcepts: target.concepts.filter(term => containsConcept(request.text, term)),
    })).filter(item => guide.units.some(unit => unit.id === item.target.unitId));
    // A specific question about planning should prefer the planning section over
    // an introductory section that merely shares the broad topic name "Agent".
    const targetWeight = (terms: string[]) => terms.reduce((sum, term) => sum +
      (containsConcept(orientation.shortTitle, term) || containsConcept(guide.metadata.paperTitle, term) ? .5 : 1), 0);
    targets.sort((a, b) => targetWeight(b.matchedConcepts) - targetWeight(a.matchedConcepts) || a.targetOrder - b.targetOrder);
    const selected = targets[0];
    if (!selected || (!matchedTopics.length && !selected.matchedConcepts.length)) return;
    candidates.push({ rank: matchedTopics.length * 2 + selected.matchedConcepts.length, order, candidate: {
      guide, target: { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: selected.target.unitId },
      heading: guide.units.find(unit => unit.id === selected.target.unitId)!.heading ?? '阅读起点',
      purpose: selected.target.purpose, limit: selected.target.limit, matchedTopics, matchedConcepts: selected.matchedConcepts,
    } });
  });
  return candidates.sort((a, b) => b.rank - a.rank || a.order - b.order).slice(0, 3).map(item => item.candidate);
}

export function literatureBrief(request: ReadingRequest, topics: ReadingTopic[], candidates: ReadingCandidate[]) {
  const labels = topics.filter(topic => request.topicIds.includes(topic.id)).map(topic => topic.label);
  return `文献检索任务\n\n本次主动选入的问题或阅读目标：\n${request.text || '尚未填写，请补充想解决的问题。'}\n\n指定主题：${labels.join('、') || '未指定'}\n\n本库可对照的材料：\n${candidates.length ? candidates.map(item => `- ${item.guide.metadata.paperTitle}：${item.purpose}`).join('\n') : '当前库未找到符合所选主题或概念的阅读目标。'}\n\n希望补充的证据或知识：\n请补充需要比较的方法、需要解释的机制，或需要检验的适用条件。\n\n候选筛选要求：\n核实原论文题名、作者、年份、正式发表或预印本身份与来源；说明它与上述问题的关系、建议阅读位置及适用限制。区分综述与具体研究，标明是否取得全文。\n\n这是待执行的检索任务；平台尚未联网寻找文献，也未判定研究空白。`;
}
