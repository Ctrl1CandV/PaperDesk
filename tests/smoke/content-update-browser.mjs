// Synthetic content/IndexedDB integration probe. Only an isolated project copy
// and fresh browser contexts are used; normal preview records are never read.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJson, validateContent } from '../../server/content/validation.mjs';
import { importContent, recoverContent, rollbackContent, SimulatedInterruption } from '../../server/content/import.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'http://127.0.0.1:4175';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const putJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const personalIdentity = value => { const { exportedAt: _time, ...records } = value; return records; };
const guideId = 'agent-survey';
const noteId = '11111111-1111-4111-8111-111111111111';
const explorationId = '22222222-2222-4222-8222-222222222222';
const lensId = 'synthetic-update-lens';
const mainContent = await validateContent();
const baseRevision = mainContent.catalog.currentRevisions[guideId];
const nextRevision = Math.max(...mainContent.guides.filter(item => item.metadata.id === guideId).map(item => item.metadata.revision)) + 1;
const baseSeedRevision = mainContent.catalog.exploration.currentRevision;
const nextSeedRevision = Math.max(...Object.keys(mainContent.catalog.exploration.revisions).map(Number)) + 1;
const originalGuide = mainContent.guides.find(item => item.metadata.id === guideId && item.metadata.revision === baseRevision);
assert.equal(originalGuide.metadata.schemaVersion, 2, 'This probe exercises v2 orientation metadata.');
const target = { guideId, revision: baseRevision, unitId: originalGuide.metadata.orientation.readingTargets[0].unitId };
const quote = 'SYNTHETIC saved excerpt fixture; do not rewrite after content updates.';
const originalBodyHash = hash(Buffer.from(originalGuide.body));
const source = originalGuide.metadata.source;
const snapshotPaths = new Set(['content/catalog.json', ...mainContent.guides.flatMap(item => [item.metadataFile, item.bodyFile, ...item.metadata.assets.map(asset => path.posix.join(path.posix.dirname(item.metadataFile), asset.path))]), ...mainContent.explorations.map(item => item.seedFile)]);
const rootSnapshot = new Map(await Promise.all([...snapshotPaths].map(async file => [file, hash(await readFile(path.join(project, file)))])));
async function rootContentUnchanged() {
  for (const [file, expected] of rootSnapshot) assert.equal(hash(await readFile(path.join(project, file))), expected, `Main content changed during probe: ${file}`);
}

await mkdir(path.join(project, '.cache/test-workspaces'), { recursive: true });
const root = await mkdtemp(path.join(project, '.cache/test-workspaces/content-browser-'));
const relativeRoot = path.relative(project, root).replaceAll('\\', '/');
const report = {
  format: 'paperdesk-synthetic-content-browser-check', directory: relativeRoot, port: 4175, node: process.version,
  guideId, fromRevision: baseRevision, toRevision: nextRevision, fromSeedRevision: baseSeedRevision, toSeedRevision: nextSeedRevision,
  checkpoints: [], limitations: [
    'Browser automation, not physical-device testing.',
    'Interruption is injected at a documented transaction boundary, not a power-loss simulation.',
    'All personal records are synthetic, created in a fresh context. Reader-route probes use a separate empty context.',
    'The new revision changes synthetic orientation text only; it does not claim new scholarly content.',
  ],
};
for (const directory of ['src', 'content', 'schemas', 'scripts', 'shared']) await cp(path.join(project, directory), path.join(root, directory), { recursive: true, errorOnExist: true, force: false });
for (const file of ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json']) await cp(path.join(project, file), path.join(root, file), { errorOnExist: true, force: false });

function syntheticLens(revision, seedRevision) {
  const reading = { guideId, revision, unitId: target.unitId, purpose: 'Synthetic pinned reading target.' };
  return { id: lensId, rank: 4, title: `Synthetic editorial lens ${seedRevision}`, whyNow: 'Synthetic update test.', orientation: 'Synthetic editorial background only.', guideRefs: [reading], prompt: `Synthetic editorial prompt ${seedRevision}`, selfCheck: 'Synthetic understanding check, no score.', nextAction: { kind: 'read-guide', description: 'Synthetic deliberate next reading.', target: reading } };
}
const activeContent = path.join(root, 'content');
const originalSeedFile = mainContent.catalog.exploration.revisions[baseSeedRevision];
const baseSeed = await json(path.join(activeContent, originalSeedFile));
const baseLens = syntheticLens(baseRevision, baseSeedRevision);
baseLens.rank = Math.max(...baseSeed.lenses.map(item => item.rank)) + 1;
baseSeed.lenses.push(baseLens);
await putJson(path.join(activeContent, originalSeedFile), baseSeed);
await validateContent({ rootDir: root });

let server, browser, mainContext, probeContext;
const errors = [], external = [];
async function startServer() {
  // Rebuild the same derived browser catalog used by the normal import/build path.
  await promisify(execFile)(process.execPath, [path.join(root, 'scripts/content/build-index.mjs')], { cwd: root });
  const nonce = randomBytes(18).toString('base64');
  server = await createServer({
    configFile: false, root, cacheDir: path.join(root, '.vite-cache'), logLevel: 'silent',
    plugins: [react(), { name: 'synthetic-local-csp', transformIndexHtml: { order: 'pre', handler: html => html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) } }],
    html: { cspNonce: nonce },
    server: { host: '127.0.0.1', port: 4175, strictPort: true, watch: { ignored: ['**/incoming/**', '**/.content-update/**'] } },
  });
  await server.listen();
}
async function stopServer() { if (server) { const closing = server; server = undefined; await closing.close(); } }
function observe(context) {
  context.on('page', page => page.on('pageerror', error => errors.push(error.name)));
  context.on('request', request => { if (/^https?:/u.test(request.url()) && !request.url().startsWith(`${origin}/`)) external.push(new URL(request.url()).origin); });
}
async function readPersonal(page) { return personalIdentity(await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup())); }
async function checkpoint(page, name, baseline, current, seedRevision) {
  await page.goto(`${origin}/backup`);
  await page.getByRole('heading', { name: '备份与本地记录', exact: true }).waitFor();
  assert.deepEqual(await readPersonal(page), baseline);
  const content = await page.evaluate(async ({ guideId, baseRevision, baseSeedRevision, lensId }) => {
    const { contentRepository } = await import('/src/content/repository.ts');
    const old = await contentRepository.get(guideId, baseRevision);
    const seed = await contentRepository.getExplorationSeed();
    const oldSeed = await contentRepository.getExplorationSeed(baseSeedRevision);
    return {
      current: contentRepository.currentRevision(guideId), seedRevision: seed.revision,
      oldTitle: old?.metadata.title,
      oldLens: oldSeed?.lenses.find(lens => lens.id === lensId)?.title,
      sourceVersion: old?.metadata.source.version,
    };
  }, { guideId, baseRevision, baseSeedRevision, lensId });
  assert.deepEqual(content, { current, seedRevision, oldTitle: originalGuide.metadata.title, oldLens: baseLens.title, sourceVersion: source.version });
  report.checkpoints.push({ name, current, seedRevision, personalSha256: hash(canonicalJson(baseline)), completePersonalRecordsUnchanged: true, retainedGuideRevision: baseRevision, retainedSeedRevision: baseSeedRevision });
}
async function readerRoutes(page, current, available = [1, baseRevision, current]) {
  await page.goto(`${origin}/library?article=${guideId}`);
  await page.locator(`#choose-${guideId}`).waitFor();
  // Resume intentionally keeps an older revision; the chapter links select the current guide.
  assert.equal(await page.locator(`.orientation-outline a[href="/read/${guideId}/${current}#${target.unitId}"]`).count(), 1);
  const currentMetadata = await page.evaluate(async guideId => {
    const { contentRepository } = await import('/src/content/repository.ts');
    return (await contentRepository.get(guideId, contentRepository.currentRevision(guideId))).metadata;
  }, guideId);
  assert.equal(currentMetadata.schemaVersion, 2);
  const orientationTitle = page.locator('#orientation-title');
  await orientationTitle.waitFor({ state: 'visible' });
  const normalizeTitle = value => value.replace(/\s+/gu, ' ').trim();
  const title = currentMetadata.orientation.shortTitle;
  const separator = title.search(/[：:]/);
  assert.equal(normalizeTitle(await orientationTitle.textContent()), normalizeTitle(separator > 0 && separator < 24 ? title.slice(0, separator) : title));
  for (const revision of new Set(available)) {
    await page.goto(`${origin}/read/${guideId}/${revision}#${target.unitId}`);
    await page.locator(`#${target.unitId}`).waitFor();
    const actual = await page.evaluate(async ({ guideId, revision }) => (await (await import('/src/content/repository.ts')).contentRepository.get(guideId, revision)).body, { guideId, revision });
    assert.equal(hash(Buffer.from(actual)), originalBodyHash);
    await page.locator('.prose h1').filter({ hasText: originalGuide.metadata.title }).waitFor();
  }
}
async function savedEvidence(page, baseline) {
  await page.goto(`${origin}/explore/questions/${explorationId}`);
  await page.getByRole('heading', { name: 'SYNTHETIC preserved research question', exact: true }).waitFor();
  await page.locator('.exploration-origin summary').click();
  await page.locator('.exploration-origin').filter({ hasText: baseLens.title }).waitFor();
  assert.equal(await page.locator(`a[href="/read/${guideId}/${baseRevision}#${target.unitId}"]`).count(), 2);
  await page.getByText(quote, { exact: true }).waitFor();
  assert.deepEqual(await readPersonal(page), baseline);
}
try {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(project, '.cache/playwright');
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
  report.browser = browser.version();
  mainContext = await browser.newContext(); probeContext = await browser.newContext();
  observe(mainContext); observe(probeContext);
  const page = await mainContext.newPage(), probe = await probeContext.newPage();
  await startServer();
  await readerRoutes(probe, baseRevision);
  await page.goto(`${origin}/backup`);
  await page.getByRole('heading', { name: '备份与本地记录', exact: true }).waitFor();
  await page.evaluate(async ({ target, noteId, explorationId, lensId, baseSeedRevision, source, quote }) => {
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.saveNote({ id: noteId, ...target, text: 'SYNTHETIC exact reader note\nDo not rewrite this after a content update.', quote, status: 'open' }, null);
    await personalStore.saveExploration({ id: explorationId, title: 'SYNTHETIC preserved research question', question: 'SYNTHETIC question based on the retained revision?', origin: 'adapted-editorial', seedRef: { revision: baseSeedRevision, lensId }, status: 'deferred', interpretation: 'SYNTHETIC tentative interpretation.', unknowns: 'SYNTHETIC unresolved condition.', nextAction: { kind: 'read-guide', description: 'SYNTHETIC return to the retained revision.', target }, evidence: [{ id: '33333333-3333-4333-8333-333333333333', provenance: 'guide-excerpt', text: quote, target, relatedNoteId: noteId, sources: [{ url: source.url, label: 'Synthetic saved source snapshot', version: source.version }], comment: 'SYNTHETIC exact independent reader comment.' }] }, null);
    const updatedAt = '2026-01-01T00:00:00.000Z';
    await personalStore.setGuideState({ guideId: target.guideId, revision: target.revision, status: 'read', updatedAt });
    await personalStore.setOriginalState({ sourceId: source.id, sourceVersion: source.version, status: 'unread', updatedAt });
    await personalStore.setResume({ ...target, offset: 0.35, updatedAt });
    await personalStore.savePreferences({ fontSize: 19, theme: 'system' });
  }, { target, noteId, explorationId, lensId, baseSeedRevision, source, quote });
  const baseline = await readPersonal(page);
  await checkpoint(page, 'initial-current-with-synthetic-records', baseline, baseRevision, baseSeedRevision);

  const from = 'incoming/next-release', incoming = path.join(root, from);
  await mkdir(path.dirname(incoming), { recursive: true });
  await cp(activeContent, incoming, { recursive: true, errorOnExist: true, force: false });
  const nextMetadata = structuredClone(originalGuide.metadata);
  nextMetadata.revision = nextRevision;
  nextMetadata.orientation.shortTitle = `SYNTHETIC orientation revision ${nextRevision}`;
  nextMetadata.orientation.summary = 'SYNTHETIC updated orientation; accepted reading body remains byte-for-byte unchanged.';
  const metadataRelative = `guides/${guideId}.synthetic-r${nextRevision}.json`;
  await putJson(path.join(incoming, metadataRelative), nextMetadata);
  const nextSeed = structuredClone(baseSeed); nextSeed.revision = nextSeedRevision;
  nextSeed.lenses[nextSeed.lenses.length - 1] = { ...syntheticLens(nextRevision, nextSeedRevision), rank: baseLens.rank };
  const nextSeedFile = `exploration-synthetic-r${nextSeedRevision}.json`;
  await putJson(path.join(incoming, nextSeedFile), nextSeed);
  const nextCatalog = await json(path.join(incoming, 'catalog.json'));
  const oldEntry = nextCatalog.entries.find(entry => entry.guideId === guideId && entry.revision === baseRevision);
  nextCatalog.entries.push({ ...structuredClone(oldEntry), revision: nextRevision, metadataFile: metadataRelative });
  nextCatalog.currentRevisions[guideId] = nextRevision;
  nextCatalog.exploration.currentRevision = nextSeedRevision; nextCatalog.exploration.revisions[nextSeedRevision] = nextSeedFile;
  await putJson(path.join(incoming, 'catalog.json'), nextCatalog);
  await stopServer();
  const applied = await importContent({ rootDir: root, from, apply: true });
  assert.equal(applied.applied, true);
  await startServer();
  await checkpoint(page, 'applied-next-guide-and-seed', baseline, nextRevision, nextSeedRevision);
  await readerRoutes(probe, nextRevision);
  await savedEvidence(page, baseline);

  await stopServer();
  assert.equal((await rollbackContent({ rootDir: root })).applied, false);
  assert.equal((await rollbackContent({ rootDir: root, apply: true })).applied, true);
  await startServer();
  await checkpoint(page, 'selection-rollback-retains-new-and-old-revisions', baseline, baseRevision, baseSeedRevision);
  await readerRoutes(probe, baseRevision, [1, baseRevision, nextRevision]);
  await savedEvidence(page, baseline);
  await stopServer();
  await importContent({ rootDir: root, from, apply: true });
  await startServer();
  await checkpoint(page, 'reselected-next-revision-after-rollback', baseline, nextRevision, nextSeedRevision);

  const beforeInvalid = await readFile(path.join(activeContent, 'catalog.json'));
  const metadataFile = path.join(incoming, metadataRelative);
  const conflicting = structuredClone(nextMetadata);
  conflicting.orientation.value = 'SYNTHETIC prohibited same-key orientation edit.';
  await putJson(metadataFile, conflicting);
  await stopServer();
  await assert.rejects(importContent({ rootDir: root, from, apply: true }), /Immutable metadata conflict/u);
  assert.deepEqual(await readFile(path.join(activeContent, 'catalog.json')), beforeInvalid);
  await putJson(metadataFile, nextMetadata);
  await startServer();
  await checkpoint(page, 'rejected-same-key-orientation-change', baseline, nextRevision, nextSeedRevision);

  const selectionOnly = structuredClone(nextCatalog);
  selectionOnly.entries.find(entry => entry.guideId === guideId && entry.revision === nextRevision).recommendation.reason = 'Synthetic catalog choice for interruption probe.';
  await putJson(path.join(incoming, 'catalog.json'), selectionOnly);
  await stopServer();
  await assert.rejects(importContent({ rootDir: root, from, apply: true, onPhase: phase => { if (phase === 'before-switch') throw new SimulatedInterruption(phase); } }), /Synthetic interrupted/u);
  assert.deepEqual(await readFile(path.join(activeContent, 'catalog.json')), beforeInvalid);
  assert.equal((await recoverContent({ rootDir: root })).state, 'interrupted-before-switch');
  assert.equal((await recoverContent({ rootDir: root, apply: true })).recovered, true);
  await startServer();
  await checkpoint(page, 'interrupted-before-switch-and-recovered', baseline, nextRevision, nextSeedRevision);
  await readerRoutes(probe, nextRevision);
  await savedEvidence(page, baseline);

  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  await rootContentUnchanged();
  report.renderedChecks = ['Two-level library selects the current orientation and links to its exact revision.', 'Revision 1, the previous current revision and the next revision render the unchanged accepted body.', 'Saved exploration retains its original seed lens and two pinned return links after update, rollback and recovery.', 'Every complete personal backup is identical across update, rollback, rejection and recovery.'];
  report.result = 'pass'; report.mainContentFilesUnchanged = rootSnapshot.size; report.acceptedBodySha256 = originalBodyHash;
  report.unsolicitedExternalRequests = 0; report.pageErrors = 0;
} catch (error) {
  report.result = 'fail'; report.error = { name: error.name, code: error.code ?? null, message: String(error.message).replaceAll(root, '[synthetic project]').replaceAll(project, '[project]').replace(/file:\/\/\/[^\s]+/gu, '[local module]') };
  process.exitCode = 1;
} finally {
  await mainContext?.close(); await probeContext?.close(); await browser?.close(); await stopServer();
  await putJson(path.join(root, 'content-browser-results.json'), report);
  await mkdir(path.join(project, '.cache/screenshots'), { recursive: true });
  await putJson(path.join(project, '.cache/screenshots/content-update-check.json'), report);
  console.log(JSON.stringify(report, null, 2));
}
