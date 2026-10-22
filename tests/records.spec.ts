import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Every record in this suite is synthetic; the isolated test origin never reads normal-preview records.
const noteId = '11111111-1111-4111-8111-111111111111';
const explorationId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-01-01T00:00:00.000Z';
const target = { guideId: 'agent-survey', revision: 1, unitId: 'orientation' };
const backup = {
  format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: timestamp,
  notes: [{ id: noteId, ...target, text: 'SYNTHETIC：需要比较行动条件。', quote: 'SYNTHETIC guide quotation', blockFingerprint: 'synthetic-block', status: 'open', recordRevision: 1, createdAt: timestamp, updatedAt: timestamp }],
  explorations: [{ id: explorationId, title: 'SYNTHETIC research question', question: 'SYNTHETIC：这些条件如何比较？', origin: 'adapted-editorial', seedRef: { revision: 1, lensId: 'applications' }, status: 'exploring', interpretation: 'SYNTHETIC tentative interpretation', unknowns: 'SYNTHETIC unresolved condition', nextAction: { kind: 'read-guide', description: 'SYNTHETIC revisit source conditions', target }, evidence: [
    { id: '33333333-3333-4333-8333-333333333333', provenance: 'guide-excerpt', text: 'SYNTHETIC saved guide excerpt', target, sources: [{ url: 'https://example.org/synthetic-paper#section-2', label: 'SYNTHETIC §2', version: 'v1' }], relatedNoteId: noteId, blockFingerprint: 'synthetic-block', comment: 'SYNTHETIC reader comment' },
    { id: '44444444-4444-4444-8444-444444444444', provenance: 'original-excerpt', text: 'SYNTHETIC independent original excerpt', source: { identity: 'doi:10.0000/synthetic', locator: 'SYNTHETIC page 2', version: null }, comment: 'SYNTHETIC manual attribution' },
    { id: '55555555-5555-4555-8555-555555555555', provenance: 'reader-observation', text: 'SYNTHETIC independent observation' },
  ], recordRevision: 1, createdAt: timestamp, updatedAt: timestamp }],
  resume: [{ ...target, offset: 0.35, blockFingerprint: 'synthetic-block', updatedAt: timestamp }],
  guideStates: [{ guideId: target.guideId, revision: 1, status: 'reading', updatedAt: timestamp }],
  originalStates: [{ sourceId: 'doi:10.0000/synthetic', sourceVersion: null, status: 'unread', updatedAt: timestamp }],
  preferences: { fontSize: 20, theme: 'system' },
};
const dataOnly = (value: any) => { const { exportedAt: _time, ...data } = value; return data; };
async function readBackup(page: Page) {
  return page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
}
async function seed(page: Page) {
  return page.evaluate(async input => { const { personalStore } = await import('/src/records/store.ts'); return personalStore.importBackup(await personalStore.previewImport(input)); }, backup);
}
test.beforeEach(async ({ page }) => { await page.goto('/backup'); await expect(page.getByRole('heading', { name: '备份与本地记录', exact: true })).toBeVisible(); });

test('synthetic full backup survives a fresh-context restore, duplicates and reload without changing provenance', async ({ page, browser }) => {
  await seed(page);
  await page.reload();
  const saved = await readBackup(page);
  expect(dataOnly(saved)).toEqual(dataOnly(backup));
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage(); await fresh.goto('http://127.0.0.1:4174/backup');
    const restored = await fresh.evaluate(async input => {
      const { personalStore } = await import('/src/records/store.ts');
      const empty = await personalStore.exportBackup();
      const preview = await personalStore.previewImport(input);
      const first = await personalStore.importBackup(preview);
      const duplicate = await personalStore.previewImport(input);
      const second = await personalStore.importBackup(duplicate);
      return { empty, first, duplicateCount: duplicate.duplicates, second, saved: await personalStore.exportBackup() };
    }, saved);
    expect(restored.empty.notes).toEqual([]); expect(restored.empty.explorations).toEqual([]);
    expect(restored.first.imported).toBe(5); expect(restored.duplicateCount).toBe(5);
    expect(restored.second.imported).toBe(0); expect(restored.second.skipped).toBe(5);
    expect(dataOnly(restored.saved)).toEqual(dataOnly(saved));
    expect(restored.saved.explorations[0].evidence[1]).not.toHaveProperty('target');
    expect(restored.saved.explorations[0].evidence[2]).not.toHaveProperty('source');
  } finally { await freshContext.close(); }
});

test('resume position never creates guide or original reading marks', async ({ page }) => {
  const result = await page.evaluate(async target => {
    const { personalStore } = await import('/src/records/store.ts');
    await personalStore.setResume({ ...target, offset: 1, updatedAt: new Date().toISOString() });
    const automatic = await personalStore.exportBackup();
    await personalStore.setGuideState({ guideId: target.guideId, revision: target.revision, status: 'read', updatedAt: new Date().toISOString() });
    return { automatic, marked: await personalStore.exportBackup() };
  }, target);
  expect(result.automatic.resume[0].offset).toBe(1);
  expect(result.automatic.guideStates).toEqual([]); expect(result.automatic.originalStates).toEqual([]);
  expect(result.marked.guideStates[0].status).toBe('read'); expect(result.marked.originalStates).toEqual([]);
});

test('two tabs preserve stale note and exploration drafts with optimistic revision conflicts', async ({ page, context }) => {
  await seed(page);
  const other = await context.newPage(); await other.goto('/backup');
  const original = await readBackup(other);
  await page.evaluate(async ids => {
    const { personalStore } = await import('/src/records/store.ts');
    const note = await personalStore.get('notes', ids.noteId); await personalStore.saveNote({ ...note, text: 'SYNTHETIC first tab note' }, note.recordRevision);
    const exploration = await personalStore.get('explorations', ids.explorationId); await personalStore.saveExploration({ ...exploration, interpretation: 'SYNTHETIC first tab interpretation' }, exploration.recordRevision);
  }, { noteId, explorationId });
  const results = await other.evaluate(async input => {
    const { personalStore, ConflictError } = await import('/src/records/store.ts');
    const noteDraft = { ...input.notes[0], text: 'SYNTHETIC second tab unsaved note' };
    const explorationDraft = { ...input.explorations[0], interpretation: 'SYNTHETIC second tab unsaved interpretation' };
    const conflicts = [];
    try { await personalStore.saveNote(noteDraft, 1); } catch (error) { conflicts.push({ valid: error instanceof ConflictError, current: error.current }); }
    try { await personalStore.saveExploration(explorationDraft, 1); } catch (error) { conflicts.push({ valid: error instanceof ConflictError, current: error.current }); }
    const noteCopy = await personalStore.saveNote({ ...noteDraft, id: crypto.randomUUID() }, null);
    const explorationCopy = await personalStore.saveExploration({ ...explorationDraft, id: crypto.randomUUID() }, null);
    return { conflicts, noteDraft, explorationDraft, noteCopy, explorationCopy, saved: await personalStore.exportBackup() };
  }, original);
  expect(results.conflicts).toHaveLength(2); expect(results.conflicts.every(item => item.valid)).toBe(true);
  expect(results.conflicts[0].current.text).toBe('SYNTHETIC first tab note');
  expect(results.conflicts[1].current.interpretation).toBe('SYNTHETIC first tab interpretation');
  expect(results.noteCopy.text).toBe(results.noteDraft.text); expect(results.explorationCopy.interpretation).toBe(results.explorationDraft.interpretation);
  expect(results.saved.notes).toHaveLength(2); expect(results.saved.explorations).toHaveLength(2);
});

test('strict imports reject malformed, unsupported, unsafe and ambiguous records before any write', async ({ page }) => {
  await seed(page); const before = await readBackup(page);
  const result = await page.evaluate(async fixture => {
    const { personalStore } = await import('/src/records/store.ts');
    const variants = [];
    const mutate = (change: (item: any) => void) => { const item = structuredClone(fixture); change(item); variants.push(item); };
    variants.push('{broken-json'); variants.push('x'.repeat(5 * 1024 * 1024 + 1));
    mutate(item => { item.schemaVersion = 2; });
    mutate(item => { item.unsupported = true; });
    variants.push(JSON.parse(JSON.stringify(fixture).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"polluted":true}')));
    mutate(item => { item.notes[0].id = 'not-a-uuid'; });
    mutate(item => { item.notes.push(structuredClone(item.notes[0])); });
    mutate(item => { item.notes[0].createdAt = '2026-02-30T00:00:00.000Z'; });
    mutate(item => { item.notes[0].updatedAt = '2025-01-01T00:00:00.000Z'; });
    mutate(item => { item.notes[0].recordRevision = Number.MAX_SAFE_INTEGER + 1; });
    mutate(item => { delete item.explorations[0].evidence[0].target; });
    mutate(item => { item.explorations[0].evidence[0].sources[0].url = 'javascript:alert(1)'; });
    mutate(item => { item.explorations[0].evidence[0].sources[0].url = 'https://account:secret@example.org/'; });
    mutate(item => { delete item.explorations[0].evidence[1].source.locator; });
    mutate(item => { item.explorations[0].evidence[2].source = { identity: 'fabricated' }; });
    mutate(item => { item.explorations[0].evidence.push(structuredClone(item.explorations[0].evidence[0])); });
    mutate(item => { delete item.explorations[0].seedRef; });
    mutate(item => { delete item.explorations[0].nextAction.target; });
    const errors = [];
    for (const item of variants) { try { await personalStore.previewImport(item); errors.push('accepted'); } catch (error) { errors.push(error.name); } }
    return { errors, after: await personalStore.exportBackup(), prototypeClean: !Object.hasOwn(Object.prototype, 'polluted') };
  }, backup);
  expect(result.errors).toHaveLength(18); expect(result.errors.every(name => name === 'ValidationError')).toBe(true);
  expect(dataOnly(result.after)).toEqual(dataOnly(before)); expect(result.prototypeClean).toBe(true);
});

test('import conflict choices keep both alternatives and remap copied note references; stale previews write nothing', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async fixture => {
    const { personalStore } = await import('/src/records/store.ts');
    const incoming = structuredClone(fixture);
    incoming.notes[0].text = 'SYNTHETIC imported alternative'; incoming.notes[0].recordRevision = 99;
    incoming.explorations[0].interpretation = 'SYNTHETIC imported interpretation';
    const preview = await personalStore.previewImport(incoming);
    const before = await personalStore.exportBackup();
    const imported = await personalStore.importBackup(preview);
    const after = await personalStore.exportBackup();
    const stale = await personalStore.previewImport(incoming);
    await personalStore.savePreferences({ fontSize: 18 });
    const justBeforeStale = await personalStore.exportBackup();
    let staleName = ''; try { await personalStore.importBackup(stale); } catch (error) { staleName = error.name; }
    return { conflicts: preview.conflicts, before, imported, after, staleName, justBeforeStale, afterStale: await personalStore.exportBackup() };
  }, backup);
  expect(result.conflicts).toHaveLength(2); expect(result.imported.copied).toBe(2);
  expect(result.after.notes.find(note => note.id === noteId).text).toBe(backup.notes[0].text);
  const copiedNote = result.after.notes.find(note => note.id !== noteId);
  const copiedExploration = result.after.explorations.find(item => item.id !== explorationId);
  expect(copiedNote.recordRevision).toBe(1); expect(copiedNote.text).toBe('SYNTHETIC imported alternative');
  expect(copiedExploration.evidence[0].relatedNoteId).toBe(copiedNote.id);
  expect(result.staleName).toBe('StaleImportError'); expect(dataOnly(result.afterStale)).toEqual(dataOnly(result.justBeforeStale));
});

test('explicit import replacement is revisioned and local-state choices remain independent', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async fixture => {
    const { personalStore } = await import('/src/records/store.ts');
    const incoming = structuredClone(fixture); incoming.notes[0].text = 'SYNTHETIC explicit replacement'; incoming.notes[0].recordRevision = 7;
    incoming.guideStates[0].status = 'read'; incoming.originalStates[0].status = 'read'; incoming.preferences.fontSize = 22;
    const preview = await personalStore.previewImport(incoming);
    const choices = Object.fromEntries(preview.conflicts.map(item => [item.key, item.store === 'originalStates' ? 'keep-local' : 'use-imported']));
    await personalStore.importBackup(preview, choices); return personalStore.exportBackup();
  }, backup);
  expect(result.notes).toHaveLength(1); expect(result.notes[0].text).toBe('SYNTHETIC explicit replacement'); expect(result.notes[0].recordRevision).toBe(8);
  expect(result.guideStates[0].status).toBe('read'); expect(result.originalStates[0].status).toBe('unread'); expect(result.preferences.fontSize).toBe(22);
});

test('unavailable links preserve snapshots and deleting a note never cascades to exploration evidence', async ({ page }) => {
  const result = await page.evaluate(async fixture => {
    const { personalStore } = await import('/src/records/store.ts');
    const incoming = structuredClone(fixture); incoming.notes[0].revision = 900; incoming.explorations[0].evidence[0].target.revision = 900;
    const preview = await personalStore.previewImport(incoming, () => false);
    await personalStore.importBackup(preview); await personalStore.deleteNote(incoming.notes[0].id, 1);
    const after = await personalStore.exportBackup();
    const orphanPreview = await personalStore.previewImport(after, () => false);
    return { unavailable: preview.unavailable, after, missingNotes: orphanPreview.missingNotes };
  }, backup);
  expect(result.unavailable).toContain('agent-survey/900#orientation'); expect(result.after.notes).toEqual([]);
  expect(result.after.explorations[0].evidence[0].text).toBe(backup.explorations[0].evidence[0].text);
  expect(result.after.explorations[0].evidence[0].sources).toEqual(backup.explorations[0].evidence[0].sources);
  expect(result.missingNotes).toEqual([noteId]);
});

test('simulated quota and mid-import failures preserve durable records and the unsaved draft', async ({ page }) => {
  await seed(page); const before = await readBackup(page);
  const result = await page.evaluate(async fixture => {
    const { personalStore } = await import('/src/records/store.ts');
    const originalPut = IDBObjectStore.prototype.put;
    const noteDraft = { ...fixture.notes[0], text: 'SYNTHETIC recoverable unsaved draft' };
    let quota = '', atomic = '';
    try {
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes') throw new DOMException('SYNTHETIC quota failure', 'QuotaExceededError'); return originalPut.apply(this, args); };
      try { await personalStore.saveNote(noteDraft, 1); } catch (error) { quota = error.message; }
    } finally { IDBObjectStore.prototype.put = originalPut; }
    const afterQuota = await personalStore.exportBackup();
    const incoming = structuredClone(fixture); incoming.notes[0].id = crypto.randomUUID(); incoming.explorations[0].id = crypto.randomUUID();
    incoming.explorations[0].evidence[0].relatedNoteId = incoming.notes[0].id;
    const preview = await personalStore.previewImport(incoming);
    let puts = 0;
    try {
      IDBObjectStore.prototype.put = function (...args) { if (++puts === 2) throw new DOMException('SYNTHETIC transaction failure', 'QuotaExceededError'); return originalPut.apply(this, args); };
      try { await personalStore.importBackup(preview); } catch (error) { atomic = error.message; }
    } finally { IDBObjectStore.prototype.put = originalPut; }
    return { noteDraft, quota, atomic, puts, afterQuota, afterImport: await personalStore.exportBackup() };
  }, backup);
  expect(result.quota).toContain('存储空间不足'); expect(result.atomic).toContain('存储空间不足'); expect(result.puts).toBe(2);
  expect(result.noteDraft.text).toBe('SYNTHETIC recoverable unsaved draft');
  expect(dataOnly(result.afterQuota)).toEqual(dataOnly(before)); expect(dataOnly(result.afterImport)).toEqual(dataOnly(before));
});

test('backup page previews exact data, cancels without changes, exports only deliberately and confirms removal', async ({ page }) => {
  const initial = await readBackup(page);
  const file = { name: 'synthetic-records.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
  await page.getByLabel('选择个人记录备份').setInputFiles(file);
  await expect(page.getByRole('heading', { name: '导入预览', exact: true })).toBeVisible();
  await page.getByText('查看将导入文件的完整内容', { exact: true }).click();
  expect(JSON.parse(await page.getByLabel('导入文件完整内容').inputValue())).toEqual(backup);
  expect(dataOnly(await readBackup(page))).toEqual(dataOnly(initial));
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  expect(dataOnly(await readBackup(page))).toEqual(dataOnly(initial));
  await page.getByLabel('选择个人记录备份').setInputFiles(file);
  await page.getByRole('button', { name: '确认按以上选择导入' }).click();
  await expect(page.getByRole('status')).toContainText('导入并回读确认完成');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
  const download = await downloadPromise;
  const downloadedText = await readFile((await download.path())!, 'utf8');
  expect(downloadedText).toBe(JSON.stringify(JSON.parse(downloadedText)));
  expect(Buffer.byteLength(downloadedText, 'utf8')).toBeLessThanOrEqual(5 * 1024 * 1024);
  const validatedDownload = await page.evaluate(async text => (await import('/src/records/store.ts')).validateBackup(text), downloadedText);
  expect(dataOnly(validatedDownload)).toEqual(dataOnly(backup));
  await page.getByRole('button', { name: '清除前确认' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '先导出完整备份' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认清除全部记录' })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(dataOnly(await readBackup(page))).toEqual(dataOnly(backup));
  await page.getByRole('button', { name: '清除前确认' }).click();
  await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: '确认清除全部记录' }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('status')).toContainText('已清除');
  expect(dataOnly(await readBackup(page))).toEqual(dataOnly(initial));
});

test('individually valid backups that exceed the merged size limit abort without changing existing records', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const empty = await personalStore.exportBackup();
    const createBatch = (label: string) => ({ ...structuredClone(empty), notes: Array.from({ length: 140 }, () => ({
      id: crypto.randomUUID(), guideId: 'agent-survey', revision: 1, unitId: 'u01',
      text: `SYNTHETIC ${label} ` + 'x'.repeat(19950), status: 'open', recordRevision: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })) });
    const local = createBatch('local'), incoming = createBatch('incoming');
    await personalStore.importBackup(await personalStore.previewImport(local));
    const preview = await personalStore.previewImport(incoming);
    const before = await personalStore.exportBackup();
    let error = ''; try { await personalStore.importBackup(preview); } catch (failure) { error = failure.name + ': ' + failure.message; }
    const after = await personalStore.exportBackup();
    const { exportedAt: _beforeTime, ...beforeData } = before, { exportedAt: _afterTime, ...afterData } = after;
    return { localBytes: new TextEncoder().encode(JSON.stringify(local)).length, incomingBytes: new TextEncoder().encode(JSON.stringify(incoming)).length, incomingCount: preview.counts.notes, unchanged: JSON.stringify(beforeData) === JSON.stringify(afterData), afterCount: after.notes.length, error };
  });
  expect(result.localBytes).toBeLessThan(5 * 1024 * 1024); expect(result.incomingBytes).toBeLessThan(5 * 1024 * 1024);
  expect(result.localBytes + result.incomingBytes).toBeGreaterThan(5 * 1024 * 1024); expect(result.incomingCount).toBe(140);
  expect(result.error).toContain('ValidationError'); expect(result.error).toContain('5 MiB');
  expect(result.unchanged).toBe(true); expect(result.afterCount).toBe(140);
});
