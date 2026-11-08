import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ContentIndex } from '../../server/content/index.mjs';
import { normalizeConfig } from '../../server/config.mjs';
import { validateAsk } from '../../server/http/validation.mjs';

// Public guide bytes and synthetic questions only. In-memory index; no original
// material store, provider, credentials or saved conversation is opened.
const config = normalizeConfig({ baseURL: 'https://synthetic.invalid/v1', apiKey: 'SYNTHETIC', modelId: 'synthetic-selection-model', toolsEnabled: false });
function fixture(t) {
  const metadata = JSON.parse(readFileSync('content/guides/llm-survey.r2.json', 'utf8'));
  const body = readFileSync('content/guides/llm-survey.r2.md', 'utf8');
  const content = new ContentIndex({ catalog: { currentRevisions: { 'llm-survey': 2 } }, guides: [{ metadata, body }] });
  t.after(() => content.close());
  const guide = content.get('llm-survey', 2), unit = guide.units.find(item => item.id === 'architecture');
  const text = unit.renderedText;
  const selection = text.slice(text.indexOf('一个缓存形状表'), text.indexOf('在这个例子里')).trim();
  const input = extra => validateAsk({ requestId: randomUUID(), guideId: 'llm-survey', revision: 2, bodySha256: metadata.bodySha256,
    unitId: 'architecture', selection, question: 'SYNTHETIC：请解释选中的公开导读并保留其条件。', webSearch: false, ...extra });
  return { content, guide, unit, selection, input };
}

test('public formula and table excerpt passes the actual fixed-section backend preparation', t => {
  const { content, guide, selection, input } = fixture(t);
  assert.match(selection, /长度 \$T\$/);
  assert.match(selection, /普通多头 8 8 \$2T\\times8d\$/);
  const prepared = content.prepare(input(), [], config);
  assert.equal(prepared.context.selection, selection);
  assert.equal(prepared.context.bodySha256, guide.metadata.bodySha256);
  assert.equal(prepared.context.unitId, 'architecture');
  assert.ok(prepared.sources.some(source => source.unitId === 'architecture' && source.text.includes('一个缓存形状表')));
});

test('source validation still rejects altered formula, unrelated prose and wrong chapter', t => {
  const { content, selection, input } = fixture(t);
  for (const request of [input({ selection: selection.replace('2T\\times8d', '999T\\times8d') }),
    input({ selection: selection + ' SYNTHETIC text absent from the reviewed guide' }), input({ unitId: 'training' })]) {
    assert.throws(() => content.prepare(request, [], config), error => error.status === 400 && error.code === 'selection_mismatch');
  }
});

test('source validation retains fixed-revision checks and legacy Markdown excerpt support', t => {
  const { content, unit, input } = fixture(t);
  assert.throws(() => content.prepare(input({ bodySha256: '0'.repeat(64) }), [], config), error => error.status === 409);
  const legacy = unit.text.slice(unit.text.indexOf('**MQA'), unit.text.indexOf('一个缓存形状表')).trim();
  assert.ok(legacy.startsWith('**MQA'));
  assert.equal(content.prepare(input({ selection: legacy }), [], config).context.selection, legacy);
});
