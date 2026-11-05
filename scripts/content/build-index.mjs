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
const translationBytes = await readFile(resolve(root, 'translations.json')).catch(() => undefined);
const translations = translationBytes ? JSON.parse(translationBytes) : { schemaVersion: 1, guides: [] };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Intrinsic sizes let figures reserve their space before the image arrives.
function imageSize(bytes) {
  if (bytes.subarray(1, 4).toString('ascii') === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
    if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]; }
    if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  return null;
}
const entries = [];
for (const entry of catalog.entries) {
  const bytes = await readFile(resolve(root, entry.metadataFile));
  const metadata = JSON.parse(bytes);
  const directory = entry.metadataFile.slice(0, entry.metadataFile.lastIndexOf('/') + 1);
  const { id, paperId, revision, title, paperTitle, type, purpose, source, orientation, units } = metadata;
  const current = catalog.currentRevisions[id] === revision;
  const figures = [];
  for (const asset of metadata.assets ?? []) {
    const size = imageSize(await readFile(resolve(root, directory, asset.path)));
    figures.push({ path: asset.path, alt: asset.alt, origin: asset.origin, rights: asset.rights, ...(size ? { width: size[0], height: size[1] } : {}) });
  }
  const translation = translations.guides?.find(item => item.guideId === id && item.revision === revision && item.language === 'en');
  const english = translation ? { title: translation.title, bodyPath: translation.bodyFile, bodySha256: translation.bodySha256, assets: translation.assets ?? [] } : undefined;
  entries.push({ ...entry, metadataSha256: sha256(bytes), bodySha256: metadata.bodySha256,
    guide: { metadata: { id, paperId, revision, title, paperTitle, type, purpose, source,
      ...(current && orientation ? { orientation } : {}),
      related: current ? metadata.related ?? [] : [],
      coverage: { limitations: current ? metadata.coverage.limitations : [] } },
    units, figures, bodyPath: directory + metadata.bodyFile, packageDirectory: directory, ...(english ? { translations: { en: english } } : {}) } });
}
const seeds = {};
for (const [revision, file] of Object.entries(catalog.exploration.revisions)) {
  seeds[revision] = { file, sha256: sha256(await readFile(resolve(root, file))) };
}
const index = { schemaVersion: 1, catalogSha256: sha256(catalogBytes), currentRevisions: catalog.currentRevisions,
  archivedGuideIds: catalog.archivedGuideIds ?? [],
  ...(catalog.readingAssignments ? { readingAssignments: catalog.readingAssignments } : {}),
  entries, exploration: { currentRevision: catalog.exploration.currentRevision, revisions: seeds } };
const output = resolve(project, 'src/content/catalog-index.json');
const serialized = JSON.stringify(index) + '\n';
if (await readFile(output, 'utf8').catch(() => '') !== serialized) await writeFile(output, serialized);
console.log(`Content navigation index: ${entries.length} retained revisions; bodies excluded.`);
