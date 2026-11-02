import { canonicalExplorationSync, explorationRevisionData, explorationRevisionHash, validateExplorationWorkspace, type ExplorationSyncEntry, type ExplorationSyncHead, type ExplorationWorkspace } from '../../shared/exploration-sync.mjs';
import { canonical, validateRecord, verifyResearchRecord } from './validation';
import { ConflictError, personalStore, type ExplorationSyncBaseline } from './store';
import type { Exploration } from './types';

export interface ExplorationFileConflict {
  id: string; local: Exploration | null; heads: ExplorationSyncHead[]; baseline: ExplorationSyncBaseline | null;
}
export interface ExplorationFileState { phase: 'loading' | 'ready' | 'offline' | 'conflict' | 'paused'; count: number; conflicts: ExplorationFileConflict[]; message?: string }
let state: ExplorationFileState = { phase: 'loading', count: 0, conflicts: [] };
const listeners = new Set<() => void>();
export const explorationFileState = () => state;
export const subscribeExplorationFiles = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = (value: ExplorationFileState) => { state = value; listeners.forEach(listener => listener()); };
const hashes = (heads: ExplorationSyncHead[]) => heads.map(head => head.hash).sort();
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);

/** Revision counters are local CAS tokens. Import can advance them without generating another file. */
async function fingerprint(record: Exploration | null) {
  const value = record === null ? null : JSON.parse(JSON.stringify(record));
  if (value) delete value.recordRevision;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalExplorationSync(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function jsonRequest(path: string, init: RequestInit = {}) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(path, { ...init, cache: 'no-store', signal: abort.signal });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const known: Record<string, string> = { workspace_conflict: '项目文件在另一处改变，请重新比较后再选择。', workspace_invalid_files: '探索项目文件缺失、冲突或校验不通过。请检查 Git 拉取结果并恢复完整文件，再重试；浏览器记录未覆盖。', workspace_capacity: '探索项目文件达到保存容量，尚未写入最新修改；浏览器记录仍保留，请先备份并整理项目历史。' };
      const error = new Error(known[detail.code] ?? '项目文件服务暂不可用，浏览器中的探索仍然保留。');
      error.name = response.status === 409 ? 'WorkspaceConflict' : 'WorkspaceUnavailable'; throw error;
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function connection() {
  const status = await jsonRequest('/api/workspace/status');
  if (typeof status.csrfToken !== 'string' || !status.csrfToken) throw Error('项目服务未返回有效的本地令牌，请重启服务。');
  return status.csrfToken as string;
}
async function readWorkspace(token: string): Promise<ExplorationWorkspace> {
  const workspace = validateExplorationWorkspace(await jsonRequest('/api/workspace/explorations', { headers: { 'x-paperdesk-token': token } }));
  // Validate the whole response before making even one personal-data change.
  for (const entry of workspace.explorations) for (const head of entry.heads) if (head.record) {
    validateRecord('explorations', head.record); await verifyResearchRecord(head.record);
  }
  return workspace;
}
async function writeEntry(token: string, id: string, heads: ExplorationSyncHead[], record: Exploration | null): Promise<ExplorationSyncEntry> {
  const input = JSON.parse(JSON.stringify({ explorationId: id, parents: hashes(heads), record }));
  const expectedHash = await explorationRevisionHash(explorationRevisionData(input));
  const entry = await jsonRequest('/api/workspace/explorations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-paperdesk-token': token }, body: JSON.stringify(input) });
  const valid = validateExplorationWorkspace({ format: 'paperdesk-exploration-workspace', schemaVersion: 1, explorations: [entry] }).explorations[0];
  if (valid.explorationId !== id || valid.heads.length !== 1 || valid.heads[0].hash !== expectedHash) {
    const error = new Error('项目写入期间出现了新的分支，内容已保留，请重新比较。'); error.name = 'WorkspaceConflict'; throw error;
  }
  return valid;
}
const baselineFor = async (heads: ExplorationSyncHead[], record: Exploration | null): Promise<ExplorationSyncBaseline> => ({ heads: hashes(heads), localFingerprint: await fingerprint(record) });

async function reconcile() {
  const local = await personalStore.explorationSyncState();
  if (local.paused) { publish({ phase: 'paused', count: local.records.length, conflicts: [] }); return; }
  const token = await connection(), workspace = await readWorkspace(token);
  const localRecords = new Map(local.records.map(record => [record.id, record]));
  const entries = new Map(workspace.explorations.map(entry => [entry.explorationId, entry]));
  const remote = new Map(workspace.explorations.map(entry => [entry.explorationId, entry.heads]));
  const ids = new Set([...localRecords.keys(), ...remote.keys(), ...Object.keys(local.baselines)]);
  const conflicts: ExplorationFileConflict[] = [];
  for (const id of ids) {
    const record = localRecords.get(id) ?? null, heads = remote.get(id) ?? [], baseline = local.baselines[id] ?? null;
    if (baseline?.heads.some(hash => !entries.get(id)?.revisionHashes.includes(hash))) throw Error('项目中缺少已经同步过的探索版本。请检查是否切换到较旧的 Git 分支或遗漏文件；不会把旧版本自动覆盖到浏览器。');
    if (!heads.length && baseline?.heads.length) throw Error('项目中缺少已经同步过的探索文件。请先检查 Git 分支、拉取结果或恢复文件；不会把缺失当成删除。');
    if (heads.length > 1) { conflicts.push({ id, local: record, heads, baseline }); continue; }
    const localHash = await fingerprint(record);
    if (!heads.length) {
      if (!record) continue;
      const written = await writeEntry(token, id, [], record);
      await personalStore.applyExplorationSync({ id, baseline: await baselineFor(written.heads, record), expectedBaseline: baseline });
      continue;
    }
    const remoteRecord = heads[0].record, remoteHash = await fingerprint(remoteRecord);
    if (localHash === remoteHash) {
      if (!baseline || !same(baseline.heads, hashes(heads)) || baseline.localFingerprint !== localHash) await personalStore.applyExplorationSync({ id, baseline: { heads: hashes(heads), localFingerprint: localHash }, expectedBaseline: baseline });
      continue;
    }
    if (!baseline) {
      if (record) { conflicts.push({ id, local: record, heads, baseline }); continue; }
      await personalStore.applyExplorationSync({ id, baseline: await baselineFor(heads, remoteRecord), expectedBaseline: null, expected: null, record: remoteRecord });
      continue;
    }
    const localChanged = localHash !== baseline.localFingerprint, remoteChanged = !same(hashes(heads), baseline.heads);
    if (localChanged && remoteChanged) { conflicts.push({ id, local: record, heads, baseline }); continue; }
    if (localChanged) {
      const written = await writeEntry(token, id, heads, record);
      await personalStore.applyExplorationSync({ id, baseline: await baselineFor(written.heads, record), expectedBaseline: baseline });
    } else if (remoteChanged) await personalStore.applyExplorationSync({ id, baseline: await baselineFor(heads, remoteRecord), expectedBaseline: baseline, expected: record, record: remoteRecord });
  }
  const fresh = await personalStore.explorationSyncState();
  publish({ phase: conflicts.length ? 'conflict' : 'ready', count: fresh.records.length, conflicts });
}
let pending: Promise<void> | undefined, queued = false, resolving = false;
export function syncExplorations() {
  queued = true;
  if (resolving) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    let attempts = 0;
    do {
      queued = false;
      publish({ ...state, phase: 'loading' });
      try { await reconcile(); }
      catch (error) {
        if ((error instanceof ConflictError || error instanceof Error && error.name === 'WorkspaceConflict') && attempts++ < 3) { queued = true; continue; }
        publish({ phase: 'offline', count: state.count, conflicts: [], message: error instanceof Error && error.name !== 'AbortError' ? error.message : '项目文件服务暂不可用，浏览器中的探索仍然保留。' });
      }
    } while (queued);
  })().finally(() => { pending = undefined; });
  return pending;
}

/** Explicit conflict resolution preserves the local alternative in file history first. */
export async function resolveExplorationFile(conflict: ExplorationFileConflict, selection: 'local' | string) {
  await pending;
  if (resolving) throw Error('另一个版本选择正在保存，请稍后重试。');
  resolving = true;
  try {
    const token = await connection(), fresh = await personalStore.explorationSyncState();
    if (fresh.paused) throw Error('项目同步已暂停，请先恢复再比较。');
    const current = fresh.records.find(record => record.id === conflict.id) ?? null;
    if (!same(current, conflict.local) || !same(fresh.baselines[conflict.id] ?? null, conflict.baseline)) throw Error('浏览器中的探索已经改变，请重新比较后选择。');
    let heads = (await readWorkspace(token)).explorations.find(entry => entry.explorationId === conflict.id)?.heads ?? [];
    if (!same(hashes(heads), hashes(conflict.heads))) throw Error('项目版本已经改变，请重新比较后选择。');
    const chosen = selection === 'local' ? current : conflict.heads.find(head => head.hash === selection)?.record;
    if (chosen === undefined) throw Error('所选项目版本已经不可用。');
    // The browser-only alternative must reach immutable history before replacing it.
    if (!heads.some(head => same(head.record, current))) heads = (await writeEntry(token, conflict.id, heads, current)).heads;
    const written = await writeEntry(token, conflict.id, heads, chosen);
    await personalStore.applyExplorationSync({ id: conflict.id, expected: current, expectedBaseline: conflict.baseline, record: chosen, baseline: await baselineFor(written.heads, chosen) });
  } finally { resolving = false; await syncExplorations(); }
}

export function startExplorationFileSync() {
  const kick = () => { void syncExplorations(); };
  const unsubscribe = personalStore.subscribe(store => { if (!store || store === 'explorations') kick(); });
  window.addEventListener('focus', kick); window.addEventListener('online', kick);
  const timer = setInterval(kick, 15000); kick();
  return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', kick); window.removeEventListener('online', kick); };
}
