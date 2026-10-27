import { LIMITS, SYSTEM_PROMPT, availableTools } from '../ai/instructions.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { normalizedRelativePath } from '../../shared/package-path.mjs';
import { RetrievalIndex, digest, RETRIEVAL_VERSION } from './retrieval-index.mjs';
import { ReadingMaterials } from './materials.mjs';
import { utf8Prefix, localResultBudget } from '../ai/prompt-budget.mjs';
import { object, reject, isId, isRevision, isText } from '../http/validation.mjs';

const sectionUrl = (guide, unit) => `/read/${guide.metadata.id}/${guide.metadata.revision}#${unit.id}`;
const normalizeText = value => value.replace(/\s+/gu, ' ').trim();
const nodeText = node => typeof node.value === 'string' ? node.value : (node.children ?? []).map(nodeText).join(['table', 'tableRow', 'list', 'listItem'].includes(node.type) ? '\n' : '');
export class ContentIndex {
  constructor(validated, options = {}) {
    this.index = options.index ?? new RetrievalIndex(); this.reading = options.reading;
    this.rootDir = options.rootDir; this.cache = new Map();
    this.catalog = validated.catalog;
    this.memoryGuides = validated.guides;
    this.entries = new Map(); this.catalogDigest = digest(JSON.stringify(this.catalog));
    if (this.rootDir) {
      const ajv = new Ajv2020({ strict: false });
      this.validators = new Map(['catalog', 'guide', 'guide-v2'].map(name => [name, ajv.compile(JSON.parse(readFileSync(join(this.rootDir, 'schemas', `${name}.schema.json`), 'utf8')))]));
      this.refresh(true);
    } else {
      for (const guide of validated.guides) this.entries.set(`${guide.metadata.id}/${guide.metadata.revision}`, guide.metadata);
      this.publish();
    }
  }
  parse(guide) {
      const tree = unified().use(remarkParse).parse(guide.body);
      const offsets = [0, ...tree.children.filter(node => node.type === 'heading' && node.depth === 2).map(node => node.position.start.offset)];
      return { ...guide, units: guide.metadata.units.map((unit, index) => {
        const text = guide.body.slice(offsets[index], offsets[index + 1]);
        const parsed = unified().use(remarkParse).use(remarkGfm).parse(text);
        return { ...unit, text, renderedText: normalizeText(parsed.children.map(nodeText).join('\n')) };
      }) };
  }
  static async load({ rootDir = fileURLToPath(new URL('../../', import.meta.url)), indexFile, readingDirectory } = {}) {
    const reading = new ReadingMaterials(readingDirectory ?? join(rootDir, 'private/reading'));
    return new ContentIndex({ catalog: {}, guides: [] }, { rootDir, reading, index: new RetrievalIndex(indexFile ?? join(reading.directory, 'index.sqlite')) });
  }
  read(path, max = 2 * 1024 * 1024) {
    normalizedRelativePath(path); const base = realpathSync(this.rootDir), file = realpathSync(resolve(base, path)), rel = relative(base, file);
    if (rel.startsWith('..') || isAbsolute(rel) || statSync(file).size > max) reject('审核内容路径或大小无效。');
    return readFileSync(file);
  }
  refresh(force = false) {
    if (!this.rootDir) return;
    const bytes = this.read('content/catalog.json'), hash = digest(bytes);
    const materials = this.reading?.list() ?? [];
    const materialHash = digest(JSON.stringify(materials.map(item => [item.sourceRevisionId, item.parserRevision, item.status, Boolean(item.referenceOnly)])));
    const evidence = this.reading?.evidence() ?? [], evidenceHash = evidence === this.evidenceRecords ? this.evidenceDigest : digest(JSON.stringify(evidence));
    if (!force && hash === this.catalogDigest && materialHash === this.materialDigest && evidenceHash === this.evidenceDigest) return;
    const catalog = JSON.parse(bytes);
    if (!this.validators.get('catalog')(catalog)) reject('审核目录格式无效。');
    const entries = new Map();
    for (const entry of catalog.entries) {
      const metadataFile = `content/${entry.metadataFile}`, metadata = JSON.parse(this.read(metadataFile));
      if (!this.validators.get(metadata.schemaVersion === 2 ? 'guide-v2' : 'guide')(metadata) || metadata.id !== entry.guideId || metadata.revision !== entry.revision) reject('审核内容元数据不匹配。');
      entries.set(`${metadata.id}/${metadata.revision}`, { ...metadata, _metadataFile: metadataFile });
    }
    const previous = { catalog: this.catalog, entries: this.entries, catalogDigest: this.catalogDigest, materialDigest: this.materialDigest, evidenceDigest: this.evidenceDigest, evidenceRecords: this.evidenceRecords, generation: this.generation, cache: this.cache };
    try {
      this.catalog = catalog; this.entries = entries; this.catalogDigest = hash; this.materialDigest = materialHash; this.evidenceDigest = evidenceHash; this.evidenceRecords = evidence; this.cache = new Map();
      this.publish(materials, evidence);
    } catch (error) { Object.assign(this, previous); throw error; }
  }
  publish(materials = this.reading?.list() ?? [], evidence = this.reading?.evidence() ?? []) {
    const generation = digest(`${this.catalogDigest}:${digest(JSON.stringify(materials.map(item => [item.sourceRevisionId, item.parserRevision, item.status, Boolean(item.referenceOnly)])))}:${digest(JSON.stringify(evidence))}:${RETRIEVAL_VERSION}`);
    if (this.index.active === generation) { this.generation = generation; return; }
    const documents = [], ids = [];
    for (const [key, metadata] of this.entries) {
      if (this.catalog.currentRevisions[metadata.id] !== metadata.revision) continue;
      const unitKeys = metadata.units.map(unit => `guide:${key}:${metadata.bodySha256}:${unit.id}`); ids.push(...unitKeys);
      if (unitKeys.every(id => this.index.has(id))) continue;
      const guide = this.get(metadata.id, metadata.revision);
      for (const unit of guide.units) documents.push({ id: `guide:${key}:${metadata.bodySha256}:${unit.id}`, kind: 'guide', paperId: metadata.paperId,
        title: `${metadata.title} · ${unit.heading ?? '导读开篇'}`, guideId: metadata.id, revision: metadata.revision, unitId: unit.id, text: unit.text });
    }
    for (const material of materials) {
      if (material.referenceOnly || !['partial', 'ready'].includes(material.status)) continue;
      // Manifests are small; text is read only for a new parser revision.
      const prefix = `original:${material.sourceRevisionId}:${material.parserRevision}:`;
      const retained = this.index.db.prepare("SELECT id FROM documents WHERE id LIKE ? ORDER BY id").all(`${prefix}%`);
      if (retained.length === material.unitCount) ids.push(...retained.map(row => row.id));
      else { const docs = this.reading.documents(material); documents.push(...docs); ids.push(...docs.map(doc => doc.id)); }
    }
    this.index.db.prepare('INSERT OR IGNORE INTO state VALUES(?,?)').run(`catalog:${generation}`, JSON.stringify(this.catalog));
    const evidenceGroups = new Map(), documentIds = new Set(ids);
    for (const record of evidence) {
      const guide = this.entries.get(`${record.guideId}/${record.revision}`);
      if (!guide?.units.some(unit => unit.id === record.unitId)) reject('证据记录指向不存在的导读修订或章节。');
      for (const unit of record.sourceUnitIds) {
        if (!documentIds.has(`original:${record.sourceRevisionId}:${record.parserRevision}:${unit}`)) reject('证据记录指向未发布的原文单元。');
      }
      const keys = [`guide:${record.guideId}/${record.revision}:${record.unitId}`, ...record.sourceUnitIds.map(unit => `original:${record.sourceRevisionId}:${record.parserRevision}:${unit}`)];
      for (const key of keys) { const records = evidenceGroups.get(key) ?? []; records.push(record); evidenceGroups.set(key, records); }
    }
    for (const [key, records] of evidenceGroups) this.index.db.prepare('INSERT OR IGNORE INTO state VALUES(?,?)').run(`evidence:${generation}:${key}`, JSON.stringify(records));
    this.index.publish(generation, documents, ids);
    this.generation = generation;
  }
  get(id, revision) {
    const key = `${id}/${revision}`, cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    const metadata = this.entries.get(key); if (!metadata) return;
    let guide;
    if (this.rootDir) {
      const { _metadataFile, ...clean } = metadata;
      const path = `${dirname(_metadataFile).replaceAll('\\', '/')}/${metadata.bodyFile}`;
      const bytes = this.read(path, 1024 * 1024);
      if (digest(bytes) !== metadata.bodySha256) reject('审核正文摘要不符。', 409);
      guide = this.parse({ metadata: clean, body: bytes.toString('utf8') });
    } else guide = this.parse(this.memoryGuides.find(item => item.metadata.id === id && item.metadata.revision === revision));
    this.cache.set(key, guide);
    while (this.cache.size > 8 || [...this.cache.values()].reduce((n, item) => n + Buffer.byteLength(item.body), 0) > 4 * 1024 * 1024) this.cache.delete(this.cache.keys().next().value);
    return guide;
  }
  close() { this.index.close(); }
  evidenceFor(key, generation = this.generation) {
    const row = this.index.db.prepare('SELECT value FROM state WHERE key=?').get(`evidence:${generation}:${key}`);
    return row ? JSON.parse(row.value).slice(0, 6) : [];
  }
  source(guide, unit, sources, text = unit.text) {
    const url = sectionUrl(guide, unit);
    const existing = sources.find(source => source.url === url);
    if (existing) { if (text.length > existing.text.length) existing.text = text; return existing; }
    if (sources.length >= 64) reject('来源数量超过本轮上限。');
    const source = { id: `L${sources.filter(item => item.kind === 'guide').length + 1}`, kind: 'guide', title: `${guide.metadata.title} · ${unit.heading ?? '导读开篇'}`,
      url, guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, text, version: guide.metadata.source.version };
    sources.push(source); return source;
  }
  prepare(request, previous, config) {
    this.refresh();
    const guide = this.get(request.guideId, request.revision);
    if (!guide) reject('该文章版本不在后端书库中，请刷新页面或重启后端。', 409);
    if (guide.metadata.bodySha256 !== request.bodySha256) reject('当前页面与后端的文章内容不一致，请重新构建页面并重启后端。', 409);
    const active = guide.units.find(unit => unit.id === request.unitId);
    if (!active) reject('当前章节不存在，请重新选择章节。');
    if (request.selection && !normalizeText(active.text).includes(normalizeText(request.selection)) && !active.renderedText.includes(normalizeText(request.selection))) reject('选文与当前章节不一致，请重新选择；公式或跨章节文字可直接写入问题。');
    const { title, paperId, paperTitle, source, orientation, coverage, citations } = guide.metadata;
    const evidence = this.evidenceFor(`guide:${request.guideId}/${request.revision}:${request.unitId}`);
    let metadataJson = JSON.stringify({ title, paperId, paperTitle, source, orientation: orientation ?? null, coverage, citations, evidence });
    // Reserve room before selecting the guide scope, including metadata, question,
    // history and subsequent evidence. Final provider preflight remains authoritative.
    const fixedBytes = Buffer.byteLength(metadataJson + SYSTEM_PROMPT + JSON.stringify(availableTools(request.webSearch)) + request.question + (request.selection ?? '')) + 2000;
    const contextBytes = Math.min(5000, Math.max(0, (config.contextTokenLimit ?? 32768) - (config.maxOutputTokens ?? 3000) - fixedBytes - 10000));
    if (contextBytes < 512) reject('本轮元数据与问题已占满保守预算，请缩小问题或调整已确认的模型上下文容量。', 413);
    const scope = guide.body.length <= LIMITS.contextChars && Buffer.byteLength(guide.body) <= contextBytes ? 'full-guide' : 'section';
    const units = scope === 'full-guide' ? guide.units : [...new Set([guide.units[0], active])];
    if (units.length > 64) reject('导读章节数量超过本轮来源预算，请选择章节模式。', 413);
    if (units.reduce((sum, unit) => sum + unit.text.length, 0) > LIMITS.contextChars) reject('当前章节超过上下文预算，请选择较短章节。', 413);
    const guideRanges = [];
    const sources = units.map(unit => {
      const limit = scope === 'full-guide' ? contextBytes : Math.floor(contextBytes * (units.length === 1 ? 1 : unit.id === active.id ? .7 : .3));
      const text = scope === 'full-guide' ? unit.text : utf8Prefix(unit.text, limit);
      guideRanges.push({ unitId: unit.id, start: 0, end: text.length, total: unit.text.length, excerptOnly: text.length < unit.text.length });
      return this.source(guide, unit, [], text);
    });
    metadataJson = JSON.stringify({ ...JSON.parse(metadataJson), guideRanges, guideScope: guideRanges.some(range => range.excerptOnly) ? '导读预算内节选；不是完整章节。可按需补读。' : '所列导读章节文本完整。' });
    sources.forEach((source, index) => { source.id = `L${index + 1}`; });
    let historyChars = 0;
    const history = [];
    for (const turn of previous.filter(turn => turn.status === 'complete').slice(-6).reverse()) {
      const length = turn.question.length + turn.answer.length;
      if (historyChars + length > LIMITS.historyChars || Buffer.byteLength(JSON.stringify([...history.flatMap(item => [item.question, item.answer]), turn.question, turn.answer])) > 4000) break;
      history.unshift(turn); historyChars += length;
    }
    const context = { guideId: request.guideId, revision: request.revision, bodySha256: request.bodySha256, unitId: request.unitId,
      selection: request.selection ?? '', scope, metadataJson,
      historyTurnIds: history.map(turn => turn.id), webSearch: request.webSearch, model: config.modelId, toolEvents: [], catalogDigest: this.catalogDigest, indexGeneration: this.generation };
    return { context, sources, history };
  }
  runLocal(name, args, sources, context = {}) {
    const generation = context.indexGeneration ?? this.generation;
    if (['search_sources', 'read_source_unit', 'resolve_source_locator'].includes(name)) return this.runOriginal(name, args, sources, generation, context);
    if (name === 'read_section') {
      object(args, ['guideId', 'revision', 'unitId']);
      if (!isId(args.guideId) || !isRevision(args.revision) || !isId(args.unitId)) reject('章节工具参数无效。');
      const pinned = this.index.db.prepare('SELECT value FROM state WHERE key=?').get(`catalog:${generation}`);
      if (pinned && !JSON.parse(pinned.value).entries.some(entry => entry.guideId === args.guideId && entry.revision === args.revision)) return { error: '该导读修订不在本轮固定目录中。' };
      const guide = this.get(args.guideId, args.revision), unit = guide?.units.find(item => item.id === args.unitId);
      if (!unit) return { error: '指定的文章章节不存在。请用 search_library 返回的精确 guideId/revision/unitId，不得猜测章节。' };
      if (unit.text.length > 16000) return { error: '章节超过工具的 16000 字预算。请在对应章节中新建问答。' };
      const preview = this.source(guide, unit, []);
      const output = { source: preview, coverage: guide.metadata.coverage, sourceIdentity: guide.metadata.source, evidence: this.evidenceFor(`guide:${args.guideId}/${args.revision}:${args.unitId}`, generation) };
      if (Buffer.byteLength(JSON.stringify(output)) > localResultBudget(context) / 1.12) return { error: '剩余资料预算不足以完整补读这个导读章节；未把未读部分加入证据。可在该章节开始较聚焦的新问题，或用原文工具按范围补读。' };
      output.source = this.source(guide, unit, sources); return output;
    }
    if (name === 'search_library') {
      object(args, ['query']);
      if (!isText(args.query, 300, 1) || !args.query.trim()) reject('库内搜索词无效。');
      const hits = this.index.search(args.query, { generation, kind: 'guide', limit: 8 });
      const docs = hits.map(hit => { const guide = this.get(hit.guideId, hit.revision); return { guide, unit: guide.units.find(item => item.id === hit.unitId) }; });
      const budget = localResultBudget(context, true);
      const render = (count, bytes) => {
        let nextId = sources.filter(item => item.kind === 'guide').length;
        return { results: docs.slice(0, count).map(({ guide, unit }) => {
          const text = utf8Prefix(unit.text, bytes), source = this.source(guide, unit, [], text);
          source.id = sources.find(item => item.url === source.url)?.id ?? 'L' + (++nextId);
          return { source, excerptOnly: text.length < unit.text.length, range: { start: 0, end: text.length, total: unit.text.length } };
        }), candidateCount: hits.length, returnedCount: count, omittedCount: hits.length - count, indexGeneration: generation,
          scope: '固定代次的导读候选节选；范围见range。按本轮预算限制候选，不代表全面文献检索；可按需补读。' };
      };
      let count = hits.length, bytes = 500, output = render(count, bytes);
      while (Buffer.byteLength(JSON.stringify(output)) > budget && bytes > 80) { bytes = Math.max(80, Math.floor(bytes / 2)); output = render(count, bytes); }
      while (Buffer.byteLength(JSON.stringify(output)) > budget && count > 0) output = render(--count, bytes);
      if (Buffer.byteLength(JSON.stringify(output)) > budget) return { error: '本轮剩余预算不足以加入更多导读候选；已有来源保持。' };
      output.results.forEach((item, at) => { item.source.id = this.source(docs[at].guide, docs[at].unit, sources, item.source.text).id; });
      return output;

    }
    reject('模型请求了未开放的工具。');
  }
  runOriginal(name, args, sources, generation, context = {}) {
    const attach = (doc, start, end) => {
      const existing = sources.find(item => item.kind === 'original' && item.sourceRevisionId === doc.sourceRevisionId && item.parserRevision === doc.parserRevision && item.sourceUnitId === doc.sourceUnitId);
      if (!existing && sources.length >= 64) reject('来源数量超过本轮上限。');
      const { paperId, sourceRevisionId, materialSha256, parserRevision, sourceUnitId, title, version, locator, verification, gaps, url } = doc;
      const source = existing ?? { id: `O${sources.filter(item => item.kind === 'original').length + 1}`, kind: 'original', paperId, sourceRevisionId, materialSha256, parserRevision, sourceUnitId, title, version, locator, verification, gaps, url, text: '' };
      const ranges = [...(source.readRanges ?? []), { start, end, total: doc.text.length }].sort((a, b) => a.start - b.start), merged = [];
      for (const range of ranges) { const last = merged.at(-1); if (last && range.start <= last.end) last.end = Math.max(last.end, range.end); else merged.push({ ...range }); }
      source.readRanges = merged;
      source.text = merged.map(range => `[原文单元字符 ${range.start}–${range.end}/${range.total}]\n${doc.text.slice(range.start, range.end)}`).join('\n\n');
      if (!existing) sources.push(source); return source;
    };
    if (name === 'search_sources') {
      object(args, ['query'], ['paperId', 'limit']);
      if (!isText(args.query, 300, 1) || !args.query.trim() || args.paperId !== undefined && !isText(args.paperId, 200, 1) || args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 12)) reject('原文检索参数无效。');
      const hits = this.index.search(args.query, { generation, kind: 'original', paperId: args.paperId, limit: args.limit ?? 8 });
      const budget = localResultBudget(context, true);
      const render = (count, excerptBytes) => {
        const materials = [], materialKeys = new Map(); let nextId = sources.filter(item => item.kind === 'original').length;
        const results = hits.slice(0, count).map(doc => {
          const key = doc.sourceRevisionId + ':' + doc.parserRevision;
          let material = materialKeys.get(key);
          if (!material) {
            material = 'M' + (materials.length + 1); materialKeys.set(key, material);
            const { paperId, sourceRevisionId, parserRevision, materialSha256, version, gaps } = doc;
            materials.push({ id: material, title: utf8Prefix(doc.title.split(' · ')[0], 200), paperId, sourceRevisionId, parserRevision, materialSha256, version, gaps });
          }
          const existing = sources.find(item => item.kind === 'original' && item.sourceRevisionId === doc.sourceRevisionId && item.parserRevision === doc.parserRevision && item.sourceUnitId === doc.sourceUnitId);
          const text = utf8Prefix(doc.text, excerptBytes), range = { start: 0, end: text.length, total: doc.text.length };
          return { material, source: { id: existing?.id ?? 'O' + (++nextId), kind: 'original', sourceUnitId: doc.sourceUnitId, text, locator: { physicalPage: doc.locator.physicalPage, printedPageLabel: doc.locator.printedPageLabel, anchor: doc.locator.anchor }, verification: doc.verification },
            range, excerptOnly: text.length < doc.text.length, nextOffset: text.length < doc.text.length ? text.length : null };
        });
        return { materials, results, indexGeneration: generation, candidateCount: hits.length, returnedCount: count, omittedCount: hits.length - count,
          scope: '仅明确导入的固定原文候选节选。material指向共享固定身份；range为单元内字符偏移。未发送完整原文；按需补读。无命中不代表领域空白。', budgetLimited: count < hits.length };
      };
      let count = hits.length, excerptBytes = 500, output = render(count, excerptBytes);
      while (Buffer.byteLength(JSON.stringify(output)) > budget && excerptBytes > 80) { excerptBytes = Math.max(80, Math.floor(excerptBytes / 2)); output = render(count, excerptBytes); }
      while (Buffer.byteLength(JSON.stringify(output)) > budget && count > 0) output = render(--count, excerptBytes);
      if (Buffer.byteLength(JSON.stringify(output)) > budget) return { error: '本轮取证预算不足，未加入新证据；请缩小问题或开始新问答。', returnedCount: 0, candidateCount: hits.length };
      output.results.forEach((item, at) => { item.source.id = attach(hits[at], 0, item.range.end).id; });
      return output;
    }
    object(args, ['sourceRevisionId', 'parserRevision', 'sourceUnitId'], ['offset', 'maxChars']);
    if (!isId(args.sourceRevisionId) || !/^[a-f0-9]{64}$/.test(args.parserRevision) || !isId(args.sourceUnitId)
      || args.offset !== undefined && (!Number.isSafeInteger(args.offset) || args.offset < 0 || args.offset > 100000)
      || args.maxChars !== undefined && (!Number.isSafeInteger(args.maxChars) || args.maxChars < 1 || args.maxChars > 20000)) reject('原文读取参数无效。');
    const doc = this.index.get(`original:${args.sourceRevisionId}:${args.parserRevision}:${args.sourceUnitId}`, generation);
    if (!doc) return { error: '该原文单元不在本轮固定的索引代次；请使用本轮检索返回的完整身份。', indexGeneration: generation };
    const start = args.offset ?? 0;
    if (start >= doc.text.length || start && doc.text.charCodeAt(start) >= 0xdc00 && doc.text.charCodeAt(start) <= 0xdfff && doc.text.charCodeAt(start - 1) >= 0xd800 && doc.text.charCodeAt(start - 1) <= 0xdbff) return { error: '原文偏移超出单元范围；请使用上一次返回的nextOffset。' };
    const evidence = this.evidenceFor(doc.id, generation);
    const existing = sources.find(item => item.kind === 'original' && item.sourceRevisionId === doc.sourceRevisionId && item.parserRevision === doc.parserRevision && item.sourceUnitId === doc.sourceUnitId);
    const sourceId = existing?.id ?? 'O' + (sources.filter(item => item.kind === 'original').length + 1);
    const { paperId, sourceRevisionId, materialSha256, parserRevision, sourceUnitId, title, version, locator, verification, gaps, url } = doc;
    const render = text => {
      const range = { start, end: start + text.length, total: doc.text.length }, partial = start > 0 || range.end < range.total;
      return { source: { id: sourceId, kind: 'original', paperId, sourceRevisionId, materialSha256, parserRevision, sourceUnitId, title, version, locator, verification, gaps, url, text, readRanges: [range] },
        range, unitRange: doc.range, partial, excerptOnly: partial, nextOffset: range.end < range.total ? range.end : null, evidence, indexGeneration: generation,
        scope: partial ? '仅本次range内的原文解析文本；可按nextOffset继续，不代表整单元已读。' : '已读取本原文单元全部解析文本；不代表整篇或图像核验。' };
    };
    const available = doc.text.slice(start, start + (args.maxChars ?? doc.text.length)), budget = Math.floor(localResultBudget(context) / 1.12);
    let low = 0, high = Buffer.byteLength(available), output = render('');
    while (low < high) { const middle = Math.ceil((low + high) / 2), candidate = render(utf8Prefix(available, middle)); if (Buffer.byteLength(JSON.stringify(candidate)) <= budget) { low = middle; output = candidate; } else high = middle - 1; }
    output = render(utf8Prefix(available, low));
    if (!output.source.text || Buffer.byteLength(JSON.stringify(output)) > budget) return { error: '本轮剩余预算不足以补读该原文单元，未把未读文本计作证据。请缩小问题或开始新问答。', indexGeneration: generation };
    attach(doc, start, output.range.end);
    return output;

  }
}
