import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, join, relative, isAbsolute } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateContent } from '../../server/content/validation.mjs';
import { ReadingMaterials } from '../../server/content/materials.mjs';

// Only synthetic catalogs/files live under this test's temporary workspace.
// Catalog acceptance here means structural acceptance, not 10,000 body reviews.
const catalogSchema = JSON.parse(fs.readFileSync(new URL('../../schemas/catalog.schema.json', import.meta.url), 'utf8'));
const validateCatalog = new Ajv2020({ allErrors: true, strict: true }).compile(catalogSchema);
const temporaryParent = resolve('.cache/test-workspaces');
const originalLimit = 64 * 1024 * 1024;
const identity = { paperId: 'synthetic:boundary-paper', sourceRevisionId: 'synthetic-boundary-v1', title: 'SYNTHETIC file boundary', version: 'synthetic-v1', url: 'https://example.test/synthetic-boundary.html', format: 'html' };

function fixture(t) {
  fs.mkdirSync(temporaryParent, { recursive: true });
  const root = fs.mkdtempSync(join(temporaryParent, 'synthetic-upgrade-boundary-'));
  t.after(() => {
    const child = relative(temporaryParent, root);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child), 'Cleanup stays inside the synthetic workspace.');
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function catalog(currentCount, retainedCount = currentCount) {
  const currentRevisions = {}, entries = [];
  for (let index = 0; index < retainedCount; index++) {
    const guide = index % currentCount, guideId = `synthetic-${guide}`, revision = Math.floor(index / currentCount) + 1;
    currentRevisions[guideId] = revision;
    entries.push({ guideId, revision, metadataFile: `guides/s${index}.json`, recommendation: { rank: guide + 1, relation: 'editorial-reading-order', reason: 'SYNTHETIC.' } });
  }
  return { schemaVersion: 1, currentRevisions, entries, exploration: { currentRevision: 1, revisions: { 1: 'synthetic-exploration.json' } } };
}

function sparseFile(file, bytes) {
  const descriptor = fs.openSync(file, 'wx');
  try { fs.ftruncateSync(descriptor, bytes); } finally { fs.closeSync(descriptor); }
}

test('catalog schema accepts 1000 current guides and 10000 distinct retained revisions at the stated boundaries', t => {
  const current = catalog(1000), retained = catalog(1000, 10000);
  for (const value of [current, retained]) {
    assert.equal(validateCatalog(value), true, JSON.stringify(validateCatalog.errors));
    assert.equal(Object.keys(value.currentRevisions).length, 1000);
    assert.equal(new Set(value.entries.map(entry => `${entry.guideId}/${entry.revision}`)).size, value.entries.length);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 2 * 1024 * 1024, 'The synthetic boundary catalog also fits the actual catalog JSON read limit.');
  }
  assert.equal(retained.entries.length, 10000);
  t.diagnostic('Executed schema acceptance: 1000 current guides; 10000 retained identities. Full bodies/import transactions were not generated for this structural boundary.');
});

test('1001 current guides and 10001 retained revisions fail both schema validation and the content-validation entry point', async t => {
  const cases = [
    { value: catalog(1001), path: '/currentRevisions', keyword: 'maxProperties' },
    { value: catalog(1000, 10001), path: '/entries', keyword: 'maxItems' },
  ];
  for (const item of cases) {
    assert.equal(validateCatalog(item.value), false);
    assert.ok(validateCatalog.errors.some(error => error.instancePath === item.path && error.keyword === item.keyword), 'The intended count boundary caused rejection.');
    const root = fixture(t);
    fs.mkdirSync(join(root, 'content'));
    fs.writeFileSync(join(root, 'content/catalog.json'), JSON.stringify(item.value));
    await assert.rejects(validateContent({ rootDir: root }), error => {
      assert.match(error.message, /schema violation/);
      assert.ok(error.message.includes(item.path) && error.message.includes(item.keyword));
      return true;
    });
    assert.equal(fs.existsSync(join(root, 'content/guides')), false, 'Rejection precedes nonexistent metadata/body reads.');
  }
  t.diagnostic('Executed real validation-entry rejection: 1001 current guides; 10001 retained revisions.');
});

test('oversized and zero-byte original files are rejected from stat without reading their contents', async t => {
  const root = fixture(t);
  for (const [name, size] of [['oversized', originalLimit + 1], ['empty', 0]]) {
    const file = join(root, `${name}.html`), destination = join(root, `${name}-reading`);
    sparseFile(file, size);
    assert.equal(fs.statSync(file).size, size);
    const actualRead = fs.readFileSync, actualStat = fs.statSync;
    let reads = 0, stats = 0;
    try {
      fs.statSync = function (path, ...args) { if (path === file) stats++; return actualStat.call(fs, path, ...args); };
      fs.readFileSync = function (path, ...args) {
        if (path === file) { reads++; throw Error('SYNTHETIC unexpected input read'); }
        return actualRead.call(fs, path, ...args);
      };
      syncBuiltinESMExports();
      await assert.rejects(new ReadingMaterials(destination).import({ ...identity, file }), /原文文件为空或超过 64 MiB/);
    } finally { fs.readFileSync = actualRead; fs.statSync = actualStat; syncBuiltinESMExports(); }
    assert.ok(stats >= 1); assert.equal(reads, 0);
    assert.equal(fs.existsSync(destination), false, 'Invalid input does not publish a job, raw material or manifest.');
  }
  t.diagnostic('Executed sparse-file size rejection: 67,108,865 bytes and 0 bytes; input readFileSync calls = 0 for both.');
});

test('an exact 64 MiB original passes the stat gate before the read sentinel stops the test', async t => {
  const root = fixture(t), file = join(root, 'exact-boundary.html'), destination = join(root, 'reading');
  sparseFile(file, originalLimit);
  assert.equal(fs.statSync(file).size, originalLimit);
  const actualRead = fs.readFileSync, sentinel = new Error('SYNTHETIC reached input read after stat');
  let reads = 0;
  try {
    fs.readFileSync = function (path, ...args) {
      if (path === file) { reads++; throw sentinel; }
      return actualRead.call(fs, path, ...args);
    };
    syncBuiltinESMExports();
    await assert.rejects(new ReadingMaterials(destination).import({ ...identity, file }), error => error === sentinel);
  } finally { fs.readFileSync = actualRead; syncBuiltinESMExports(); }
  assert.equal(reads, 1); assert.equal(fs.existsSync(destination), false);
  t.diagnostic('Executed exact 67,108,864-byte stat acceptance only. No large content read, parsing or complete 64 MiB import is claimed.');
});

test('wrong PDF and HTML magic is rejected before publication, while a small valid HTML control imports', async t => {
  const root = fixture(t);
  const cases = [
    { format: 'pdf', bytes: '<!doctype html><html><body>SYNTHETIC wrong format</body></html>' },
    { format: 'html', bytes: '%PDF-1.4\nSYNTHETIC wrong format\n%%EOF' },
    { format: 'pdf', bytes: 'SYNTHETIC ordinary text with no PDF signature' },
  ];
  for (const [index, item] of cases.entries()) {
    const file = join(root, `wrong-${index}.${item.format}`), destination = join(root, `wrong-${index}-reading`);
    fs.writeFileSync(file, item.bytes);
    await assert.rejects(new ReadingMaterials(destination).import({ ...identity, file, format: item.format }), /实际文件类型与声明不符/);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.readFileSync(file, 'utf8'), item.bytes, 'Rejected input remains unchanged.');
  }
  const file = join(root, 'valid.html'), reading = new ReadingMaterials(join(root, 'valid-reading'));
  fs.writeFileSync(file, '<!doctype html><html><body><p id="synthetic">SYNTHETIC small valid parser control, not research evidence.</p></body></html>');
  const manifest = await reading.import({ ...identity, file });
  assert.equal(manifest.status, 'partial'); assert.equal(manifest.unitCount, 1);
  assert.match(reading.derived(manifest).units[0].text, /SYNTHETIC small valid/);
  t.diagnostic('Executed three wrong-magic rejections and a successful small HTML import control.');
});

test('full content validation accepts exactly 64 MiB of cumulative files and rejects one additional byte', async t => {
  const root = fixture(t), content = join(root, 'content'), guides = join(content, 'guides');
  fs.mkdirSync(guides, { recursive: true });
  const sha = value => createHash('sha256').update(value).digest('hex');
  const assetLimit = 10 * 1024 * 1024, packageLimit = 64 * 1024 * 1024;
  const assets = Array.from({ length: 7 }, (_, index) => ({ path: `synthetic-${index}.png`, sha256: '0'.repeat(64), mime: 'image/png', alt: `SYNTHETIC pixel ${index}`, origin: 'https://example.test/synthetic-pixel', rights: 'SYNTHETIC test fixture only.' }));
  const body = '# SYNTHETIC aggregate fixture\n\nSynthetic test data, not a research guide.\n\n## Mechanism\n\n[synthetic locator](https://example.test/synthetic-paper)\n\n' + assets.map(asset => `![${asset.alt}](${asset.path})`).join('\n\n') + '\n';
  const metadata = {
    schemaVersion: 1, id: 'synthetic-aggregate', paperId: 'synthetic:aggregate-paper', revision: 1,
    title: 'SYNTHETIC aggregate fixture', paperTitle: 'SYNTHETIC aggregate paper', language: 'en', type: 'other', mode: 'standard', purpose: 'SYNTHETIC cumulative byte-limit exercise.',
    source: { id: 'synthetic:aggregate-paper', version: null, url: 'https://example.test/synthetic-paper' }, bodyFile: 'synthetic.md', bodySha256: sha(body),
    units: [{ id: 'orientation', heading: null }, { id: 'mechanism', heading: 'Mechanism' }],
    citations: [{ id: 'synthetic-locator', url: 'https://example.test/synthetic-paper', labels: ['synthetic locator'], role: 'primary', sourceVersion: null }], related: [], assets,
    coverage: { scope: 'selected', basis: 'sections', sections: ['SYNTHETIC section'], figuresViewed: [], limitations: ['SYNTHETIC test data only.'], reviewBasis: 'SYNTHETIC validator fixture, no scholarly claims.' },
  };
  const target = { guideId: metadata.id, revision: 1, unitId: 'mechanism', purpose: 'SYNTHETIC target validation.' };
  const seed = { schemaVersion: 1, revision: 1, kind: 'editorial-starting-points', language: 'en', title: 'SYNTHETIC seed', orientation: 'SYNTHETIC orientation.', evidenceBoundary: 'SYNTHETIC no research evidence.', lenses: [{ id: 'synthetic-lens', rank: 1, title: 'SYNTHETIC lens', whyNow: 'SYNTHETIC test only.', orientation: 'SYNTHETIC orientation.', guideRefs: [target], prompt: 'SYNTHETIC prompt.', selfCheck: 'SYNTHETIC check.', nextAction: { kind: 'read-guide', description: 'SYNTHETIC action.', target: { ...target } } }] };
  const directory = { schemaVersion: 1, currentRevisions: { [metadata.id]: 1 }, entries: [{ guideId: metadata.id, revision: 1, metadataFile: 'guides/synthetic.json', recommendation: { rank: 1, relation: 'editorial-reading-order', reason: 'SYNTHETIC test only.' } }], exploration: { currentRevision: 1, revisions: { 1: 'synthetic-exploration.json' } } };
  const encoded = value => JSON.stringify(value);
  const overhead = Buffer.byteLength(encoded(directory)) + Buffer.byteLength(encoded(metadata)) + Buffer.byteLength(body) + Buffer.byteLength(encoded(seed));
  const lastSize = packageLimit - 6 * assetLimit - overhead;
  assert.ok(lastSize > 100 && lastSize < assetLimit);

  // Seven actual PNG files carry an ignored private ancillary chunk before
  // IEND. Its correct CRC keeps the fixture a PNG; no validator is mocked.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
    let value = byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  const png = size => {
    const chunk = Buffer.alloc(size - pixel.length);
    chunk.writeUInt32BE(chunk.length - 12, 0); chunk.write('pdSk', 4, 'ascii');
    let crc = 0xffffffff;
    for (let index = 4; index < chunk.length - 4; index++) crc = crcTable[(crc ^ chunk[index]) & 255] ^ (crc >>> 8);
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
    return Buffer.concat([pixel.subarray(0, -12), chunk, pixel.subarray(-12)]);
  };
  const writeAsset = (index, size) => { const bytes = png(size); fs.writeFileSync(join(guides, assets[index].path), bytes); assets[index].sha256 = sha(bytes); };
  for (let index = 0; index < assets.length; index++) writeAsset(index, index < 6 ? assetLimit : lastSize);
  fs.writeFileSync(join(content, 'catalog.json'), encoded(directory));
  fs.writeFileSync(join(guides, 'synthetic.json'), encoded(metadata));
  fs.writeFileSync(join(guides, 'synthetic.md'), body);
  fs.writeFileSync(join(content, 'synthetic-exploration.json'), encoded(seed));
  const files = [join(content, 'catalog.json'), join(guides, 'synthetic.json'), join(guides, 'synthetic.md'), join(content, 'synthetic-exploration.json'), ...assets.map(asset => join(guides, asset.path))];
  const actualSize = () => files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  assert.equal(actualSize(), packageLimit);
  const accepted = await validateContent({ rootDir: root });
  assert.deepEqual(accepted.summary, { guides: 1, units: 2, citationUrls: 1, lenses: 1, explorationTargets: 2 });

  writeAsset(6, lastSize + 1);
  fs.writeFileSync(join(guides, 'synthetic.json'), encoded(metadata));
  assert.equal(actualSize(), packageLimit + 1);
  assert.ok(assets.every(asset => fs.statSync(join(guides, asset.path)).size <= assetLimit), 'Every individual asset still fits its 10 MiB limit.');
  await assert.rejects(validateContent({ rootDir: root }), /^Error: Package: total size limit exceeded$/);
  t.diagnostic('Executed full, unmocked validation of 11 real files totalling 67,108,864 bytes: accepted. Recomputed valid asset/hash at total 67,108,865 bytes: rejected only by cumulative package limit. Schema, body/link/seed validation, asset hashes and MIME checks stayed enabled.');
});
