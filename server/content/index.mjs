import { LIMITS, SYSTEM_PROMPT, availableTools } from '../ai/instructions.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { normalizedRelativePath } from '../../shared/package-path.mjs';
import { RetrievalIndex, digest, RETRIEVAL_VERSION } from './retrieval-index.mjs';
import { ReadingMaterials } from './materials.mjs';
import { utf8Prefix, localResultBudget } from '../ai/prompt-budget.mjs';
import { guidePromptMetadata } from './prompt-metadata.mjs';
import { termMatcher, termsIn } from '../../shared/glossary.mjs';
import { object, reject, isId, isRevision, isText } from '../http/validation.mjs';
import { normalizeReadingText as normalizeText, readingTextFromMarkdown } from '../../shared/reading-text.mjs';

const sectionUrl = (guide, unit) => `/read/${guide.metadata.id}/${guide.metadata.revision}#${unit.id}`;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
// Upper bound for the guide text sent with a question before any tool call.
const INITIAL_SECTION_BYTES = 24000;
// Tool JSON is itself a string inside both provider protocols.
const resultBytes = value => jsonBytes(JSON.stringify(value));
const mergeRanges = ranges => {
  const merged = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
};
const guideRanges = (source, unit) => source?.readRanges ?? (source?.text && unit.text.startsWith(source.text) ? [{ start: 0, end: source.text.length, total: unit.text.length }] : []);
const nextUnread = (ranges, offset = 0) => {
  for (const range of ranges) if (offset >= range.start && offset < range.end) offset = range.end;
  return offset;
};
function selectedRawRange(unit, selection) {
  const target = normalizeText(selection);
  const blocks = unified().use(remarkParse).parse(unit.text).children.map(node => ({
    start: node.position.start.offset, end: node.position.end.offset,
    text: readingTextFromMarkdown(unit.text.slice(node.position.start.offset, node.position.end.offset)),
  })).filter(block => block.text);
  const combined = blocks.map(block => block.text).join(' '), at = combined.indexOf(target);
  if (at >= 0) {
    let offset = 0, start;
    for (const block of blocks) {
      if (start === undefined && offset + block.text.length > at) start = block.start;
      if (start !== undefined && offset + block.text.length >= at + target.length) return { start, end: block.end };
      offset += block.text.length + 1;
    }
  }
  // Legacy Markdown selections can contain markup absent from reading text.
  // Retaining the real whole section is honest; the budget may reject it.
  return { start: 0, end: unit.text.length };
}
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
        return { ...unit, text, renderedText: readingTextFromMarkdown(text) };
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
      if (this.catalog.currentRevisions[metadata.id] !== metadata.revision || this.catalog.archivedGuideIds?.includes(metadata.id)) continue;
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
  /** Public catalog of current guides for planning the next reading; no personal reading state. */
  libraryOverview() {
    const current = this.catalog?.currentRevisions ? Object.entries(this.catalog.currentRevisions).map(([id, revision]) => this.entries.get(`${id}/${revision}`)) : [...this.entries.values()];
    return current.filter(m => m && !this.catalog.archivedGuideIds?.includes(m.id)).map(m => ({ guideId: m.id, revision: m.revision, type: m.type, paperTitle: m.paperTitle, guideTitle: m.orientation?.shortTitle ?? m.title,
      source: m.source?.id ?? m.paperId, version: m.source?.version ?? null, topics: (m.orientation?.topics ?? []).map(topic => topic.label) }));
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
  source(guide, unit, sources, text = unit.text, offset = 0) {
    const url = sectionUrl(guide, unit);
    const existing = sources.find(source => source.kind === 'guide' && source.url === url);
    if (text !== unit.text.slice(offset, offset + text.length)) reject('导读片段与固定章节范围不一致。');
    if (!existing && sources.length >= 64) reject('来源数量超过本轮上限。');
    const source = existing ?? { id: `L${sources.filter(item => item.kind === 'guide').length + 1}`, kind: 'guide', bodySha256: guide.metadata.bodySha256, title: `${guide.metadata.title} · ${unit.heading ?? '导读开篇'}`,
      url, guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id, text, version: guide.metadata.source.version };
    if (text.length) {
      source.readRanges = mergeRanges([...guideRanges(existing, unit), { start: offset, end: offset + text.length, total: unit.text.length }]);
      source.text = source.readRanges.length === 1 ? unit.text.slice(source.readRanges[0].start, source.readRanges[0].end)
        : source.readRanges.map(range => `[导读章节字符 ${range.start}–${range.end}/${range.total}]\n${unit.text.slice(range.start, range.end)}`).join('\n\n');
    }
    if (!existing) sources.push(source); return source;
  }
  // Reviewed glossary names for terms mentioned in the sent units; about 1 KB at most.
  termsFor(units) {
    if (!this.rootDir) return [];
    let bytes;
    try { bytes = this.read('content/glossary.json', 1024 * 1024); } catch { return []; }
    const hash = digest(bytes);
    if (hash !== this.glossaryDigest) {
      const entries = JSON.parse(bytes).entries ?? [];
      this.glossary = { entries: new Map(entries.map(entry => [entry.id, entry])), matcher: termMatcher(entries) }; this.glossaryDigest = hash;
    }
    const terms = [];
    for (const id of termsIn(units.map(unit => unit.renderedText ?? unit.text).join('\n'), this.glossary.matcher)) {
      const { term, full, zh, field } = this.glossary.entries.get(id);
      const item = { term, ...(full ? { full } : {}), ...(zh ? { zh } : {}), field };
      if (Buffer.byteLength(JSON.stringify([...terms, item])) > 1024) break;
      terms.push(item);
    }
    return terms;
  }
  prepare(request, previous, config) {
    this.refresh();
    const guide = this.get(request.guideId, request.revision);
    if (!guide) reject('该文章版本不在后端书库中，请刷新页面或重启后端。', 409);
    if (guide.metadata.bodySha256 !== request.bodySha256) reject('当前页面与后端的文章内容不一致，请重新构建页面并重启后端。', 409);
    const active = guide.units.find(unit => unit.id === request.unitId);
    if (!active) reject('当前章节不存在，请重新选择章节。');
    if (request.selection && !normalizeText(active.text).includes(normalizeText(request.selection)) && !active.renderedText.includes(normalizeText(request.selection))) reject('选文与当前章节不一致，请重新选择；公式或跨章节文字可直接写入问题。', 400, 'selection_mismatch');
    const evidence = this.evidenceFor(`guide:${request.guideId}/${request.revision}:${request.unitId}`);
    const sectionUnits = [...new Set([guide.units[0], active])];
    const guideBytes = Buffer.byteLength(guide.body);
    const selectionRange = request.selection ? selectedRawRange(active, request.selection) : undefined;
    const selectionBytes = selectionRange ? Buffer.byteLength(active.text.slice(selectionRange.start, selectionRange.end)) : 0;
    const minimumTextBytes = selectionRange ? selectionBytes + (sectionUnits.length > 1 ? 256 : 0) : 512;
    let historyChars = 0;
    const history = [];
    for (const turn of previous.filter(turn => turn.status === 'complete').slice(-6).reverse()) {
      const length = turn.question.length + turn.answer.length;
      const candidate = [turn, ...history].flatMap(item => [{ role: 'user', content: item.question }, { role: 'assistant', content: item.answer }]);
      if (historyChars + length > LIMITS.historyChars || jsonBytes(candidate) > 4000) break;
      history.unshift(turn); historyChars += length;
    }
    // Charge the actual bounded history and escaped metadata/source envelope.
    // Keep a separate tool-result allowance; the final adapter check remains strict.
    // Research/command additions are already deducted by the calling layer.
    const tools = config.toolsEnabled === false ? [] : availableTools(Boolean(request.webSearch && config.searchAvailable));
    const hardInputLimit = (config.contextTokenLimit ?? 32768) - (config.maxOutputTokens ?? 3000);
    const projected = new Map();
    const render = (units, scope, textBytes) => {
      const activeStart = selectionRange?.start ?? 0;
      // The section being asked about comes first; the opening keeps a small share for orientation.
      const activeText = scope === 'section' ? utf8Prefix(active.text.slice(activeStart), Math.max(selectionBytes, units.length === 1 ? textBytes : Math.max(Math.floor(textBytes * .7), textBytes - 1500))) : active.text;
      const otherBytes = Math.max(0, textBytes - Buffer.byteLength(activeText));
      const ranges = [], sources = units.map(unit => {
        const start = scope === 'section' && unit.id === active.id ? activeStart : 0;
        const text = scope === 'full-guide' ? unit.text : unit.id === active.id ? activeText : utf8Prefix(unit.text, otherBytes);
        ranges.push({ unitId: unit.id, start, end: start + text.length, total: unit.text.length, excerptOnly: start > 0 || text.length < unit.text.length });
        return this.source(guide, unit, [], text, start);
      });
      sources.forEach((source, index) => { source.id = `L${index + 1}`; });
      if (!projected.has(units)) projected.set(units, guidePromptMetadata(guide.metadata, units, evidence, this.termsFor(units)));
      const base = projected.get(units);
      const citations = base.citations.filter(citation => sources.some(source => source.text.includes(citation.url)));
      const metadata = { ...base, citations,
        metadataProjection: { ...base.metadataProjection, omittedCitations: guide.metadata.citations.length - citations.length,
          citationScope: 'only-sent-guide-ranges', note: `${base.metadataProjection.note} 引用清单进一步限定为实际发送片段中完整出现的URL；未读章节中的引用标签没有发送。` }, guideRanges: ranges,
        guideScope: ranges.some(range => range.excerptOnly) ? '导读预算内节选；不是完整章节。可按需补读。' : '所列导读章节文本完整。' };
      const content = JSON.stringify({ researchSnapshot: null, metadata, activeUnit: request.unitId, selection: request.selection ?? '', sources });
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content },
        ...history.flatMap(turn => [{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]), { role: 'user', content: request.question }];
      // 2 KB covers scope prose, protocol differences and the normal 512-byte
      // framing allowance; do not count a fictitious 10 KB of missing history.
      return { sources, metadataJson: JSON.stringify(metadata), bytes: jsonBytes({ messages, tools }) + 2000 };
    };
    let scope = guide.body.length <= LIMITS.contextChars && guideBytes <= 5000 ? 'full-guide' : 'section';
    let units = scope === 'full-guide' ? guide.units : sectionUnits;
    if (units.length > 64) { scope = 'section'; units = sectionUnits; }
    // Aim to send the whole section in question (from the selection onward) plus a short opening,
    // so an ordinary question is answered without a reading round. The budget below still decides.
    // `initialGuideBytes` is an internal knob (not a saved setting) for callers that need a tight first excerpt.
    const desiredTextBytes = Math.max(5000, minimumTextBytes, Math.min(Number.isSafeInteger(config.initialGuideBytes) ? config.initialGuideBytes : INITIAL_SECTION_BYTES,
      Buffer.byteLength(active.text.slice(selectionRange?.start ?? 0)) + (sectionUnits.length > 1 ? Math.min(1500, Buffer.byteLength(guide.units[0].text)) : 0)));
    let selected = render(units, scope, Math.max(5000, minimumTextBytes));
    if (scope === 'full-guide' && selected.bytes > hardInputLimit) { scope = 'section'; units = sectionUnits; }
    let minimum = render(units, scope, minimumTextBytes);
    while (history.length && minimum.bytes > hardInputLimit) { history.shift(); minimum = render(units, scope, minimumTextBytes); }
    // The desired tool allowance yields to required evidence. A large private
    // attachment must not be rejected just to reserve hypothetical tool text.
    const reserveTarget = Number.isSafeInteger(config.initialContextReserveBytes) && config.initialContextReserveBytes >= 0 ? config.initialContextReserveBytes : 4000;
    const reserve = tools.length ? Math.min(reserveTarget, Math.max(0, hardInputLimit - minimum.bytes)) : 0;
    const inputLimit = hardInputLimit - reserve;
    if (minimum.bytes > hardInputLimit) reject('问题和必要资料超过本机的上下文预算，请缩短输入或调整本机模型上下文预算。选文所需的真实导读片段未被截掉。', 413);
    if (scope === 'section') {
      let low = minimumTextBytes, high = desiredTextBytes;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2), candidate = render(units, scope, middle);
        // Text beyond the ordinary excerpt may not use the room kept for a later evidence round.
        if (candidate.bytes <= inputLimit - (tools.length && middle > Math.max(5000, minimumTextBytes) ? 4000 : 0)) low = middle; else high = middle - 1;
      }
      selected = render(units, scope, low);
    }
    const { sources, metadataJson } = selected;
    const context = { guideId: request.guideId, revision: request.revision, bodySha256: request.bodySha256, unitId: request.unitId,
      selection: request.selection ?? '', scope, metadataJson,
      historyTurnIds: history.map(turn => turn.id), webSearch: request.webSearch, model: config.modelId, toolEvents: [], catalogDigest: this.catalogDigest, indexGeneration: this.generation };
    return { context, sources, history };
  }
  runLocal(name, args, sources, context = {}) {
    const generation = context.indexGeneration ?? this.generation;
    if (['search_sources', 'read_source_unit', 'resolve_source_locator'].includes(name)) return this.runOriginal(name, args, sources, generation, context);
    if (name === 'read_section') {
      object(args, ['guideId', 'revision', 'unitId'], ['offset', 'maxChars']);
      if (!isId(args.guideId) || !isRevision(args.revision) || !isId(args.unitId)
        || args.offset !== undefined && (!Number.isSafeInteger(args.offset) || args.offset < 0 || args.offset > 1000000)
        || args.maxChars !== undefined && (!Number.isSafeInteger(args.maxChars) || args.maxChars < 1 || args.maxChars > 16000)) reject('章节工具参数无效。');
      const pinned = this.index.db.prepare('SELECT value FROM state WHERE key=?').get(`catalog:${generation}`);
      if (pinned && !JSON.parse(pinned.value).entries.some(entry => entry.guideId === args.guideId && entry.revision === args.revision)) return { error: '该导读修订不在本轮固定目录中。' };
      const guide = this.get(args.guideId, args.revision), unit = guide?.units.find(item => item.id === args.unitId);
      if (!unit) return { error: '指定的文章章节不存在。请用 search_library 返回的精确 guideId/revision/unitId，不得猜测章节。' };
      const existing = sources.find(source => source.kind === 'guide' && source.url === sectionUrl(guide, unit));
      const known = guideRanges(existing, unit), requestedOffset = args.offset ?? 0;
      if (requestedOffset > unit.text.length || requestedOffset && /[\uDC00-\uDFFF]/u.test(unit.text[requestedOffset]) && /[\uD800-\uDBFF]/u.test(unit.text[requestedOffset - 1])) return { error: '导读偏移超出章节范围；请使用上一次返回的nextOffset。' };
      const start = nextUnread(known, requestedOffset);
      const firstGap = nextUnread(known);
      if (start >= unit.text.length) return { sourceRef: existing?.id, alreadyRead: true, readRanges: known, nextOffset: firstGap < unit.text.length ? firstGap : null,
        excerptOnly: firstGap < unit.text.length, scope: '请求位置之后的导读文本此前已读取；本次没有加入新证据。' };
      let coverage = { coverage: guide.metadata.coverage, sourceIdentity: guide.metadata.source };
      const identity = { guideId: guide.metadata.id, revision: guide.metadata.revision, bodySha256: guide.metadata.bodySha256 };
      let initialMetadata;
      try { initialMetadata = JSON.parse(context.metadataJson ?? '{}'); } catch { /* No reusable initial identity. */ }
      if (context.guideId === identity.guideId && context.revision === identity.revision && context.bodySha256 === identity.bodySha256
        && initialMetadata?.coverage && initialMetadata.source?.id === guide.metadata.source.id) {
        coverage = { coverageRef: { ...identity, location: 'initial.metadata.coverage', sourceIdentityLocation: 'initial.metadata.source' } };
      } else {
        const at = (context.toolEvents ?? []).findIndex(event => {
          try { const value = JSON.parse(event.resultJson); return value.coverage && value.source?.guideId === identity.guideId && value.source?.revision === identity.revision && value.source?.bodySha256 === identity.bodySha256; }
          catch { return false; }
        });
        if (at >= 0) coverage = { coverageRef: { ...identity, toolEventIndex: at, location: 'coverage', sourceIdentityLocation: 'sourceIdentity' } };
      }
      const sourceId = existing?.id ?? `L${sources.filter(source => source.kind === 'guide').length + 1}`;
      let sourceRef;
      if (existing && coverage.coverageRef?.location === 'initial.metadata.coverage' && initialMetadata.guideRanges?.some(range => range.unitId === unit.id)) {
        sourceRef = { sourceId, location: 'initial.sources' };
      } else if (existing) {
        for (const [at, event] of (context.toolEvents ?? []).entries()) {
          let value; try { value = JSON.parse(event.resultJson); } catch { continue; }
          if (value.source?.id === sourceId && value.source.guideId === guide.metadata.id) { sourceRef = { sourceId, toolEventIndex: at, location: 'source' }; break; }
          const index = value.results?.findIndex(item => item.source?.id === sourceId && item.source.guideId === guide.metadata.id) ?? -1;
          if (index >= 0) { sourceRef = { sourceId, toolEventIndex: at, resultIndex: index, location: 'results.source' }; break; }
        }
      }
      const evidence = this.evidenceFor(`guide:${args.guideId}/${args.revision}:${args.unitId}`, generation);
      const render = text => {
        const range = { start, end: start + text.length, total: unit.text.length };
        const readRanges = mergeRanges([...known, range]);
        const next = nextUnread(readRanges, range.end), earliest = nextUnread(readRanges);
        const nextOffset = next < unit.text.length ? next : earliest < unit.text.length ? earliest : null;
        const fullSource = this.source(guide, unit, [], text, start); fullSource.id = sourceId;
        const source = sourceRef ? { id: sourceId, kind: 'guide', text, readRanges: text.length ? [range] : [] } : fullSource;
        return { source, ...(sourceRef ? { sourceRef } : {}), ...coverage, evidence, range, requestedOffset, excerptOnly: earliest < unit.text.length, nextOffset, indexGeneration: generation,
          scope: '仅range新增片段；sourceRef/coverageRef复用已发送身份及覆盖限制，未读空隙不是证据。' };
      };
      // Do not resend a later already-read interval or silently fill the gap before it.
      const later = known.find(range => range.start > start);
      const available = unit.text.slice(start, Math.min(start + (args.maxChars ?? 16000), later?.start ?? unit.text.length));
      const budget = localResultBudget(context);
      let low = 0, high = Buffer.byteLength(available);
      while (low < high) {
        const middle = Math.ceil((low + high) / 2), candidate = render(utf8Prefix(available, middle));
        if (resultBytes(candidate) <= budget) low = middle; else high = middle - 1;
      }
      const output = render(utf8Prefix(available, low));
      if (!output.source.text || resultBytes(output) > budget) return { error: '本轮剩余预算不足以补读该导读片段，未把未读文本计作证据。请缩小问题或开始新问答。', indexGeneration: generation };
      this.source(guide, unit, sources, output.source.text, start);
      return output;
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
          return { source, excerptOnly: text.length < unit.text.length, range: { start: 0, end: text.length, total: unit.text.length }, nextOffset: text.length < unit.text.length ? text.length : null };
        }), candidateCount: hits.length, returnedCount: count, omittedCount: hits.length - count, indexGeneration: generation,
          scope: '固定代次的导读候选节选；范围见range。按本轮预算限制候选，不代表全面文献检索；可按需补读。' };
      };
      let count = hits.length, bytes = 500, output = render(count, bytes);
      while (resultBytes(output) > budget && bytes > 80) { bytes = Math.max(80, Math.floor(bytes / 2)); output = render(count, bytes); }
      while (resultBytes(output) > budget && count > 0) output = render(--count, bytes);
      if (resultBytes(output) > budget) return { error: '本轮剩余预算不足以加入更多导读候选；已有来源保持。' };
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
