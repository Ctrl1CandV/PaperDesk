import type { GuideSummary } from '../content/types';

/**
 * The shelf's public editorial reading collections, as described in
 * docs/content/RESEARCH-READING-SET.md. The shelf is one list; collections only let a
 * category word such as “通信” in the search box find their articles. They say nothing
 * about what the reader has read or chosen to research.
 */
export interface ReadingCollection { id: string; title: string; terms: string[]; guideIds: string[] }
export const readingCollections: ReadingCollection[] = [
  { id: 'foundations', title: 'Agent 与大模型基础', terms: ['基础', '大模型基础', '入门'],
    guideIds: ['llm-survey', 'transformer', 'gpt3', 'instructgpt', 'rag-survey', 'rag', 'agent-survey', 'react'] },
  { id: 'communication', title: '多智能体通信', terms: ['通信', '多智能体', '多智能体通信'],
    guideIds: ['multi-agent-communication-survey', 'multi-agent-collaboration-survey', 'camel', 'autogen', 'agentprune'] },
  { id: 'evaluation', title: 'Agent 与模型评价', terms: ['评价', '评测', '评估'],
    guideIds: ['llm-evaluation-survey', 'agent-evaluation-survey', 'helm', 'agentbench', 'tau-bench'] },
];

/**
 * Category words under which a guide can be found. Collection titles are not included: “Agent 与大模型基础”
 * would make every foundation paper match “Agent”. A whole title still names its collection exactly.
 */
export function collectionTerms(guide: GuideSummary) {
  return readingCollections.filter(collection => collection.guideIds.includes(guide.metadata.id)).flatMap(collection => collection.terms);
}

/** The collection a whole query names, if any: “通信” then means that collection, not any article that mentions it. */
export function collectionForQuery(query: string) {
  const term = query.normalize('NFKC').trim().toLocaleLowerCase();
  return term ? readingCollections.find(collection => [collection.title, ...collection.terms].some(item => item.toLocaleLowerCase() === term)) : undefined;
}
