import type { ArchivePreview, Exploration, ExplorationDraft, GuideState, GuideTarget, ImportChoice, ImportConflict, ImportPreview, Note, NoteDraft, OriginalState, PersonalBackup, Preferences, RecordMap, RecordPage, RecordPageOptions, RecordStats, ResumeRecord, StoreName } from './types';
import { byteLength, canonical, guideKey, MAX_BACKUP_BYTES, MAX_PERSONAL_BYTES, MAX_PERSONAL_RECORDS, originalKey, recordKey, validateBackup, validateRecord, verifyResearchRecord, ValidationError } from './validation';
import { exportPersonalArchive, previewPersonalArchive, applyPersonalArchive, discardPersonalArchive, archiveConflicts } from './archive';
import { createResearchSnapshot, emptyResearchState, validateResearchProposal, type ResearchProposal, type ResearchStage } from '../../shared/research-contract.mjs';

export { guideKey, originalKey, validateBackup, ValidationError };
export const DATABASE_NAME = 'paperdesk-personal-v1';
const storeNames: StoreName[] = ['notes', 'explorations', 'resume', 'guideStates', 'originalStates'];
const allStores = [...storeNames, 'preferences'];
const metaStore = '_metadata', stageStore = '_backupStage', migrationStore = '_migrationV1', researchMigrationStore = '_migrationV2';
type ChangeStore = StoreName | 'preferences';
export const emptyStats = (): RecordStats => ({ bytes: 0, counts: { notes: 0, explorations: 0, resume: 0, guideStates: 0, originalStates: 0 }, revision: 0, limitBytes: MAX_PERSONAL_BYTES, migrationBackupAvailable: false });
export class ConflictError extends Error {
  constructor(public current: Note | Exploration | null) { super('记录已在另一处修改或删除。当前草稿仍保留，请比较后选择保存副本或重新载入。'); this.name = 'ConflictError'; }
}
export class StorageError extends Error {
  constructor(message: string) { super(message); this.name = 'StorageError'; }
}
export class StaleImportError extends Error {
  constructor() { super('本地记录在预览后发生变化。尚未导入，请重新预览后再选择。'); this.name = 'StaleImportError'; }
}
function storageError(error: unknown): Error {
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof StaleImportError || error instanceof StorageError) return error;
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') return new StorageError('浏览器存储空间不足，未保存。请保留草稿并复制或导出，清理空间后重试。');
  return new StorageError('本地存储暂时不可用，未确认保存。阅读仍可继续；请保留草稿并复制或导出后重试。');
}
const request = <T>(operation: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result); operation.onerror = () => reject(operation.error);
});
function completion(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

export class PersonalRecordStore {
  private opening: Promise<IDBDatabase> | undefined;
  private listeners = new Set<(store?: ChangeStore) => void>();
  private channel: BroadcastChannel | undefined;
  constructor(private name = DATABASE_NAME) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`${name}-changes`);
      this.channel.onmessage = event => this.listeners.forEach(listener => listener(typeof event.data === 'string' && allStores.includes(event.data) ? event.data as ChangeStore : undefined));
    }
  }
  subscribe = (listener: (store?: ChangeStore) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  notifyChange(store?: ChangeStore) { this.listeners.forEach(listener => listener(store)); this.channel?.postMessage(store ?? 'changed'); }
  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new StorageError('浏览器没有提供本地记录存储。可以继续阅读，并将草稿另存。')); return; }
      let operation: IDBOpenDBRequest;
      try { operation = indexedDB.open(this.name, 3); } catch (error) { reject(storageError(error)); return; }
      operation.onupgradeneeded = event => {
        const database = operation.result, transaction = operation.transaction!;
        for (const name of allStores) if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
        if (event.oldVersion < 2) {
          database.createObjectStore(metaStore);
          database.createObjectStore(stageStore);
          database.createObjectStore(migrationStore);
        }
        if (event.oldVersion < 3) database.createObjectStore(researchMigrationStore);
        const metadata = transaction.objectStore(metaStore);
        const recovery = transaction.objectStore(migrationStore);
        const researchRecovery = transaction.objectStore(researchMigrationStore);
        const stats = emptyStats(); stats.migrationBackupAvailable = event.oldVersion === 1;
        stats.researchMigrationBackupAvailable = event.oldVersion > 0;
        // Preserve v2 counters/revision and the original v1 recovery flag. Cursor
        // validation below recounts live bytes rather than trusting old counters.
        const priorStats = event.oldVersion >= 2 ? metadata.get('stats') : null;
        if (priorStats) priorStats.onsuccess = () => {
          if (!priorStats.result || !Number.isSafeInteger(priorStats.result.revision)) { transaction.abort(); return; }
          stats.revision = priorStats.result.revision;
          stats.migrationBackupAvailable = priorStats.result.migrationBackupAvailable === true;
        };
        let remaining = allStores.length;
        for (const name of allStores) {
          const store = transaction.objectStore(name);
          if (name !== 'preferences' && event.oldVersion < 2) {
            if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', ['updatedAt']);
            if (!store.indexNames.contains('guideRevision')) store.createIndex('guideRevision', ['guideId', 'revision']);
          }
          // Versionchange is atomic: an invalid row or quota failure aborts the upgrade,
          // retaining the complete v1 database. A successful migration also retains raw v1 rows.
          const cursor = store.openCursor();
          cursor.onerror = () => { try { transaction.abort(); } catch { /* A preceding cursor already aborted this versionchange. */ } };
          cursor.onsuccess = () => {
            const row = cursor.result;
            try {
              if (row) {
                validateRecord(name as ChangeStore, row.value, false);
                if (row.primaryKey !== (name === 'preferences' ? 'preferences' : recordKey(name as StoreName, row.value))) throw new ValidationError('旧记录标识不一致，迁移未提交。');
                stats.bytes += byteLength(row.value);
                if (name !== 'preferences') stats.counts[name as StoreName]++;
                if (event.oldVersion === 1) recovery.put(row.value, [name, row.primaryKey]);
                if (event.oldVersion > 0) researchRecovery.put(row.value, [name, row.primaryKey]);
                row.continue();
              } else if (--remaining === 0) {
                if (stats.bytes > MAX_PERSONAL_BYTES || Object.values(stats.counts).some(count => count > MAX_PERSONAL_RECORDS)) throw new ValidationError('旧记录超过运行容量，迁移未提交。');
                metadata.put(stats, 'stats');
              }
            } catch { try { transaction.abort(); } catch { /* The complete old layout remains on an aborted upgrade. */ } }
          };
        }
      };
      operation.onblocked = () => reject(new StorageError('其他页面阻止本地存储升级，请关闭旧页面后重试。'));
      operation.onerror = () => reject(storageError(operation.error));
      operation.onsuccess = () => {
        const database = operation.result;
        database.onversionchange = () => { database.close(); this.opening = undefined; };
        resolve(database);
      };
    }).catch(error => { this.opening = undefined; throw storageError(error); });
    return this.opening;
  }
  async transaction<T>(names: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => Promise<T> | T): Promise<T> {
    const database = await this.open();
    let transaction: IDBTransaction;
    try { transaction = database.transaction(names, mode); } catch (error) { throw storageError(error); }
    const finished = completion(transaction);
    // Register a rejection handler immediately; custom validation can abort before awaiting completion.
    void finished.catch(() => {});
    try {
      const result = await work(transaction);
      await finished;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* Already complete/aborted. */ }
      await finished.catch(() => {});
      throw storageError(error);
    }
  }
  private run = <T>(names: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => Promise<T> | T) => this.transaction(names, mode, work);
  async getStats(): Promise<RecordStats> {
    return this.run([metaStore], 'readonly', transaction => request(transaction.objectStore(metaStore).get('stats')));
  }
  async listPage<K extends StoreName>(name: K, options: RecordPageOptions = {}): Promise<RecordPage<RecordMap[K]>> {
    const limit = Math.max(1, Math.min(500, options.limit ?? 100));
    let after: { updatedAt: string; key: string } | undefined;
    if (options.cursor) {
      try { after = JSON.parse(options.cursor); if (!after || typeof after.updatedAt !== 'string' || typeof after.key !== 'string') throw new Error(); }
      catch { throw new ValidationError('列表游标无效，请重新读取。'); }
    }
    return this.run([name], 'readonly', transaction => new Promise((resolve, reject) => {
      const store = transaction.objectStore(name);
      const rows: { value: RecordMap[K]; key: string }[] = [];
      const operation = options.guideId && options.revision
        ? store.index('guideRevision').openCursor(IDBKeyRange.only([options.guideId, options.revision]))
        : store.index('updatedAt').openCursor(after ? IDBKeyRange.upperBound([after.updatedAt]) : undefined, 'prev');
      operation.onerror = () => reject(operation.error);
      operation.onsuccess = () => {
        const row = operation.result;
        if (!row) { resolve({ records: rows.map(item => item.value) }); return; }
        const value = row.value as RecordMap[K], key = String(row.primaryKey);
        if (options.guideId && options.revision) {
          // Guide-filtered cursors use stable primary-key order within the compound index.
          if (after && key <= after.key) { row.continue(); return; }
        } else if (after && (value.updatedAt > after.updatedAt || value.updatedAt === after.updatedAt && key >= after.key)) { row.continue(); return; }
        if (rows.length === limit) {
          const last = rows[rows.length - 1];
          resolve({ records: rows.map(item => item.value), nextCursor: JSON.stringify({ updatedAt: last.value.updatedAt, key: last.key }) }); return;
        }
        rows.push({ value, key }); row.continue();
      };
    }));
  }
  async list<K extends StoreName>(name: K): Promise<RecordMap[K][]> {
    return this.run([name], 'readonly', transaction => request(transaction.objectStore(name).getAll()));
  }
  async hasResearchRecords(): Promise<boolean> {
    return this.run(['explorations'], 'readonly', transaction => new Promise((resolve, reject) => {
      const cursor = transaction.objectStore('explorations').openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) resolve(false);
        else if (row.value.research !== undefined) resolve(true);
        else row.continue();
      };
    }));
  }
  async get<K extends StoreName>(name: K, key: string): Promise<RecordMap[K] | undefined> {
    return this.run([name], 'readonly', transaction => request(transaction.objectStore(name).get(key)));
  }
  private async saveVersioned<T extends Note | Exploration>(name: 'notes' | 'explorations', draft: NoteDraft | ExplorationDraft, expectedRevision: number | null): Promise<T> {
    draft = structuredClone(draft);
    if (name === 'explorations') {
      const research = (draft as ExplorationDraft).research;
      if (research) {
        // Validate before hashing, and complete all WebCrypto work before IDB opens.
        validateRecord('explorations', { ...draft, recordRevision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await verifyResearchRecord(draft as Exploration);
      }
    }
    const saved = await this.run([name, metaStore], 'readwrite', async transaction => {
      const objectStore = transaction.objectStore(name);
      const current = await request<Note | Exploration | undefined>(objectStore.get(draft.id));
      if (expectedRevision === null ? current !== undefined : current?.recordRevision !== expectedRevision) throw new ConflictError(current ?? null);
      if (name === 'explorations' && current) {
        const previousResearch = (current as Exploration).research;
        const nextResearch = (draft as ExplorationDraft).research;
        // Decisions are revised by appending a replacement, and adoption audit
        // records remain the exact proposal that was accepted.
        for (const field of ['decisions', 'appliedProposalIds', 'appliedProposals'] as const) {
          const prior = previousResearch?.[field] ?? [], next = nextResearch?.[field] ?? [];
          if (canonical(next.slice(0, prior.length)) !== canonical(prior)) throw new ValidationError('决定与采纳记录不可覆盖或删除；请保留旧记录并追加变化。');
        }
        const nextArtifacts = nextResearch?.artifacts ?? [];
        for (const previous of previousResearch?.artifacts ?? []) {
          if (!previous.taskVersions.length && !previous.receipts.length) continue;
          const next = nextArtifacts.find(item => item.id === previous.id);
          if (!next || canonical(next.taskVersions.slice(0, previous.taskVersions.length)) !== canonical(previous.taskVersions)
            || canonical(next.receipts.slice(0, previous.receipts.length)) !== canonical(previous.receipts)) throw new ValidationError('已交付任务版本和执行回执不可覆盖或删除；请追加新版本。');
        }
      }
      const timestamp = new Date().toISOString();
      const value = { ...draft, recordRevision: (current?.recordRevision ?? 0) + 1, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp } as T;
      validateRecord(name, value);
      await this.accountChange(transaction, name, current, value);
      await request(objectStore.put(value, value.id));
      return value;
    });
    const readBack = await this.get(name, saved.id);
    if (!readBack || canonical(readBack) !== canonical(saved)) throw new StorageError('保存后记录已发生变化，请保留草稿并重新载入核对。');
    this.notifyChange(name); return saved;
  }
  saveNote(draft: NoteDraft, expectedRevision: number | null) { return this.saveVersioned<Note>('notes', draft, expectedRevision); }
  saveExploration(draft: ExplorationDraft, expectedRevision: number | null) { return this.saveVersioned<Exploration>('explorations', draft, expectedRevision); }
  async adoptResearchProposal(input: ResearchProposal): Promise<Exploration> {
    const proposal = structuredClone(input);
    try { validateResearchProposal(proposal); } catch (error) { throw new ValidationError(error instanceof Error ? error.message : '研究提案无效。'); }
    const baseline = await this.get('explorations', proposal.explorationId);
    if (!baseline) throw new ConflictError(null);
    const alreadyApplied = (record: Exploration) => {
      if (!record.research?.appliedProposalIds.includes(proposal.id)) return false;
      const previous = record.research.appliedProposals?.find(item => item.id === proposal.id);
      if (!previous || canonical(previous) !== canonical(proposal)) throw new ValidationError('同一提案标识对应不同内容，未重复采纳。');
      return true;
    };
    if (alreadyApplied(baseline)) return baseline;
    if (baseline.recordRevision !== proposal.baseRecordRevision) throw new ConflictError(baseline);
    // WebCrypto runs before opening the write transaction, which must not idle
    // across non-IDB asynchronous work. Recheck the record inside the transaction.
    const snapshot = await createResearchSnapshot(baseline);
    if (snapshot.snapshotSha256 !== proposal.baseSnapshotSha256) throw new ValidationError('研究提案与当前探索快照不一致，未保存。');
    const saved = await this.run(['explorations', metaStore], 'readwrite', async transaction => {
      const target = transaction.objectStore('explorations');
      const current = await request<Exploration | undefined>(target.get(proposal.explorationId));
      if (!current) throw new ConflictError(null);
      if (alreadyApplied(current)) return current;
      if (current.recordRevision !== baseline.recordRevision || canonical(current) !== canonical(baseline)) throw new ConflictError(current);
      const next = structuredClone(current);
      next.research ??= emptyResearchState();
      for (const change of proposal.changes) {
        if (change.kind === 'set-field') {
          if (change.field === 'title' || change.field === 'question' || change.field === 'interpretation' || change.field === 'unknowns') next[change.field] = change.value;
          else if (change.field === 'stage') next.research.stage = change.value as ResearchStage;
          else next.research[change.field] = change.value;
        } else if (change.kind === 'set-next-action') {
          next.nextAction = change.action ? structuredClone(change.action) : null;
        } else {
          if (next.research.decisions.some(item => item.id === change.decision.id)) throw new ValidationError('提案包含重复决定标识，未保存。');
          if (change.decision.supersedes && !next.research.decisions.some(item => item.id === change.decision.supersedes)) throw new ValidationError('提案要替代的决定不存在，未保存。');
          next.research.decisions.push(change.decision);
        }
      }
      next.research.appliedProposalIds.push(proposal.id);
      (next.research.appliedProposals ??= []).push(proposal);
      next.recordRevision++; next.updatedAt = new Date().toISOString();
      validateRecord('explorations', next);
      await this.accountChange(transaction, 'explorations', current, next);
      await request(target.put(next, next.id));
      return next;
    });
    this.notifyChange('explorations');
    return saved;
  }
  private async deleteVersioned(name: 'notes' | 'explorations', id: string, expectedRevision: number) {
    await this.run([name, metaStore], 'readwrite', async transaction => {
      const objectStore = transaction.objectStore(name);
      const current = await request<Note | Exploration | undefined>(objectStore.get(id));
      if (current?.recordRevision !== expectedRevision) throw new ConflictError(current ?? null);
      await this.accountChange(transaction, name, current, undefined);
      await request(objectStore.delete(id));
    });
    this.notifyChange(name);
  }
  deleteNote(id: string, expectedRevision: number) { return this.deleteVersioned('notes', id, expectedRevision); }
  deleteExploration(id: string, expectedRevision: number) { return this.deleteVersioned('explorations', id, expectedRevision); }
  private async set<K extends 'resume' | 'guideStates' | 'originalStates'>(name: K, value: RecordMap[K]) {
    validateRecord(name, value);
    const key = recordKey(name, value);
    await this.run([name, metaStore], 'readwrite', async transaction => {
      const current = await request(transaction.objectStore(name).get(key));
      await this.accountChange(transaction, name, current, value);
      await request(transaction.objectStore(name).put(value, key));
    });
    const readBack = await this.get(name, key);
    if (!readBack || canonical(value) !== canonical(readBack)) throw new StorageError('写入后位置或状态发生变化，请重试。');
    this.notifyChange(name); return readBack;
  }
  setResume(value: ResumeRecord) { return this.set('resume', value); }
  setGuideState(value: GuideState) { return this.set('guideStates', value); }
  setOriginalState(value: OriginalState) { return this.set('originalStates', value); }
  async getPreferences(): Promise<Preferences> {
    return (await this.run(['preferences'], 'readonly', transaction => request(transaction.objectStore('preferences').get('preferences')))) ?? {};
  }
  async savePreferences(value: Preferences) {
    validateRecord('preferences', value);
    const saved = await this.run(['preferences', metaStore], 'readwrite', async transaction => {
      const objectStore = transaction.objectStore('preferences');
      const current = await request<Preferences | undefined>(objectStore.get('preferences'));
      const merged = { ...current, ...value };
      validateRecord('preferences', merged);
      await this.accountChange(transaction, 'preferences', current, merged);
      await request(objectStore.put(merged, 'preferences')); return merged;
    });
    if (canonical(await this.getPreferences()) !== canonical(saved)) throw new StorageError('字号设置写入后发生变化，请重试。');
    this.notifyChange('preferences'); return saved;
  }
  private async snapshot(transaction: IDBTransaction): Promise<PersonalBackup> {
    const [notes, explorations, resume, guideStates, originalStates, preferences] = await Promise.all([
      ...storeNames.map(name => request(transaction.objectStore(name).getAll())),
      request(transaction.objectStore('preferences').get('preferences')),
    ]);
    return { format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), notes, explorations, resume, guideStates, originalStates, preferences: preferences ?? {} };
  }
  async accountChange(transaction: IDBTransaction, name: ChangeStore, previous: unknown, next: unknown) {
    const metadata = transaction.objectStore(metaStore);
    const stats: RecordStats = await request(metadata.get('stats'));
    stats.bytes += (next === undefined ? 0 : byteLength(next)) - (previous === undefined ? 0 : byteLength(previous));
    if (name !== 'preferences') stats.counts[name] += Number(next !== undefined) - Number(previous !== undefined);
    if (stats.bytes > MAX_PERSONAL_BYTES || name !== 'preferences' && stats.counts[name] > MAX_PERSONAL_RECORDS) throw new ValidationError('个人记录达到 512 MiB 或单类 250000 条运行容量，请先导出并整理；已有记录不会自动删除。');
    if (stats.bytes < 0) throw new StorageError('本地容量计数异常，请保留备份后重试。');
    stats.revision++;
    await request(metadata.put(stats, 'stats'));
  }
  async exportBackup(): Promise<PersonalBackup> {
    const stats = await this.getStats();
    if (stats.bytes + Object.values(stats.counts).reduce((a, b) => a + b, 2048) > MAX_BACKUP_BYTES) throw new ValidationError('当前记录超过旧 v1 备份容量，请使用分块备份 v2。');
    const snapshot = await this.run(allStores, 'readonly', transaction => this.snapshot(transaction));
    if (snapshot.explorations.some(record => record.research !== undefined)) throw new ValidationError('研究记录需要分块备份 v3，旧 v1 格式不会丢弃研究字段。');
    return validateBackup(snapshot);
  }
  async previewImport(input: unknown, targetAvailable?: (target: GuideTarget) => boolean): Promise<ImportPreview> {
    const backup = validateBackup(input);
    return this.run([...allStores, metaStore], 'readonly', async transaction => {
    const baselineRevision = (await request<RecordStats>(transaction.objectStore(metaStore).get('stats'))).revision;
    const conflicts: ImportConflict[] = [];
    const unavailable: string[] = [];
    const missingNotes: string[] = [];
    const counts = {} as Record<StoreName, number>;
    let duplicates = 0;
    for (const name of storeNames) {
      counts[name] = backup[name].length;
      for (const incoming of backup[name]) {
        const key = recordKey(name, incoming), local = await request(transaction.objectStore(name).get(key));
        if (local && canonical(local) === canonical(incoming)) duplicates++;
        else if (local) conflicts.push({ key: `${name}:${key}`, store: name, local, incoming, canKeepBoth: name === 'notes' || name === 'explorations' });
      }
    }
    const preferences = (await request<Preferences>(transaction.objectStore('preferences').get('preferences'))) ?? {};
    if (Object.keys(preferences).length && canonical(preferences) !== canonical(backup.preferences)) conflicts.push({ key: 'preferences', store: 'preferences', local: preferences, incoming: backup.preferences, canKeepBoth: false });
    const inspectTarget = (target: GuideTarget) => { if (targetAvailable && !targetAvailable(target)) unavailable.push(`${target.guideId}/${target.revision}#${target.unitId}`); };
    backup.notes.forEach(inspectTarget); backup.resume.forEach(inspectTarget);
    const notes = new Set(backup.notes.map(note => note.id));
    for (const exploration of backup.explorations) {
      for (const evidence of exploration.evidence) {
        if (evidence.target) inspectTarget(evidence.target);
        if (evidence.relatedNoteId && !notes.has(evidence.relatedNoteId) && !await request(transaction.objectStore('notes').getKey(evidence.relatedNoteId))) missingNotes.push(evidence.relatedNoteId);
      }
      if (exploration.nextAction?.target) inspectTarget(exploration.nextAction.target);
    }
    return { backup, baselineRevision, counts, duplicates, conflicts, unavailable: [...new Set(unavailable)], missingNotes: [...new Set(missingNotes)] };
    });
  }
  async importBackup(preview: ImportPreview, choices: Record<string, ImportChoice> = {}) {
    const backup = validateBackup(preview.backup);
    const validKeys = new Set(preview.conflicts.map(conflict => conflict.key));
    for (const [key, choice] of Object.entries(choices)) {
      if (!validKeys.has(key) || !['keep-local', 'use-imported', 'keep-both'].includes(choice)) throw new ValidationError('导入选择无效，请重新预览。');
      if (choice === 'keep-both' && !preview.conflicts.find(conflict => conflict.key === key)?.canKeepBoth) throw new ValidationError('该记录类型不能保留两份，请重新选择。');
    }
    const result = await this.run([...allStores, metaStore], 'readwrite', async transaction => {
      if ((await request<RecordStats>(transaction.objectStore(metaStore).get('stats'))).revision !== preview.baselineRevision) throw new StaleImportError();
      const noteRemap = new Map<string, string>();
      let imported = 0, copied = 0, skipped = 0;
      const plans: { store: StoreName; value: any; key: string }[] = [];
      for (const name of storeNames) {
        for (const item of backup[name]) {
          const incoming = structuredClone(item);
          const key = recordKey(name, incoming), current = await request(transaction.objectStore(name).get(key));
          if (current && canonical(current) === canonical(incoming)) { skipped++; continue; }
          const choice = choices[`${name}:${key}`] ?? (name === 'notes' || name === 'explorations' ? 'keep-both' : 'keep-local');
          if (current && choice === 'keep-local') { skipped++; continue; }
          if (current && choice === 'keep-both') {
            if (name !== 'notes' && name !== 'explorations') throw new ValidationError('阅读位置和状态不能在同一标识下保留两份，请重新选择。');
            const record = incoming as Note | Exploration;
            record.id = crypto.randomUUID(); record.recordRevision = 1;
            if (name === 'notes') noteRemap.set(key, record.id);
            copied++;
          } else if (current && (name === 'notes' || name === 'explorations')) {
            (incoming as Note | Exploration).recordRevision = Math.max((current as Note | Exploration).recordRevision, (incoming as Note | Exploration).recordRevision) + 1;
            (incoming as Note | Exploration).updatedAt = new Date().toISOString();
          }
          plans.push({ store: name, value: incoming, key: recordKey(name, incoming) }); imported++;
        }
      }
      for (const plan of plans) {
        if (plan.store === 'explorations') for (const evidence of (plan.value as Exploration).evidence) {
          if (evidence.relatedNoteId && noteRemap.has(evidence.relatedNoteId)) evidence.relatedNoteId = noteRemap.get(evidence.relatedNoteId)!;
        }
        validateRecord(plan.store, plan.value);
      }
      const preferences = (await request<Preferences>(transaction.objectStore('preferences').get('preferences'))) ?? {};
      const importPreferences = !Object.keys(preferences).length || choices.preferences === 'use-imported';
      for (const plan of plans) {
        const store = transaction.objectStore(plan.store), previous = await request(store.get(plan.key));
        await this.accountChange(transaction, plan.store, previous, plan.value);
        await request(store.put(plan.value, plan.key));
      }
      if (importPreferences) {
        const store = transaction.objectStore('preferences'), previous = await request(store.get('preferences'));
        await this.accountChange(transaction, 'preferences', previous, backup.preferences);
        await request(store.put(backup.preferences, 'preferences'));
      }
      return { imported, copied, skipped };
    });
    await this.getStats(); this.notifyChange(); return result;
  }
  exportArchive(signal?: AbortSignal) { return exportPersonalArchive(this, signal); }
  exportMigrationArchive(signal?: AbortSignal) { return exportPersonalArchive(this, signal, true); }
  exportResearchMigrationArchive(signal?: AbortSignal) { return exportPersonalArchive(this, signal, 'v2'); }
  async exportMigrationBackup(): Promise<PersonalBackup> {
    const backup: PersonalBackup = { format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), notes: [], explorations: [], resume: [], guideStates: [], originalStates: [], preferences: {} };
    await this.run([migrationStore, metaStore], 'readonly', async transaction => {
      if (!(await request<RecordStats>(transaction.objectStore(metaStore).get('stats'))).migrationBackupAvailable) throw new ValidationError('没有保留的 v1 迁移副本。');
      await new Promise<void>((resolve, reject) => {
        const operation = transaction.objectStore(migrationStore).openCursor(); let bytes = 0;
        operation.onerror = () => reject(operation.error);
        operation.onsuccess = () => {
          const row = operation.result;
          if (!row) { resolve(); return; }
          const [name] = row.key as [ChangeStore, string]; bytes += byteLength(row.value);
          if (bytes > MAX_BACKUP_BYTES) { reject(new ValidationError('升级前副本超过旧 v1 格式上限，需使用分块恢复工具。')); return; }
          if (name === 'preferences') backup.preferences = row.value; else (backup[name] as unknown[]).push(row.value);
          row.continue();
        };
      });
    });
    return validateBackup(backup);
  }
  previewArchive(file: Blob, targetAvailable?: (target: GuideTarget) => boolean, signal?: AbortSignal) { return previewPersonalArchive(this, file, targetAvailable, signal); }
  importArchive(preview: ArchivePreview, choices: Record<string, ImportChoice> = {}, signal?: AbortSignal) { return applyPersonalArchive(this, preview, choices, signal); }
  discardArchive(jobId: string) { return discardPersonalArchive(this, jobId); }
  archiveConflictPage(preview: ArchivePreview, offset = 0) { return archiveConflicts(this, preview.jobId, offset); }
  async clearAll() {
    await this.run([...allStores, metaStore, stageStore, migrationStore, researchMigrationStore], 'readwrite', async transaction => {
      const stats = await request<RecordStats>(transaction.objectStore(metaStore).get('stats'));
      for (const name of [...allStores, stageStore, migrationStore, researchMigrationStore]) transaction.objectStore(name).clear();
      transaction.objectStore(metaStore).clear(); transaction.objectStore(metaStore).put({ ...emptyStats(), revision: stats.revision + 1 }, 'stats');
    });
    const backup = await this.exportBackup();
    if (storeNames.some(name => backup[name].length) || Object.keys(backup.preferences).length) throw new StorageError('清除后记录发生变化，请重新查看。');
    this.notifyChange();
  }
}

export const personalStore = new PersonalRecordStore();
export const store = personalStore;
export const personalRecordStore = personalStore;
