import { validateContent } from '../../server/content/validation.mjs';
import { readFile } from 'node:fs/promises';
import { validateLibraryBriefs } from '../../server/content/brief-validation.mjs';
import { validateGlossary } from '../../shared/glossary.mjs';
import { validateTranslations } from '../../server/content/translations.mjs';
import { validatePresentations } from '../../server/content/presentations.mjs';

try {
  const { summary, guides } = await validateContent();
  const briefCount = validateLibraryBriefs(JSON.parse(await readFile(new URL('../../content/library-briefs.json', import.meta.url), 'utf8')), guides);
  console.log(`Content valid: ${summary.guides} guides, ${summary.units} units, ${summary.citationUrls} cited URLs, ${summary.lenses} editorial lenses, ${summary.explorationTargets} pinned targets.`);
  console.log('Structural validation only; source accuracy and rendered reading quality require separate review.');
  console.log(`Library briefs valid: ${briefCount} revision-specific briefs.`);
  const glossary = JSON.parse(await readFile(new URL('../../content/glossary.json', import.meta.url), 'utf8'));
  const termCount = validateGlossary(glossary, (id, revision, unitId) => guides.some(guide => guide.metadata.id === id && guide.metadata.revision === revision && (!unitId || guide.metadata.units.some(unit => unit.id === unitId))));
  console.log(`Glossary valid: ${termCount} reviewed terms.`);
  const translations = await validateTranslations({ guides });
  console.log(`English translations valid: ${translations.guides} guide(s), ${translations.glossary} term(s).`);
  const presentations = await validatePresentations({ guides });
  console.log(`Talk outlines valid: ${presentations.length} presentation(s), ${presentations.reduce((sum, item) => sum + item.stops, 0)} stop(s).`);
} catch (error) {
  console.error(`Content validation failed: ${error.message}`);
  process.exitCode = 1;
}
