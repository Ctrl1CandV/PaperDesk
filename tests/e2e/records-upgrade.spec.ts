import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// All records, databases and downloads below are synthetic and use the isolated test origin.
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/ai(?:\/|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'SYNTHETIC isolated browser test' }) }));
  await page.goto('/backup'); await expect(page.getByRole('heading', { name: '备份与本地记录', exact: true })).toBeVisible();
});

test('v1 layout migrates atomically with original identities, counters, indexes and a recoverable copy', async ({ page }) => {
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const name = 'synthetic-record-migration';
    const timestamp = '2026-01-01T00:00:00.000Z';
    const note = { id: '11111111-1111-4111-8111-111111111111', guideId: 'synthetic-guide', revision: 7, unitId: 'old-unit', text: 'SYNTHETIC immutable old note', status: 'open', recordRevision: 9, createdAt: timestamp, updatedAt: timestamp };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => { for (const store of ['notes', 'explorations', 'resume', 'guideStates', 'originalStates', 'preferences']) open.result.createObjectStore(store); open.transaction.objectStore('notes').put(note, note.id); };
      open.onerror = () => reject(open.error); open.onsuccess = () => { open.result.close(); resolve(); };
    });
    const migrated = new PersonalRecordStore(name);
    const stats = await migrated.getStats(), saved = await migrated.get('notes', note.id);
    const recovery = await migrated.exportMigrationArchive();
    const legacyRecovery = await migrated.exportMigrationBackup();
    const target = new PersonalRecordStore('synthetic-migration-recovery');
    await target.importArchive(await target.previewArchive(recovery));
    const reopened = new PersonalRecordStore(name);
    const shape = await migrated.transaction(['notes'], 'readonly', tx => ({ version: tx.db.version, indexes: [...tx.objectStore('notes').indexNames] }));
    return { note, saved, stats, again: await reopened.getStats(), restored: await target.get('notes', note.id), shape, legacyRecovery };
  });
  expect(result.saved).toEqual(result.note); expect(result.restored).toEqual(result.note);
  expect(result.stats.counts.notes).toBe(1); expect(result.stats.bytes).toBeGreaterThan(0);
  expect(result.stats.migrationBackupAvailable).toBe(true); expect(result.again).toEqual(result.stats);
  expect(result.shape.version).toBe(2); expect(result.shape.indexes).toContain('guideRevision'); expect(result.shape.indexes).toContain('updatedAt');
  expect(result.legacyRecovery.schemaVersion).toBe(1); expect(result.legacyRecovery.notes).toEqual([result.note]); expect(pageErrors).toEqual([]);
});

test('failed migration keeps the old database complete and old clients cannot write the upgraded layout', async ({ page }) => {
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const name = 'synthetic-invalid-migration'; const malformed = { id: 'SYNTHETIC-invalid-id', text: 'SYNTHETIC preserve me' };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => { for (const store of ['notes', 'explorations', 'resume', 'guideStates', 'originalStates', 'preferences']) open.result.createObjectStore(store); open.transaction.objectStore('notes').put(malformed, 'synthetic-invalid'); };
      open.onerror = () => reject(open.error); open.onsuccess = () => { open.result.close(); resolve(); };
    });
    let failure = ''; try { await new PersonalRecordStore(name).getStats(); } catch (error) { failure = error.name; }
    const old = await new Promise<any>((resolve, reject) => {
      const open = indexedDB.open(name, 1); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, tx = db.transaction('notes'), row = tx.objectStore('notes').get('synthetic-invalid'); row.onsuccess = () => resolve({ version: db.version, row: row.result, stores: [...db.objectStoreNames] }); tx.oncomplete = () => db.close(); };
    });
    await new PersonalRecordStore('synthetic-new-layout').getStats();
    const downgrade = await new Promise<string>(resolve => { const open = indexedDB.open('synthetic-new-layout', 1); open.onerror = () => resolve(open.error.name); open.onsuccess = () => { open.result.close(); resolve('unexpected success'); }; });
    return { failure, old, malformed, downgrade };
  });
  expect(result.failure).toBe('StorageError'); expect(result.old.version).toBe(1); expect(result.old.row).toEqual(result.malformed);
  expect(result.old.stores).not.toContain('_metadata'); expect(result.downgrade).toBe('VersionError');
  expect(pageErrors).toEqual([]);
});

test('export is a consistent snapshot while later edits remain in the live store', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const source = new PersonalRecordStore('synthetic-consistent-export');
    const before = await source.saveNote({ id: crypto.randomUUID(), guideId: 'synthetic-guide', revision: 1, unitId: 'unit', text: 'SYNTHETIC before snapshot', status: 'open' }, null);
    const digest = crypto.subtle.digest.bind(crypto.subtle); let changed = false;
    let archive: Blob;
    try {
      crypto.subtle.digest = async (...args) => { if (!changed) { changed = true; await source.saveNote({ ...before, text: 'SYNTHETIC edit during export' }, 1); } return digest(...args); };
      archive = await source.exportArchive();
    } finally { crypto.subtle.digest = digest; }
    const restored = new PersonalRecordStore('synthetic-consistent-restored'); await restored.importArchive(await restored.previewArchive(archive));
    return { before, restored: await restored.get('notes', before.id), live: await source.get('notes', before.id) };
  });
  expect(result.restored).toEqual(result.before); expect(result.live.text).toBe('SYNTHETIC edit during export'); expect(result.live.recordRevision).toBe(2);
});

test('over 5 MiB remains writable without full scans; paged reads and complete v2 restore preserve exact records', async ({ page }) => {
  test.setTimeout(90_000);
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const store = new PersonalRecordStore('synthetic-large-personal');
    const timestamp = '2026-01-01T00:00:00.000Z';
    const records = Array.from({ length: 320 }, (_, index) => ({ id: crypto.randomUUID(), guideId: index % 2 ? 'synthetic-one' : 'synthetic-two', revision: 1, unitId: 'unit', text: `SYNTHETIC ${index} ` + 'x'.repeat(19900), status: 'open' as const, recordRevision: 1, createdAt: timestamp, updatedAt: timestamp }));
    const base = { format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: timestamp, notes: [], explorations: [], resume: [], guideStates: [], originalStates: [], preferences: {} };
    for (let start = 0; start < records.length; start += 100) await store.importBackup(await store.previewImport({ ...base, notes: records.slice(start, start + 100) }));
    const before = await store.getStats();
    const getAll = IDBObjectStore.prototype.getAll, cursor = IDBObjectStore.prototype.openCursor; let scans = 0;
    const block = () => { scans++; throw new Error('SYNTHETIC unexpected full scan'); };
    let conflict = '';
    try {
      IDBObjectStore.prototype.getAll = block; IDBObjectStore.prototype.openCursor = block;
      await store.setResume({ guideId: 'synthetic-one', revision: 1, unitId: 'unit', offset: 0.5, updatedAt: timestamp });
      await store.saveNote({ ...records[0], text: 'SYNTHETIC updated large-library note' }, 1);
      try { await store.saveNote({ ...records[0], text: 'SYNTHETIC stale draft' }, 1); } catch (error) { conflict = error.name; }
      await store.savePreferences({ fontSize: 20 });
    } finally { IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.openCursor = cursor; }
    const ids: string[] = []; let nextCursor: string | undefined;
    do { const part = await store.listPage('notes', { limit: 37, cursor: nextCursor }); ids.push(...part.records.map(row => row.id)); nextCursor = part.nextCursor; } while (nextCursor);
    const filtered = await store.listPage('notes', { guideId: 'synthetic-one', revision: 1, limit: 500 });
    const archive = await store.exportArchive();
    const restored = new PersonalRecordStore('synthetic-large-restored');
    const parse = JSON.parse; let largestParse = 0;
    try {
      JSON.parse = function (text, ...args) { largestParse = Math.max(largestParse, text.length); if (text.length > 1024 * 1024) throw new Error('SYNTHETIC unbounded parse'); return parse.call(JSON, text, ...args); };
      await restored.importArchive(await restored.previewArchive(archive));
    } finally { JSON.parse = parse; }
    let identityMatch = true;
    for (const row of records) if (row.id !== records[0].id && JSON.stringify(await restored.get('notes', row.id)) !== JSON.stringify(row)) identityMatch = false;
    const after = await store.getStats(), restoredStats = await restored.getStats();
    return { before, after, restoredStats, bytes: archive.size, scans, conflict, count: ids.length, unique: new Set(ids).size, filtered: filtered.records.length, filteredCorrect: filtered.records.every(row => row.guideId === 'synthetic-one'), largestParse, identityMatch, changed: await restored.get('notes', records[0].id), resume: await restored.get('resume', 'synthetic-one/1') };
  });
  expect(result.before.bytes).toBeGreaterThan(5 * 1024 * 1024); expect(result.bytes).toBeGreaterThan(5 * 1024 * 1024);
  expect(result.scans).toBe(0); expect(result.conflict).toBe('ConflictError');
  expect(result.count).toBe(320); expect(result.unique).toBe(320); expect(result.filtered).toBe(160); expect(result.filteredCorrect).toBe(true);
  expect(result.largestParse).toBeLessThan(1024 * 1024); expect(result.identityMatch).toBe(true);
  expect(result.changed.text).toBe('SYNTHETIC updated large-library note'); expect(result.changed.recordRevision).toBe(2); expect(result.resume.offset).toBe(0.5);
  expect(result.restoredStats.counts).toEqual(result.after.counts); expect(result.restoredStats.bytes).toEqual(result.after.bytes);
});

test('v2 corruption, missing blocks, cancellation and a mid-restore quota failure expose no partial records', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const source = new PersonalRecordStore('synthetic-archive-failures-source');
    for (let i = 0; i < 8; i++) await source.saveNote({ id: crypto.randomUUID(), guideId: 'synthetic-guide', revision: 1, unitId: 'unit', text: `SYNTHETIC ${i} ` + 'x'.repeat(19000), status: 'open' }, null);
    const archive = await source.exportArchive(), lines = (await archive.text()).trimEnd().split('\n');
    const target = new PersonalRecordStore('synthetic-archive-failures-target');
    const errors: string[] = [];
    const corrupt = [...lines], block = JSON.parse(corrupt[1]); block.records[0].value.text = 'SYNTHETIC tampered'; corrupt[1] = JSON.stringify(block);
    const variants = [corrupt.join('\n') + '\n', [...lines.slice(0, -2), lines.at(-1)].join('\n') + '\n', [lines[0], lines[1], lines[1], ...lines.slice(2)].join('\n') + '\n', lines.slice(0, -1).join('\n') + '\n'];
    for (const text of variants) { try { await target.previewArchive(new Blob([text])); errors.push('accepted'); } catch (error) { errors.push(error.name); } }
    const cancelled = new AbortController(); cancelled.abort();
    try { await target.previewArchive(archive, undefined, cancelled.signal); } catch (error) { errors.push(error.name); }
    const preview = await target.previewArchive(archive), before = await target.getStats();
    const put = IDBObjectStore.prototype.put; let writes = 0, failure = '';
    try {
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes' && ++writes === 2) throw new DOMException('SYNTHETIC quota failure', 'QuotaExceededError'); return put.apply(this, args); };
      try { await target.importArchive(preview); } catch (error) { failure = error.message; }
    } finally { IDBObjectStore.prototype.put = put; }
    const afterFailure = await target.getStats();
    const controller = new AbortController(); writes = 0; let cancelFailure = '';
    try {
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes' && ++writes === 2) controller.abort(); return put.apply(this, args); };
      try { await target.importArchive(preview, {}, controller.signal); } catch (error) { cancelFailure = error.message; }
    } finally { IDBObjectStore.prototype.put = put; }
    const afterCancel = await target.getStats();
    await target.importArchive(preview);
    return { errors, failure, cancelFailure, before, afterFailure, afterCancel, restored: await target.getStats() };
  });
  expect(result.errors).toEqual(Array(5).fill('ValidationError')); expect(result.failure).toContain('存储空间不足'); expect(result.cancelFailure).toContain('已取消');
  expect(result.afterFailure).toEqual(result.before); expect(result.afterCancel).toEqual(result.before); expect(result.restored.counts.notes).toBe(8);
});

test('v2 keeps both conflicting notes, remaps exploration evidence, and rejects stale previews', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const source = new PersonalRecordStore('synthetic-conflict-source'), target = new PersonalRecordStore('synthetic-conflict-target');
    const note = await source.saveNote({ id: crypto.randomUUID(), guideId: 'synthetic-guide', revision: 1, unitId: 'old-unit', text: 'SYNTHETIC source note', status: 'open' }, null);
    const exploration = await source.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC question', question: 'SYNTHETIC unknown', origin: 'reader', status: 'inbox', interpretation: '', unknowns: '', nextAction: null, evidence: [{ id: crypto.randomUUID(), provenance: 'reader-observation', text: 'SYNTHETIC retained evidence', relatedNoteId: note.id }] }, null);
    await target.importArchive(await target.previewArchive(await source.exportArchive()));
    await target.saveNote({ ...note, text: 'SYNTHETIC local alternative' }, 1);
    await target.saveExploration({ ...exploration, interpretation: 'SYNTHETIC local interpretation' }, 1);
    const input = await source.exportArchive(), preview = await target.previewArchive(input, () => false);
    const result = await target.importArchive(preview);
    const notes = await target.list('notes'), explorations = await target.list('explorations');
    const stale = await target.previewArchive(input); await target.savePreferences({ fontSize: 22 }); const before = await target.getStats();
    let error = ''; try { await target.importArchive(stale); } catch (failure) { error = failure.name; }
    return { result, notes, explorations, noteId: note.id, explorationId: exploration.id, conflicts: preview.conflictCount, unavailable: preview.unavailableCount, error, before, after: await target.getStats() };
  });
  expect(result.conflicts).toBe(2); expect(result.result.copied).toBe(2); expect(result.unavailable).toBe(1);
  expect(result.notes.find(row => row.id === result.noteId).text).toBe('SYNTHETIC local alternative');
  expect(result.explorations.find(row => row.id !== result.explorationId).evidence[0].relatedNoteId).toBe(result.notes.find(row => row.id !== result.noteId).id);
  expect(result.error).toBe('StaleImportError'); expect(result.after).toEqual(result.before);
});

test('large-library backup UI uses counts and downloads a v2 file that can be previewed and cancelled', async ({ page }) => {
  test.setTimeout(90_000);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const base = await personalStore.exportBackup(), timestamp = base.exportedAt;
    for (let batch = 0; batch < 3; batch++) await personalStore.importBackup(await personalStore.previewImport({ ...base, notes: Array.from({ length: 100 }, (_, index) => ({ id: crypto.randomUUID(), guideId: 'synthetic-ui', revision: 1, unitId: 'unit', text: `SYNTHETIC ${batch}-${index} ` + 'x'.repeat(19500), status: 'open', recordRevision: 1, createdAt: timestamp, updatedAt: timestamp })) }));
  });
  await expect(page.getByText('已用 ', { exact: false })).toContainText('512 MiB');
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出完整备份', exact: true }).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.jsonl$/);
  const bytes = await readFile((await download.path())!); expect(bytes.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.getByLabel('选择个人记录备份').setInputFiles({ name: 'synthetic-large.jsonl', mimeType: 'application/x-ndjson', buffer: bytes });
  await expect(page.getByRole('heading', { name: '导入预览', exact: true })).toBeVisible();
  await expect(page.getByText('已逐块核对清单', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已取消');
  const stats = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.getStats()); expect(stats.counts.notes).toBe(300);
});

test('paged note UI deduplicates overlaps and ignores a late refresh while retaining opened pages', async ({ page }) => {
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const timestamp = '2026-01-01T00:00:00.000Z';
    const notes = Array.from({ length: 205 }, (_, index) => ({ id: crypto.randomUUID(), guideId: 'synthetic-paged-ui', revision: 1, unitId: 'unit', text: `SYNTHETIC page row ${index}`, status: 'open', recordRevision: 1, createdAt: timestamp, updatedAt: new Date(Date.parse(timestamp) + index * 1000).toISOString() }));
    await personalStore.importBackup(await personalStore.previewImport({ format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: timestamp, notes, explorations: [], resume: [], guideStates: [], originalStates: [], preferences: {} }));
  });
  await page.goto('/notes');
  await expect(page.locator('.note-entry')).toHaveCount(100);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const original = personalStore.listPage.bind(personalStore);
    const first = (await original('notes', { limit: 1 })).records[0];
    const controls = { holdNext: false, held: false, release: undefined as undefined | (() => void) };
    (window as any).syntheticPagedReads = controls;
    personalStore.listPage = async (name, options = {}) => {
      const result = await original(name, options);
      if (name === 'notes' && !options.cursor && controls.holdNext) {
        controls.holdNext = false; controls.held = true;
        await new Promise<void>(resolve => { controls.release = resolve; });
      }
      // Simulate an overlap caused by a concurrent edit across cursor pages.
      return name === 'notes' && options.cursor ? { ...result, records: [first, ...result.records] } : result;
    };
  });
  await page.getByRole('button', { name: '载入更多笔记', exact: true }).click();
  await expect(page.locator('.note-entry')).toHaveCount(200);
  await page.evaluate(async () => {
    (window as any).syntheticPagedReads.holdNext = true;
    (await import('/src/records/store.ts')).personalStore.notifyChange('notes');
  });
  await expect.poll(() => page.evaluate(() => (window as any).syntheticPagedReads.held)).toBe(true);
  await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const first = (await personalStore.listPage('notes', { limit: 1 })).records[0];
    await personalStore.saveNote({ ...first, text: 'SYNTHETIC latest refresh must survive' }, first.recordRevision);
  });
  await expect(page.getByText('SYNTHETIC latest refresh must survive', { exact: true })).toBeVisible();
  await expect(page.locator('.note-entry')).toHaveCount(200);
  await page.evaluate(() => (window as any).syntheticPagedReads.release());
  await expect(page.getByRole('button', { name: '载入更多笔记', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '载入更多笔记', exact: true }).click();
  await expect(page.locator('.note-entry')).toHaveCount(205);
  await expect(page.getByText('SYNTHETIC latest refresh must survive', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('a late single-exploration read cannot replace a newer saved revision', async ({ page }) => {
  const id = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const record = await personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC original exploration', question: 'SYNTHETIC original question', origin: 'reader', status: 'inbox', interpretation: '', unknowns: '', nextAction: null, evidence: [] }, null);
    return record.id;
  });
  await page.goto(`/explore/questions/${id}`);
  await expect(page.getByRole('heading', { name: 'SYNTHETIC original exploration', exact: true })).toBeVisible();
  await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const original = personalStore.get.bind(personalStore);
    let holdNext = true;
    personalStore.get = async (name, key) => {
      const value = await original(name, key);
      if (name === 'explorations' && key === id && holdNext) {
        holdNext = false;
        await new Promise<void>(resolve => { (window as any).syntheticReleaseExploration = resolve; });
      }
      return value;
    };
    personalStore.notifyChange('explorations');
  }, id);
  await expect.poll(() => page.evaluate(() => typeof (window as any).syntheticReleaseExploration)).toBe('function');
  await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const record = await personalStore.get('explorations', id);
    await personalStore.saveExploration({ ...record, title: 'SYNTHETIC latest exploration' }, record.recordRevision);
  }, id);
  await expect(page.getByRole('heading', { name: 'SYNTHETIC latest exploration', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    (window as any).syntheticReleaseExploration();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.getByRole('heading', { name: 'SYNTHETIC latest exploration', exact: true })).toBeVisible();
});
