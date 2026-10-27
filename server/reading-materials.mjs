import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'parse5';
import Ajv2020 from 'ajv/dist/2020.js';
import { digest } from './retrieval-index.mjs';
import { isId, isHash, isText, safeWebUrl, object, reject } from './validation.mjs';

export const MATERIAL_LIMIT = 64 * 1024 * 1024;
const PARSER = 'paperdesk-structure-1/pdfjs-6.4.299/parse5-8.0.1';
const ajv = new Ajv2020({ strict: true });
const validators = new Map(['material', 'derived', 'evidence'].map(name => [name, ajv.compile(JSON.parse(readFileSync(new URL(`../schemas/reading-${name}-v1.schema.json`, import.meta.url), 'utf8')))]));
function validate(name, value) { if (!validators.get(name)(value)) reject('原文伴随数据不符合版本化 schema。'); return value; }
const compact = text => text.replace(/\s+/gu, ' ').trim();
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
const ignored = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'nav', 'form']);
const nodeText = node => ignored.has(node.tagName) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(nodeText).join(' ');
function safeRead(root, child, max = MATERIAL_LIMIT) {
  const base = realpathSync(root), file = realpathSync(resolve(base, child)), rel = relative(base, file);
  if (rel.startsWith('..') || isAbsolute(rel) || !statSync(file).isFile() || statSync(file).size > max) reject('原文材料路径或大小无效。');
  return readFileSync(file);
}
function htmlUnits(bytes, sourceUrl) {
  const tree = parse(bytes.toString('utf8')), units = [], assets = [], headingPath = [];
  const emit = (node, anchor, type) => {
    const text = compact(nodeText(node)); if (!text) return;
    // Tables remain one semantic unit. Oversized structures are explicitly partial.
    const max = 12000;
    for (let offset = 0; offset < text.length; offset += max) units.push({ sourceUnitId: `u${String(units.length + 1).padStart(5, '0')}`, type, headingPath: [...headingPath], text: text.slice(offset, offset + max),
      locator: { label: `${headingPath.join(' / ') || '正文'}${offset ? ` · 文本偏移 ${offset}` : ''}`, anchor: anchor || null, physicalPage: null, printedPageLabel: null }, range: { start: offset, end: Math.min(text.length, offset + max), total: text.length }, verification: 'unreviewed' });
  };
  function walk(node, anchor) {
    if (ignored.has(node.tagName)) return;
    const next = attr(node, 'id') || anchor;
    if (node.tagName === 'img') {
      const raw = attr(node, 'src');
      if (raw) { try { assets.push({ url: new URL(raw, sourceUrl).href, status: 'not-acquired', alt: attr(node, 'alt') || '' }); } catch { /* no invented URL */ } }
    }
    if (/^h[1-6]$/.test(node.tagName ?? '')) {
      const level = Number(node.tagName.slice(1)); headingPath.length = Math.min(headingPath.length, level - 1); headingPath.push(compact(nodeText(node)));
      emit(node, next, 'heading'); return;
    }
    if (['p', 'table', 'figure', 'figcaption', 'math', 'li'].includes(node.tagName)) {
      emit(node, next, node.tagName === 'table' ? 'table' : node.tagName === 'figure' ? 'figure-caption' : node.tagName === 'math' ? 'equation' : 'paragraph');
      // Collect external asset gaps without rendering or following them.
      function images(child) { if (child.tagName === 'img') { const raw = attr(child, 'src'); if (raw) try { assets.push({ url: new URL(raw, sourceUrl).href, status: 'not-acquired', alt: attr(child, 'alt') || '' }); } catch {} } for (const nested of child.childNodes ?? []) images(nested); }
      images(node); return;
    }
    for (const child of node.childNodes ?? []) walk(child, next);
  }
  walk(tree, null);
  return { units, assets, gaps: ['HTML 结构文本已提取；公式、表格行列和图像细节尚需独立核验。', ...(assets.length ? ['原文依赖的外部图像未随 HTML 自动下载；图注不代表已查看图像。'] : [])] };
}
async function pdfUnits(bytes, signal) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, stopAtErrors: true });
  const abort = () => { void task.destroy(); }; signal?.addEventListener('abort', abort, { once: true });
  const units = [], gaps = ['PDF 文本层按物理页提取；多栏阅读顺序、公式、表格和图像未经视觉核验，不保证完整。'];
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 1000) reject('PDF 超过 1000 页的处理预算。');
    const labels = await pdf.getPageLabels();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted(); const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
      const text = content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      if (!text) { gaps.push(`PDF 第 ${pageNumber} 页无可用文本层；保留原始文件，未执行 OCR。`); continue; }
      for (let offset = 0; offset < text.length; offset += 10000) units.push({ sourceUnitId: `p${pageNumber}-s${Math.floor(offset / 10000) + 1}`, type: 'page-text', headingPath: [], text: text.slice(offset, offset + 10000),
        locator: { label: `PDF 第 ${pageNumber} 页${labels?.[pageNumber - 1] ? `（文内页标签 ${labels[pageNumber - 1]}）` : '（印刷页码未识别）'}`, physicalPage: pageNumber, printedPageLabel: labels?.[pageNumber - 1] ?? null, anchor: null }, range: { start: offset, end: Math.min(text.length, offset + 10000), total: text.length }, verification: 'unreviewed' });
      page.cleanup();
    }
    return { units, assets: [], gaps: gaps.slice(0, 20) };
  } finally { signal?.removeEventListener('abort', abort); await task.destroy(); }
}
export function validateEvidenceRecord(record) {
  object(record, ['schemaVersion', 'evidenceId', 'guideId', 'revision', 'unitId', 'claim', 'conditions', 'attribution', 'sourceRevisionId', 'parserRevision', 'sourceUnitIds', 'review']);
  if (record.schemaVersion !== 1 || !isId(record.evidenceId) || !isId(record.guideId) || !Number.isSafeInteger(record.revision) || record.revision < 1 || !isId(record.unitId)
    || !isText(record.claim, 5000, 1) || !isText(record.conditions, 5000) || !['paper', 'editorial-explanation', 'hypothesis'].includes(record.attribution)
    || !isId(record.sourceRevisionId) || !isHash(record.parserRevision) || !Array.isArray(record.sourceUnitIds) || !record.sourceUnitIds.length || record.sourceUnitIds.length > 20 || !record.sourceUnitIds.every(isId)) reject('证据伴随记录无效。');
  object(record.review, ['status', 'reviewerType', 'note']);
  if (!['unreviewed', 'text-checked', 'visually-checked'].includes(record.review.status) || !['AI', 'human'].includes(record.review.reviewerType) || !isText(record.review.note, 5000, 1)) reject('证据核验记录无效。');
  return record;
}

export class ReadingMaterials {
  constructor(directory) { this.directory = directory; }
  ensure() { for (const name of ['materials', 'manifests', 'derived', 'evidence', 'jobs']) mkdirSync(join(this.directory, name), { recursive: true }); }
  list() {
    const dir = join(this.directory, 'manifests'); if (!existsSync(dir)) return [];
    const stamp = statSync(dir).mtimeMs;
    if (this.manifestCache?.stamp === stamp) return this.manifestCache.records;
    const records = readdirSync(dir).filter(name => /^[a-z0-9-]+\.json$/.test(name)).sort().map(name => {
      const manifest = validate('material', JSON.parse(safeRead(dir, name, 2 * 1024 * 1024)));
      if (`${manifest.sourceRevisionId}.json` !== name || !safeWebUrl(manifest.originalUrl) || !safeWebUrl(manifest.finalUrl) || manifest.materialFile !== `${manifest.materialSha256}.${manifest.format}`) reject('原文材料身份与清单不符。');
      return manifest;
    });
    this.manifestCache = { stamp, records }; return records;
  }
  evidence() {
    const dir = join(this.directory, 'evidence'); if (!existsSync(dir)) return [];
    const stamp = statSync(dir).mtimeMs;
    if (this.evidenceCache?.stamp === stamp) return this.evidenceCache.records;
    const files = readdirSync(dir).filter(name => /^[a-z0-9-]+\.json$/.test(name)).sort();
    if (files.length > 10000) reject('证据记录超过单库处理预算。');
    const records = files.map(name => {
      const record = validate('evidence', JSON.parse(safeRead(dir, name, 64 * 1024)));
      validateEvidenceRecord(record);
      if (`${record.evidenceId}.json` !== name) reject('证据身份与文件名不符。');
      return record;
    });
    this.evidenceCache = { stamp, records }; return records;
  }
  manifest(id) { if (!isId(id)) reject('原文材料 ID 无效。'); return this.list().find(item => item.sourceRevisionId === id); }
  derived(manifest) {
    const bytes = safeRead(join(this.directory, 'derived'), `${manifest.parserRevision}.json`, 64 * 1024 * 1024);
    if (digest(bytes) !== manifest.outputSha256) reject('原文解析摘要不符，请从原材料恢复。', 409);
    const output = validate('derived', JSON.parse(bytes));
    if (output.units.length !== manifest.unitCount || new Set(output.units.map(unit => unit.sourceUnitId)).size !== output.units.length) reject('原文解析单元身份无效。');
    return output;
  }
  view(id, parserRevision, unitId) {
    if (!isHash(parserRevision) || !isId(unitId)) reject('原文读取定位无效。');
    const manifest = this.manifest(id);
    if (!manifest || manifest.parserRevision !== parserRevision) reject('原文解析版本不可用；历史来源文本仍保留。', 404);
    const unit = this.derived(manifest).units.find(item => item.sourceUnitId === unitId);
    if (!unit) reject('原文单元不可用。', 404);
    return { ...unit, title: manifest.title, gaps: manifest.gaps, sourceRevisionId: id, parserRevision, materialSha256: manifest.materialSha256, paperId: manifest.paperId, version: manifest.version, url: this.url(manifest, unit) };
  }
  url(manifest, unit) { const url = new URL(manifest.finalUrl); url.hash = unit.locator.physicalPage ? `page=${unit.locator.physicalPage}` : unit.locator.anchor || ''; return url.href; }
  documents(manifest) {
    return this.derived(manifest).units.map(unit => ({ id: `original:${manifest.sourceRevisionId}:${manifest.parserRevision}:${unit.sourceUnitId}`, kind: 'original', paperId: manifest.paperId, sourceRevisionId: manifest.sourceRevisionId,
      parserRevision: manifest.parserRevision, materialSha256: manifest.materialSha256, sourceUnitId: unit.sourceUnitId, title: `${manifest.title} · ${unit.locator.label}`.slice(0, 1000), version: manifest.version,
      text: unit.text, locator: unit.locator, range: unit.range, verification: unit.verification, gaps: manifest.gaps, url: this.url(manifest, unit) }));
  }
  async import({ file, paperId, sourceRevisionId, title, version, url, finalUrl = url, format, referenceOnly = false }, { signal } = {}) {
    if (typeof referenceOnly !== 'boolean') reject('原文用途无效。');
    if (!isId(sourceRevisionId) || !isText(paperId, 200, 1) || !isText(title, 700, 1) || !isText(version, 100, 1) || !safeWebUrl(url) || !safeWebUrl(finalUrl) || !['html', 'pdf'].includes(format)) reject('原文导入身份或格式无效。');
    const info = statSync(file); if (!info.isFile() || info.size > MATERIAL_LIMIT || !info.size) reject('原文文件为空或超过 64 MiB。');
    const bytes = readFileSync(file); if (bytes.length > MATERIAL_LIMIT || !bytes.length) reject('原文文件为空或超过 64 MiB。');
    if (format === 'pdf' ? !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) : !/<(?:!doctype\s+html|html|article|body)[\s>]/i.test(bytes.subarray(0, 10000).toString('utf8'))) reject('原文实际文件类型与声明不符。');
    this.ensure(); const materialSha256 = digest(bytes), rawName = `${materialSha256}.${format}`;
    const prior = this.manifest(sourceRevisionId);
    if (prior) {
      if (prior.materialSha256 !== materialSha256 || prior.paperId !== paperId || prior.version !== version || prior.originalUrl !== url || prior.title !== title || prior.finalUrl !== finalUrl || prior.format !== format || Boolean(prior.referenceOnly) !== referenceOnly) reject('固定原文身份已存在且内容不同；请使用新的来源修订 ID。', 409);
      const retained = safeRead(join(this.directory, 'materials'), prior.materialFile);
      if (digest(retained) !== prior.materialSha256) reject('原文材料字节损坏；请从已验证备份恢复，不能把解析索引当作原文。', 409);
      this.derived(prior); return prior;
    }
    const rawPath = join(this.directory, 'materials', rawName);
    if (!existsSync(rawPath)) writeFileSync(rawPath, bytes, { flag: 'wx', mode: 0o600, flush: true });
    else if (digest(safeRead(join(this.directory, 'materials'), rawName)) !== materialSha256) reject('原文材料字节损坏；请从已验证备份恢复。', 409);
    const job = { schemaVersion: 1, sourceRevisionId, materialSha256, state: 'pending', error: null };
    const saveJob = () => { const file = join(this.directory, 'jobs', `${sourceRevisionId}.json`); writeFileSync(`${file}.tmp`, JSON.stringify(job)); renameSync(`${file}.tmp`, file); };
    saveJob();
    try {
      signal?.throwIfAborted(); job.state = 'processing'; saveJob();
      const result = format === 'html' ? htmlUnits(bytes, url) : await pdfUnits(bytes, signal);
      signal?.throwIfAborted();
      if (result.units.length > 20000) reject('原文单元数量超过单材料处理预算。');
      const output = JSON.stringify({ schemaVersion: 1, parser: PARSER, ...result }), outputSha256 = digest(output);
      validate('derived', JSON.parse(output));
      const parserRevision = digest(`${PARSER}\n${materialSha256}\n${outputSha256}`);
      const derived = join(this.directory, 'derived', `${parserRevision}.json`);
      if (!existsSync(derived)) writeFileSync(derived, output, { flag: 'wx', mode: 0o600 });
      else if (digest(safeRead(join(this.directory, 'derived'), `${parserRevision}.json`)) !== outputSha256) reject('原文解析文件损坏；请从已验证备份恢复。', 409);
      const manifest = { schemaVersion: 1, paperId, sourceRevisionId, title, version, originalUrl: url, finalUrl, acquiredAt: new Date().toISOString(), materialSha256, materialFile: rawName, format,
        parserRevision, parser: PARSER, configurationSha256: digest(PARSER), outputSha256, status: result.units.length ? 'partial' : 'failed', unitCount: result.units.length, assets: result.assets, gaps: result.gaps, ...(referenceOnly ? { referenceOnly: true } : {}) };
      validate('material', manifest);
      const target = join(this.directory, 'manifests', `${sourceRevisionId}.json`), temp = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temp, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600, flush: true }); renameSync(temp, target);
      this.manifestCache = undefined;
      job.state = manifest.status; saveJob(); return manifest;
    } catch (error) { job.state = signal?.aborted ? 'cancelled' : 'failed'; job.error = '解析未完成；原始材料保留，可用相同参数重试。'; saveJob(); throw error; }
  }
  addEvidence(record) {
    validate('evidence', record); validateEvidenceRecord(record); this.ensure();
    for (const unit of record.sourceUnitIds) this.view(record.sourceRevisionId, record.parserRevision, unit);
    const path = join(this.directory, 'evidence', `${record.evidenceId}.json`), text = JSON.stringify(record, null, 2);
    if (existsSync(path)) { if (readFileSync(path, 'utf8') !== text) reject('证据身份不可覆盖。', 409); } else writeFileSync(path, text, { flag: 'wx', mode: 0o600 });
    this.evidenceCache = undefined;
    return record;
  }
}
