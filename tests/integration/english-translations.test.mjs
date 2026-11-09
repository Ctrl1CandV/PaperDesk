import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContent } from '../../server/content/validation.mjs';
import { validateTranslations } from '../../server/content/translations.mjs';

// Checks structure and linkage only; it is not a translation-quality review.
test('every current guide has a structurally valid English edition', async () => {
  const { guides } = await validateContent();
  const result = await validateTranslations({ guides });
  const catalog = JSON.parse(await readFile(new URL('../../content/catalog.json', import.meta.url), 'utf8'));
  assert.equal(result.guides, Object.keys(catalog.currentRevisions).length);
  assert.ok(result.glossary >= 20, 'English glossary should cover key terms used by the guides');
});
