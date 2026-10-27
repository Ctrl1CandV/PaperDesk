import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { ReadingMaterials } from '../server/reading-materials.mjs';
import { ContentIndex } from '../server/content.mjs';
import { backupReading, restoreReading } from '../server/reading-backup.mjs';

const args = process.argv.slice(2), command = args.shift();
function option(name) { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; }
function localFile(value) {
  if (!value) throw Error('Missing file.'); const root = realpathSync('.'), path = realpathSync(resolve(value)), rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Use a project-local input file.'); return path;
}
const directory = resolve(option('directory') ?? 'private/reading');
if (relative(resolve('.'), directory).startsWith('..') || isAbsolute(relative(resolve('.'), directory))) throw Error('Use a project-local materials directory.');
const reading = new ReadingMaterials(directory), controller = new AbortController();
process.once('SIGINT', () => controller.abort());
try {
  if (command === 'backup' || command === 'restore') {
    const target=resolve(option(command==='backup'?'to':'from')??'');const rel=relative(resolve('.'),target);
    if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Use a new project-local backup directory.');
    console.log(JSON.stringify(command==='backup'?await backupReading(directory,target,controller.signal):await restoreReading(target,directory,controller.signal)));
  } else if (command === 'import') {
    const manifest = await reading.import({ file: localFile(option('file')), paperId: option('paper-id'), sourceRevisionId: option('source-id'), title: option('title'), version: option('version'), url: option('url'), finalUrl: option('final-url') ?? option('url'), format: option('format'), referenceOnly: args.includes('--reference-only') }, { signal: controller.signal });
    console.log(JSON.stringify({ sourceRevisionId: manifest.sourceRevisionId, materialSha256: manifest.materialSha256, parserRevision: manifest.parserRevision, referenceOnly: Boolean(manifest.referenceOnly), status: manifest.status, unitCount: manifest.unitCount, gaps: manifest.gaps }, null, 2));
  } else if (command === 'evidence') {
    const file = localFile(option('file')); if (statSync(file).size > 64 * 1024) throw Error('Evidence file exceeds 64 KiB.');
    const candidate = JSON.parse(readFileSync(file, 'utf8'));
    const check = await ContentIndex.load({ readingDirectory: directory });
    try { if (!check.entries.get(`${candidate.guideId}/${candidate.revision}`)?.units.some(unit => unit.id === candidate.unitId)) throw Error('Evidence guide revision/unit is unavailable.'); }
    finally { check.close(); }
    const record = reading.addEvidence(candidate);
    console.log(`Evidence retained: ${record.evidenceId}`);
  } else if (command === 'status') {
    console.log(JSON.stringify(reading.list().map(({ sourceRevisionId, paperId, status, unitCount, materialSha256, parserRevision, gaps, referenceOnly }) => ({ sourceRevisionId, paperId, status, unitCount, materialSha256, parserRevision, gaps, referenceOnly: Boolean(referenceOnly) })), null, 2));
  } else if (command !== 'reindex') throw Error('Commands: import, evidence, status, reindex, backup, restore. See docs/OPERATIONS.md.');
  if (['import', 'evidence', 'reindex'].includes(command)) {
    const index = await ContentIndex.load({ readingDirectory: directory }); console.log(`Index generation: ${index.generation}`); index.close();
  }
} catch (error) { console.error(error.name === 'AbortError' ? 'Material operation cancelled; original bytes retained.' : error.message?.includes('原文') || error.message?.startsWith('Commands:') ? error.message : 'Material operation failed; inspect input identity, format and local permissions.'); process.exitCode = 1; }
