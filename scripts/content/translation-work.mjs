// Checks or merges one English guide translation prepared in .cache/translation-work/<id>/,
// so several translations can be written at once without touching shared files.
//   node scripts/content/translation-work.mjs check <id>   preview-validate, report reading statistics
//   node scripts/content/translation-work.mjs merge <id>   add the manifest entry and new English glossary cards
// Work directory: entry.json (manifest entry without bodySha256) and glossary-en.json ({ "entries": [] } additions).
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateContent } from '../../server/content/validation.mjs';
import { validateTranslations } from '../../server/content/translations.mjs';

const [mode, id] = process.argv.slice(2);
if (!['check', 'merge'].includes(mode) || !id) { console.error('Usage: node scripts/content/translation-work.mjs check|merge <id>'); process.exit(1); }
const work = resolve('.cache/translation-work', id);
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const entry = read(resolve(work, 'entry.json'));
if (entry.guideId !== id || entry.language !== 'en') throw new Error('entry.json must name this guide with language "en"');
const additions = existsSync(resolve(work, 'glossary-en.json')) ? read(resolve(work, 'glossary-en.json')).entries ?? [] : [];
const manifest = existsSync('content/translations.json') ? read('content/translations.json') : { schemaVersion: 1, guides: [] };
const glossary = existsSync('content/glossary-en.json') ? read('content/glossary-en.json') : { schemaVersion: 1, entries: [] };
const body = readFileSync(resolve('content', entry.bodyFile));
const complete = { guideId: entry.guideId, revision: entry.revision, language: 'en', title: entry.title, bodyFile: entry.bodyFile, assets: entry.assets ?? [], bodySha256: createHash('sha256').update(body).digest('hex') };
const nextManifest = { ...manifest, guides: [...manifest.guides.filter(item => !(item.guideId === id && item.revision === entry.revision && item.language === 'en')), complete] };
const known = new Set(glossary.entries.map(item => item.id));
const nextGlossary = { ...glossary, entries: [...glossary.entries, ...additions.filter(item => !known.has(item.id))] };

const previewManifest = `content/.translations-preview-${id}.json`, previewGlossary = `content/.glossary-en-preview-${id}.json`;
writeFileSync(previewManifest, JSON.stringify(nextManifest, null, 2));
writeFileSync(previewGlossary, JSON.stringify(nextGlossary, null, 2));
try {
  const { guides } = await validateContent();
  await validateTranslations({ guides, manifestFile: previewManifest, glossaryFile: previewGlossary });
  const guide = guides.find(item => item.metadata.id === id && item.metadata.revision === entry.revision);
  if (!guide) throw new Error(`${id} r${entry.revision} is not in the catalog`);
  const text = body.toString('utf8'), words = text.split(/\s+/).filter(Boolean).length;
  // Negations per 1 000 words. Complete English versions sit at 3–9.
  const negations = (text.match(/\b(not|cannot|can't|isn't|aren't|doesn't|don't)\b/gi) ?? []).length;
  const density = Math.round(negations * 10000 / words) / 10;
  const templates = (text.match(/\b(not necessarily|does not mean|do not mean|does not prove|does not show|should not be read as|is not evidence|no guarantee)\b/gi) ?? []).length;
  // English words per Chinese character of prose, overall and per section. Complete
  // translations sit at 0.43–0.57 overall (the approved samples at 0.43–0.45) and above
  // 0.36 in every section; a lower ratio means explanation was summarized away.
  // Only prose is compared: link targets, figure lines, code and display math are the
  // same in both languages, and a long URL would otherwise count as dozens of Chinese
  // characters but one English word.
  const prose = value => value.replace(/```[\s\S]*?```/g, '').replace(/\$\$[\s\S]*?\$\$/g, '').replace(/^!\[.*$/gm, '').replace(/\]\([^)]*\)/g, ']');
  const wordsIn = value => prose(value).split(/\s+/).filter(Boolean).length;
  const charsIn = value => prose(value).replace(/\s+/g, '').length;
  const zhSections = guide.body.split(/\n(?=## )/), enSections = text.split(/\n(?=## )/);
  const ratio = wordsIn(text) / charsIn(guide.body);
  const thin = zhSections.map((section, index) => ({ index, ratio: wordsIn(enSections[index] ?? '') / charsIn(section), heading: (enSections[index] ?? '').split('\n')[0].replace(/^#+\s*/, '') })).filter(item => item.ratio < 0.31);
  console.log(`${id} r${entry.revision} en: ${words} words (Chinese prose ${charsIn(guide.body)} characters, prose ratio ${ratio.toFixed(2)}; complete translations 0.43–0.57); negations ${density} per 1 000 words (complete translations 3–9); caveat templates ${templates}; ${additions.length} English glossary additions (${additions.filter(item => known.has(item.id)).length} already present).`);
  if (ratio < 0.38) throw new Error(`English body is a condensed version (prose ratio ${ratio.toFixed(2)} < 0.38). Translate every paragraph in full per GUIDE-WRITING.md §13.`);
  if (ratio < 0.41) console.log('Warning: the English body is shorter than complete translations; compare section by section for omitted explanation.');
  for (const item of thin) console.log(`Warning: section ${item.index} "${item.heading}" is condensed (prose ratio ${item.ratio.toFixed(2)} < 0.31).`);
  if (density > 10) console.log('Warning: dense negation. Apply GUIDE-WRITING.md §4.4 in English: state each condition once, inside the conclusion.');
  if (density < 3) console.log('Warning: almost no qualifying conditions remain. Check that the Chinese guide’s necessary conditions survived translation.');
  if (templates > 4) console.log('Warning: repeated caveat templates ("not necessarily", "does not mean" …) read like a reviewer’s notes.');
} finally { rmSync(previewManifest, { force: true }); rmSync(previewGlossary, { force: true }); }
if (mode === 'merge') {
  writeFileSync('content/translations.json', JSON.stringify(nextManifest, null, 2) + '\n');
  writeFileSync('content/glossary-en.json', JSON.stringify(nextGlossary, null, 2) + '\n');
  console.log('Merged. Run npm run build to refresh the navigation index.');
} else console.log('Check passed; shared files unchanged.');
