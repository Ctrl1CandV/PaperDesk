import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importContent, planImport, recoverContent, rollbackContent, SimulatedInterruption } from '../scripts/content-import.mjs';
import { projectRoot, validateContent } from '../scripts/content-validation.mjs';

const retainedCatalog = JSON.parse(await readFile(path.join(projectRoot, 'content/catalog.json'), 'utf8'));
const retainedRevisionCount = retainedCatalog.entries.length;
const parent = path.join(projectRoot, '.cache', 'test-workspaces');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const putJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

async function fixture(t) {
  await mkdir(parent, { recursive: true });
  const rootDir = await mkdtemp(path.join(parent, 'import-synthetic-'));
  t.after(async () => {
    const relative = path.relative(parent, rootDir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(rootDir, { recursive: true, force: true });
  });
  await cp(path.join(projectRoot, 'content'), path.join(rootDir, 'content'), { recursive: true });
  const from = 'incoming/synthetic release';
  const input = path.join(rootDir, from);
  await mkdir(path.dirname(input), { recursive: true });
  await cp(path.join(projectRoot, 'content'), input, { recursive: true });
  const personal = Buffer.from('Synthetic personal-record sentinel: never import, alter or export me.');
  await writeFile(path.join(rootDir, 'synthetic-personal-records.txt'), personal);
  const original = await readFile(path.join(rootDir, 'content/catalog.json'));
  return { rootDir, from, input, personal, original };
}

async function addGuide(input, { revision = 1, image = false } = {}) {
  const file = `synthetic-fourth-r${revision}`;
  const body = `# Synthetic fourth guide\n\nSynthetic test data only; not a research essay.\n\n## Synthetic mechanism\n\nRevision ${revision} synthetic text. [Synthetic locator](https://example.test/synthetic-paper)\n${image ? '\n![Synthetic test pixel](synthetic-pixel.png)\n' : ''}`;
  const metadata = {
    schemaVersion: 1, id: 'synthetic-fourth', paperId: 'synthetic:fourth', revision,
    title: 'Synthetic fourth guide', paperTitle: 'Synthetic test-only paper', language: 'en', type: 'other', mode: 'standard', purpose: 'Synthetic importer exercise.',
    source: { id: 'synthetic:fourth', version: null, url: 'https://example.test/synthetic-paper' }, bodyFile: `${file}.md`, bodySha256: sha(body),
    units: [{ id: 'orientation', heading: null }, { id: 'mechanism', heading: 'Synthetic mechanism' }],
    citations: [{ id: 'synthetic-source', url: 'https://example.test/synthetic-paper', labels: ['Synthetic locator'], role: 'primary', sourceVersion: null }], related: [],
    assets: image ? [{ path: 'synthetic-pixel.png', sha256: sha(pixel), mime: 'image/png', alt: 'Synthetic test pixel', origin: 'https://example.test/pixel', rights: 'Synthetic test-only pixel.' }] : [],
    coverage: { scope: 'selected', basis: 'sections', sections: ['Synthetic mechanism'], figuresViewed: [], limitations: ['Synthetic data only.'], reviewBasis: 'Technical fixture, no scholarly claim.' },
  };
  await writeFile(path.join(input, `guides/${file}.md`), body);
  await putJson(path.join(input, `guides/${file}.json`), metadata);
  if (image) await writeFile(path.join(input, 'guides/synthetic-pixel.png'), pixel);
  const catalog = await json(path.join(input, 'catalog.json'));
  const rank = catalog.entries.find(entry => entry.guideId === metadata.id)?.recommendation.rank
    ?? Math.max(...catalog.entries.map(entry => entry.recommendation.rank)) + 1;
  catalog.entries.push({ guideId: metadata.id, revision, metadataFile: `guides/${file}.json`, recommendation: { rank, relation: 'editorial-reading-order', reason: 'Synthetic test only.' } });
  catalog.currentRevisions[metadata.id] = revision;
  await putJson(path.join(input, 'catalog.json'), catalog);
  return { metadata, body, file };
}

async function unchanged(f) {
  assert.deepEqual(await readFile(path.join(f.rootDir, 'content/catalog.json')), f.original);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount);
}

test('dry-run validates a synthetic fourth guide and writes nothing', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  const before = await readdir(f.rootDir);
  const result = await importContent(f);
  assert.equal(result.applied, false);
  assert.deepEqual(result.addedGuides, ['synthetic-fourth/1']);
  assert.equal(result.checks.guides, retainedRevisionCount + 1);
  assert.deepEqual(await readdir(f.rootDir), before);
  await unchanged(f);
});

test('apply publishes the fourth guide once and JSON whitespace/key-order reimport is a no-op', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  const result = await importContent({ ...f, apply: true });
  assert.equal(result.applied, true);
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount + 1);
  const before = await readFile(path.join(f.rootDir, 'content/catalog.json'));
  const metadataFile = path.join(f.input, 'guides/synthetic-fourth-r1.json');
  const metadata = await json(metadataFile);
  await writeFile(metadataFile, JSON.stringify(Object.fromEntries(Object.entries(metadata).reverse())));
  const seedFile = path.join(f.input, 'exploration.json');
  const seed = await json(seedFile);
  await writeFile(seedFile, JSON.stringify(Object.fromEntries(Object.entries(seed).reverse())));
  assert.equal((await importContent({ ...f, apply: true })).changed, false);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'content/catalog.json')), before);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
});

test('new guide and editorial revisions coexist and selection rollback retains them', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await importContent({ ...f, apply: true });
  await addGuide(f.input, { revision: 2 });
  const seed = await json(path.join(f.input, 'exploration.json'));
  seed.revision = 2;
  seed.lenses[0].prompt = 'Synthetic revised editorial wording for the test.';
  seed.lenses[0].guideRefs.push({ guideId: 'synthetic-fourth', revision: 2, unitId: 'mechanism', purpose: 'Synthetic target.' });
  await putJson(path.join(f.input, 'exploration-r2.json'), seed);
  const catalog = await json(path.join(f.input, 'catalog.json'));
  catalog.exploration.currentRevision = 2;
  catalog.exploration.revisions[2] = 'exploration-r2.json';
  await putJson(path.join(f.input, 'catalog.json'), catalog);
  await importContent({ ...f, apply: true });
  let active = await validateContent({ rootDir: f.rootDir });
  assert.equal(active.summary.guides, retainedRevisionCount + 2);
  assert.equal(active.catalog.currentRevisions['synthetic-fourth'], 2);
  assert.equal(active.explorations.length, 2);
  assert.equal((await rollbackContent({ rootDir: f.rootDir })).applied, false);
  await rollbackContent({ rootDir: f.rootDir, apply: true });
  active = await validateContent({ rootDir: f.rootDir });
  assert.equal(active.catalog.currentRevisions['synthetic-fourth'], 1);
  assert.equal(active.catalog.exploration.currentRevision, 1);
  assert.equal(active.summary.guides, retainedRevisionCount + 2);
  assert.equal(active.explorations.length, 2);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
});

test('same-key changed metadata conflicts even with identical body hash', async t => {
  const f = await fixture(t);
  const file = path.join(f.input, 'guides/agent-survey.json');
  const metadata = await json(file);
  metadata.coverage.reviewBasis += ' Synthetic forbidden same-revision edit.';
  await putJson(file, metadata);
  await assert.rejects(importContent({ ...f, apply: true }), /Immutable metadata conflict/);
  await unchanged(f);
});

test('v2 metadata can upgrade a v1 catalog while preserving each approved body and old target', async t => {
  const f = await fixture(t);
  const activeFile = path.join(f.rootDir, 'content/catalog.json');
  const legacy = await json(activeFile);
  legacy.entries = legacy.entries.filter(entry => entry.revision === 1);
  for (const id of Object.keys(legacy.currentRevisions)) legacy.currentRevisions[id] = 1;
  await putJson(activeFile, legacy);
  for (const id of ['agent-survey', 'instructgpt', 'helm']) await rm(path.join(f.rootDir, `content/guides/${id}.r2.json`));
  const before = await validateContent({ rootDir: f.rootDir });
  assert.equal(before.summary.guides, Object.keys(retainedCatalog.currentRevisions).length);
  const plan = await importContent(f);
  // The fixture removes every later catalog revision, including guides added after the original metadata upgrade.
  assert.deepEqual(plan.addedGuides, retainedCatalog.entries.filter(entry => entry.revision > 1).map(entry => `${entry.guideId}/${entry.revision}`));
  assert.equal(plan.applied, false);
  assert.equal(plan.newFiles, 3);
  await importContent({ ...f, apply: true });
  const after = await validateContent({ rootDir: f.rootDir });
  assert.equal(after.summary.guides, retainedRevisionCount);
  for (const guide of before.guides) {
    const retained = after.guides.find(item => item.metadata.id === guide.metadata.id && item.metadata.revision === 1);
    assert.deepEqual(retained.metadata, guide.metadata);
    if (['agent-survey', 'instructgpt', 'helm'].includes(guide.metadata.id)) {
      const current = after.guides.find(item => item.metadata.id === guide.metadata.id && item.metadata.revision === 2);
      assert.equal(current.body, guide.body);
    } else assert.equal(retained.body, guide.body);
  }
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
});

test('same-key changed orientation conflicts even when approved body is unchanged', async t => {
  const f = await fixture(t);
  const file = path.join(f.input, 'guides/agent-survey.r2.json');
  const metadata = await json(file);
  metadata.orientation.summary += ' Synthetic forbidden same-revision change.';
  await putJson(file, metadata);
  await assert.rejects(importContent({ ...f, apply: true }), /Immutable metadata conflict/);
  await unchanged(f);
});

test('same-revision changed seed conflicts and retains the previous collection', async t => {
  const f = await fixture(t);
  const file = path.join(f.input, 'exploration.json');
  const seed = await json(file);
  seed.lenses[0].prompt = 'Synthetic conflicting prompt.';
  await putJson(file, seed);
  await assert.rejects(importContent({ ...f, apply: true }), /Immutable exploration conflict/);
  await unchanged(f);
});

test('changed declared assets require a new revision even when Markdown bytes do not change', async t => {
  const f = await fixture(t);
  await addGuide(f.input, { image: true });
  await importContent({ ...f, apply: true });
  const before = await readFile(path.join(f.rootDir, 'content/catalog.json'));
  const changed = Buffer.concat([pixel, Buffer.from('synthetic distinct asset bytes')]);
  await writeFile(path.join(f.input, 'guides/synthetic-pixel.png'), changed);
  const metadataFile = path.join(f.input, 'guides/synthetic-fourth-r1.json');
  const metadata = await json(metadataFile);
  metadata.assets[0].sha256 = sha(changed);
  await putJson(metadataFile, metadata);
  await assert.rejects(importContent({ ...f, apply: true }), /Immutable metadata conflict/);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'content/catalog.json')), before);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'content/guides/synthetic-pixel.png')), pixel);
});

const rejects = [
  ['invalid body hash', async input => { const file = path.join(input, 'guides/agent-survey.json'); const m = await json(file); m.bodySha256 = '0'.repeat(64); await putJson(file, m); }, /hash mismatch/],
  ['unknown property', async input => { const file = path.join(input, 'catalog.json'); const c = await json(file); c.syntheticPrivateField = 'not accepted'; await putJson(file, c); }, /schema violation/],
  ['traversal', async input => { const file = path.join(input, 'catalog.json'); const c = await json(file); c.entries[0].metadataFile = '../secret.json'; await putJson(file, c); }, /schema violation|normalized/],
  ['missing unit heading', async input => { const file = path.join(input, 'guides/agent-survey.json'); const m = await json(file); m.units[1].heading = 'Synthetic missing heading'; await putJson(file, m); }, /heading\/order mismatch/],
  ['duplicate lens rank', async input => { const file = path.join(input, 'exploration.json'); const s = await json(file); s.lenses[1].rank = s.lenses[0].rank; await putJson(file, s); }, /duplicate/],
  ['duplicate lens identity', async input => { const file = path.join(input, 'exploration.json'); const s = await json(file); s.lenses[1].id = s.lenses[0].id; await putJson(file, s); }, /duplicate/],
];
for (const [name, change, error] of rejects) test(`rejected ${name} leaves active catalog and personal sentinel unchanged`, async t => {
  const f = await fixture(t);
  await change(f.input);
  await assert.rejects(importContent({ ...f, apply: true }), error);
  await unchanged(f);
});

test('published revisions cannot be pruned from an otherwise valid package', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await importContent({ ...f, apply: true });
  const catalog = await json(path.join(f.input, 'catalog.json'));
  catalog.entries = catalog.entries.filter(entry => entry.guideId !== 'synthetic-fourth');
  delete catalog.currentRevisions['synthetic-fourth'];
  await putJson(path.join(f.input, 'catalog.json'), catalog);
  await assert.rejects(importContent({ ...f, apply: true }), /Retained guide revision missing/);
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount + 1);
});

for (const phase of ['prepared', 'files-staged', 'before-switch', 'after-switch']) test(`recover synthetic process interruption at ${phase}`, async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await assert.rejects(importContent({ ...f, apply: true, onPhase: current => { if (current === phase) throw new SimulatedInterruption(phase); } }), /Synthetic interrupted/);
  await assert.rejects(importContent({ ...f, apply: true }), /content lock/);
  const expected = phase === 'after-switch' ? 'interrupted-after-switch' : 'interrupted-before-switch';
  assert.equal((await recoverContent({ rootDir: f.rootDir })).state, expected);
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount + (phase === 'after-switch' ? 1 : 0));
  assert.equal((await recoverContent({ rootDir: f.rootDir, apply: true })).recovered, true);
  if (phase !== 'after-switch') await unchanged(f);
  await importContent({ ...f, apply: true });
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount + 1);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
});

test('recorded interrupted switch recovers a damaged catalog from its verified backup', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await assert.rejects(importContent({ ...f, apply: true, onPhase: phase => { if (phase === 'before-switch') throw new SimulatedInterruption(phase); } }));
  await writeFile(path.join(f.rootDir, 'content/catalog.json'), 'Synthetic damaged catalog');
  assert.equal((await recoverContent({ rootDir: f.rootDir })).state, 'catalog-needs-recovery');
  await recoverContent({ rootDir: f.rootDir, apply: true });
  await unchanged(f);
});

test('recovery rejects a modified backup without changing the active catalog', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await assert.rejects(importContent({ ...f, apply: true, onPhase: phase => { if (phase === 'before-switch') throw new SimulatedInterruption(phase); } }));
  await writeFile(path.join(f.rootDir, '.content-update/previous-catalog.json'), '{}');
  await assert.rejects(recoverContent({ rootDir: f.rootDir, apply: true }), /backup hash mismatch/);
  await unchanged(f);
});

test('recovery cannot release the lock of a running import', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await importContent({ ...f, apply: true, onPhase: async phase => {
    if (phase !== 'prepared') return;
    await assert.rejects(recoverContent({ rootDir: f.rootDir, apply: true }), /owner is still running/);
    await assert.rejects(importContent({ ...f, apply: true }), /content lock/);
    await unchanged(f);
  } });
  assert.equal((await validateContent({ rootDir: f.rootDir })).summary.guides, retainedRevisionCount + 1);
});

test('selection rollback rejects a modified successful-update backup without writes', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await importContent({ ...f, apply: true });
  const before = await readFile(path.join(f.rootDir, 'content/catalog.json'));
  await writeFile(path.join(f.rootDir, '.content-update/previous-catalog.json'), '{}');
  await assert.rejects(rollbackContent({ rootDir: f.rootDir }), /No valid previous/);
  await assert.rejects(rollbackContent({ rootDir: f.rootDir, apply: true }), /No valid previous/);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'content/catalog.json')), before);
});

test('only declared input files are read or copied, and destinations outside content are untouched', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await writeFile(path.join(f.input, 'unlisted-synthetic.txt'), 'Synthetic unlisted payload, must not enter content.');
  await importContent({ ...f, apply: true });
  assert.equal((await readdir(path.join(f.rootDir, 'content'))).includes('unlisted-synthetic.txt'), false);
  assert.deepEqual(await readFile(path.join(f.rootDir, 'synthetic-personal-records.txt')), f.personal);
});

test('input roots reject absolute and parent paths without reading them', async t => {
  const f = await fixture(t);
  for (const from of ['../outside', '/outside', 'C:/outside', 'incoming/../outside', 'incoming//synthetic', 'incoming\\synthetic']) {
    await assert.rejects(planImport({ rootDir: f.rootDir, from }), /project-relative/);
  }
  await unchanged(f);
});

test('input symlinks are rejected before following them', async t => {
  const f = await fixture(t);
  const original = path.join(f.input, 'guides');
  const target = path.join(f.rootDir, 'synthetic-linked-target');
  await rename(original, target);
  try { await symlink(target, original, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Synthetic link unavailable (${error.code}); rejection not exercised.`); return; } throw error; }
  await assert.rejects(importContent({ ...f, apply: true }), /symlink/);
  await unchanged(f);
});

test('destination symlinks are rejected before writing an imported file', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  const target = path.join(f.rootDir, 'synthetic-linked-target');
  await mkdir(target);
  const metadataFile = path.join(f.input, 'guides/synthetic-fourth-r1.json');
  const metadata = await json(metadataFile);
  metadata.bodyFile = 'new-folder/synthetic.md';
  await mkdir(path.join(f.input, 'guides/new-folder'));
  await rename(path.join(f.input, 'guides/synthetic-fourth-r1.md'), path.join(f.input, 'guides/new-folder/synthetic.md'));
  await putJson(metadataFile, metadata);
  try { await symlink(target, path.join(f.rootDir, 'content/guides/new-folder'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Synthetic link unavailable (${error.code}); rejection not exercised.`); return; } throw error; }
  await assert.rejects(importContent({ ...f, apply: true }), /symlink/);
  assert.deepEqual(await readdir(target), []);
  await unchanged(f);
});

test('recovery rejects a symlinked staging ancestor before recursive cleanup', async t => {
  const f = await fixture(t);
  await addGuide(f.input);
  await assert.rejects(importContent({ ...f, apply: true, onPhase: phase => { if (phase === 'prepared') throw new SimulatedInterruption(phase); } }));
  const stage = path.join(f.rootDir, '.content-update/stages');
  const target = path.join(f.rootDir, 'synthetic-stage-target');
  await rename(stage, target);
  try { await symlink(target, stage, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Synthetic link unavailable (${error.code}); rejection not exercised.`); return; } throw error; }
  await assert.rejects(recoverContent({ rootDir: f.rootDir, apply: true }), /symlink/);
  assert.equal((await readdir(target)).length, 1);
  await unchanged(f);
});
