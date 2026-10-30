import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Run after validate:content. A derived navigation manifest, never an authority
// for approved content; deliberately contains no Markdown body.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(project, 'content');
const catalogBytes = await readFile(resolve(root, 'catalog.json'));
const catalog = JSON.parse(catalogBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [];
for (const entry of catalog.entries) {
  const bytes = await readFile(resolve(root, entry.metadataFile));
  const metadata = JSON.parse(bytes);
  const directory = entry.metadataFile.slice(0, entry.metadataFile.lastIndexOf('/') + 1);
  const { id, paperId, revision, title, paperTitle, type, purpose, source, orientation, units } = metadata;
  const current = catalog.currentRevisions[id] === revision;
  entries.push({ ...entry, metadataSha256: sha256(bytes), bodySha256: metadata.bodySha256,
    guide: { metadata: { id, paperId, revision, title, paperTitle, type, purpose, source,
      ...(current && orientation ? { orientation } : {}),
      related: current ? metadata.related ?? [] : [],
      coverage: { limitations: current ? metadata.coverage.limitations : [] } },
    units, bodyPath: directory + metadata.bodyFile, packageDirectory: directory } });
}
const seeds = {};
for (const [revision, file] of Object.entries(catalog.exploration.revisions)) {
  seeds[revision] = { file, sha256: sha256(await readFile(resolve(root, file))) };
}
const index = { schemaVersion: 1, catalogSha256: sha256(catalogBytes), currentRevisions: catalog.currentRevisions,
  entries, exploration: { currentRevision: catalog.exploration.currentRevision, revisions: seeds } };
const output = resolve(project, 'src/content/catalog-index.json');
const serialized = JSON.stringify(index) + '\n';
if (await readFile(output, 'utf8').catch(() => '') !== serialized) await writeFile(output, serialized);
console.log(`Content navigation index: ${entries.length} retained revisions; bodies excluded.`);
