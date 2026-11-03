import type { Root, Text, PhrasingContent } from 'mdast';
import { visitParents } from 'unist-util-visit-parents';
import { splitTerms, termsIn } from '../../shared/glossary.mjs';
import { glossaryMatcher } from '../content/glossary';

// Text inside these nodes keeps its own meaning (titles, link labels) and is not marked.
const skipped = new Set(['heading', 'link', 'linkReference', 'image', 'imageReference']);

/**
 * Marks the first mention of each glossary term in one rendered section. Terms
 * named in the article title are its subject, so they are not marked again.
 */
export function remarkTerms(options: { title?: string } = {}) {
  return (tree: Root) => {
    const seen = new Set<string>(options.title ? termsIn(options.title, glossaryMatcher) : []);
    const edits: { parent: { children: PhrasingContent[] }; node: Text; parts: PhrasingContent[] }[] = [];
    visitParents(tree, 'text', (node: Text, ancestors) => {
      if (ancestors.some(ancestor => skipped.has(ancestor.type))) return;
      const segments = splitTerms(node.value, glossaryMatcher, seen);
      if (!segments.some(segment => segment.id)) return;
      const parts = segments.map(segment => segment.id
        ? { type: 'emphasis', data: { hName: 'abbr', hProperties: { dataTerm: segment.id } }, children: [{ type: 'text', value: segment.text }] } as PhrasingContent
        : { type: 'text', value: segment.text } as Text);
      edits.push({ parent: ancestors.at(-1) as unknown as { children: PhrasingContent[] }, node, parts });
    });
    for (const { parent, node, parts } of edits) parent.children.splice(parent.children.indexOf(node), 1, ...parts);
  };
}
