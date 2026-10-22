import type { Exploration, ExplorationDraft, GuideState, GuideTarget, ImportChoice, ImportConflict, ImportPreview, Note, NoteDraft, OriginalState, PersonalBackup, Preferences, RecordMap, ResumeRecord, StoreName } from './types';
import { canonical, guideKey, originalKey, recordKey, validateBackup, validateRecord, ValidationError } from './validation';

export { guideKey, originalKey, validateBackup, ValidationError };
export const DATABASE_NAME = 'paperdesk-personal-v1';
const storeNames: StoreName[] = ['notes', 'explorations', 'resume', 'guideStates', 'originalStates'];
const allStores = [...storeNames, 'preferences'];
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
function dataIdentity(backup: PersonalBackup) { const { exportedAt: _time, ...data } = backup; return canonical(data); }

export class PersonalRecordStore {
  private opening: Promise<IDBDatabase> | undefined;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | undefined;
  constructor(private name = DATABASE_NAME) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`${name}-changes`);
      this.channel.onmessage = () => this.listeners.forEach(listener => listener());
    }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed() { this.listeners.forEach(listener => listener()); this.channel?.postMessage('changed'); }
  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new StorageError('浏览器没有提供本地记录存储。可以继续阅读，并将草稿另存。')); return; }
      let operation: IDBOpenDBRequest;
      try { operation = indexedDB.open(this.name, 1); } catch (error) { reject(storageError(error)); return; }
      operation.onupgradeneeded = () => { for (const name of allStores) operation.result.createObjectStore(name); };
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
  private async run<T>(names: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => Promise<T> | T): Promise<T> {
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
  async list<K extends StoreName>(name: K): Promise<RecordMap[K][]> {
    return this.run([name], 'readonly', transaction => request(transaction.objectStore(name).getAll()));
  }
  async get<K extends StoreName>(name: K, key: string): Promise<RecordMap[K] | undefined> {
    return this.run([name], 'readonly', transaction => request(transaction.objectStore(name).get(key)));
  }
  private async saveVersioned<T extends Note | Exploration>(name: 'notes' | 'explorations', draft: NoteDraft | ExplorationDraft, expectedRevision: number | null): Promise<T> {
    const saved = await this.run(allStores, 'readwrite', async transaction => {
      const objectStore = transaction.objectStore(name);
      const current = await request<Note | Exploration | undefined>(objectStore.get(draft.id));
      if (expectedRevision === null ? current !== undefined : current?.recordRevision !== expectedRevision) throw new ConflictError(current ?? null);
      const timestamp = new Date().toISOString();
      const value = { ...draft, recordRevision: (current?.recordRevision ?? 0) + 1, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp } as T;
      validateRecord(name, value);
      await this.validateCapacity(transaction, name, value);
      await request(objectStore.put(value, value.id));
      return value;
    });
    const readBack = await this.get(name, saved.id);
    if (!readBack || canonical(readBack) !== canonical(saved)) throw new StorageError('保存后记录已发生变化，请保留草稿并重新载入核对。');
    this.changed(); return saved;
  }
  saveNote(draft: NoteDraft, expectedRevision: number | null) { return this.saveVersioned<Note>('notes', draft, expectedRevision); }
  saveExploration(draft: ExplorationDraft, expectedRevision: number | null) { return this.saveVersioned<Exploration>('explorations', draft, expectedRevision); }
  private async deleteVersioned(name: 'notes' | 'explorations', id: string, expectedRevision: number) {
    await this.run([name], 'readwrite', async transaction => {
      const objectStore = transaction.objectStore(name);
      const current = await request<Note | Exploration | undefined>(objectStore.get(id));
      if (current?.recordRevision !== expectedRevision) throw new ConflictError(current ?? null);
      await request(objectStore.delete(id));
    });
    this.changed();
  }
  deleteNote(id: string, expectedRevision: number) { return this.deleteVersioned('notes', id, expectedRevision); }
  deleteExploration(id: string, expectedRevision: number) { return this.deleteVersioned('explorations', id, expectedRevision); }
  private async set<K extends 'resume' | 'guideStates' | 'originalStates'>(name: K, value: RecordMap[K]) {
    validateRecord(name, value);
    const key = recordKey(name, value);
    await this.run(allStores, 'readwrite', async transaction => {
      await this.validateCapacity(transaction, name, value);
      await request(transaction.objectStore(name).put(value, key));
    });
    const readBack = await this.get(name, key);
    if (!readBack || canonical(value) !== canonical(readBack)) throw new StorageError('写入后位置或状态发生变化，请重试。');
    this.changed(); return readBack;
  }
  setResume(value: ResumeRecord) { return this.set('resume', value); }
  setGuideState(value: GuideState) { return this.set('guideStates', value); }
  setOriginalState(value: OriginalState) { return this.set('originalStates', value); }
  async getPreferences(): Promise<Preferences> {
    return (await this.run(['preferences'], 'readonly', transaction => request(transaction.objectStore('preferences').get('preferences')))) ?? {};
  }
  async savePreferences(value: Preferences) {
    validateRecord('preferences', value);
    const saved = await this.run(allStores, 'readwrite', async transaction => {
      const objectStore = transaction.objectStore('preferences');
      const current = await request<Preferences | undefined>(objectStore.get('preferences'));
      const merged = { ...current, ...value };
      validateRecord('preferences', merged);
      const candidate = await this.snapshot(transaction); candidate.preferences = merged; validateBackup(candidate);
      await request(objectStore.put(merged, 'preferences')); return merged;
    });
    if (canonical(await this.getPreferences()) !== canonical(saved)) throw new StorageError('字号设置写入后发生变化，请重试。');
    this.changed(); return saved;
  }
  private async snapshot(transaction: IDBTransaction): Promise<PersonalBackup> {
    const [notes, explorations, resume, guideStates, originalStates, preferences] = await Promise.all([
      ...storeNames.map(name => request(transaction.objectStore(name).getAll())),
      request(transaction.objectStore('preferences').get('preferences')),
    ]);
    return { format: 'paperdesk-personal-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), notes, explorations, resume, guideStates, originalStates, preferences: preferences ?? {} };
  }
  private async validateCapacity(transaction: IDBTransaction, name: StoreName, value: RecordMap[StoreName]) {
    const candidate = await this.snapshot(transaction);
    const rows = candidate[name] as RecordMap[StoreName][];
    const index = rows.findIndex(row => recordKey(name, row) === recordKey(name, value));
    if (index < 0) rows.push(value); else rows[index] = value;
    validateBackup(candidate);
  }
  async exportBackup(): Promise<PersonalBackup> {
    const snapshot = await this.run(allStores, 'readonly', transaction => this.snapshot(transaction));
    return validateBackup(snapshot);
  }
  async previewImport(input: unknown, targetAvailable?: (target: GuideTarget) => boolean): Promise<ImportPreview> {
    const backup = validateBackup(input);
    const baseline = await this.exportBackup();
    const conflicts: ImportConflict[] = [];
    const unavailable: string[] = [];
    const missingNotes: string[] = [];
    const counts = {} as Record<StoreName, number>;
    let duplicates = 0;
    for (const name of storeNames) {
      counts[name] = backup[name].length;
      const existing = new Map(baseline[name].map(value => [recordKey(name, value), value]));
      for (const incoming of backup[name]) {
        const key = recordKey(name, incoming), local = existing.get(key);
        if (local && canonical(local) === canonical(incoming)) duplicates++;
        else if (local) conflicts.push({ key: `${name}:${key}`, store: name, local, incoming, canKeepBoth: name === 'notes' || name === 'explorations' });
      }
    }
    if (Object.keys(baseline.preferences).length && canonical(baseline.preferences) !== canonical(backup.preferences)) conflicts.push({ key: 'preferences', store: 'preferences', local: baseline.preferences, incoming: backup.preferences, canKeepBoth: false });
    const inspectTarget = (target: GuideTarget) => { if (targetAvailable && !targetAvailable(target)) unavailable.push(`${target.guideId}/${target.revision}#${target.unitId}`); };
    backup.notes.forEach(inspectTarget); backup.resume.forEach(inspectTarget);
    const notes = new Set([...baseline.notes, ...backup.notes].map(note => note.id));
    backup.explorations.forEach(exploration => {
      exploration.evidence.forEach(evidence => { if (evidence.target) inspectTarget(evidence.target); if (evidence.relatedNoteId && !notes.has(evidence.relatedNoteId)) missingNotes.push(evidence.relatedNoteId); });
      if (exploration.nextAction?.target) inspectTarget(exploration.nextAction.target);
    });
    return { backup, baseline, counts, duplicates, conflicts, unavailable: [...new Set(unavailable)], missingNotes: [...new Set(missingNotes)] };
  }
  async importBackup(preview: ImportPreview, choices: Record<string, ImportChoice> = {}) {
    const backup = validateBackup(preview.backup);
    const validKeys = new Set(preview.conflicts.map(conflict => conflict.key));
    for (const [key, choice] of Object.entries(choices)) {
      if (!validKeys.has(key) || !['keep-local', 'use-imported', 'keep-both'].includes(choice)) throw new ValidationError('导入选择无效，请重新预览。');
      if (choice === 'keep-both' && !preview.conflicts.find(conflict => conflict.key === key)?.canKeepBoth) throw new ValidationError('该记录类型不能保留两份，请重新选择。');
    }
    const result = await this.run(allStores, 'readwrite', async transaction => {
      const local = await this.snapshot(transaction);
      if (dataIdentity(local) !== dataIdentity(preview.baseline)) throw new StaleImportError();
      const noteRemap = new Map<string, string>();
      let imported = 0, copied = 0, skipped = 0;
      const plans: { store: StoreName; value: any; key: string }[] = [];
      for (const name of storeNames) {
        const existing = new Map(local[name].map(value => [recordKey(name, value), value]));
        for (const item of backup[name]) {
          const incoming = structuredClone(item);
          const key = recordKey(name, incoming), current = existing.get(key);
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
      const candidate = structuredClone(local);
      for (const plan of plans) {
        if (plan.store === 'explorations') for (const evidence of (plan.value as Exploration).evidence) {
          if (evidence.relatedNoteId && noteRemap.has(evidence.relatedNoteId)) evidence.relatedNoteId = noteRemap.get(evidence.relatedNoteId)!;
        }
        validateRecord(plan.store, plan.value);
        const rows = candidate[plan.store] as RecordMap[StoreName][];
        const index = rows.findIndex(value => recordKey(plan.store, value) === plan.key);
        if (index < 0) rows.push(plan.value); else rows[index] = plan.value;
      }
      const importPreferences = !Object.keys(local.preferences).length || choices.preferences === 'use-imported';
      if (importPreferences) candidate.preferences = backup.preferences;
      validateBackup(candidate);
      for (const plan of plans) transaction.objectStore(plan.store).put(plan.value, plan.key);
      if (importPreferences) transaction.objectStore('preferences').put(backup.preferences, 'preferences');
      return { imported, copied, skipped };
    });
    // A complete readback verifies the durable state remains schema-valid.
    await this.exportBackup(); this.changed(); return result;
  }
  async clearAll() {
    await this.run(allStores, 'readwrite', transaction => { for (const name of allStores) transaction.objectStore(name).clear(); });
    const backup = await this.exportBackup();
    if (storeNames.some(name => backup[name].length) || Object.keys(backup.preferences).length) throw new StorageError('清除后记录发生变化，请重新查看。');
    this.changed();
  }
}

export const personalStore = new PersonalRecordStore();
export const store = personalStore;
export const personalRecordStore = personalStore;
