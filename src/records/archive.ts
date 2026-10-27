import type { ArchivePreview, Exploration, GuideTarget, ImportChoice, ImportConflict, Preferences, RecordStats, StoreName } from './types';
import type { PersonalRecordStore } from './store';
import { StaleImportError } from './store';
import { byteLength, canonical, MAX_PERSONAL_BYTES, MAX_PERSONAL_RECORDS, MAX_RECORD_BYTES, recordKey, validateRecord, ValidationError } from './validation';

// Version 2 is an ordered, bounded NDJSON archive. It never JSON.parse's a whole file.
// A private IndexedDB staging area provides a consistent export and atomic restore.
const names: StoreName[] = ['notes', 'explorations', 'resume', 'guideStates', 'originalStates'];
const recordStores = [...names, 'preferences'];
const stageName = '_backupStage', metaName = '_metadata';
const targetBlockBytes = 128 * 1024;
const maxLineBytes = MAX_RECORD_BYTES + 256 * 1024;
export const MAX_ARCHIVE_BYTES = 768 * 1024 * 1024;
type ArchiveRow = { store: StoreName | 'preferences'; key: string; value: any };
type Header = { kind: 'manifest'; format: 'paperdesk-personal-archive'; schemaVersion: 2; exportedAt: string; snapshotRevision: number; counts: Record<StoreName, number>; bytes: number; records: number; origin: 'current' | 'migration-v1' };
type StageManifest = { header: Header; baselineRevision?: number; conflictCount?: number; ready?: boolean };
const request = <T>(operation: IDBRequest<T>) => new Promise<T>((resolve, reject) => { operation.onsuccess = () => resolve(operation.result); operation.onerror = () => reject(operation.error); });
const jobRange = (id: string) => IDBKeyRange.bound([id], [id, []]);
const rowRange = (id: string, after?: IDBValidKey) => IDBKeyRange.bound(after ?? [id, 'record'], [id, 'record', []], Boolean(after));
const fail = (message: string): never => { throw new ValidationError(`分块备份：${message}`); };
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new ValidationError('已取消备份操作，本地记录未改变。'); }
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
function fields(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('字段缺失或包含未支持字段。');
}
function validateHeader(value: any): asserts value is Header {
  fields(value, ['kind', 'format', 'schemaVersion', 'exportedAt', 'snapshotRevision', 'counts', 'bytes', 'records', 'origin']);
  if (value.kind !== 'manifest' || value.format !== 'paperdesk-personal-archive' || value.schemaVersion !== 2) fail('格式或版本不受支持。');
  if (!['current', 'migration-v1'].includes(value.origin) || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) || new Date(value.exportedAt).toISOString() !== value.exportedAt) fail('清单时间或来源无效。');
  fields(value.counts, names);
  for (const count of Object.values(value.counts)) if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > MAX_PERSONAL_RECORDS) fail('记录数量无效。');
  if (!Number.isSafeInteger(value.snapshotRevision) || value.snapshotRevision < 0 || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_PERSONAL_BYTES || value.records !== Object.values<number>(value.counts).reduce((a, b) => a + b, 1)) fail('清单容量或数量无效。');
}
function validateRow(row: any): ArchiveRow {
  fields(row, ['store', 'value']);
  if (!recordStores.includes(row.store)) fail('记录类型无效。');
  validateRecord(row.store, row.value);
  return { ...row, key: row.store === 'preferences' ? 'preferences' : recordKey(row.store, row.value) };
}
async function visit(store: IDBObjectStore, range: IDBKeyRange | undefined, work: (cursor: IDBCursorWithValue) => Promise<void> | void) {
  return new Promise<void>((resolve, reject) => {
    const operation = store.openCursor(range);
    operation.onerror = () => reject(operation.error);
    operation.onsuccess = () => {
      const cursor = operation.result;
      if (!cursor) { resolve(); return; }
      Promise.resolve().then(() => work(cursor)).then(() => cursor.continue(), reject);
    };
  });
}
export async function discardPersonalArchive(store: PersonalRecordStore, jobId: string) {
  await store.transaction([stageName], 'readwrite', transaction => request(transaction.objectStore(stageName).delete(jobRange(jobId))));
}
async function stageExport(store: PersonalRecordStore, signal?: AbortSignal, migration = false) {
  const jobId = crypto.randomUUID();
  const header: Header = { kind: 'manifest', format: 'paperdesk-personal-archive', schemaVersion: 2, exportedAt: new Date().toISOString(), snapshotRevision: 0, counts: { notes: 0, explorations: 0, resume: 0, guideStates: 0, originalStates: 0 }, bytes: 0, records: 0, origin: migration ? 'migration-v1' : 'current' };
  try {
    await store.transaction([...(migration ? ['_migrationV1'] : recordStores), stageName, metaName], 'readwrite', async transaction => {
      const stats: RecordStats = await request(transaction.objectStore(metaName).get('stats'));
      if (migration && !stats.migrationBackupAvailable) fail('没有保留的 v1 迁移副本。');
      header.snapshotRevision = stats.revision;
      const stage = transaction.objectStore(stageName);
      let preferences = false;
      const copy = async (name: ArchiveRow['store'], key: string, value: any) => {
        checkAbort(signal); validateRecord(name, value);
        header.bytes += byteLength(value); header.records++;
        if (name === 'preferences') preferences = true; else header.counts[name]++;
        await request(stage.add({ store: name, key, value }, [jobId, 'record', name, key]));
      };
      if (migration) await visit(transaction.objectStore('_migrationV1'), undefined, cursor => { const [name, key] = cursor.key as [ArchiveRow['store'], string]; return copy(name, key, cursor.value); });
      else for (const name of recordStores) await visit(transaction.objectStore(name), undefined, cursor => copy(name as ArchiveRow['store'], String(cursor.key), cursor.value));
      if (!preferences) await copy('preferences', 'preferences', {});
      await request(stage.add({ header } satisfies StageManifest, [jobId, 'manifest']));
    });
    return { jobId, header };
  } catch (error) { await discardPersonalArchive(store, jobId).catch(() => {}); throw error; }
}
async function nextRows(store: PersonalRecordStore, jobId: string, after?: IDBValidKey) {
  return store.transaction([stageName], 'readonly', transaction => new Promise<{ rows: ArchiveRow[]; last?: IDBValidKey }>((resolve, reject) => {
    const rows: ArchiveRow[] = []; let bytes = 0, last: IDBValidKey | undefined;
    const operation = transaction.objectStore(stageName).openCursor(rowRange(jobId, after));
    operation.onerror = () => reject(operation.error);
    operation.onsuccess = () => {
      const cursor = operation.result;
      if (!cursor || rows.length && bytes >= targetBlockBytes) { resolve({ rows, last }); return; }
      rows.push(cursor.value); bytes += byteLength(cursor.value); last = cursor.key; cursor.continue();
    };
  }));
}
export async function exportPersonalArchive(store: PersonalRecordStore, signal?: AbortSignal, migration = false): Promise<Blob> {
  const { jobId, header } = await stageExport(store, signal, migration);
  try {
    const line = JSON.stringify(header); let chain = await digest(line), sequence = 0, after: IDBValidKey | undefined;
    // Blob concatenation retains browser-managed binary parts, not one giant JS string.
    let output = new Blob([line + '\n'], { type: 'application/x-ndjson' });
    for (;;) {
      checkAbort(signal);
      const page = await nextRows(store, jobId, after);
      if (!page.rows.length) break;
      const records = page.rows.map(({ store, value }) => ({ store, value }));
      const sha256 = await digest(JSON.stringify(records));
      const block = JSON.stringify({ kind: 'block', sequence, records, sha256 });
      if (new TextEncoder().encode(block).byteLength > maxLineBytes) fail('单块超过传输限制。');
      output = new Blob([output, block + '\n'], { type: 'application/x-ndjson' });
      if (output.size > MAX_ARCHIVE_BYTES - 1024) fail('文件超过 768 MiB 传输限制。');
      chain = await digest(chain + sha256); sequence++; after = page.last;
    }
    checkAbort(signal);
    return new Blob([output, JSON.stringify({ kind: 'end', blocks: sequence, sha256: chain, records: header.records }) + '\n'], { type: 'application/x-ndjson' });
  } finally { await discardPersonalArchive(store, jobId); }
}
async function* lines(file: Blob, signal?: AbortSignal) {
  if (file.size > MAX_ARCHIVE_BYTES) fail('文件超过 768 MiB 传输上限。');
  const reader = file.stream().getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let buffer = '';
  try {
    for (;;) {
      checkAbort(signal); const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        if (!line || new TextEncoder().encode(line).byteLength > maxLineBytes) fail('空块或单块超过限制。');
        yield line;
      }
      if (buffer.length > maxLineBytes) fail('单块超过限制。');
      if (done) break;
    }
    if (buffer) fail('文件结尾不完整。');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function previewPersonalArchive(store: PersonalRecordStore, file: Blob, targetAvailable?: (target: GuideTarget) => boolean, signal?: AbortSignal): Promise<ArchivePreview> {
  const jobId = crypto.randomUUID(); let header: Header | undefined, chain = '', sequence = 0, count = 0, bytes = 0, ended = false;
  const counts: Header['counts'] = { notes: 0, explorations: 0, resume: 0, guideStates: 0, originalStates: 0 };
  try {
    for await (const line of lines(file, signal)) {
      let value: any; try { value = JSON.parse(line); } catch { fail('包含损坏的 JSON 块。'); }
      if (!header) { validateHeader(value); header = value; chain = await digest(line); continue; }
      if (ended) fail('结束块之后仍有数据。');
      if (value?.kind === 'end') {
        fields(value, ['kind', 'blocks', 'sha256', 'records']);
        if (value.blocks !== sequence || value.sha256 !== chain || value.records !== count) fail('缺块、顺序或完整性校验不一致。');
        ended = true; continue;
      }
      fields(value, ['kind', 'sequence', 'records', 'sha256']);
      if (value.kind !== 'block' || value.sequence !== sequence || !Array.isArray(value.records) || !value.records.length || value.records.length > 4096 || typeof value.sha256 !== 'string') fail('块顺序或内容无效。');
      if (await digest(JSON.stringify(value.records)) !== value.sha256) fail('块校验和不符。');
      await store.transaction([stageName], 'readwrite', async transaction => {
        const stage = transaction.objectStore(stageName);
        for (const item of value.records) {
          checkAbort(signal); const row = validateRow(item);
          count++; bytes += byteLength(row.value);
          if (row.store !== 'preferences') counts[row.store]++;
          if (bytes > MAX_PERSONAL_BYTES || count > 5 * MAX_PERSONAL_RECORDS + 1) fail('超过运行容量。');
          const key = [jobId, 'record', row.store, row.key];
          if (await request(stage.getKey(key))) fail('包含重复记录标识。');
          await request(stage.add(row, key));
        }
      });
      chain = await digest(chain + value.sha256); sequence++;
    }
    if (!header || !ended || header.records !== count || header.bytes !== bytes || canonical(header.counts) !== canonical(counts)) fail('文件缺块或清单数量不一致。');
    const preview: ArchivePreview = { format: 'paperdesk-personal-archive', schemaVersion: 2, jobId, exportedAt: header!.exportedAt, counts, bytes, baselineRevision: 0, duplicates: 0, conflictCount: 0, conflicts: [], unavailable: [], unavailableCount: 0, missingNotes: [], missingNoteCount: 0 };
    await store.transaction([...recordStores, stageName, metaName], 'readwrite', async transaction => {
      const stage = transaction.objectStore(stageName);
      if (!await request(stage.getKey([jobId, 'record', 'preferences', 'preferences']))) fail('缺少阅读设置。');
      preview.baselineRevision = (await request<RecordStats>(transaction.objectStore(metaName).get('stats'))).revision;
      const inspect = (target: GuideTarget) => {
        if (targetAvailable && !targetAvailable(target)) { preview.unavailableCount++; if (preview.unavailable.length < 100) preview.unavailable.push(`${target.guideId}/${target.revision}#${target.unitId}`); }
      };
      await visit(stage, rowRange(jobId), async cursor => {
        checkAbort(signal); const row: ArchiveRow = cursor.value;
        const local = await request(transaction.objectStore(row.store).get(row.key));
        if (local !== undefined && canonical(local) === canonical(row.value)) preview.duplicates++;
        else if (local !== undefined && (row.store !== 'preferences' || Object.keys(local).length)) {
          const conflict: ImportConflict = { key: row.store === 'preferences' ? 'preferences' : `${row.store}:${row.key}`, store: row.store, local, incoming: row.value, canKeepBoth: row.store === 'notes' || row.store === 'explorations' };
          await request(stage.put(conflict, [jobId, 'conflict', preview.conflictCount])); preview.conflictCount++;
          if (preview.conflicts.length < 20) preview.conflicts.push(conflict);
        }
        if (row.store === 'notes' || row.store === 'resume') inspect(row.value);
        if (row.store === 'explorations') {
          for (const evidence of (row.value as Exploration).evidence) {
            if (evidence.target) inspect(evidence.target);
            if (evidence.relatedNoteId && !await request(stage.getKey([jobId, 'record', 'notes', evidence.relatedNoteId])) && !await request(transaction.objectStore('notes').getKey(evidence.relatedNoteId))) {
              preview.missingNoteCount++; if (preview.missingNotes.length < 100) preview.missingNotes.push(evidence.relatedNoteId);
            }
          }
          if (row.value.nextAction?.target) inspect(row.value.nextAction.target);
        }
      });
      await request(stage.put({ header: header!, baselineRevision: preview.baselineRevision, conflictCount: preview.conflictCount, ready: true } satisfies StageManifest, [jobId, 'manifest']));
    });
    checkAbort(signal); return preview;
  } catch (error) { await discardPersonalArchive(store, jobId).catch(() => {}); throw error; }
}
export async function archiveConflicts(store: PersonalRecordStore, jobId: string, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0) fail('冲突页无效。');
  return store.transaction([stageName], 'readonly', transaction => request<ImportConflict[]>(transaction.objectStore(stageName).getAll(IDBKeyRange.bound([jobId, 'conflict', offset], [jobId, 'conflict', offset + 19]), 20)));
}
export async function applyPersonalArchive(store: PersonalRecordStore, preview: ArchivePreview, choices: Record<string, ImportChoice>, signal?: AbortSignal) {
  checkAbort(signal);
  const result = await store.transaction([...recordStores, stageName, metaName], 'readwrite', async transaction => {
    const stage = transaction.objectStore(stageName), manifest: StageManifest | undefined = await request(stage.get([preview.jobId, 'manifest']));
    const stats: RecordStats = await request(transaction.objectStore(metaName).get('stats'));
    if (!manifest?.ready || manifest.baselineRevision !== preview.baselineRevision) fail('预览已失效，请重新选择备份。');
    if (stats.revision !== preview.baselineRevision) throw new StaleImportError();
    const allowed = new Set<string>();
    await visit(stage, IDBKeyRange.bound([preview.jobId, 'conflict'], [preview.jobId, 'conflict', []]), cursor => {
      const conflict: ImportConflict = cursor.value; allowed.add(conflict.key);
      if (choices[conflict.key] === 'keep-both' && !conflict.canKeepBoth) fail('该记录不能保留两份。');
    });
    if (Object.entries(choices).some(([key, value]) => !allowed.has(key) || !['keep-local', 'use-imported', 'keep-both'].includes(value))) fail('导入选择无效。');
    let imported = 0, copied = 0, skipped = 0;
    const remaps = new Map<string, string>();
    // Plan copied note identities before processing exploration references.
    await visit(stage, IDBKeyRange.bound([preview.jobId, 'record', 'notes'], [preview.jobId, 'record', 'notes', []]), async cursor => {
      const row: ArchiveRow = cursor.value, local = await request(transaction.objectStore('notes').get(row.key));
      if (local && canonical(local) !== canonical(row.value) && (choices[`notes:${row.key}`] ?? 'keep-both') === 'keep-both') remaps.set(row.key, crypto.randomUUID());
    });
    await visit(stage, rowRange(preview.jobId), async cursor => {
      checkAbort(signal); const row: ArchiveRow = cursor.value, target = transaction.objectStore(row.store);
      const current = await request(target.get(row.key));
      if (current !== undefined && canonical(current) === canonical(row.value)) { skipped++; return; }
      const key = row.store === 'preferences' ? 'preferences' : `${row.store}:${row.key}`;
      const isVersioned = row.store === 'notes' || row.store === 'explorations';
      const choice = choices[key] ?? (isVersioned ? 'keep-both' : 'keep-local');
      const hasCurrent = current !== undefined && (row.store !== 'preferences' || Object.keys(current).length > 0);
      if (hasCurrent && choice === 'keep-local') { skipped++; return; }
      const incoming = structuredClone(row.value); let saveKey = row.key;
      if (hasCurrent && choice === 'keep-both') {
        if (!isVersioned) fail('该记录不能保留两份。');
        incoming.id = row.store === 'notes' ? remaps.get(row.key)! : crypto.randomUUID(); incoming.recordRevision = 1; saveKey = incoming.id; copied++;
      } else if (hasCurrent && isVersioned) {
        incoming.recordRevision = Math.max(current.recordRevision, incoming.recordRevision) + 1; incoming.updatedAt = new Date().toISOString();
      }
      if (row.store === 'explorations') for (const evidence of (incoming as Exploration).evidence) if (evidence.relatedNoteId && remaps.has(evidence.relatedNoteId)) evidence.relatedNoteId = remaps.get(evidence.relatedNoteId)!;
      validateRecord(row.store, incoming);
      const previous = saveKey === row.key ? current : undefined;
      await store.accountChange(transaction, row.store, previous, incoming);
      await request(target.put(incoming, saveKey)); imported++;
    });
    checkAbort(signal);
    await request(stage.delete(jobRange(preview.jobId)));
    return { imported, copied, skipped };
  });
  await store.getStats(); store.notifyChange(); return result;
}
