import { validateContent } from './content-validation.mjs';

try {
  const { summary } = await validateContent();
  console.log(`Content valid: ${summary.guides} guides, ${summary.units} units, ${summary.citationUrls} cited URLs, ${summary.lenses} editorial lenses, ${summary.explorationTargets} pinned targets.`);
  console.log('Structural validation only; source accuracy and rendered reading quality require separate review.');
} catch (error) {
  console.error(`Content validation failed: ${error.message}`);
  process.exitCode = 1;
}
