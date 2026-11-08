import { normalizeReadingText } from '../../shared/reading-text.mjs';

const ignored = '[aria-hidden="true"], [data-reading-ignore], .overflow-hint, .teaching-diagram, .paper-figure';
const blocks = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);

function selectedText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element) {
    if (node.matches(ignored)) return '';
    // Formulae and compact citation labels are atomic source text. Never copy
    // KaTeX's duplicate accessibility/visual representations or UI abbreviations.
    if (node.hasAttribute('data-reading-text')) return node.getAttribute('data-reading-text') ?? '';
    if (node.tagName === 'BR') return '\n';
  }
  const text = [...node.childNodes].map(selectedText).join('');
  return node instanceof Element && blocks.has(node.tagName) ? `\n${text}\n` : text;
}

/** A prose range in one fixed section; a partial formula/citation keeps its whole source label. */
export function readingSelectionText(range: Range): string {
  const sourceRange = range.cloneRange();
  const atomAt = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('[data-reading-text]');
  const startAtom = atomAt(sourceRange.startContainer), endAtom = atomAt(sourceRange.endContainer);
  if (startAtom) sourceRange.setStartBefore(startAtom);
  if (endAtom) sourceRange.setEndAfter(endAtom);
  const ignoredAt = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(ignored);
  const startIgnored = ignoredAt(sourceRange.startContainer), endIgnored = ignoredAt(sourceRange.endContainer);
  if (startIgnored && startIgnored === endIgnored) return '';
  if (startIgnored) sourceRange.setStartAfter(startIgnored);
  if (endIgnored) sourceRange.setEndBefore(endIgnored);
  if (sourceRange.collapsed) return '';
  return normalizeReadingText(selectedText(sourceRange.cloneContents()));
}
