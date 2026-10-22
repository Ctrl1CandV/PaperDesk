import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Guide } from '../content/types';
import type { ReadingContext } from '../handoff/PacketDialog';

export function sectionContext(guide: Guide, unitId: string): ReadingContext {
  const unit = guide.units.find(unit => unit.id === unitId) ?? guide.units[0];
  const tree = unified().use(remarkParse).use(remarkGfm).parse(unit.markdown);
  function plain(node: { type: string; value?: string; children?: unknown[] }): string {
    if (node.type === 'definition') return '';
    if (typeof node.value === 'string') return node.value;
    const separator = ['root', 'list', 'table', 'tableRow'].includes(node.type) ? '\n\n' : '';
    return (node.children ?? []).map(child => plain(child as Parameters<typeof plain>[0])).filter(Boolean).join(separator);
  }
  const sources = guide.metadata.citations.filter(citation => unit.markdown.includes(citation.url)).map(citation => ({ url: citation.url, version: citation.sourceVersion, label: citation.labels.filter(label => unit.markdown.includes(`[${label}]`)).join('；') || citation.labels[0] }));
  return { guide, unitId: unit.id, locator: `${unit.id} · ${unit.heading ?? '阅读起点'}`, text: plain(tree), sources };
}
