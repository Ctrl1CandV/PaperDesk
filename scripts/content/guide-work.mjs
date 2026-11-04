// Checks or merges one guide revision prepared in .cache/guide-work/<id>/ without
// touching shared files during parallel authoring.
//   node scripts/content/guide-work.mjs check <id>   preview-validate everything, change nothing shared
//   node scripts/content/guide-work.mjs merge <id>   add catalog entry, current pointer, brief and glossary terms
// Work directory: spec.json (new-revision spec), brief.json (one library brief), glossary.json ({ entries: [] } additions).
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateContent } from '../../server/content/validation.mjs';
import { validateLibraryBriefs } from '../../server/content/brief-validation.mjs';
import { validateGlossary } from '../../shared/glossary.mjs';

const [mode, id] = process.argv.slice(2);
if (!['check', 'merge'].includes(mode) || !id) { console.error('Usage: node scripts/content/guide-work.mjs check|merge <id>'); process.exit(1); }
const work = resolve('.cache/guide-work', id);
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const spec = read(resolve(work, 'spec.json'));
const brief = read(resolve(work, 'brief.json'));
const additions = existsSync(resolve(work, 'glossary.json')) ? read(resolve(work, 'glossary.json')).entries ?? [] : [];
const catalog = read('content/catalog.json');
const briefs = read('content/library-briefs.json');
const glossary = read('content/glossary.json');
const revision = spec.revision, metadataFile = `guides/${spec.out}`;
const previous = catalog.entries.filter(entry => entry.guideId === id).at(-1);
if (!previous) throw new Error(`${id} is not in the catalog`);
if (brief.guideId !== id || brief.guideRevision !== revision) throw new Error('brief.json must name this guide and revision');

const nextCatalog = structuredClone(catalog);
if (!nextCatalog.entries.some(entry => entry.guideId === id && entry.revision === revision)) {
  const last = nextCatalog.entries.findLastIndex(entry => entry.guideId === id);
  nextCatalog.entries.splice(last + 1, 0, { ...previous, revision, metadataFile });
}
nextCatalog.currentRevisions[id] = revision;
const nextBriefs = { ...briefs, entries: [...briefs.entries.filter(entry => !(entry.guideId === id && entry.guideRevision === revision)), brief] };
const known = new Set(glossary.entries.map(entry => entry.id));
const nextGlossary = { ...glossary, entries: [...glossary.entries, ...additions.filter(entry => !known.has(entry.id))] };

const preview = `content/.catalog-preview-${id}.json`;
writeFileSync(preview, JSON.stringify(nextCatalog, null, 2));
let guides;
try { ({ guides } = await validateContent({ catalogFile: preview })); } finally { rmSync(preview, { force: true }); }
validateLibraryBriefs(nextBriefs, guides);
validateGlossary(nextGlossary, (guideId, rev, unitId) => guides.some(guide => guide.metadata.id === guideId && guide.metadata.revision === rev && (!unitId || guide.metadata.units.some(unit => unit.id === unitId))));
const guide = guides.find(item => item.metadata.id === id && item.metadata.revision === revision);
const sections = guide.body.split(/\n(?=## )/).map(part => part.length);
const long = sections.filter(length => length > 8000);
console.log(`${id} r${revision}: ${guide.body.length} characters, ${sections.length} sections (${sections.join(' ')}); brief ${brief.overview.length}/${brief.value.length}/${brief.advice.length}; ${additions.length} glossary additions (${additions.filter(entry => known.has(entry.id)).length} already present).`);
if (sections.some(length => length > 16000)) throw new Error('a section exceeds 16000 characters; split it');
// Hedging negations per 10 000 characters. The approved samples sit near 9; dense
// negation reads as a reviewer's caveats rather than an explanation.
const hedges = (guide.body.match(/不能|不等于|并不|不是|未必|不意味/g) ?? []).length;
const hedgeDensity = Math.round(hedges * 10000 / guide.body.length);
console.log(`Hedging negations: ${hedges} (${hedgeDensity} per 10 000 characters; samples ≈ 9; aim for 5–12).`);
if (hedgeDensity < 4) console.log('Warning: almost no qualifying conditions remain. GUIDE-WRITING.md §4.4 lists conditions that must stay (sample size, test split, unequal comparisons, unverified explanations).');
if (hedgeDensity > 14) console.log('Warning: too many hedging negations. Rewrite per GUIDE-WRITING.md §4.4: state each condition once inside the conclusion, drop repeated and end-of-section caveats.');
if (guide.body.length < 12000) console.log(`Warning: the body has ${guide.body.length} characters; GUIDE-WRITING.md expects about 15000–26000. Check whether the core is explained in enough depth.`);
for (const [field, minimum] of [['overview', 3], ['value', 2], ['advice', 2]]) {
  const paragraphs = brief[field].split(/\n\n+/).length;
  if (paragraphs < minimum) console.log(`Warning: brief ${field} has ${paragraphs} paragraph(s); expected at least ${minimum}.`);
}
if (long.length) console.log(`Warning: ${long.length} section(s) above 8000 characters; consider splitting.`);
if (mode === 'merge') {
  writeFileSync('content/catalog.json', JSON.stringify(nextCatalog, null, 2) + '\n');
  writeFileSync('content/library-briefs.json', JSON.stringify(nextBriefs, null, 2) + '\n');
  writeFileSync('content/glossary.json', JSON.stringify(nextGlossary, null, 1) + '\n');
  console.log('Merged. Run npm run build to refresh the navigation index.');
} else console.log('Check passed; shared files unchanged.');
