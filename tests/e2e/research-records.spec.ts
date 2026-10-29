import { test, expect } from '@playwright/test';

// Synthetic records only, isolated Playwright origin and named databases.
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/ai(?:\/|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"SYNTHETIC isolated test"}' }));
  await page.goto('/backup');
  await expect(page.getByRole('heading', { name: '备份与本地记录', exact: true })).toBeVisible();
});

test('research proposals are atomic, idempotent, source-preserving and conflict checked', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const store = new PersonalRecordStore('synthetic-research-proposals');
    const before = await store.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC topic', question: 'SYNTHETIC question', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null, research: emptyResearchState() }, null);
    const snap = await createResearchSnapshot(before), turnId = crypto.randomUUID();
    const evidence = [{ turnId, citationId: 'L1', source: { id: 'L1', kind: 'guide', title: 'SYNTHETIC source', text: 'SYNTHETIC exact excerpt', guideId: 'synthetic-guide', revision: 1, unitId: 'unit', url: '/read/synthetic-guide/1#unit' } }];
    const proposal = { id: crypto.randomUUID(), explorationId: before.id, baseRecordRevision: 1, baseSnapshotSha256: snap.snapshotSha256, sourceTurnId: turnId, rationale: 'SYNTHETIC rationale', evidenceRefs: evidence, changes: [{ kind: 'set-field', field: 'constraints', value: 'SYNTHETIC bounded scope' }, { kind: 'add-decision', decision: { id: crypto.randomUUID(), kind: 'hypothesis', status: 'adopted', text: 'SYNTHETIC still a hypothesis', rationale: 'SYNTHETIC investigate', sourceTurnId: turnId, evidenceRefs: evidence, createdAt: new Date().toISOString() } }] };
    const adopted = await store.adoptResearchProposal(proposal), stats = await store.getStats();
    const duplicate = await store.adoptResearchProposal(proposal), repeatedStats = await store.getStats();
    const errors: string[] = [];
    try { await store.adoptResearchProposal({ ...proposal, rationale: 'SYNTHETIC altered same ID' }); } catch (error) { errors.push(error.name); }
    try { await store.adoptResearchProposal({ ...proposal, id: crypto.randomUUID() }); } catch (error) { errors.push(error.name); }
    const current = await createResearchSnapshot(adopted);
    try { await store.adoptResearchProposal({ ...proposal, id: crypto.randomUUID(), baseRecordRevision: 2, baseSnapshotSha256: 'f'.repeat(64) }); } catch (error) { errors.push(error.name); }
    const invalid = { ...proposal, id: crypto.randomUUID(), baseRecordRevision: 2, baseSnapshotSha256: current.snapshotSha256, changes: [{ kind: 'set-field', field: 'scope', value: 'SYNTHETIC must roll back' }, proposal.changes[1]] };
    try { await store.adoptResearchProposal(invalid); } catch (error) { errors.push(error.name); }
    const rewritten = structuredClone(adopted); rewritten.research.appliedProposals[0].rationale = 'SYNTHETIC overwritten audit';
    try { await store.saveExploration(rewritten, 2); } catch (error) { errors.push(error.name); }
    return { adopted, duplicate, stats, repeatedStats, errors, live: await store.get('explorations', before.id), proposal };
  });
  expect(result.adopted.recordRevision).toBe(2);
  expect(result.adopted.research.constraints).toBe('SYNTHETIC bounded scope');
  expect(result.adopted.research.decisions[0].kind).toBe('hypothesis');
  expect(result.adopted.research.appliedProposals).toEqual([result.proposal]);
  expect(result.adopted.evidence).toEqual([]);
  expect(result.duplicate).toEqual(result.adopted);
  expect(result.repeatedStats).toEqual(result.stats);
  expect(result.errors).toEqual(['ValidationError', 'ConflictError', 'ValidationError', 'ValidationError', 'ValidationError']);
  expect(result.live).toEqual(result.adopted);
});

test('v3 archive preserves research while legacy v1/v2 remain strict and importable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    const store = new PersonalRecordStore('synthetic-research-archive');
    const before = await store.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC archival topic', question: 'SYNTHETIC question', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null }, null);
    const legacy = await store.exportBackup();
    const enriched = await store.saveExploration({ ...before, research: { ...emptyResearchState(), constraints: 'SYNTHETIC constraint' } }, 1);
    let legacyRejected = false;
    try { await store.exportBackup(); } catch { legacyRejected = true; }
    const archive = await store.exportArchive(), text = await archive.text();
    const target = new PersonalRecordStore('synthetic-research-archive-target');
    const preview = await target.previewArchive(archive); await target.importArchive(preview);
    const restored = await target.get('explorations', before.id);
    const copiedPreview = await store.previewArchive(archive);
    await store.saveExploration({ ...enriched, question: 'SYNTHETIC new current question' }, 2);
    let stale = ''; try { await store.importArchive(copiedPreview); } catch (error) { stale = error.name; }
    const freshPreview = await store.previewArchive(archive); await store.importArchive(freshPreview);
    const copied = (await store.list('explorations')).find(row => row.id !== before.id);
    const oldTarget = new PersonalRecordStore('synthetic-research-legacy-target');
    await oldTarget.importBackup(await oldTarget.previewImport(legacy));
    // A valid v2 fixture is the exact old-record archive protocol with recomputed
    // manifest chain; research properties must still be rejected under v2.
    const digest = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(v => v.toString(16).padStart(2, '0')).join('');
    async function asV2(blob: Blob) {
      const lines = (await blob.text()).trimEnd().split('\n').map(line => JSON.parse(line)); lines[0].schemaVersion = 2;
      let chain = await digest(JSON.stringify(lines[0]));
      for (const block of lines.slice(1, -1)) chain = await digest(chain + block.sha256);
      lines.at(-1).sha256 = chain;
      return new Blob([lines.map(line => JSON.stringify(line)).join('\n') + '\n']);
    }
    const oldV2 = await asV2(await oldTarget.exportArchive());
    const compatible = new PersonalRecordStore('synthetic-v2-compatible'); await compatible.importArchive(await compatible.previewArchive(oldV2));
    let badV2 = ''; try { await compatible.previewArchive(await asV2(archive)); } catch (error) { badV2 = error.name; }
    return { enriched, restored, copied, header: JSON.parse(text.split('\n')[0]), legacyRejected, stale, badV2, legacy, compatible: await compatible.get('explorations', before.id) };
  });
  expect(result.header.schemaVersion).toBe(3);
  expect(result.restored).toEqual(result.enriched);
  expect(result.copied.research).toEqual(result.enriched.research);
  expect(result.copied.id).not.toBe(result.enriched.id);
  expect(result.legacyRejected).toBe(true);
  expect(result.stale).toBe('StaleImportError');
  expect(result.badV2).toBe('ValidationError');
  expect(result.compatible).toEqual(result.legacy.explorations[0]);
});

test('v2 layout upgrades without recreating stores and retains a portable pre-research copy', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore, emptyStats } = await import('/src/records/store.ts');
    const timestamp = '2026-01-01T00:00:00.000Z';
    const record = { id: crypto.randomUUID(), title: 'SYNTHETIC old topic', question: 'SYNTHETIC question', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null, recordRevision: 9, createdAt: timestamp, updatedAt: timestamp };
    const name = 'synthetic-v2-research-migration';
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 2);
      open.onupgradeneeded = () => {
        for (const name of ['notes', 'explorations', 'resume', 'guideStates', 'originalStates', 'preferences']) {
          const store = open.result.createObjectStore(name);
          if (name !== 'preferences') { store.createIndex('updatedAt', ['updatedAt']); store.createIndex('guideRevision', ['guideId', 'revision']); }
        }
        open.result.createObjectStore('_backupStage'); open.result.createObjectStore('_migrationV1');
        const stats = emptyStats(); stats.revision = 17; stats.counts.explorations = 1; stats.bytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
        open.result.createObjectStore('_metadata').put(stats, 'stats'); open.transaction.objectStore('explorations').put(record, record.id);
      };
      open.onerror = () => reject(open.error); open.onsuccess = () => { open.result.close(); resolve(); };
    });
    const migrated = new PersonalRecordStore(name);
    const stats = await migrated.getStats(), saved = await migrated.get('explorations', record.id);
    const recovery = await migrated.exportResearchMigrationArchive();
    const target = new PersonalRecordStore('synthetic-pre-research-restored'); await target.importArchive(await target.previewArchive(recovery));
    const shape = await migrated.transaction(['explorations'], 'readonly', tx => ({ version: tx.db.version, stores: [...tx.db.objectStoreNames] }));
    const oldClient = await new Promise<string>(resolve => { const open = indexedDB.open(name, 2); open.onerror = () => resolve(open.error.name); open.onsuccess = () => { open.result.close(); resolve('unexpected success'); }; });
    return { stats, saved, record, restored: await target.get('explorations', record.id), header: JSON.parse((await recovery.text()).split('\n')[0]), shape, oldClient };
  });
  expect(result.saved).toEqual(result.record); expect(result.restored).toEqual(result.record);
  expect(result.stats.revision).toBe(17); expect(result.stats.researchMigrationBackupAvailable).toBe(true);
  expect(result.shape.version).toBe(3); expect(result.shape.stores).toContain('_migrationV1'); expect(result.shape.stores).toContain('_migrationV2');
  expect(result.header.schemaVersion).toBe(2); expect(result.oldClient).toBe('VersionError');
});

test('a concurrent edit during snapshot hashing wins over an old proposal', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const store = new PersonalRecordStore('synthetic-research-concurrency');
    const before = await store.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC race', question: 'SYNTHETIC question', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null, research: emptyResearchState() }, null);
    const snapshot = await createResearchSnapshot(before);
    const proposal = { id: crypto.randomUUID(), explorationId: before.id, baseRecordRevision: 1, baseSnapshotSha256: snapshot.snapshotSha256, sourceTurnId: crypto.randomUUID(), changes: [{ kind: 'set-field', field: 'constraints', value: 'SYNTHETIC stale value' }], rationale: '', evidenceRefs: [] };
    const digest = crypto.subtle.digest.bind(crypto.subtle); let changed = false, errorName = '';
    try {
      crypto.subtle.digest = async (...args) => {
        if (!changed) { changed = true; await store.saveExploration({ ...before, question: 'SYNTHETIC newer reader edit' }, 1); }
        return digest(...args);
      };
      try { await store.adoptResearchProposal(proposal); } catch (error) { errorName = error.name; }
    } finally { crypto.subtle.digest = digest; }
    return { errorName, record: await store.get('explorations', before.id) };
  });
  expect(result.errorName).toBe('ConflictError');
  expect(result.record.question).toBe('SYNTHETIC newer reader edit');
  expect(result.record.research.appliedProposalIds).toEqual([]);
  expect(result.record.research.constraints).toBe('');
});

test('frozen tasks and receipts survive backups and cannot be rewritten by normal edits', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PersonalRecordStore } = await import('/src/records/store.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const { createResearchArtifact, freezeTaskBrief, receiptTemplate, receiveExecutionReceipt } = await import('/shared/research-artifacts.mjs');
    const store = new PersonalRecordStore('synthetic-frozen-research');
    const before = await store.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC frozen research', question: 'SYNTHETIC question', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', evidence: [], nextAction: null, research: emptyResearchState() }, null);
    const artifact = createResearchArtifact({ title: 'SYNTHETIC task', body: 'SYNTHETIC review existing sources', kind: 'harness-task', recordRevision: 1 });
    const task = await freezeTaskBrief({ artifact, snapshot: await createResearchSnapshot(before), sources: [], tasks: [{ id: crypto.randomUUID(), question: 'SYNTHETIC compare sources', inputs: [], dependsOn: [], deliverables: ['SYNTHETIC report'], acceptanceCriteria: ['SYNTHETIC check sources'], stopConditions: ['SYNTHETIC missing sources'] }], executionLimits: 'SYNTHETIC read only', acceptanceCriteria: ['SYNTHETIC sources checked'], requiredWorkflows: [] });
    artifact.taskVersions.push(task);
    const receipt = receiptTemplate(task); receipt.taskResults[0].summary = 'SYNTHETIC incomplete review';
    const withReceipt = receiveExecutionReceipt(artifact, receipt);
    const saved = await store.saveExploration({ ...before, research: { ...before.research, artifacts: [withReceipt] } }, 1);
    const failures: string[] = [];
    for (const mutate of [(a: any) => { a.taskVersions = []; a.receipts = []; }, (a: any) => { a.taskVersions[0].goal = 'SYNTHETIC rewritten'; }, (a: any) => { a.receipts[0].taskResults[0].summary = 'SYNTHETIC rewritten receipt'; }]) {
      const next = structuredClone(saved); mutate(next.research.artifacts[0]);
      try { await store.saveExploration(next, 2); } catch (error) { failures.push(error.name); }
    }
    const archive = await store.exportArchive(), target = new PersonalRecordStore('synthetic-frozen-restored');
    await target.importArchive(await target.previewArchive(archive));
    return { failures, saved, restored: await target.get('explorations', before.id), live: await store.get('explorations', before.id) };
  });
  expect(result.failures).toEqual(['ValidationError', 'ValidationError', 'ValidationError']);
  expect(result.restored).toEqual(result.saved); expect(result.live).toEqual(result.saved);
});
