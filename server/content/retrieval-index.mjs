import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const RETRIEVAL_VERSION = 'lexical-v4';
// Explicit lexical aliases, not embeddings or a claim of semantic understanding.
const aliases = [['注意力汇', 'attention sink'], ['注意力沉降', 'attention sink'], ['缓存', 'cache kv'], ['困惑度', 'perplexity'], ['检索', 'retrieval retrieved'], ['记忆', 'memory'], ['消融', 'ablation'], ['精确匹配', 'exact match'], ['事实', 'factual'], ['训练', 'training'], ['微调', 'training fine tuning'], ['对照', 'baseline'], ['基线', 'baseline'], ['边缘化', 'marginalize marginalization'], ['查询编码器', 'query encoder'],
 ['文档编码器', 'document encoder'], ['生成器', 'generator'], ['文本', 'textual'], ['参数', 'parametric'], ['来源', 'sources'], ['广义', 'broad definition'], ['跨试验', 'cross trial'], ['尝试', 'trial'], ['换行符', 'newline'], ['初始', 'initial'], ['词元', 'tokens'], ['开头', 'initial'], ['最近', 'recent'], ['位置', 'positional position'], ['绝对距离', 'absolute relative contiguous'], ['写入', 'writing'], ['管理', 'management'], ['读取', 'reading'], ['摘要', 'summary'], ['交互', 'interaction'], ['压缩', 'compression'], ['外部', 'external'], ['知识', 'knowledge'], ['标签', 'labels'], ['监督', 'supervision supervised'], ['损失', 'loss likelihood'], ['数量', 'number'], ['效率', 'efficiency'], ['权衡', 'effectiveness efficiency interpretability'], ['免费', 'efficiency cost'], ['准确率', 'accuracy'], ['延迟', 'latency'], ['模型', 'model'], ['样本', 'samples'], ['重叠', 'overlap disjoint'], ['片段', 'passages'], ['表', 'table'], ['图', 'figure'], ['遗忘', 'forget'], ['删除', 'forget delete'], ['合并', 'merge'], ['信息', 'information'], ['观察', 'observation'], ['概率', 'probability'], ['分类', 'classification']];
const stopWords = new Set('a an the is are was were of to for in on at and or with by how why what which does do this that it its'.split(' '));
export function terms(text, expand = false) {
  let normalized = text.normalize('NFKC').toLowerCase();
  if (expand) for (const [cn, en] of aliases) if (normalized.includes(cn)) normalized += ` ${en}`;
  const result = [];
  for (const match of normalized.matchAll(/[a-z0-9]+|[\u3400-\u9fff]+/gu)) {
    const token = match[0];
    if (/^[\u3400-\u9fff]+$/u.test(token) && token.length > 1) {
      for (let index = 0; index < token.length - 1; index++) result.push(token.slice(index, index + 2));
    } else result.push(token);
  }
  const unique = [...new Set(result)].filter(token => !stopWords.has(token));
  // Chinese bigrams must not consume the whole query budget before the explicit
  // English equivalents for an English original can participate.
  return expand ? unique.sort((a,b) => Number(/^[\u3400-\u9fff]/u.test(a))-Number(/^[\u3400-\u9fff]/u.test(b))) : unique;
}

/** Derived, append-only documents and immutable generation membership. Rebuildable. */
export class RetrievalIndex {
  constructor(file = ':memory:') {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, paper_id TEXT NOT NULL, json TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, terms, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (generation TEXT NOT NULL, document_id TEXT NOT NULL, PRIMARY KEY(generation,document_id));
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS documents_paper ON documents(paper_id,kind);`);
    if (this.db.prepare("SELECT value FROM state WHERE key='lexical-version'").get()?.value !== '3') {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec('DELETE FROM search');
        const insert = this.db.prepare('INSERT INTO search(id,terms) VALUES(?,?)');
        for (const row of this.db.prepare('SELECT id,json FROM documents').iterate()) { const doc = JSON.parse(row.json); insert.run(row.id, this.searchText(doc)); }
        this.db.prepare("INSERT INTO state VALUES('lexical-version','3') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
  }
  searchText(doc) { return terms(doc.kind === 'original' ? doc.text : `${doc.title} ${doc.text}`).join(' '); }
  get active() { return this.db.prepare("SELECT value FROM state WHERE key='active'").get()?.value ?? null; }
  has(id) { return Boolean(this.db.prepare('SELECT 1 FROM documents WHERE id=?').get(id)); }
  get(id, generation) {
    const row = generation ? this.db.prepare('SELECT d.json FROM documents d JOIN members m ON m.document_id=d.id WHERE d.id=? AND m.generation=?').get(id, generation)
      : this.db.prepare('SELECT json FROM documents WHERE id=?').get(id);
    return row ? JSON.parse(row.json) : undefined;
  }
  publish(generation, documents, ids, { failAt } = {}) {
    if (this.active === generation) return generation;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare('INSERT OR IGNORE INTO documents VALUES(?,?,?,?)');
      const fts = this.db.prepare('INSERT INTO search(id,terms) VALUES(?,?)');
      for (const doc of documents) {
        const json = JSON.stringify(doc), previous = this.db.prepare('SELECT json FROM documents WHERE id=?').get(doc.id);
        if (previous && previous.json !== json) throw Error('Immutable indexed document changed.');
        if (!previous) { insert.run(doc.id, doc.kind, doc.paperId, json); fts.run(doc.id, this.searchText(doc)); }
      }
      if (failAt === 'documents') throw Error('Synthetic index failure.');
      this.db.prepare('INSERT OR IGNORE INTO generations VALUES(?,?)').run(generation, new Date().toISOString());
      const member = this.db.prepare('INSERT OR IGNORE INTO members VALUES(?,?)');
      for (const id of ids) {
        if (!this.has(id)) throw Error('Missing indexed document.');
        member.run(generation, id);
      }
      if (failAt === 'switch') throw Error('Synthetic index failure.');
      this.db.prepare("INSERT INTO state VALUES('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(generation);
      this.db.exec('COMMIT'); return generation;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  search(query, { generation = this.active, paperId, kind, limit = 8 } = {}) {
    const tokens = terms(query, true).slice(0, 40);
    if (!tokens.length || !generation) return [];
    const expression = tokens.map(token => `"${token}"`).join(' OR ');
    const rows = this.db.prepare(`SELECT d.json, bm25(search) AS score FROM search
      JOIN documents d ON d.id=search.id JOIN members m ON m.document_id=d.id
      WHERE search MATCH ? AND m.generation=? AND (? IS NULL OR d.paper_id=?) AND (? IS NULL OR d.kind=?)
      ORDER BY score,d.id LIMIT ?`).all(expression, generation, paperId ?? null, paperId ?? null, kind ?? null, kind ?? null, Math.min(48, Math.max(1, limit) * 4));
    // Prefer substantive units over an exact section-heading-only unit. Short
    // tables, equations and conditions remain searchable regardless of length.
    const headingOnly = doc => doc.kind === 'original' && doc.locator?.label.split(' / ').at(-1) === doc.text ? 1 : 0;
    return rows.map(row => ({ ...JSON.parse(row.json), score: row.score })).sort((a,b) => headingOnly(a)-headingOnly(b) || a.score-b.score).slice(0, Math.min(12, Math.max(1, limit)));
  }
  close() { this.db.close(); }
}
