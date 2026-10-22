import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, limits, normalizedRelativePath, projectRoot, validateContent } from '../scripts/content-validation.mjs';
import { isSafeDiagram, isSafeExternalUrl } from '../scripts/content-policy.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const tempParent = path.join(projectRoot, '.cache', 'test-workspaces');
const syntheticBody = '# Synthetic technical fixture\n\nThis is synthetic test data, not a research guide.\n\n## Mechanism\n\n[synthetic locator](https://example.test/paper)\n';
function syntheticPackage() {
  const metadata = {
    schemaVersion: 1, id: 'synthetic', paperId: 'synthetic:paper', revision: 1,
    title: 'Synthetic technical fixture', paperTitle: 'Synthetic test-only paper',
    language: 'en', type: 'other', mode: 'standard', purpose: 'Synthetic validation exercise only.',
    source: { id: 'synthetic:paper', version: null, url: 'https://example.test/paper' },
    bodyFile: 'synthetic.md', bodySha256: sha(syntheticBody),
    units: [{ id: 'orientation', heading: null }, { id: 'mechanism', heading: 'Mechanism' }],
    citations: [{ id: 'synthetic-locator', url: 'https://example.test/paper', labels: ['synthetic locator'], role: 'primary', sourceVersion: null }],
    related: [], assets: [], coverage: { scope: 'selected', basis: 'sections', sections: ['Synthetic section'], figuresViewed: [], limitations: ['Synthetic data only.'], reviewBasis: 'Test fixture; no scholarly claims.' },
  };
  const target = { guideId: 'synthetic', revision: 1, unitId: 'mechanism', purpose: 'Synthetic link exercise.' };
  const seed = { schemaVersion: 1, revision: 1, kind: 'editorial-starting-points', language: 'en', title: 'Synthetic exploration fixture', orientation: 'Synthetic test data.', evidenceBoundary: 'No research evidence.', lenses: [{ id: 'synthetic-lens', rank: 1, title: 'Synthetic lens', whyNow: 'Test only.', orientation: 'Synthetic test only.', guideRefs: [target], prompt: 'Synthetic prompt.', selfCheck: 'Synthetic check.', nextAction: { kind: 'read-guide', description: 'Synthetic action.', target: { ...target } } }] };
  const catalog = { schemaVersion: 1, currentRevisions: { synthetic: 1 }, entries: [{ guideId: 'synthetic', revision: 1, metadataFile: 'guides/synthetic.json', recommendation: { rank: 1, relation: 'editorial-reading-order', reason: 'Synthetic test only.' } }], exploration: { currentRevision: 1, revisions: { 1: 'exploration.json' } } };
  return { catalog, metadata, seed, body: syntheticBody };
}

async function fixture(t, change = () => {}) {
  await mkdir(tempParent, { recursive: true });
  const rootDir = await mkdtemp(path.join(tempParent, 'synthetic-'));
  t.after(async () => {
    const relative = path.relative(tempParent, rootDir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(rootDir, { recursive: true, force: true });
  });
  const data = syntheticPackage();
  await change(data);
  await mkdir(path.join(rootDir, 'content', 'guides'), { recursive: true });
  const put = (file, value) => writeFile(path.join(rootDir, file), typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  await put('content/catalog.json', data.catalog);
  await put('content/guides/synthetic.json', data.metadata);
  await put('content/guides/synthetic.md', data.body);
  await put('content/exploration.json', data.seed);
  return { rootDir, data, put };
}

test('approved bodies, retained revisions, current orientations and all exploration targets validate', async () => {
  const result = await validateContent();
  assert.equal(result.summary.guides, result.catalog.entries.length);
  assert.equal(result.summary.lenses, 3);
  assert.equal(result.summary.explorationTargets, 12);
  const originalCollection = result.guides.filter(guide => ['agent-survey', 'instructgpt', 'helm'].includes(guide.metadata.id));
  assert.equal(originalCollection.reduce((sum, guide) => sum + guide.metadata.units.length, 0), 46);
  assert.equal(new Set(originalCollection.flatMap(guide => guide.metadata.citations.map(citation => citation.url))).size, 39);
  for (const id of ['agent-survey', 'instructgpt', 'helm']) {
    const original = result.guides.find(guide => guide.metadata.id === id && guide.metadata.revision === 1);
    const current = result.guides.find(guide => guide.metadata.id === id && guide.metadata.revision === 2);
    assert.equal(result.catalog.currentRevisions[id], 2);
    assert.equal(original.metadata.schemaVersion, 1);
    assert.equal(current.metadata.schemaVersion, 2);
    assert.equal(current.metadata.bodySha256, original.metadata.bodySha256);
    assert.equal(current.body, original.body);
    assert.deepEqual(current.metadata.coverage, original.metadata.coverage);
    assert.deepEqual(current.metadata.citations, original.metadata.citations);
  }
  for (const id of ['react', 'toolformer', 'reflexion']) {
    const versions = result.guides.filter(guide => guide.metadata.id === id);
    assert.equal(versions.length, 1);
    assert.equal(result.catalog.currentRevisions[id], 1);
    const guide = versions[0];
    assert.equal(guide.metadata.schemaVersion, 2);
    assert.equal(guide.metadata.type, 'method');
    assert.equal(guide.metadata.coverage.scope, 'mainline');
    assert.equal(guide.metadata.orientation.bibliography.year, 2023);
    assert.equal(guide.metadata.orientation.bibliography.publicationKind, 'conference');
    assert.ok(guide.metadata.orientation.readingTargets.every(target => guide.metadata.units.some(unit => unit.id === target.unitId)));
  }
});

test('synthetic minimum package validates independently of reader components', async (t) => {
  const { rootDir } = await fixture(t);
  assert.equal((await validateContent({ rootDir })).summary.guides, 1);
});

function addSyntheticOrientation(data) {
  data.metadata.schemaVersion = 2;
  data.metadata.orientation = {
    shortTitle: 'Synthetic orientation',
    topics: [{ id: 'synthetic-topic', label: 'Synthetic topic', aliases: ['Synthetic alias'] }],
    summary: 'Synthetic summary.', value: 'Synthetic learning purpose.', prerequisites: [],
    boundaries: ['Synthetic test data, no scholarly claim.'],
    bibliography: { authors: ['Synthetic Author'], year: null, venue: null, publicationKind: 'unknown', url: 'https://example.test/paper', preprintYear: null },
    readingTargets: [{ unitId: 'mechanism', purpose: 'Synthetic section.', concepts: ['Synthetic concept'], limit: 'Synthetic boundary.' }],
  };
}

test('synthetic v2 orientation supports unknown bibliography and a valid local target', async t => {
  const { rootDir } = await fixture(t, addSyntheticOrientation);
  assert.equal((await validateContent({ rootDir })).guides[0].metadata.orientation.bibliography.year, null);
});

const orientationRejections = [
  ['missing orientation', d => { delete d.metadata.orientation; }, /schema violation/],
  ['v2 fields on v1', d => { d.metadata.schemaVersion = 1; }, /schema violation/],
  ['unknown orientation field', d => { d.metadata.orientation.personalProfile = 'Synthetic forbidden field'; }, /schema violation/],
  ['unknown bibliography field', d => { d.metadata.orientation.bibliography.privateRecord = 'Synthetic forbidden field'; }, /schema violation/],
  ['blank topic label', d => { d.metadata.orientation.topics[0].label = ' '; }, /schema violation/],
  ['duplicate topic identity', d => { d.metadata.orientation.topics.push({ ...d.metadata.orientation.topics[0], label: 'Different label' }); }, /topic IDs: duplicate/],
  ['case duplicate alias', d => { d.metadata.orientation.topics[0].aliases = ['Alias', 'alias']; }, /topic aliases: duplicate/],
  ['unsafe bibliography URL', d => { d.metadata.orientation.bibliography.url = 'https://synthetic:secret@example.test'; }, /invalid HTTP/],
  ['missing reading target', d => { d.metadata.orientation.readingTargets[0].unitId = 'missing'; }, /orientation reading target missing/],
  ['duplicate reading target', d => { d.metadata.orientation.readingTargets.push({ ...d.metadata.orientation.readingTargets[0], purpose: 'Another purpose.' }); }, /reading targets: duplicate/],
  ['published record without venue/year', d => { d.metadata.orientation.bibliography.publicationKind = 'journal'; }, /requires year and venue/],
];
for (const [name, change, error] of orientationRejections) test(`rejects orientation ${name}`, async t => {
  const { rootDir } = await fixture(t, data => { addSyntheticOrientation(data); change(data); });
  await assert.rejects(validateContent({ rootDir }), error);
});

const rejectionCases = [
  ['unknown guide field', (d) => { d.metadata.privateRecord = 'Synthetic forbidden field'; }, /schema violation/],
  ['unknown catalog field', (d) => { d.catalog.operator = 'Synthetic forbidden field'; }, /schema violation/],
  ['unknown exploration field', (d) => { d.seed.personalState = 'Synthetic forbidden field'; }, /schema violation/],
  ['unsupported schema', (d) => { d.metadata.schemaVersion = 3; }, /schema violation/],
  ['zero revision', (d) => { d.metadata.revision = 0; }, /schema violation/],
  ['catalog identity mismatch', (d) => { d.metadata.revision = 2; }, /identity mismatch/],
  ['duplicate guide revision', (d) => { d.catalog.entries.push(structuredClone(d.catalog.entries[0])); }, /duplicate/],
  ['unknown current revision', (d) => { d.catalog.currentRevisions.synthetic = 2; }, /current revision target missing/],
  ['duplicate unit', (d) => { d.metadata.units[1].id = 'orientation'; }, /duplicate/],
  ['wrong heading', (d) => { d.metadata.units[1].heading = 'Unknown'; }, /heading\/order mismatch/],
  ['wrong title', (d) => { d.metadata.title = 'Different synthetic title'; }, /leading title/],
  ['body hash mismatch', (d) => { d.metadata.bodySha256 = '0'.repeat(64); }, /hash mismatch/],
  ['parent traversal', (d) => { d.metadata.bodyFile = '../synthetic.md'; }, /schema violation|normalized/],
  ['unnormalized dot path', (d) => { d.metadata.bodyFile = './synthetic.md'; }, /normalized/],
  ['doubled separator', (d) => { d.catalog.entries[0].metadataFile = 'guides//synthetic.json'; }, /normalized/],
  ['dangling citation label', (d) => { d.metadata.citations[0].labels.push('Missing label'); }, /dangling citation/],
  ['duplicate citation URL', (d) => { d.metadata.citations.push({ ...d.metadata.citations[0], id: 'another' }); }, /duplicate/],
  ['invalid source URL', (d) => { d.metadata.source.url = 'https://'; }, /invalid HTTP/],
  ['credential-bearing citation URL', (d) => { d.metadata.citations[0].url = 'https://user:secret@example.test/paper'; }, /invalid HTTP/],
  ['version URL disagreement', (d) => { d.metadata.source.url = 'https://arxiv.org/abs/2308.11432v7'; d.metadata.source.version = 'v2'; }, /version differs/],
  ['missing related guide', (d) => { d.metadata.related.push({ guideId: 'missing', relation: 'editorial-reading-order' }); }, /related guide missing/],
  ['missing partial-coverage limits', (d) => { d.metadata.coverage.limitations = []; }, /limitations/],
  ['unsupported full-survey claim', (d) => { d.metadata.coverage.scope = 'full-survey'; }, /full-survey requires/],
  ['missing exploration revision', (d) => { d.catalog.exploration.currentRevision = 2; }, /current exploration revision missing/],
  ['seed revision mismatch', (d) => { d.seed.revision = 2; }, /exploration revision mismatch/],
  ['duplicate lens IDs', (d) => { d.seed.lenses.push({ ...d.seed.lenses[0], rank: 2 }); }, /lens IDs: duplicate/],
  ['duplicate lens ranks', (d) => { d.seed.lenses.push({ ...d.seed.lenses[0], id: 'synthetic-second' }); }, /lens ranks: duplicate/],
  ['missing exploration guide', (d) => { d.seed.lenses[0].guideRefs[0].guideId = 'missing'; }, /target missing/],
  ['missing exploration unit', (d) => { d.seed.lenses[0].nextAction.target.unitId = 'missing'; }, /target missing/],
];
for (const [name, change, error] of rejectionCases) test(`rejects ${name}`, async (t) => {
  const { rootDir } = await fixture(t, change);
  await assert.rejects(validateContent({ rootDir }), error);
});

const bodyRejections = [
  ['uninventoried URL', '\n[unknown](https://example.test/unknown)\n', /citation inventory/],
  ['unmatched citation label', '\n[unknown](https://example.test/paper)\n', /citation inventory/],
  ['script URL', '\n[unsafe](javascript:alert%281%29)\n', /normalized/],
  ['encoded script URL', '\n[unsafe](java&#x73;cript:alert%281%29)\n', /normalized/],
  ['remote image', '\n![synthetic](https://example.test/image.png)\n', /normalized/],
  ['undeclared local image', '\n![synthetic](image.png)\n', /declared local asset/],
  ['raw HTML', '\n<script>alert(1)</script>\n', /raw HTML/],
  ['unknown relative guide', '\n[missing](missing.md)\n', /unknown internal/],
  ['unknown pinned target', '\n[missing](/read/synthetic/2#mechanism)\n', /unknown pinned/],
  ['unknown unit', '\n[missing](#missing)\n', /unknown unit/],
  ['diagram callback', '\n```mermaid\nflowchart LR\nA[one] --> B[two]\nclick A callback\n```\n', /diagram syntax/],
  ['diagram override', '\n```mermaid\n%%{init: {securityLevel: loose}}%%\nflowchart LR\nA[one] --> B[two]\n```\n', /diagram syntax/],
];
for (const [name, extra, error] of bodyRejections) test(`rejects ${name} in Markdown AST`, async (t) => {
  const { rootDir } = await fixture(t, (data) => { data.body += extra; data.metadata.bodySha256 = sha(data.body); });
  await assert.rejects(validateContent({ rootDir }), error);
});

test('reference-style links and local unit links resolve without bypassing inventory', async (t) => {
  const { rootDir } = await fixture(t, (data) => {
    data.body += '\n[synthetic locator][paper]\n\n[paper]: https://example.test/paper\n\n[section](#mechanism)\n';
    data.metadata.bodySha256 = sha(data.body);
  });
  assert.equal((await validateContent({ rootDir })).summary.citationUrls, 1);
});

test('rejects linked package directories before following them', async (t) => {
  const { rootDir } = await fixture(t);
  const folder = path.join(rootDir, 'content', 'guides');
  const destination = path.join(rootDir, 'synthetic-target');
  await rename(folder, destination);
  try { await symlink(destination, folder, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Local symlink creation unavailable (${error.code}); rejection not exercised.`); return; }
    throw error;
  }
  await assert.rejects(validateContent({ rootDir }), /symlink is not allowed/);
});

test('rejects oversized and malformed UTF-8 bodies before parsing', async (t) => {
  const { rootDir, put, data } = await fixture(t);
  await put('content/guides/synthetic.md', Buffer.alloc(limits.body + 1, 65));
  await assert.rejects(validateContent({ rootDir }), /size limit/);
  const invalid = Buffer.from([255, 254, 253]);
  data.metadata.bodySha256 = sha(invalid);
  await put('content/guides/synthetic.json', data.metadata);
  await put('content/guides/synthetic.md', invalid);
  await assert.rejects(validateContent({ rootDir }), /invalid UTF-8/);
});

test('multiple revisions preserve paper identity and current recommendation ranks', async (t) => {
  const { rootDir, data, put } = await fixture(t);
  data.catalog.entries.push({ ...structuredClone(data.catalog.entries[0]), revision: 2, metadataFile: 'guides/synthetic-2.json' });
  data.catalog.currentRevisions.synthetic = 2;
  const second = { ...data.metadata, revision: 2, bodyFile: 'synthetic-2.md' };
  await put('content/catalog.json', data.catalog);
  await put('content/guides/synthetic-2.json', second);
  await put('content/guides/synthetic-2.md', data.body);
  assert.equal((await validateContent({ rootDir })).summary.guides, 2);
  second.bodyFile = 'synthetic.md';
  await put('content/guides/synthetic-2.json', second);
  assert.equal((await validateContent({ rootDir })).summary.guides, 2, 'unchanged immutable body may be shared by revisions of one guide');
  second.paperId = 'synthetic:different-paper';
  await put('content/guides/synthetic-2.json', second);
  await assert.rejects(validateContent({ rootDir }), /paper identity changed/);
});

test('current guides need distinct recommendation ranks and a current pointer each', async (t) => {
  const { rootDir, data, put } = await fixture(t);
  data.catalog.entries.push({ ...structuredClone(data.catalog.entries[0]), guideId: 'synthetic-second', metadataFile: 'guides/second.json' });
  data.catalog.currentRevisions['synthetic-second'] = 1;
  const second = { ...data.metadata, id: 'synthetic-second', bodyFile: 'second.md' };
  await put('content/catalog.json', data.catalog);
  await put('content/guides/second.json', second);
  await put('content/guides/second.md', data.body);
  await assert.rejects(validateContent({ rootDir }), /recommendation ranks: duplicate/);
  data.catalog.entries[1].recommendation.rank = 2;
  delete data.catalog.currentRevisions['synthetic-second'];
  await put('content/catalog.json', data.catalog);
  await assert.rejects(validateContent({ rootDir }), /every guide requires a current revision/);
});

test('declared local image checks exact hash, MIME and bounded package membership', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const { rootDir, data, put } = await fixture(t, (data) => {
    data.body += '\n![Synthetic test pixel](synthetic.png)\n';
    data.metadata.bodySha256 = sha(data.body);
    data.metadata.assets.push({ path: 'synthetic.png', sha256: sha(png), mime: 'image/png', alt: 'Synthetic test pixel', origin: 'https://example.test/synthetic-pixel', rights: 'Synthetic test-only pixel.' });
  });
  await put('content/guides/synthetic.png', png);
  assert.equal((await validateContent({ rootDir })).summary.guides, 1);
  data.metadata.assets[0].mime = 'image/webp';
  await put('content/guides/synthetic.json', data.metadata);
  await assert.rejects(validateContent({ rootDir }), /image MIME/);
  data.metadata.assets[0].mime = 'image/png';
  data.metadata.assets[0].sha256 = '0'.repeat(64);
  await put('content/guides/synthetic.json', data.metadata);
  await assert.rejects(validateContent({ rootDir }), /asset hash mismatch/);
});

test('validator remains read-only on rejected content', async (t) => {
  const { rootDir } = await fixture(t, (data) => { data.metadata.bodySha256 = '0'.repeat(64); });
  const before = await readFile(path.join(rootDir, 'content/catalog.json'));
  await assert.rejects(validateContent({ rootDir }), /hash mismatch/);
  assert.deepEqual(await readFile(path.join(rootDir, 'content/catalog.json')), before);
});

test('portable path boundary rejects absolute, encoded and device paths', () => {
  for (const file of ['/absolute.md', 'C:/absolute.md', '../other.md', 'a/../b', 'a/./b', 'a//b', 'a\\b', '%2e%2e/secret', 'NUL', 'con.json', 'folder/file.']) {
    assert.throws(() => normalizedRelativePath(file), /normalized/);
  }
});

test('diagram subset accepts reviewed loops and rejects executable/remote syntax', () => {
  assert.equal(isSafeDiagram('flowchart LR\nA[合成测试] --> B[Next]\nB --> A'), true);
  for (const text of ['sequenceDiagram\nA->>B: one', 'flowchart LR\nA[one] --> B[<b>two</b>]', 'flowchart LR\nA[one] --> B[two]\nclick A href https://example.test', 'flowchart LR\nA[one] --> B[two]\nstyle A fill:red', 'flowchart LR\nA[one] --> B[fa:fa-user]', 'flowchart LR\nA[one] --> B', '---\nconfig: bad\n---\nflowchart LR\nA[one] --> B[two]']) {
    assert.equal(isSafeDiagram(text), false, text);
  }
});

test('external URL policy rejects script/data/file/credentials/control schemes', () => {
  assert.equal(isSafeExternalUrl('https://arxiv.org/pdf/2308.11432v7#page=4'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///synthetic.txt', '//example.test', 'https://x:y@example.test', 'https://example.test/%0a', ' https://example.test', 'https://example.test\\evil']) assert.equal(isSafeExternalUrl(value), false);
});

test('canonical identity ignores object order only and preserves arrays/scalars', () => {
  assert.equal(canonicalJson({ b: 2, a: [1, 'x'] }), canonicalJson({ a: [1, 'x'], b: 2 }));
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }));
  assert.notEqual(canonicalJson({ version: null }), canonicalJson({ version: 'null' }));
});
