import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiStore, AI_STORE_LIMITS, validateBackup, validateHistory } from './ai-store.mjs';
import { object, reject, isHash, isTime, validateContext } from '../http/validation.mjs';

const LINE_BYTES = AI_STORE_LIMITS.turnBytes + 4096;
const line = value => JSON.stringify(value) + '\n';
const parsed = rows => (function* () { for (const row of rows) yield JSON.parse(row.data); })();
function removeTemporary(file) {
  // Only this operation's generated files are removed, never a directory or user backup.
  for (const suffix of ['', '-wal', '-shm']) { try { unlinkSync(file + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

export async function* exportBackupStream(store, signal) {
  signal?.throwIfAborted();
  const file = store.createSnapshotFile();
  let snapshot;
  try {
    snapshot = new DatabaseSync(file, { readOnly: true });
    const totals = snapshot.prepare('SELECT conversations, turns FROM storage_totals WHERE id = 1').get();
    const manifest = { type: 'manifest', format: 'paperdesk-ai-backup', schemaVersion: 3,
      exportedAt: new Date().toISOString(), counts: { conversations: totals.conversations, turns: totals.turns } };
    const hash = createHash('sha256');
    const first = line(manifest); hash.update(first); yield first;
    let sequence = 0;
    for (const [table, kind] of [['conversations', 'conversation'], ['turns', 'turn']]) {
      for (const item of parsed(snapshot.prepare('SELECT data FROM ' + table + ' ORDER BY rowid').iterate())) {
        signal?.throwIfAborted();
        const data = kind === 'turn' && item.status === 'running' ? { ...item, status: 'interrupted' } : item;
        const record = line({ type: 'record', sequence: ++sequence, kind, data });
        if (Buffer.byteLength(record) > LINE_BYTES) reject('单条问答超过备份分块预算。', 413);
        hash.update(record); yield record;
      }
    }
    yield line({ type: 'complete', records: sequence, sha256: hash.digest('hex') });
  } finally { snapshot?.close(); removeTemporary(file); }
}

// Staging is a separate SQLite database. No live record becomes visible before all
// lines, hashes, counts, identities and historical references have been checked.
export async function importBackupStream(store, input, signal, { preview = false } = {}) {
  mkdirSync(store.temporaryDirectory, { recursive: true });
  const file = resolve(store.temporaryDirectory, 'ai-import-' + randomUUID() + '.sqlite');
  let staged;
  try {
    staged = new AiStore(file, { capacityBytes: store.capacityBytes, minimumFreeBytes: store.minimumFreeBytes });
    staged.db.exec('BEGIN IMMEDIATE');
    const decoder = new TextDecoder('utf-8', { fatal: true }), hash = createHash('sha256');
    let buffer = '', received = 0, manifest, complete = false, sequence = 0, turnPhase = false;
    const counts = { conversations: 0, turns: 0 };
    const receive = raw => {
      if (Buffer.byteLength(raw) > LINE_BYTES) reject('备份单条记录超过大小限制。', 413);
      if (complete || !raw) reject('备份包含多余或空白分块。');
      let value; try { value = JSON.parse(raw); } catch { reject('备份包含无效 JSON 分块。'); }
      if (!manifest) {
        object(value, ['type', 'format', 'schemaVersion', 'exportedAt', 'counts']);
        object(value.counts, ['conversations', 'turns']);
        if (value.type !== 'manifest' || value.format !== 'paperdesk-ai-backup' || value.schemaVersion !== 3 || !isTime(value.exportedAt)
          || !Number.isSafeInteger(value.counts.conversations) || value.counts.conversations < 0 || value.counts.conversations > AI_STORE_LIMITS.conversations
          || !Number.isSafeInteger(value.counts.turns) || value.counts.turns < 0 || value.counts.turns > AI_STORE_LIMITS.turns) reject('AI 分块备份格式或版本无效。');
        manifest = value; hash.update(raw + '\n'); return;
      }
      if (value.type === 'complete') {
        object(value, ['type', 'records', 'sha256']);
        if (value.records !== sequence || !isHash(value.sha256) || value.sha256 !== hash.digest('hex')
          || counts.conversations !== manifest.counts.conversations || counts.turns !== manifest.counts.turns) reject('备份分块缺失、数量或校验和不符；未导入任何记录。');
        complete = true; return;
      }
      object(value, ['type', 'sequence', 'kind', 'data']);
      if (value.type !== 'record' || value.sequence !== sequence + 1 || !['conversation', 'turn'].includes(value.kind)) reject('备份分块顺序无效或重复。');
      const item = value.data;
      if (value.kind === 'conversation') {
        if (turnPhase || ++counts.conversations > manifest.counts.conversations) reject('备份会话分块顺序或数量无效。');
        validateBackup({ format: 'paperdesk-ai-backup', schemaVersion: 3, exportedAt: manifest.exportedAt, conversations: [item], turns: [] });
        if (staged.conversation(item.id)) reject('备份包含重复会话。');
        staged.insertConversation(item);
      } else {
        turnPhase = true;
        if (++counts.turns > manifest.counts.turns) reject('备份问答数量无效。');
        const conversation = staged.conversation(item?.conversationId);
        if (!conversation) reject('备份问答没有对应的会话。');
        validateContext(item.context);
        validateBackup({ format: 'paperdesk-ai-backup', schemaVersion: 3, exportedAt: manifest.exportedAt, conversations: [conversation],
          turns: [{ ...item, context: { ...item.context, historyTurnIds: [] } }] });
        // Validate the original context too; do not allow a missing/malformed history list.
        if (!Array.isArray(item.context.historyTurnIds) || item.context.historyTurnIds.length > 6) reject('备份历史引用无效。');
        validateHistory(item, id => staged.turn(id));
        if (staged.turn(item.id) || staged.byRequest(item.requestId)) reject('备份包含重复问答。');
        staged.insertTurn(item);
      }
      staged.checkCapacity(); sequence++; hash.update(raw + '\n');
    };
    for await (const chunk of input) {
      signal?.throwIfAborted();
      received += Buffer.byteLength(chunk);
      if (received > store.capacityBytes * 2) reject('备份超过当前运行容量的传输预算。', 413);
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) { receive(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
      if (Buffer.byteLength(buffer) > LINE_BYTES) reject('备份单条记录超过大小限制。', 413);
    }
    buffer += decoder.decode();
    if (buffer) receive(buffer);
    if (!complete) reject('备份没有完整结束清单；未导入任何记录。');
    signal?.throwIfAborted();
    staged.db.exec('COMMIT');
    if (preview) return { counts, schemaVersion: 3, exportedAt: manifest.exportedAt };
    return { counts: store.importRecords(parsed(staged.db.prepare('SELECT data FROM conversations ORDER BY rowid').iterate()),
      parsed(staged.db.prepare('SELECT data FROM turns ORDER BY rowid').iterate()), counts, signal) };
  } finally { staged?.close(); removeTemporary(file); }
}
