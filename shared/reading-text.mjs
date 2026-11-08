import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

// The same text convention is used by browser excerpts and source validation.
// Keep word/cell boundaries; do not erase whitespace to make unrelated text fit.
export const normalizeReadingText = value => value.replace(/\s+/gu, ' ').trim();
export const readingMathText = (source, display = false) => display ? `$$${source.trimEnd()}$$` : `$${source.trimEnd()}$`;

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
function textOf(node) {
  if (['definition', 'html', 'image', 'imageReference'].includes(node.type) || node.type === 'code' && node.lang === 'mermaid') return '';
  if (node.type === 'inlineMath' || node.type === 'math') return readingMathText(node.value, node.type === 'math');
  if (node.type === 'break') return '\n';
  if (typeof node.value === 'string') return node.value;
  const separator = ['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow'].includes(node.type) ? '\n' : '';
  return (node.children ?? []).map(textOf).join(separator);
}
export function readingTextFromMarkdown(markdown) {
  return normalizeReadingText(textOf(parser.parse(markdown)));
}
