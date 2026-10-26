import { validateContent } from './content-validation.mjs';
import { readFile } from 'node:fs/promises';
import { validateLibraryBriefs } from './library-brief-validation.mjs';

try {
  const { summary, guides } = await validateContent();
  const briefCount = validateLibraryBriefs(JSON.parse(await readFile(new URL('../content/library-briefs.json', import.meta.url), 'utf8')), guides);
  console.log(`Content valid: ${summary.guides} guides, ${summary.units} units, ${summary.citationUrls} cited URLs, ${summary.lenses} editorial lenses, ${summary.explorationTargets} pinned targets.`);
  console.log('Structural validation only; source accuracy and rendered reading quality require separate review.');
  console.log(`Library briefs valid: ${briefCount} revision-specific briefs.`);
} catch (error) {
  console.error(`Content validation failed: ${error.message}`);
  process.exitCode = 1;
}
