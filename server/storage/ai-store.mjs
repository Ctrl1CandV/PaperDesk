import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { object, reject, isUuid, isId, isRevision, isHash, isTime, isText, validateSource, validateContext, validateConversationScope } from '../http/validation.mjs';

const now = () => new Date().toISOString();
const BACKUP_BYTES = 16 * 1024 * 1024;
const TURN_BYTES = 2 * 1024 * 1024;
export const AI_STORE_LIMITS = Object.freeze({ legacyBackupBytes: BACKUP_BYTES, turnBytes: TURN_BYTES, capacityBytes: 512 * 1024 * 1024, minimumFreeBytes: 32 * 1024 * 1024, conversations: 100000, turns: 1000000 });
const bytes = value => Buffer.byteLength(JSON.stringify(value));
export const requestHash = request => createHash('sha256').update(JSON.stringify(Object.keys(request).sort().map(key => [key, request[key]]))).digest('hex');
const parse = row => row ? JSON.parse(row.data) : undefined;
const turnSummary = turn => JSON.stringify({ id: turn.id, question: turn.question.slice(0, 300), answer: turn.answer.slice(0, 800), status: turn.status, createdAt: turn.createdAt,
  sources: [], context: { provider: turn.context.provider, model: turn.context.model }, summaryOnly: true, sourceCount: turn.sources.length });

// Query words and Chinese bigrams tolerate natural-language spacing and phrasing
// without reading any other topic or relying on an external embedding service.
export function topicSearchTerms(query) {
  const normalized=query.toLocaleLowerCase().trim();
  const ignored=new Set(['的','了','和','与','在','是','我','我们','如何','什么','是否','这个','那个','可以','the','a','an','and','or','of','to','how','what']);
  const segments=[...new Intl.Segmenter('zh',{granularity:'word'}).segment(normalized)].filter(item=>item.isWordLike).map(item=>item.segment);
  const bigrams=(normalized.match(/\p{Script=Han}+/gu)??[]).flatMap(run=>{const chars=Array.from(run);return chars.slice(0,-1).map((char,index)=>char+chars[index+1]);});
  return [...new Set([...segments,...bigrams])].filter(term=>!ignored.has(term)&&term.length>1).slice(0,24);
}

export function validateBackup(value) {
  object(value, ['format', 'schemaVersion', 'exportedAt', 'conversations', 'turns']);
  if (value.format !== 'paperdesk-ai-backup' || ![1, 2, 3, 4].includes(value.schemaVersion) || !isTime(value.exportedAt)
    || !Array.isArray(value.conversations) || value.conversations.length > AI_STORE_LIMITS.conversations || !Array.isArray(value.turns) || value.turns.length > AI_STORE_LIMITS.turns) reject('AI 备份格式或版本无效。');
  const conversations = new Map(), ids = new Set(), requests = new Set();
  for (const conversation of value.conversations) {
    object(conversation, ['id', 'title', 'guideId', 'revision', 'bodySha256', 'createdAt', 'updatedAt'], ['conversationScope']);
    const research = conversation.conversationScope?.kind === 'exploration';
    if (conversation.conversationScope !== undefined) validateConversationScope(conversation.conversationScope);
    if (conversation.conversationScope?.kind === 'guide' && ['guideId','revision','bodySha256'].some(key=>conversation.conversationScope[key] !== conversation[key])) reject('会话的导读范围不一致。');
    if (research && (value.schemaVersion < 4 || conversation.guideId !== null || conversation.revision !== null || conversation.bodySha256 !== null)) reject('研究会话需要独立范围及备份版本 4。');
    if (!isUuid(conversation.id) || conversations.has(conversation.id) || !isText(conversation.title, 100, 1) || !research && (!isId(conversation.guideId)
      || !isRevision(conversation.revision) || !isHash(conversation.bodySha256)) || !isTime(conversation.createdAt) || !isTime(conversation.updatedAt)) reject('备份包含无效或重复会话。');
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
    if (value.schemaVersion < 4 && turn.context.researchSnapshot) reject('研究快照需要 AI 备份版本 4。');
    for (const proposal of turn.context.researchProposals ?? []) {
      if (proposal.sourceTurnId !== turn.id) reject('研究提案来源问答不一致。');
      for (const ref of proposal.evidenceRefs) if (ref.turnId !== turn.id || !turn.sources.some(source => includesEvidence(source, ref.source))) reject('研究提案证据不属于本轮。');
      for (const change of proposal.changes) if (change.kind === 'add-decision' && JSON.stringify(change.decision.evidenceRefs) !== JSON.stringify(proposal.evidenceRefs)) reject('研究决定证据与提案不一致。');
    }
    if (value.schemaVersion < 3 && needsBackupV3(turn)) reject('原文与检索记录需要 AI 备份版本 3。');
    if (bytes(turn) > TURN_BYTES) reject('问答快照超过 2 MiB。', 413);
    if (!conversation || !sameScope(conversation, turn.context)) reject('备份的会话与文章版本不一致。');
    const sourceIds = new Set();
    for (const source of turn.sources) { validateSource(source); if (sourceIds.has(source.id)) reject('备份包含重复来源编号。'); sourceIds.add(source.id); }
    if (turn.context.guideId !== null && !turn.sources.some(source => source.kind === 'guide' && source.guideId === turn.context.guideId && source.revision === turn.context.revision && source.unitId === turn.context.unitId)) reject('备份缺少当前文章章节的来源快照。');
    ids.add(turn.id); requests.add(turn.requestId);
  }
  const turnMap = new Map(value.turns.map((turn, index) => [turn.id, { turn, index }]));
  for (const [index, turn] of value.turns.entries()) for (const id of turn.context.historyTurnIds) {
    const prior = turnMap.get(id);
    if (!prior || prior.index >= index || prior.turn.conversationId !== turn.conversationId || prior.turn.status !== 'complete' || prior.turn.createdAt > turn.createdAt) reject('备份包含无效会话历史引用。');
  }
  return value;
}

export function needsBackupV3(turn) {
  return turn.sources.some(source => source.kind === 'original') || ['catalogDigest', 'indexGeneration', 'budget'].some(key => turn.context[key] !== undefined);
}
export function validateHistory(turn, findPrior) {
  for (const id of turn.context.historyTurnIds) {
    const prior = findPrior(id);
    if (id === turn.id || !prior || prior.conversationId !== turn.conversationId || prior.status !== 'complete' || prior.createdAt > turn.createdAt) reject('备份包含无效会话历史引用。');
  }
}
function decodeCursor(value, kind) {
  if (!value) return null;
  try {
    if (typeof value !== 'string' || value.length > 512) throw Error();
    const result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    object(result, kind === 'conversations' ? ['kind', 'updatedAt', 'id'] : ['kind', 'sequence', 'ceiling']);
    if (result.kind !== kind || kind === 'conversations' && (!isTime(result.updatedAt) || !isUuid(result.id))
      || kind === 'turns' && (!Number.isSafeInteger(result.sequence) || result.sequence < 1 || !Number.isSafeInteger(result.ceiling) || result.ceiling < result.sequence)) throw Error();
    return result;
  } catch { reject('分页位置无效。'); }
}
const encodeCursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function pageLimit(value = 50) { if (!Number.isSafeInteger(value) || value < 1 || value > 100) reject('每页应读取 1–100 条记录。'); return value; }

export class AiStore {
  constructor(file, options = {}) {
    this.file = file;
    this.capacityBytes = options.capacityBytes ?? AI_STORE_LIMITS.capacityBytes;
    this.minimumFreeBytes = options.minimumFreeBytes ?? AI_STORE_LIMITS.minimumFreeBytes;
    this.temporaryDirectory = file === ':memory:' ? resolve('.cache/ai-transfer') : dirname(resolve(file));
    if (!Number.isSafeInteger(this.capacityBytes) || this.capacityBytes < TURN_BYTES || !Number.isSafeInteger(this.minimumFreeBytes) || this.minimumFreeBytes < 0) reject('AI 运行容量配置无效。');
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 3) { this.db.close(); reject('AI 数据库版本较新，请使用匹配的软件版本。', 503); }
    try {
    if (version < 2) this.migrate(version, options.migrationHook);
    this.ensureSummaries();
    if (version < 3) this.migrateResearch(version);
    this.transaction(() => {
      for (const row of this.db.prepare("SELECT data FROM turns WHERE status = 'running'").all()) {
        const turn = parse(row); turn.status = 'interrupted'; this.writeTurn(turn);
      }
    });
    } catch (error) { this.db.close(); throw error; }
  }
  migrate(version, hook) {
    if (version === 1 && this.file !== ':memory:') {
      const backup = this.file + '.pre-v2-' + randomUUID() + '.sqlite';
      this.db.prepare('VACUUM INTO ?').run(backup);
      const check = new DatabaseSync(backup, { readOnly: true });
      try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') reject('AI 迁移备份完整性校验失败。', 503); }
      finally { check.close(); }
      this.migrationBackup = backup;
    }
    hook?.('prepared');
    this.transaction(() => {
    this.db.exec(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_conversation ON turns(conversation_id);
      ALTER TABLE conversations ADD COLUMN guide_id TEXT;
      ALTER TABLE conversations ADD COLUMN revision INTEGER;
      ALTER TABLE conversations ADD COLUMN updated_at TEXT;
      ALTER TABLE conversations ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE turns ADD COLUMN status TEXT;
      ALTER TABLE turns ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE turns ADD COLUMN reserved_bytes INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE storage_totals (id INTEGER PRIMARY KEY CHECK(id = 1), bytes INTEGER NOT NULL, reserved_bytes INTEGER NOT NULL, conversations INTEGER NOT NULL, turns INTEGER NOT NULL);
      INSERT INTO storage_totals VALUES (1, 0, 0, 0, 0);`);
    for (const row of this.db.prepare('SELECT data FROM conversations').iterate()) {
      const item = parse(row); validateBackup({ format: 'paperdesk-ai-backup', schemaVersion: 3, exportedAt: now(), conversations: [item], turns: [] });
      this.db.prepare('UPDATE conversations SET guide_id = ?, revision = ?, updated_at = ?, bytes = ? WHERE id = ?').run(item.guideId, item.revision, item.updatedAt, Buffer.byteLength(row.data), item.id);
    }
    for (const row of this.db.prepare('SELECT rowid AS sequence, data FROM turns ORDER BY rowid').iterate()) {
      const item = parse(row), check = { ...item, status: item.status === 'running' ? 'interrupted' : item.status, context: { ...item.context, historyTurnIds: [] } };
      validateBackup({ format: 'paperdesk-ai-backup', schemaVersion: 3, exportedAt: now(), conversations: [this.conversation(item.conversationId)], turns: [check] });
      validateHistory(item, id => { const prior = this.db.prepare('SELECT rowid AS sequence, data FROM turns WHERE id = ?').get(id); return prior && prior.sequence < row.sequence ? parse(prior) : undefined; });
      const size = Buffer.byteLength(row.data);
      this.db.prepare('UPDATE turns SET status = ?, bytes = ?, reserved_bytes = ? WHERE id = ?').run(item.status, size, item.status === 'running' ? Math.max(0, TURN_BYTES - size) : 0, item.id);
    }
    this.db.exec(`UPDATE storage_totals SET bytes = (SELECT COALESCE(SUM(bytes), 0) FROM conversations) + (SELECT COALESCE(SUM(bytes), 0) FROM turns),
      reserved_bytes = (SELECT COALESCE(SUM(reserved_bytes), 0) FROM turns), conversations = (SELECT COUNT(*) FROM conversations), turns = (SELECT COUNT(*) FROM turns);
      CREATE INDEX conversations_page ON conversations(guide_id, revision, updated_at DESC, id DESC);
      CREATE INDEX turns_running ON turns(status, conversation_id);
      CREATE TRIGGER conversations_insert AFTER INSERT ON conversations BEGIN UPDATE storage_totals SET bytes = bytes + new.bytes, conversations = conversations + 1 WHERE id = 1; END;
      CREATE TRIGGER conversations_update AFTER UPDATE ON conversations BEGIN UPDATE storage_totals SET bytes = bytes + new.bytes - old.bytes WHERE id = 1; END;
      CREATE TRIGGER conversations_delete AFTER DELETE ON conversations BEGIN UPDATE storage_totals SET bytes = bytes - old.bytes, conversations = conversations - 1 WHERE id = 1; END;
      CREATE TRIGGER turns_insert AFTER INSERT ON turns BEGIN UPDATE storage_totals SET bytes = bytes + new.bytes, reserved_bytes = reserved_bytes + new.reserved_bytes, turns = turns + 1 WHERE id = 1; END;
      CREATE TRIGGER turns_update AFTER UPDATE ON turns BEGIN UPDATE storage_totals SET bytes = bytes + new.bytes - old.bytes, reserved_bytes = reserved_bytes + new.reserved_bytes - old.reserved_bytes WHERE id = 1; END;
      CREATE TRIGGER turns_delete AFTER DELETE ON turns BEGIN UPDATE storage_totals SET bytes = bytes - old.bytes, reserved_bytes = reserved_bytes - old.reserved_bytes, turns = turns - 1 WHERE id = 1; END;
      PRAGMA user_version = 2;`);
      hook?.('written');
      if (this.db.prepare('PRAGMA foreign_key_check').get()) reject('AI 数据库关联校验失败。', 503);
    });
    hook?.('committed');
  }
  migrateResearch(version) {
    if (version > 0 && this.file !== ':memory:') {
      const backup = this.file + '.pre-v3-' + randomUUID() + '.sqlite';
      this.db.prepare('VACUUM INTO ?').run(backup);
      const check = new DatabaseSync(backup, { readOnly: true });
      try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') reject('研究会话迁移恢复副本校验失败。', 503); } finally { check.close(); }
      this.researchMigrationBackup = backup;
    }
    this.transaction(() => { this.db.exec('ALTER TABLE conversations ADD COLUMN exploration_id TEXT; CREATE INDEX conversations_topic ON conversations(exploration_id, updated_at DESC, id DESC); PRAGMA user_version = 3;'); });
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  ensureSummaries() {
    // A one-time additive layout-v2 backfill. Only compact previews are queried
    // for history pages; complete source snapshots remain in the authoritative row.
    if (this.db.prepare('PRAGMA table_info(turns)').all().some(column => column.name === 'summary_json')) return;
    this.transaction(() => {
      this.db.exec('ALTER TABLE turns ADD COLUMN summary_json TEXT');
      const update = this.db.prepare('UPDATE turns SET summary_json=? WHERE id=?');
      for (const row of this.db.prepare('SELECT data FROM turns').iterate()) { const turn = parse(row); update.run(turnSummary(turn), turn.id); }
    });
  }
  usage() {
    const totals = this.db.prepare('SELECT bytes, reserved_bytes AS reservedBytes, conversations, turns FROM storage_totals WHERE id = 1').get();
    return { ...totals, capacityBytes: this.capacityBytes, nearCapacity: totals.bytes + totals.reservedBytes > this.capacityBytes * .9 };
  }
  checkCapacity(additional = 0, checkDisk = false) {
    const total = this.usage();
    if (total.bytes + total.reservedBytes + additional > this.capacityBytes) reject('AI 记录达到运行容量上限，请导出备份并整理旧会话后继续。', 413);
    if (checkDisk && this.file !== ':memory:') {
      const disk = statfsSync(dirname(resolve(this.file)));
      if (disk.bavail * disk.bsize < this.minimumFreeBytes + additional) reject('本地磁盘余量不足，请释放空间后继续；已有记录保留。', 507);
    }
  }
  insertConversation(item) {
    const data = JSON.stringify(item);
    this.db.prepare('INSERT INTO conversations (id, data, guide_id, revision, updated_at, bytes, exploration_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(item.id, data, item.guideId, item.revision, item.updatedAt, Buffer.byteLength(data), item.conversationScope?.explorationId ?? null);
  }
  insertTurn(turn) {
    const data = JSON.stringify(turn), size = Buffer.byteLength(data);
    this.db.prepare('INSERT INTO turns (id, conversation_id, request_id, data, status, bytes, reserved_bytes, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(turn.id, turn.conversationId, turn.requestId, data, turn.status, size, turn.status === 'running' ? Math.max(0, TURN_BYTES - size) : 0, turnSummary(turn));
  }
  writeTurn(turn) {
    const data = JSON.stringify(turn), size = Buffer.byteLength(data);
    this.db.prepare('UPDATE turns SET data = ?, status = ?, bytes = ?, reserved_bytes = ?, summary_json = ? WHERE id = ?').run(data, turn.status, size, turn.status === 'running' ? Math.max(0, TURN_BYTES - size) : 0, turnSummary(turn), turn.id);
  }
  conversation(id) { return parse(this.db.prepare('SELECT data FROM conversations WHERE id = ?').get(id)); }
  list(guideId, revision) {
    return this.listPage(guideId, revision, { limit: 100 }).conversations;
  }
  listPage(guideId, revision, options = {}) {
    const limit = pageLimit(options.limit), after = decodeCursor(options.cursor, 'conversations');
    const rows = after ? this.db.prepare('SELECT data FROM conversations WHERE guide_id = ? AND revision = ? AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?')
      .all(guideId, revision, after.updatedAt, after.updatedAt, after.id, limit + 1)
      : this.db.prepare('SELECT data FROM conversations WHERE guide_id = ? AND revision = ? ORDER BY updated_at DESC, id DESC LIMIT ?').all(guideId, revision, limit + 1);
    const conversations = rows.slice(0, limit).map(parse), last = conversations.at(-1);
    return { conversations, nextCursor: rows.length > limit ? encodeCursor({ kind: 'conversations', updatedAt: last.updatedAt, id: last.id }) : null };
  }
  topicPage(explorationId, options = {}) {
    if (!isUuid(explorationId)) reject('研究主题编号无效。');
    const limit = pageLimit(options.limit), after = decodeCursor(options.cursor, 'conversations');
    const rows = after ? this.db.prepare('SELECT data FROM conversations WHERE exploration_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?').all(explorationId, after.updatedAt, after.updatedAt, after.id, limit + 1)
      : this.db.prepare('SELECT data FROM conversations WHERE exploration_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?').all(explorationId, limit + 1);
    const conversations = rows.slice(0, limit).map(parse), last = conversations.at(-1);
    return { conversations, nextCursor: rows.length > limit ? encodeCursor({kind:'conversations',updatedAt:last.updatedAt,id:last.id}) : null };
  }
  searchTopic(explorationId, query) {
    if (!isUuid(explorationId) || !isText(query,300,1)) reject('研究历史查询无效。');
    const terms=topicSearchTerms(query),score=['CASE WHEN instr(body,?)>0 THEN 8 ELSE 0 END',...terms.map(()=> 'CASE WHEN instr(body,?)>0 THEN 1 ELSE 0 END')].join(' + ');
    const rows=this.db.prepare(`WITH scoped AS (SELECT t.summary_json,t.rowid AS sequence,lower(json_extract(t.data,'$.question') || ' ' || json_extract(t.data,'$.answer')) AS body FROM turns t JOIN conversations c ON c.id=t.conversation_id WHERE c.exploration_id=? AND t.status='complete') SELECT summary_json,(${score}) AS score FROM scoped WHERE score>0 ORDER BY score DESC,sequence DESC LIMIT 8`).all(explorationId,query.toLocaleLowerCase().trim(),...terms);
    return rows.map(row => JSON.parse(row.summary_json));
  }
  recentTopic(explorationId, excludeIds=[]) {
    if (!isUuid(explorationId) || !Array.isArray(excludeIds) || excludeIds.length>6 || !excludeIds.every(isUuid)) reject('研究历史范围无效。');
    const exclude=excludeIds.length?` AND t.id NOT IN (${excludeIds.map(()=>'?').join(',')})`:'';
    return this.db.prepare(`SELECT t.summary_json,t.conversation_id,json_extract(t.data,'$.question')!=json_extract(t.summary_json,'$.question') AS question_truncated,json_extract(t.data,'$.answer')!=json_extract(t.summary_json,'$.answer') AS answer_truncated FROM turns t JOIN conversations c ON c.id=t.conversation_id WHERE c.exploration_id=? AND t.status='complete'${exclude} ORDER BY t.rowid DESC LIMIT 8`).all(explorationId,...excludeIds)
      .map(row=>({...JSON.parse(row.summary_json),conversationId:row.conversation_id,questionTruncated:!!row.question_truncated,answerTruncated:!!row.answer_truncated}));
  }
  readTopicTurn(explorationId, id) {
    const turn = this.turn(id);
    if (!turn || turn.status !== 'complete' || this.conversation(turn.conversationId)?.conversationScope?.explorationId !== explorationId) return null;
    return turn;
  }
  turnsPage(id, options = {}) {
    const limit = pageLimit(options.limit), after = decodeCursor(options.cursor, 'turns');
    const ceiling = after?.ceiling ?? this.db.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM turns WHERE conversation_id = ?').get(id).n;
    const rows = this.db.prepare('SELECT rowid AS sequence, id, bytes FROM turns WHERE conversation_id = ? AND rowid <= ? AND rowid < ? ORDER BY rowid DESC LIMIT ?')
      .all(id, ceiling, after?.sequence ?? ceiling + 1, limit + 1);
    const visible = []; let size = 0;
    for (const row of rows.slice(0, limit)) {
      if (visible.length && size + row.bytes > 4 * 1024 * 1024) break;
      visible.push(row); size += row.bytes;
    }
    return { turns: visible.map(row => this.turn(row.id)).reverse(), nextCursor: rows.length > visible.length ? encodeCursor({ kind: 'turns', sequence: visible.at(-1).sequence, ceiling }) : null };
  }
  turnSummariesPage(id, options = {}) {
    const limit = pageLimit(options.limit ?? 100), after = decodeCursor(options.cursor, 'turns');
    const ceiling = after?.ceiling ?? this.db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM turns WHERE conversation_id=?').get(id).n;
    const rows = this.db.prepare('SELECT rowid AS sequence,summary_json FROM turns WHERE conversation_id=? AND rowid<=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(id, ceiling, after?.sequence ?? ceiling + 1, limit + 1);
    const visible = rows.slice(0, limit);
    return { turns: visible.map(row => JSON.parse(row.summary_json)).reverse(), nextCursor: rows.length > limit ? encodeCursor({ kind: 'turns', sequence: visible.at(-1).sequence, ceiling }) : null };
  }
  turns(id) { return this.db.prepare('SELECT data FROM turns WHERE conversation_id = ? ORDER BY rowid').all(id).map(parse); }
  recentTurns(id) { return this.db.prepare("SELECT data FROM turns WHERE conversation_id = ? AND status = 'complete' ORDER BY rowid DESC LIMIT 6").all(id).map(parse).reverse(); }
  byRequest(requestId) { return parse(this.db.prepare('SELECT data FROM turns WHERE request_id = ?').get(requestId)); }
  turn(id) { return parse(this.db.prepare('SELECT data FROM turns WHERE id = ?').get(id)); }
  snapshot() {
    return { format: 'paperdesk-ai-backup', schemaVersion: 2, exportedAt: now(), conversations: this.db.prepare('SELECT data FROM conversations ORDER BY rowid').all().map(parse),
      turns: this.db.prepare('SELECT data FROM turns ORDER BY rowid').all().map(parse) };
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
      this.checkCapacity(TURN_BYTES + 4096, true);
      let conversation = request.conversationId ? this.conversation(request.conversationId) : undefined;
      if (request.conversationId && !conversation) reject('会话不存在，请开始新对话。', 404);
      if (conversation && !sameScope(conversation, request)) reject('会话绑定了不同文章版本，请开始新对话。', 409);
      if (!conversation) {
        if (this.usage().conversations >= AI_STORE_LIMITS.conversations) reject('AI 会话达到运行容量上限，请先导出并整理。', 409);
        const research = request.conversationScope?.kind === 'exploration';
        conversation = { id: randomUUID(), title: request.question.trim().slice(0, 100), guideId: research ? null : request.guideId, revision: research ? null : request.revision, bodySha256: research ? null : request.bodySha256, ...(request.conversationScope ? { conversationScope: request.conversationScope } : {}), createdAt: now(), updatedAt: now() };
        this.insertConversation(conversation);
      }
      if (this.db.prepare("SELECT id FROM turns WHERE status = 'running' AND conversation_id = ? LIMIT 1").get(conversation.id)) reject('当前会话正在回答，请等待或停止后再试。', 409);
      if (this.usage().turns >= AI_STORE_LIMITS.turns) reject('AI 问答达到运行容量上限，请先导出并整理。', 409);
      const turn = { id: randomUUID(), conversationId: conversation.id, requestId: request.requestId, requestHash: requestHash(request), question: request.question,
        answer: '', status: 'running', sources, context, createdAt: now() };
      if (bytes(turn) > TURN_BYTES) reject('初始问答快照超过 2 MiB，请缩小问题范围。', 413);
      this.insertTurn(turn);
      conversation.updatedAt = turn.createdAt;
      this.db.prepare('UPDATE conversations SET data = ?, updated_at = ?, bytes = ? WHERE id = ?').run(JSON.stringify(conversation), conversation.updatedAt, bytes(conversation), conversation.id);
      return { turn, replay: false };
    });
  }
  save(turn) {
    if (bytes(turn) > TURN_BYTES) reject('本轮问答快照超过 2 MiB，已停止继续生成。', 413);
    validateContext(turn.context); for (const source of turn.sources) validateSource(source);
    const previous = this.turn(turn.id);
    if (!previous || previous.conversationId !== turn.conversationId || previous.requestId !== turn.requestId || previous.requestHash !== turn.requestHash || previous.createdAt !== turn.createdAt) reject('问答身份与已存记录不一致。', 409);
    if (!['running', 'complete', 'interrupted', 'error'].includes(turn.status)) reject('问答状态无效。');
    validateBackup({ format: 'paperdesk-ai-backup', schemaVersion: 4, exportedAt: now(), conversations: [this.conversation(turn.conversationId)],
      turns: [{ ...turn, status: turn.status === 'running' ? 'interrupted' : turn.status, context: { ...turn.context, historyTurnIds: [] } }] });
    validateHistory(turn, id => this.turn(id));
    this.transaction(() => {
      this.writeTurn(turn);
      this.checkCapacity();
    });
  }
  delete(id) {
    return this.transaction(() => {
      if (this.db.prepare("SELECT id FROM turns WHERE status = 'running' AND conversation_id = ? LIMIT 1").get(id)) reject('回答期间不能删除会话，请先停止。', 409);
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    });
  }
  export() {
    if (this.usage().bytes > BACKUP_BYTES - 4096) reject('此记录库超过旧 JSON 备份大小，请使用分块备份。', 413);
    const result = this.snapshot();
    result.turns = result.turns.map(turn => turn.status === 'running' ? { ...turn, status: 'interrupted' } : turn);
    if (result.turns.some(needsBackupV3)) result.schemaVersion = 3;
    if (result.conversations.some(item => item.conversationScope?.kind === 'exploration')) result.schemaVersion = 4;
    return result;
  }
  import(value) {
    validateBackup(value);
    return this.importRecords(value.conversations, value.turns, { conversations: value.conversations.length, turns: value.turns.length });
  }
  importRecords(conversations, turns, counts, signal) {
    return this.transaction(() => {
      const usage = this.usage(); this.checkCapacity(0, true);
      if (usage.conversations + counts.conversations > AI_STORE_LIMITS.conversations || usage.turns + counts.turns > AI_STORE_LIMITS.turns) reject('导入会超过本地 AI 记录容量。', 413);
      for (const conversation of conversations) {
        signal?.throwIfAborted();
        if (this.conversation(conversation.id)) reject('备份中的会话 ID 已存在；未导入任何记录。', 409);
        this.insertConversation(conversation);
      }
      for (const turn of turns) {
        signal?.throwIfAborted();
        if (this.byRequest(turn.requestId) || this.turn(turn.id)) reject('备份中的问答 ID 已存在；未导入任何记录。', 409);
        this.insertTurn(turn);
      }
      this.checkCapacity(); return counts;
    });
  }
  createSnapshotFile() {
    mkdirSync(this.temporaryDirectory, { recursive: true });
    const file = resolve(this.temporaryDirectory, 'ai-export-' + randomUUID() + '.sqlite');
    this.db.prepare('VACUUM INTO ?').run(file); return file;
  }
  close() { this.db.close(); }
}

export function sameScope(conversation, value) {
  const scope = conversation.conversationScope;
  if (scope?.kind === 'exploration' || value.conversationScope?.kind === 'exploration') return scope?.kind === 'exploration' && value.conversationScope?.kind === 'exploration' && scope.explorationId === value.conversationScope.explorationId;
  return conversation.guideId === value.guideId && conversation.revision === value.revision && conversation.bodySha256 === value.bodySha256;
}

function includesEvidence(source, saved) {
  if (JSON.stringify(source) === JSON.stringify(saved)) return true;
  // Later original-unit reads can widen the same source. An earlier proposal
  // keeps its exact excerpt, with ranges demonstrably contained in the final one.
  if (source.kind !== 'original' || saved.kind !== 'original' || !saved.readRanges?.length || !source.readRanges?.length) return false;
  const {text:currentText,readRanges:currentRanges,...currentIdentity}=source;
  const {text:savedText,readRanges:savedRanges,...savedIdentity}=saved;
  if (JSON.stringify(currentIdentity)!==JSON.stringify(savedIdentity)) return false;
  if (!savedRanges.every(range=>currentRanges.some(current=>current.total===range.total && current.start<=range.start && current.end>=range.end))) return false;
  return savedText.split(/\n\n(?=\[原文单元字符 )/u).every(part=>currentText.includes(part.replace(/^\[原文单元字符 \d+–\d+\/\d+\]\n/u,'')));
}
