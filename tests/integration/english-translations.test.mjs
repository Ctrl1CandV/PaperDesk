import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent } from '../../server/content/validation.mjs';
import { validateTranslations } from '../../server/content/translations.mjs';

// Uses the reviewed English layers committed with the two sample guides. This
// checks structure and linkage only; it is not a translation-quality review.
test('reviewed English guide translations keep the Chinese revision structure and inventories', async () => {
  const { guides } = await validateContent();
  const result = await validateTranslations({ guides });
  assert.equal(result.guides, 2);
  assert.ok(result.glossary >= 20, 'English glossary should cover the key terms used by both guides');
});
