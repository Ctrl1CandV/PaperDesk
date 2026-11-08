import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReadingText, readingMathText, readingTextFromMarkdown } from '../../shared/reading-text.mjs';

test('synthetic reading text keeps words, block and table cell boundaries', () => {
  const markdown = '# SYNTHETIC heading\n\nOne **bold** [label](https://synthetic.invalid).\n\nNext paragraph.\n\n| left | right |\n| --- | --- |\n| first | second |\n\n- Third\n- Fourth';
  assert.equal(readingTextFromMarkdown(markdown), 'SYNTHETIC heading One bold label. Next paragraph. left right first second Third Fourth');
  assert.equal(normalizeReadingText(' SYNTHETIC\n\t first  second '), 'SYNTHETIC first second');
  assert.notEqual(normalizeReadingText('first second'), normalizeReadingText('firstsecond'));
});

test('synthetic math excerpts use the source once for inline and display formulae', () => {
  assert.equal(readingTextFromMarkdown('SYNTHETIC $2T\\times8d$.\n\n$$\nx^2 + y^2\n$$'), 'SYNTHETIC $2T\\times8d$. $$x^2 + y^2$$');
  assert.equal(readingMathText('x'), '$x$');
  assert.equal(readingMathText('x', true), '$$x$$');
  assert.equal(readingMathText('x \n'), '$x$');
});

test('synthetic source text excludes non-prose figure, diagram and definition payloads', () => {
  const markdown = 'SYNTHETIC before.\n\n![An image](image.png "Caption")\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nAfter [a source][ref].\n\n[ref]: https://synthetic.invalid';
  assert.equal(readingTextFromMarkdown(markdown), 'SYNTHETIC before. After a source.');
});
