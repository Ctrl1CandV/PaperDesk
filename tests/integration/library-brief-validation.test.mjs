import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContent } from '../../server/content/validation.mjs';
import { validateLibraryBriefs } from '../../server/content/brief-validation.mjs';

test('library editorial briefs cover current guides while retaining immutable revision targets', async () => {
  const { guides, catalog } = await validateContent();
  const data = JSON.parse(await readFile(new URL('../../content/library-briefs.json', import.meta.url), 'utf8'));
  assert.equal(validateLibraryBriefs(data, guides), data.entries.length);
  assert.ok(data.entries.length >= Object.keys(catalog.currentRevisions).length, 'retained briefs remain bound to their old revisions');
  for (const [id, revision] of Object.entries(catalog.currentRevisions)) {
    assert.equal(data.entries.filter(entry => entry.guideId === id && entry.guideRevision === revision).length, 1);
  }
});

test('synthetic mismatched chapters and source versions cannot enter a library brief', () => {
  const guides = [{ metadata: { id: 'synthetic-paper', revision: 1, units: [{ id: 'orientation', heading: null }, { id: 'u01', heading: 'Synthetic chapter' }], source: { url: 'https://arxiv.org/pdf/2308.11432v7' } } }];
  const entry = { guideId: 'synthetic-paper', guideRevision: 1, overview: 'Synthetic overview.', value: 'Synthetic value.', advice: 'Synthetic advice.', chapterLabels: { u01: 'Synthetic chapter' }, sourceUpdatedAt: null, sourceRecordUrl: null };
  const validate = patch => validateLibraryBriefs({ schemaVersion: 1, entries: [{ ...entry, ...patch }] }, guides);
  assert.equal(validate({}), 1);
  assert.throws(() => validate({ guideRevision: 2 }), /unknown/);
  assert.throws(() => validate({ chapterLabels: { u02: 'Wrong chapter' } }), /chapter labels/);
  assert.throws(() => validate({ sourceUpdatedAt: '2025-03-02', sourceRecordUrl: 'https://arxiv.org/abs/2308.11432v6' }), /matching fixed source version/);
  assert.throws(() => validate({ sourceUpdatedAt: '2025-02-30', sourceRecordUrl: 'https://arxiv.org/abs/2308.11432v7' }), /invalid source update date/);
});
