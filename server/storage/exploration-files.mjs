import { readFile, readdir, lstat, mkdir, open, link, unlink } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalExplorationSync, explorationRevisionData, validateExplorationRevision, validateExplorationSyncWrite, EXPLORATION_SYNC_FORMAT, EXPLORATION_SYNC_LIMITS } from '../../shared/exploration-sync.mjs';
import { validateResearchState } from '../../shared/research-contract.mjs';
import { verifyTaskBrief } from '../../shared/research-artifacts.mjs';
import { isSafeExternalUrl } from '../../shared/content-policy.mjs';

const schema = JSON.parse(await readFile(new URL('../../schemas/personal-backup.schema.json', import.meta.url), 'utf8'));
const validateBase = new Ajv2020({ strict: true }).compile({ $schema: schema.$schema, $defs: schema.$defs, $ref: '#/$defs/exploration' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hashFile = /^([0-9a-f]{64})\.json$/;
const temporaryFile = /^\.[0-9a-f]{64}\.[0-9a-f-]{36}\.tmp$/;
export const MAX_SYNC_REQUEST_BYTES = EXPLORATION_SYNC_LIMITS.recordBytes + 32 * 1024;
const pending = new Map();
export class ExplorationSyncError extends Error {
  constructor(message, status = 400, code = 'workspace_invalid') { super(message); this.name = 'ExplorationSyncError'; this.status = status; this.code = code; }
}
const fail = (message, status, code) => { throw new ExplorationSyncError(message, status, code); };
const invalidFiles = () => fail('项目探索文件不完整或格式有误。已有浏览器记录未覆盖，请先解决 Git 文件冲突或恢复缺失的版本。', 422, 'workspace_invalid_files');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const digest = revision => createHash('sha256').update(canonicalExplorationSync(revision)).digest('hex');
const same = (a, b) => canonicalExplorationSync(a) === canonicalExplorationSync(b);

function semantic(value) {
  if (Array.isArray(value)) { value.forEach(semantic); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['createdAt', 'updatedAt'].includes(key)) {
      const time = typeof item === 'string' && Number.isFinite(Date.parse(item)) ? new Date(item).toISOString() : '';
      if (!time || time !== item && time.replace('.000Z', 'Z') !== item) throw Error('Invalid time');
    }
    if (key === 'url' && !isSafeExternalUrl(item)) throw Error('Invalid source URL');
    if (key === 'identity' && (typeof item !== 'string' || !item.trim() || /^(?:javascript|data|file):/i.test(item) || /^https?:/i.test(item) && !isSafeExternalUrl(item))) throw Error('Invalid source identity');
    semantic(item);
  }
  if (value.createdAt && value.updatedAt && Date.parse(value.updatedAt) < Date.parse(value.createdAt)) throw Error('Invalid timestamps');
  if (value.origin === 'reader' && value.seedRef || value.origin === 'adapted-editorial' && !value.seedRef) throw Error('Invalid origin');
  if (value.kind === 'read-guide' && !value.target) throw Error('Missing reading target');
  if (Array.isArray(value.evidence) && new Set(value.evidence.map(item => item.id)).size !== value.evidence.length) throw Error('Duplicate evidence');
}
async function validateRecord(record) {
  if (record === null) return;
  const { research, ...base } = record;
  if (!validateBase(base)) throw Error('Invalid exploration');
  semantic(base);
  if (Object.hasOwn(record, 'research')) validateResearchState(research);
  for (const artifact of research?.artifacts ?? []) for (const task of artifact.taskVersions) await verifyTaskBrief(task);
  if (bytes(record) > EXPLORATION_SYNC_LIMITS.recordBytes) throw Error('Exploration too large');
}
async function stat(path) { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }

/** Immutable, Git-mergeable snapshots. The local service never runs Git itself. */
export class ExplorationFileStore {
  constructor(directory, { root = process.cwd(), maxBytes = EXPLORATION_SYNC_LIMITS.workspaceBytes, maxFiles = EXPLORATION_SYNC_LIMITS.files } = {}) {
    this.root = resolve(root); this.directory = resolve(directory); this.maxBytes = maxBytes; this.maxFiles = maxFiles;
    const part = relative(this.root, this.directory);
    if (!part || part === '..' || part.startsWith(`..${sep}`) || resolve(this.root, part) !== this.directory) throw new ExplorationSyncError('探索保存目录必须位于当前项目中。');
  }
  async locked(work) {
    const previous = pending.get(this.directory) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(work);
    pending.set(this.directory, result);
    try { return await result; } finally { if (pending.get(this.directory) === result) pending.delete(this.directory); }
  }
  async checkDirectory(create = false) {
    let current = this.root;
    const base = await stat(current);
    if (!base || base.isSymbolicLink() || !base.isDirectory()) invalidFiles();
    for (const part of relative(this.root, this.directory).split(sep)) {
      current = join(current, part);
      let info = await stat(current);
      if (!info && create) { try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; } info = await lstat(current); }
      if (!info) return false;
      if (info.isSymbolicLink() || !info.isDirectory()) invalidFiles();
    }
    return true;
  }
  async readAll() {
    if (!await this.checkDirectory()) return { groups: new Map(), totalBytes: 0, fileCount: 0 };
    const groups = new Map(); let totalBytes = 0, fileCount = 0;
    const entries = await readdir(this.directory, { withFileTypes: true });
    if (entries.length > this.maxFiles + 3) fail('项目探索文件超过容量上限，未载入或改写。', 413, 'workspace_capacity');
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.gitkeep', '.gitignore', 'README.md'].includes(entry.name)) continue;
      if (!uuid.test(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) invalidFiles();
      const directory = join(this.directory, entry.name), nodes = new Map();
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (temporaryFile.test(file.name) && file.isFile()) continue;
        const match = hashFile.exec(file.name);
        if (!match || file.isSymbolicLink() || !file.isFile()) invalidFiles();
        const path = join(directory, file.name), info = await lstat(path);
        if (info.isSymbolicLink() || !info.isFile()) invalidFiles();
        totalBytes += info.size; fileCount++;
        if (info.size > MAX_SYNC_REQUEST_BYTES || totalBytes > this.maxBytes || fileCount > this.maxFiles) fail('项目探索文件超过容量上限，未载入或改写。', 413, 'workspace_capacity');
        let revision;
        try {
          revision = JSON.parse(await readFile(path, 'utf8'));
          validateExplorationRevision(revision); await validateRecord(revision.record);
          if (revision.explorationId !== entry.name || digest(revision) !== match[1]) throw Error('Hash mismatch');
        } catch { invalidFiles(); }
        nodes.set(match[1], revision);
      }
      if (!nodes.size) continue;
      const referenced = new Set();
      for (const [hash, node] of nodes) for (const parent of node.parents) {
        if (parent === hash || !nodes.has(parent)) invalidFiles();
        referenced.add(parent);
      }
      // Iterative topological validation covers every component without using
      // the JS call stack for a long, otherwise valid research history.
      const remaining = new Map(), children = new Map(), ready = [];
      for (const [hash, node] of nodes) {
        remaining.set(hash, node.parents.length); if (!node.parents.length) ready.push(hash);
        for (const parent of node.parents) { const list = children.get(parent) ?? []; list.push(hash); children.set(parent, list); }
      }
      let visited = 0;
      while (ready.length) {
        const hash = ready.pop(); visited++;
        for (const child of children.get(hash) ?? []) { const count = remaining.get(child) - 1; remaining.set(child, count); if (count === 0) ready.push(child); }
      }
      if (visited !== nodes.size) invalidFiles();
      const heads = [...nodes].filter(([hash]) => !referenced.has(hash)).map(([hash, node]) => ({ hash, parents: node.parents, record: node.record })).sort((a, b) => a.hash.localeCompare(b.hash));
      if (!heads.length || heads.length > EXPLORATION_SYNC_LIMITS.parents) invalidFiles();
      groups.set(entry.name, { nodes, entry: { explorationId: entry.name, heads, revisionHashes: [...nodes.keys()].sort() } });
    }
    return { groups, totalBytes, fileCount };
  }
  read() { return this.locked(async () => ({ format: EXPLORATION_SYNC_FORMAT, schemaVersion: 1, explorations: [...(await this.readAll()).groups.values()].map(group => group.entry) })); }
  write(input) {
    return this.locked(async () => {
      let revision;
      try { validateExplorationSyncWrite(input); await validateRecord(input.record); revision = explorationRevisionData(input); }
      catch { fail('探索内容未通过完整性校验，项目文件未改写。'); }
      const hash = digest(revision), snapshot = await this.readAll(), group = snapshot.groups.get(input.explorationId);
      if (group?.nodes.has(hash)) return group.entry; // A repeated completed request is harmless.
      const current = group?.entry.heads.map(head => head.hash).sort() ?? [];
      if (!same(current, revision.parents)) fail('项目探索已被其他页面或 Git 更新，请重新载入并比较后再保存。', 409, 'workspace_conflict');
      const text = canonicalExplorationSync(revision) + '\n';
      if (snapshot.fileCount + 1 > this.maxFiles || snapshot.totalBytes + Buffer.byteLength(text) > this.maxBytes) fail('项目探索文件超过容量上限，原记录仍保留。', 413, 'workspace_capacity');
      await this.checkDirectory(true);
      const directory = join(this.directory, input.explorationId);
      try { await mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) invalidFiles();
      const temporary = join(directory, `.${hash}.${randomUUID()}.tmp`), target = join(directory, `${hash}.json`);
      let handle;
      try {
        handle = await open(temporary, 'wx', 0o600); await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = null;
        // link publishes the complete file atomically and refuses an existing target.
        try { await link(temporary, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      } finally { if (handle) await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
      // A Git pull racing with a save may introduce a second head, which is
      // returned as a conflict branch rather than discarded or timestamp-ranked.
      return (await this.readAll()).groups.get(input.explorationId).entry;
    });
  }
}
