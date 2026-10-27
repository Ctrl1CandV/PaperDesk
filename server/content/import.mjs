import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, limits, normalizedRelativePath, packageFile, projectRoot, validateContent } from './validation.mjs';

const workspaceFolder = '.content-update';
const catalogFile = 'content/catalog.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = guide => `${guide.metadata.id}/${guide.metadata.revision}`;
const sameJson = (a, b) => canonicalJson(a) === canonicalJson(b);
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(message); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** The package root is explicitly selected inside this workspace. No discovery or parent access. */
export async function resolveInputDirectory(rootDir, supplied) {
  if (typeof supplied !== 'string' || !supplied || supplied.length > 300 || path.isAbsolute(supplied)
    || /[:\\\u0000-\u001f]/u.test(supplied) || supplied.split('/').some(part => !part || part === '.' || part === '..'
      || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) fail('Input directory must be a normalized project-relative directory.');
  let cursor = path.resolve(rootDir);
  for (const part of supplied.split('/')) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = await lstat(cursor); } catch { fail('Input directory is unavailable.'); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Input directory must contain no symlink.');
  }
  if (!samePath(await realpath(cursor), cursor)) fail('Input directory must contain no symlink ancestor.');
  return cursor;
}

async function exists(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Validate every existing path component before creating a project-local target. */
async function destination(rootDir, relative, createDirectories = false) {
  normalizedRelativePath(relative);
  const root = path.resolve(rootDir);
  if (!samePath(await realpath(root), root) || (await lstat(root)).isSymbolicLink()) fail('Destination root must contain no symlink.');
  const parts = relative.split('/');
  let cursor = root;
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    const stat = await exists(cursor);
    if (stat?.isSymbolicLink()) fail('Destination path must contain no symlink.');
    if (index < parts.length - 1) {
      if (stat && !stat.isDirectory()) fail('Destination parent is not a directory.');
      if (!stat && createDirectories) await mkdir(cursor);
    } else if (stat && !stat.isFile()) fail('Destination is not a regular file.');
  }
  return cursor;
}

async function readBounded(rootDir, relative, maximum = limits.asset) {
  const file = await packageFile(rootDir, relative);
  if ((await lstat(file)).size > maximum) fail('Content file exceeds the import bound.');
  const bytes = await readFile(file);
  if (bytes.length > maximum) fail('Content file exceeds the import bound.');
  return bytes;
}

function directoryFile(file, relative) {
  normalizedRelativePath(relative);
  const directory = path.posix.dirname(file);
  return directory === '.' ? relative : `${directory}/${relative}`;
}

function declaredFiles(validation) {
  const files = new Map();
  for (const guide of validation.guides) {
    files.set(guide.metadataFile, 'json');
    files.set(guide.bodyFile, 'body');
    for (const asset of guide.metadata.assets) files.set(directoryFile(guide.metadataFile, asset.path), 'asset');
  }
  for (const item of validation.explorations) files.set(item.seedFile, 'json');
  return files;
}

async function assertImmutable(active, incoming, rootDir, inputDir) {
  const incomingGuides = new Map(incoming.guides.map(guide => [key(guide), guide]));
  for (const existing of active.guides) {
    const next = incomingGuides.get(key(existing));
    if (!next) fail(`Retained guide revision missing: ${key(existing)}.`);
    if (`content/${next.metadataFile}` !== existing.metadataFile) fail(`Retained metadata path changed: ${key(existing)}.`);
    if (!sameJson(existing.metadata, next.metadata)) fail(`Immutable metadata conflict: ${key(existing)}; use a new revision.`);
    const before = await readBounded(rootDir, existing.bodyFile, limits.body);
    const after = await readBounded(inputDir, next.bodyFile, limits.body);
    if (!before.equals(after)) fail(`Immutable body conflict: ${key(existing)}; use a new revision.`);
    for (const asset of existing.metadata.assets) {
      const a = await readBounded(rootDir, directoryFile(existing.metadataFile, asset.path));
      const b = await readBounded(inputDir, directoryFile(next.metadataFile, asset.path));
      if (!a.equals(b)) fail(`Immutable asset conflict: ${key(existing)}; use a new revision.`);
    }
  }
  const seeds = new Map(incoming.explorations.map(item => [item.seed.revision, item]));
  for (const item of active.explorations) {
    const next = seeds.get(item.seed.revision);
    if (!next) fail(`Retained exploration revision missing: ${item.seed.revision}.`);
    if (`content/${next.seedFile}` !== item.seedFile) fail(`Retained exploration path changed: ${item.seed.revision}.`);
    if (!sameJson(item.seed, next.seed)) fail(`Immutable exploration conflict: ${item.seed.revision}; use a new revision.`);
  }
}

/** Returns a validated immutable snapshot. It performs no writes. */
export async function planImport({ rootDir = projectRoot, from } = {}) {
  const inputDir = await resolveInputDirectory(rootDir, from);
  const active = await validateContent({ rootDir });
  const incoming = await validateContent({ rootDir: inputDir, catalogFile: 'catalog.json' });
  await assertImmutable(active, incoming, rootDir, inputDir);
  const files = new Map();
  let total = 0;
  for (const [relative, kind] of declaredFiles(incoming)) {
    if (relative === 'catalog.json' || relative.startsWith('.')) fail('Declared content path is reserved.');
    const bytes = await readBounded(inputDir, relative, kind === 'json' ? limits.json : kind === 'body' ? limits.body : limits.asset);
    total += bytes.length;
    if (total > limits.package) fail('Import package exceeds total size limit.');
    const target = `content/${relative}`;
    const fullTarget = await destination(rootDir, target);
    const stat = await exists(fullTarget);
    if (stat) {
      const existing = await readBounded(rootDir, target, kind === 'json' ? limits.json : kind === 'body' ? limits.body : limits.asset);
      let identical = existing.equals(bytes);
      if (!identical && kind === 'json') {
        try { identical = sameJson(JSON.parse(existing), JSON.parse(bytes)); } catch { /* Unknown files cannot be replaced. */ }
      }
      if (!identical) fail(`Destination file conflict: ${target}; use distinct revision paths.`);
      // Keep original JSON bytes when only object ordering/whitespace differs.
      files.set(relative, { bytes: existing, kind, add: false });
    } else files.set(relative, { bytes, kind, add: true });
  }
  const current = await readBounded(rootDir, catalogFile, limits.json);
  const after = encode(incoming.catalog);
  const oldKeys = new Set(active.guides.map(key));
  const oldSeeds = new Set(active.explorations.map(item => item.seed.revision));
  return {
    catalog: incoming.catalog, before: current, after, files,
    beforeHash: hash(current), afterHash: hash(after),
    changed: !sameJson(active.catalog, incoming.catalog) || [...files.values()].some(file => file.add),
    summary: {
      addedGuides: incoming.guides.filter(guide => !oldKeys.has(key(guide))).map(key),
      addedExplorationRevisions: incoming.explorations.filter(item => !oldSeeds.has(item.seed.revision)).map(item => item.seed.revision),
      newFiles: [...files.values()].filter(file => file.add).length,
      currentRevisions: incoming.catalog.currentRevisions,
      currentExplorationRevision: incoming.catalog.exploration.currentRevision,
      retainedGuideRevisions: active.guides.length,
      retainedExplorationRevisions: active.explorations.length,
      checks: incoming.summary,
    },
  };
}

async function durableWrite(file, bytes, flag = 'wx') {
  const handle = await open(file, flag);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function writeInternal(rootDir, relative, bytes) {
  const full = await destination(rootDir, relative, true);
  await durableWrite(full, bytes, 'w');
}

async function writeRecord(rootDir, relative, value) {
  const temporary = `${relative}.tmp-${randomUUID()}`;
  const full = await destination(rootDir, temporary, true);
  await durableWrite(full, Buffer.isBuffer(value) ? value : encode(value));
  try { await rename(full, await destination(rootDir, relative, true)); }
  finally { await removeInternalFile(rootDir, temporary); }
}

async function removeInternalFile(rootDir, relative) {
  const full = await destination(rootDir, relative);
  try { await unlink(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function removeStage(rootDir, id) {
  if (!/^[a-f0-9-]{36}$/u.test(id)) fail('Invalid internal transaction identity.');
  const relative = `${workspaceFolder}/stages/${id}`;
  // Validate all ancestors before any recursive operation, including recovery.
  const probe = await destination(rootDir, `${relative}/.cleanup-probe`);
  const full = path.dirname(probe);
  const expected = path.resolve(rootDir, workspaceFolder, 'stages');
  if (path.dirname(full) !== expected || (await exists(full))?.isSymbolicLink()) fail('Invalid internal staging location.');
  await rm(full, { recursive: true, force: true });
}

async function acquire(rootDir) {
  const lock = await destination(rootDir, `${workspaceFolder}/lock.json`, true);
  const id = randomUUID();
  try { await durableWrite(lock, encode({ format: 'paperdesk-content-lock', transactionId: id, pid: process.pid })); }
  catch (error) { if (error.code === 'EEXIST') fail('Another update or interrupted update holds the content lock. Run --recover to inspect it.'); throw error; }
  return id;
}

async function liveLock(rootDir) {
  const relative = `${workspaceFolder}/lock.json`;
  if (!await exists(path.resolve(rootDir, relative))) return false;
  let lock;
  try { lock = JSON.parse(await readBounded(rootDir, relative, limits.json)); }
  catch { fail('Content lock is invalid; recovery was not applied.'); }
  if (lock.format !== 'paperdesk-content-lock' || !Number.isSafeInteger(lock.pid) || lock.pid < 0) fail('Content lock is invalid; recovery was not applied.');
  if (lock.pid === 0) return false; // Test-only interruption marker; never produced by the CLI.
  try { process.kill(lock.pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; return true; }
}

export class SimulatedInterruption extends Error {
  constructor(phase) { super(`Synthetic interrupted update at ${phase}.`); this.name = 'SimulatedInterruption'; }
}

async function phaseHook(onPhase, phase) { if (onPhase) await onPhase(phase); }

/** Apply has one publication point: atomic rename over content/catalog.json. */
export async function importContent({ rootDir = projectRoot, from, apply = false, onPhase } = {}) {
  if (!apply) { const plan = await planImport({ rootDir, from }); return { applied: false, changed: plan.changed, ...plan.summary }; }
  const id = await acquire(rootDir);
  let stageMade = false;
  try {
    const plan = await planImport({ rootDir, from });
    if (!plan.changed) return { applied: false, changed: false, ...plan.summary };
    const stage = `${workspaceFolder}/stages/${id}`;
    for (const [relative, file] of plan.files) await writeInternal(rootDir, `${stage}/${relative}`, file.bytes);
    await writeInternal(rootDir, `${stage}/catalog.json`, plan.after);
    stageMade = true;
    await validateContent({ rootDir: path.resolve(rootDir, stage), catalogFile: 'catalog.json' });
    await writeRecord(rootDir, `${workspaceFolder}/previous-catalog.json`, plan.before);
    await writeRecord(rootDir, `${workspaceFolder}/next-catalog.json`, plan.after);
    await writeRecord(rootDir, `${workspaceFolder}/transaction.json`, {
      format: 'paperdesk-content-update', schemaVersion: 1, transactionId: id,
      beforeHash: plan.beforeHash, afterHash: plan.afterHash,
    });
    await phaseHook(onPhase, 'prepared');
    for (const [relative, file] of plan.files) {
      if (!file.add) continue;
      const target = await destination(rootDir, `content/${relative}`, true);
      await durableWrite(target, file.bytes);
    }
    await phaseHook(onPhase, 'files-staged');
    // Detect changes made outside this tool while it held the lock.
    if (hash(await readBounded(rootDir, catalogFile, limits.json)) !== plan.beforeHash) fail('Active catalog changed during import; publication cancelled.');
    const nextFile = `content/.catalog-${id}.json`;
    await writeInternal(rootDir, nextFile, plan.after);
    await validateContent({ rootDir, catalogFile: nextFile });
    await phaseHook(onPhase, 'before-switch');
    await rename(await destination(rootDir, nextFile), await destination(rootDir, catalogFile));
    await phaseHook(onPhase, 'after-switch');
    await writeRecord(rootDir, `${workspaceFolder}/last-update.json`, await readJournal(rootDir));
    await removeInternalFile(rootDir, `${workspaceFolder}/transaction.json`);
    return { applied: true, changed: true, ...plan.summary };
  } catch (error) {
    if (error instanceof SimulatedInterruption) {
      // A fault-injection hook models a terminated owner without killing the test runner.
      await writeInternal(rootDir, `${workspaceFolder}/lock.json`, encode({ format: 'paperdesk-content-lock', transactionId: id, pid: 0 }));
      stageMade = false;
      throw error;
    }
    throw error;
  } finally {
    // Simulated interruption deliberately models process death; recovery owns its lock.
    const journal = await exists(path.resolve(rootDir, workspaceFolder, 'transaction.json'));
    if (!journal) {
      await removeInternalFile(rootDir, `${workspaceFolder}/lock.json`);
      if (stageMade) await removeStage(rootDir, id);
    }
  }
}

async function readJournal(rootDir, filename = 'transaction.json') {
  const relative = `${workspaceFolder}/${filename}`;
  if (!await exists(path.resolve(rootDir, relative))) return null;
  let journal;
  try { journal = JSON.parse(await readBounded(rootDir, relative, limits.json)); } catch { fail('Recovery journal is unavailable or invalid.'); }
  const keys = Object.keys(journal).sort().join(',');
  if (keys !== 'afterHash,beforeHash,format,schemaVersion,transactionId' || journal.format !== 'paperdesk-content-update' || journal.schemaVersion !== 1
    || !/^[a-f0-9-]{36}$/u.test(journal.transactionId) || !/^[a-f0-9]{64}$/u.test(journal.beforeHash) || !/^[a-f0-9]{64}$/u.test(journal.afterHash)) fail('Recovery journal has an unsupported format.');
  return journal;
}

async function switchValidatedCatalog(rootDir, bytes, id) {
  const relative = `content/.catalog-recovery-${id}.json`;
  await writeInternal(rootDir, relative, bytes);
  try {
    await validateContent({ rootDir, catalogFile: relative });
    await rename(await destination(rootDir, relative), await destination(rootDir, catalogFile));
  } finally { await removeInternalFile(rootDir, relative); }
}

/** Inspect by default; --apply explicitly recovers only a recorded interrupted transaction. */
export async function recoverContent({ rootDir = projectRoot, apply = false } = {}) {
  const journal = await readJournal(rootDir);
  const locked = Boolean(await exists(path.resolve(rootDir, workspaceFolder, 'lock.json')));
  if (apply && locked && await liveLock(rootDir)) fail('Content update owner is still running; recovery was not applied.');
  if (!journal) {
    await validateContent({ rootDir });
    if (apply && locked) await removeInternalFile(rootDir, `${workspaceFolder}/lock.json`);
    return { state: locked ? 'locked-before-staging' : 'clean', recovered: apply && locked };
  }
  const previous = await readBounded(rootDir, `${workspaceFolder}/previous-catalog.json`, limits.json);
  if (hash(previous) !== journal.beforeHash) fail('Recovery backup hash mismatch; active catalog was not changed.');
  let currentHash;
  try { currentHash = hash(await readBounded(rootDir, catalogFile, limits.json)); } catch { currentHash = null; }
  const state = currentHash === journal.beforeHash ? 'interrupted-before-switch' : currentHash === journal.afterHash ? 'interrupted-after-switch' : 'catalog-needs-recovery';
  if (!apply) return { state, recovered: false };
  await destination(rootDir, `${workspaceFolder}/stages/${journal.transactionId}/.cleanup-probe`);
  if (state === 'catalog-needs-recovery') await switchValidatedCatalog(rootDir, previous, journal.transactionId);
  else await validateContent({ rootDir });
  await writeRecord(rootDir, `${workspaceFolder}/last-update.json`, journal);
  await removeInternalFile(rootDir, `content/.catalog-${journal.transactionId}.json`);
  await removeInternalFile(rootDir, `${workspaceFolder}/transaction.json`);
  await removeInternalFile(rootDir, `${workspaceFolder}/lock.json`);
  await removeStage(rootDir, journal.transactionId);
  return { state, recovered: true };
}

/** Roll back selections without pruning any published revision or touching personal records. */
export async function rollbackContent({ rootDir = projectRoot, apply = false } = {}) {
  if (await readJournal(rootDir)) fail('Recover the interrupted update before a selection rollback.');
  const active = await validateContent({ rootDir });
  const activeBytes = await readBounded(rootDir, catalogFile, limits.json);
  if (!sameJson(active.catalog, JSON.parse(activeBytes))) fail('Active catalog changed before rollback; retry after the update completes.');
  let previous;
  try {
    const receipt = await readJournal(rootDir, 'last-update.json');
    const bytes = await readBounded(rootDir, `${workspaceFolder}/previous-catalog.json`, limits.json);
    if (!receipt || hash(bytes) !== receipt.beforeHash) fail('Previous catalog backup hash mismatch.');
    previous = JSON.parse(bytes);
  }
  catch { fail('No valid previous catalog backup is available.'); }
  // Backup shape is checked by the same trusted schema during candidate validation.
  if (!previous.entries || !previous.currentRevisions || !previous.exploration?.revisions) fail('Previous catalog backup has an invalid shape.');
  const catalog = structuredClone(active.catalog);
  const priorEntries = new Map(previous.entries.map(entry => [`${entry.guideId}/${entry.revision}`, entry]));
  catalog.entries = catalog.entries.map(entry => priorEntries.get(`${entry.guideId}/${entry.revision}`) ?? entry);
  catalog.currentRevisions = { ...catalog.currentRevisions, ...previous.currentRevisions };
  catalog.exploration.currentRevision = previous.exploration.currentRevision;
  catalog.exploration.revisions = { ...catalog.exploration.revisions, ...previous.exploration.revisions };
  const priorIds = new Set(Object.keys(previous.currentRevisions));
  let maxRank = Math.max(0, ...catalog.entries.filter(entry => priorIds.has(entry.guideId) && catalog.currentRevisions[entry.guideId] === entry.revision).map(entry => entry.recommendation.rank));
  for (const entry of catalog.entries) if (!priorIds.has(entry.guideId) && catalog.currentRevisions[entry.guideId] === entry.revision) entry.recommendation.rank = ++maxRank;
  if (!apply) return { applied: false, currentRevisions: catalog.currentRevisions, currentExplorationRevision: catalog.exploration.currentRevision, retainedRevisions: catalog.entries.length };
  const id = await acquire(rootDir);
  try {
    const bytes = encode(catalog);
    const before = await readBounded(rootDir, catalogFile, limits.json);
    if (!before.equals(activeBytes)) fail('Active catalog changed before rollback; publication cancelled.');
    await writeRecord(rootDir, `${workspaceFolder}/previous-catalog.json`, before);
    await writeRecord(rootDir, `${workspaceFolder}/next-catalog.json`, bytes);
    await writeRecord(rootDir, `${workspaceFolder}/transaction.json`, { format: 'paperdesk-content-update', schemaVersion: 1, transactionId: id, beforeHash: hash(before), afterHash: hash(bytes) });
    await switchValidatedCatalog(rootDir, bytes, id);
    await writeRecord(rootDir, `${workspaceFolder}/last-update.json`, await readJournal(rootDir));
    await removeInternalFile(rootDir, `${workspaceFolder}/transaction.json`);
    return { applied: true, currentRevisions: catalog.currentRevisions, currentExplorationRevision: catalog.exploration.currentRevision, retainedRevisions: catalog.entries.length };
  } finally {
    if (!await readJournal(rootDir)) await removeInternalFile(rootDir, `${workspaceFolder}/lock.json`);
  }
}
