import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { object, reject, isUuid, isId, isRevision, isHash, isTime, isText, validateSource, validateContext } from './validation.mjs';

const now = () => new Date().toISOString();
const BACKUP_BYTES = 16 * 1024 * 1024;
const TURN_BYTES = 2 * 1024 * 1024;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
export const requestHash = request => createHash('sha256').update(JSON.stringify(Object.keys(request).sort().map(key => [key, request[key]]))).digest('hex');
const parse = row => row ? JSON.parse(row.data) : undefined;

export function validateBackup(value) {
  object(value, ['format', 'schemaVersion', 'exportedAt', 'conversations', 'turns']);
  if (value.format !== 'paperdesk-ai-backup' || ![1, 2].includes(value.schemaVersion) || !isTime(value.exportedAt)
    || !Array.isArray(value.conversations) || value.conversations.length > 2000 || !Array.isArray(value.turns) || value.turns.length > 10000) reject('AI 备份格式或版本无效。');
  const conversations = new Map(), ids = new Set(), requests = new Set();
  for (const conversation of value.conversations) {
    object(conversation, ['id', 'title', 'guideId', 'revision', 'bodySha256', 'createdAt', 'updatedAt']);
    if (!isUuid(conversation.id) || conversations.has(conversation.id) || !isText(conversation.title, 100, 1) || !isId(conversation.guideId)
      || !isRevision(conversation.revision) || !isHash(conversation.bodySha256) || !isTime(conversation.createdAt) || !isTime(conversation.updatedAt)) reject('备份包含无效或重复会话。');
    conversations.set(conversation.id, conversation);
  }
  for (const turn of value.turns) {
    object(turn, ['id', 'conversationId', 'requestId', 'requestHash', 'question', 'answer', 'status', 'sources', 'context', 'createdAt']);
    if (!isUuid(turn.id) || ids.has(turn.id) || !isUuid(turn.requestId) || requests.has(turn.requestId) || !isHash(turn.requestHash)
      || !isText(turn.question, 6000, 1) || !isText(turn.answer, 40000) || !['complete', 'interrupted', 'error'].includes(turn.status)
      || !Array.isArray(turn.sources) || turn.sources.length > 64 || !isTime(turn.createdAt)) reject('备份包含无效或重复问答。');
    const conversation = conversations.get(turn.conversationId);
    validateContext(turn.context);
    if (value.schemaVersion === 1 && (Object.hasOwn(turn.context, 'provider') || Object.hasOwn(turn.context, 'fallback'))) reject('回答服务来源需要 AI 备份版本 2。');
    if (!conversation || conversation.guideId !== turn.context.guideId || conversation.revision !== turn.context.revision || conversation.bodySha256 !== turn.context.bodySha256) reject('备份的会话与文章版本不一致。');
    const sourceIds = new Set();
    for (const source of turn.sources) { validateSource(source); if (sourceIds.has(source.id)) reject('备份包含重复来源编号。'); sourceIds.add(source.id); }
    if (!turn.sources.some(source => source.kind === 'guide' && source.guideId === turn.context.guideId && source.revision === turn.context.revision && source.unitId === turn.context.unitId)) reject('备份缺少当前文章章节的来源快照。');
    ids.add(turn.id); requests.add(turn.requestId);
  }
  const turnMap = new Map(value.turns.map((turn, index) => [turn.id, { turn, index }]));
  for (const [index, turn] of value.turns.entries()) for (const id of turn.context.historyTurnIds) {
    const prior = turnMap.get(id);
    if (!prior || prior.index >= index || prior.turn.conversationId !== turn.conversationId || prior.turn.status !== 'complete' || prior.turn.createdAt > turn.createdAt) reject('备份包含无效会话历史引用。');
  }
  return value;
}

export class AiStore {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); reject('AI 数据库版本较新，请使用匹配的软件版本。', 503); }
    this.db.exec(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_conversation ON turns(conversation_id); PRAGMA user_version = 1;`);
    this.transaction(() => {
      for (const row of this.db.prepare('SELECT data FROM turns').all()) {
        const turn = parse(row);
        if (turn.status === 'running') { turn.status = 'interrupted'; this.writeTurn(turn); }
      }
    });
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  writeTurn(turn) { this.db.prepare('UPDATE turns SET data = ? WHERE id = ?').run(JSON.stringify(turn), turn.id); }
  conversation(id) { return parse(this.db.prepare('SELECT data FROM conversations WHERE id = ?').get(id)); }
  list(guideId, revision) {
    return this.db.prepare('SELECT data FROM conversations').all().map(parse)
      .filter(item => item.guideId === guideId && item.revision === revision).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  turns(id) { return this.db.prepare('SELECT data FROM turns WHERE conversation_id = ? ORDER BY rowid').all(id).map(parse); }
  byRequest(requestId) { return parse(this.db.prepare('SELECT data FROM turns WHERE request_id = ?').get(requestId)); }
  turn(id) { return parse(this.db.prepare('SELECT data FROM turns WHERE id = ?').get(id)); }
  snapshot() {
    return { format: 'paperdesk-ai-backup', schemaVersion: 2, exportedAt: now(), conversations: this.db.prepare('SELECT data FROM conversations ORDER BY rowid').all().map(parse),
      turns: this.db.prepare('SELECT data FROM turns ORDER BY rowid').all().map(parse) };
  }
  reservedBytes(snapshot) {
    return bytes(snapshot) + snapshot.turns.filter(turn => turn.status === 'running').reduce((sum, turn) => sum + Math.max(0, TURN_BYTES - bytes(turn)), 0);
  }
  begin(request, context, sources) {
    validateContext(context);
    for (const source of sources) validateSource(source);
    return this.transaction(() => {
      const existing = this.byRequest(request.requestId);
      if (existing) {
        if (existing.requestHash !== requestHash(request)) reject('请求编号已用于不同的问题，请重新发送。', 409);
        return { turn: existing, replay: true };
      }
      // Every active turn owns a bounded reservation, keeping the complete database exportable.
      // Includes room for the new conversation envelope and backup separators.
      if (this.reservedBytes(this.snapshot()) + TURN_BYTES + 4096 > BACKUP_BYTES) reject('AI 记录接近 16 MiB 容量。请先完整导出，再整理旧会话后继续。', 413);
      let conversation = request.conversationId ? this.conversation(request.conversationId) : undefined;
      if (request.conversationId && !conversation) reject('会话不存在，请开始新对话。', 404);
      if (conversation && (conversation.guideId !== request.guideId || conversation.revision !== request.revision || conversation.bodySha256 !== request.bodySha256)) reject('会话绑定了不同文章版本，请开始新对话。', 409);
      if (!conversation) {
        if (this.db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n >= 2000) reject('AI 会话已达到 2000 个，请先导出并整理。', 409);
        conversation = { id: randomUUID(), title: request.question.trim().slice(0, 100), guideId: request.guideId, revision: request.revision, bodySha256: request.bodySha256, createdAt: now(), updatedAt: now() };
        this.db.prepare('INSERT INTO conversations (id, data) VALUES (?, ?)').run(conversation.id, JSON.stringify(conversation));
      }
      if (this.turns(conversation.id).some(turn => turn.status === 'running')) reject('当前会话正在回答，请等待或停止后再试。', 409);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM turns').get().n >= 10000) reject('AI 问答达到本地容量上限，请先导出并整理。', 409);
      const turn = { id: randomUUID(), conversationId: conversation.id, requestId: request.requestId, requestHash: requestHash(request), question: request.question,
        answer: '', status: 'running', sources, context, createdAt: now() };
      if (bytes(turn) > TURN_BYTES) reject('初始问答快照超过 2 MiB，请缩小问题范围。', 413);
      this.db.prepare('INSERT INTO turns (id, conversation_id, request_id, data) VALUES (?, ?, ?, ?)').run(turn.id, conversation.id, turn.requestId, JSON.stringify(turn));
      conversation.updatedAt = turn.createdAt;
      this.db.prepare('UPDATE conversations SET data = ? WHERE id = ?').run(JSON.stringify(conversation), conversation.id);
      return { turn, replay: false };
    });
  }
  save(turn) {
    if (bytes(turn) > TURN_BYTES) reject('本轮问答快照超过 2 MiB，已停止继续生成。', 413);
    this.transaction(() => {
      const snapshot = this.snapshot();
      snapshot.turns = snapshot.turns.map(item => item.id === turn.id ? turn : item);
      if (this.reservedBytes(snapshot) > BACKUP_BYTES) reject('AI 记录达到备份容量上限，已停止继续生成。', 413);
      this.writeTurn(turn);
    });
  }
  delete(id) {
    return this.transaction(() => {
      if (this.turns(id).some(turn => turn.status === 'running')) reject('回答期间不能删除会话，请先停止。', 409);
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    });
  }
  export() {
    const result = this.snapshot();
    result.turns = result.turns.map(turn => turn.status === 'running' ? { ...turn, status: 'interrupted' } : turn);
    return result;
  }
  import(value) {
    validateBackup(value);
    return this.transaction(() => {
      // Refuse the entire restore on any collision: imports never overwrite local text.
      for (const conversation of value.conversations) if (this.conversation(conversation.id)) reject('备份中的会话 ID 已存在；未导入任何记录。', 409);
      for (const turn of value.turns) if (this.byRequest(turn.requestId) || this.db.prepare('SELECT id FROM turns WHERE id = ?').get(turn.id)) reject('备份中的问答 ID 已存在；未导入任何记录。', 409);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n + value.conversations.length > 2000
        || this.db.prepare('SELECT COUNT(*) AS n FROM turns').get().n + value.turns.length > 10000) reject('导入会超过本地 AI 记录容量。', 413);
      const merged = this.snapshot();
      merged.conversations.push(...value.conversations); merged.turns.push(...value.turns);
      if (value.turns.some(turn => bytes(turn) > TURN_BYTES) || this.reservedBytes(merged) > BACKUP_BYTES - 4096) reject('导入将超过可完整备份的 16 MiB 容量；未导入任何记录。', 413);
      for (const conversation of value.conversations) this.db.prepare('INSERT INTO conversations (id, data) VALUES (?, ?)').run(conversation.id, JSON.stringify(conversation));
      for (const turn of value.turns) this.db.prepare('INSERT INTO turns (id, conversation_id, request_id, data) VALUES (?, ?, ?, ?)').run(turn.id, turn.conversationId, turn.requestId, JSON.stringify(turn));
      return { conversations: value.conversations.length, turns: value.turns.length };
    });
  }
  close() { this.db.close(); }
}
