import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGlossary, termMatcher, splitTerms, termsIn } from '../../shared/glossary.mjs';

// Synthetic glossary entries for tests only; not reviewed content.
const entry = (id, aliases, extra = {}) => ({ id, term: aliases[0], aliases, field: '合成测试 · 示例', explain: '仅用于测试的合成解释。', ...extra });
const synthetic = { schemaVersion: 1, entries: [
  entry('syn-rag', ['RAG', '检索增强生成'], { full: 'Synthetic Retrieval Example' }),
  entry('syn-self-rag', ['Self-RAG']),
  entry('syn-cot', ['CoT'], { guide: '/read/synthetic-guide/1#u01' }),
] };

test('synthetic glossary validates and rejects duplicate aliases and unresolved guide links', () => {
  assert.equal(validateGlossary(synthetic, (id, revision, unit) => id === 'synthetic-guide' && revision === 1 && unit === 'u01'), 3);
  assert.throws(() => validateGlossary({ schemaVersion: 1, entries: [entry('a-1', ['XYZ']), entry('a-2', ['XYZ'])] }), /alias "XYZ"/);
  assert.throws(() => validateGlossary(synthetic, () => false), /guide does not resolve/);
  assert.throws(() => validateGlossary({ schemaVersion: 1, entries: [{ ...entry('a-3', ['ABC']), extra: 1 }] }), /unknown field/);
});

test('matcher respects word boundaries and prefers longer aliases', () => {
  const matcher = termMatcher(synthetic.entries);
  assert.deepEqual(termsIn('Self-RAG 与 RAG 不同；RAGAS 不是 RAG 的别名，CoTs 也不算。', matcher), ['syn-self-rag', 'syn-rag']);
  assert.deepEqual(termsIn('检索增强生成（RAG）', matcher), ['syn-rag']);
});

test('only the first mention of each term in a section is marked', () => {
  const matcher = termMatcher(synthetic.entries);
  const seen = new Set();
  const first = splitTerms('RAG 先检索，RAG 再生成。', matcher, seen);
  assert.deepEqual(first.filter(part => part.id).map(part => part.text), ['RAG']);
  assert.equal(first.map(part => part.text).join(''), 'RAG 先检索，RAG 再生成。');
  assert.deepEqual(splitTerms('后文的 RAG 与 CoT。', matcher, seen).filter(part => part.id).map(part => part.id), ['syn-cot']);
});
