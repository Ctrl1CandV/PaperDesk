// Browser and local-file protocol. No provider state, credentials or other stores.
export const EXPLORATION_SYNC_FORMAT = 'paperdesk-exploration-workspace';
export const EXPLORATION_REVISION_FORMAT = 'paperdesk-exploration-revision';
export const EXPLORATION_SYNC_LIMITS = Object.freeze({ recordBytes: 8 * 1024 * 1024, workspaceBytes: 128 * 1024 * 1024, files: 20000, parents: 128 });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const assert = condition => { if (!condition) throw Error('探索同步数据格式无效。'); };
function keys(value, required) { assert(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key))); }
function parents(value) { assert(Array.isArray(value) && value.length <= EXPLORATION_SYNC_LIMITS.parents && value.every(hash) && new Set(value).size === value.length); }
export function canonicalExplorationSync(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalExplorationSync).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalExplorationSync(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateExplorationSyncWrite(value) {
  keys(value, ['explorationId', 'parents', 'record']);
  assert(uuid(value.explorationId)); parents(value.parents);
  assert(value.record === null || value.record && typeof value.record === 'object' && !Array.isArray(value.record) && value.record.id === value.explorationId);
  assert(new TextEncoder().encode(JSON.stringify(value.record)).byteLength <= EXPLORATION_SYNC_LIMITS.recordBytes);
  return value;
}
export function explorationRevisionData(input) {
  validateExplorationSyncWrite(input);
  return { format: EXPLORATION_REVISION_FORMAT, schemaVersion: 1, explorationId: input.explorationId, parents: [...input.parents].sort(), record: input.record };
}
export function validateExplorationRevision(value) {
  keys(value, ['format', 'schemaVersion', 'explorationId', 'parents', 'record']);
  assert(value.format === EXPLORATION_REVISION_FORMAT && value.schemaVersion === 1);
  validateExplorationSyncWrite({ explorationId: value.explorationId, parents: value.parents, record: value.record });
  assert(value.parents.every((parent, index) => index === 0 || value.parents[index - 1] < parent));
  return value;
}
export async function explorationRevisionHash(value) {
  validateExplorationRevision(value);
  const bytes = new TextEncoder().encode(canonicalExplorationSync(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validateExplorationWorkspace(value) {
  keys(value, ['format', 'schemaVersion', 'explorations']);
  assert(value.format === EXPLORATION_SYNC_FORMAT && value.schemaVersion === 1 && Array.isArray(value.explorations) && value.explorations.length <= EXPLORATION_SYNC_LIMITS.files);
  const ids = new Set();
  for (const entry of value.explorations) {
    keys(entry, ['explorationId', 'heads', 'revisionHashes']);
    assert(uuid(entry.explorationId) && !ids.has(entry.explorationId) && Array.isArray(entry.heads) && entry.heads.length > 0 && entry.heads.length <= EXPLORATION_SYNC_LIMITS.parents); ids.add(entry.explorationId);
    assert(Array.isArray(entry.revisionHashes) && entry.revisionHashes.length > 0 && entry.revisionHashes.length <= EXPLORATION_SYNC_LIMITS.files && entry.revisionHashes.every((item, index) => hash(item) && (index === 0 || entry.revisionHashes[index - 1] < item)));
    const revisions = new Set(entry.revisionHashes);
    const hashes = new Set();
    for (const head of entry.heads) {
      keys(head, ['hash', 'parents', 'record']); assert(hash(head.hash) && !hashes.has(head.hash) && revisions.has(head.hash)); hashes.add(head.hash);
      validateExplorationSyncWrite({ explorationId: entry.explorationId, parents: head.parents, record: head.record });
      assert(head.parents.every(parent => parent !== head.hash && revisions.has(parent)));
    }
  }
  return value;
}
