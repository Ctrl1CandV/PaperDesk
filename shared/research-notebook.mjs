// A living, reader-owned Markdown document. Prior saves are never rewritten.
export const NOTEBOOK_LIMITS = Object.freeze({ body: 24000, versions: 500, note: 300 });

/**
 * The working paper is shaped like the opening file of a paper project from the
 * start. Headings are a suggestion the reader may rename or delete; each maps to
 * the part of a paper it will later feed.
 */
export const WORKING_PAPER_SECTIONS = Object.freeze([
  { heading: '问题与动机', becomes: '引言', hint: '为什么值得做，现有做法卡在哪里。' },
  { heading: '已知', becomes: '相关工作', hint: '文献已经说明了什么，每条附出处。' },
  { heading: '判断与假设', becomes: '方法动机', hint: '我目前的看法和要检验的假设，注明依据强弱。' },
  { heading: '未解决的问题', becomes: '研究问题', hint: '还不清楚、需要阅读或实验回答的问题。' },
  { heading: '实验设想', becomes: '实验计划', hint: '最小可行的实验：数据、基线、指标、预期与反证条件。' },
  { heading: '阶段记录', becomes: '项目日志', hint: '每条一行：日期 · 收获或转变。' },
].map(Object.freeze));
const STAGE_LOG = '阶段记录';
const sectionText = (value, hint) => value?.trim() ? value.trim() : `<!-- ${hint} -->`;
const NL = '\n';

/** A first draft filled from what is already known about the direction. */
export function workingPaperTemplate(fields = {}) {
  const values = { 问题与动机: fields.motivation, 已知: fields.known, 判断与假设: fields.judgement, 未解决的问题: fields.unknowns, 实验设想: fields.experiments, [STAGE_LOG]: fields.log };
  return WORKING_PAPER_SECTIONS.map(section => `## ${section.heading}${NL}${NL}${sectionText(values[section.heading], section.hint)}`).join(NL + NL) + NL;
}

const headingLine = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const logLine = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*[·:：-]\s*(.+?)\s*$/;
const placeholder = /^\s*<!--.*-->\s*$/;
/** Dated lines under the stage-log heading, oldest first; other text is ignored. */
export function stageEntries(body = '') {
  const entries = [];
  let inside = false;
  for (const line of String(body).split(NL)) {
    const heading = headingLine.exec(line);
    if (heading) { inside = heading[2].trim() === STAGE_LOG; continue; }
    const match = inside && logLine.exec(line);
    if (match) entries.push({ date: match[1], text: match[2] });
  }
  return entries;
}

/** Appends one dated line to the stage log, creating the section when it is missing. */
export function appendStageEntry(body = '', date, text) {
  const line = `- ${date} · ${String(text).replace(/\s+/g, ' ').trim()}`;
  const lines = String(body).replace(/\s+$/, '').split(NL);
  const start = lines.findIndex(item => headingLine.exec(item)?.[2].trim() === STAGE_LOG);
  if (start < 0) return `${lines.join(NL).trim() ? `${lines.join(NL)}${NL}${NL}` : ''}## ${STAGE_LOG}${NL}${NL}${line}${NL}`;
  let end = lines.findIndex((item, index) => index > start && headingLine.test(item));
  if (end < 0) end = lines.length;
  const content = lines.slice(start + 1, end).filter(item => item.trim());
  // An untouched template hint gives way to the first real entry.
  if (content.length === 1 && placeholder.test(content[0])) {
    lines.splice(start + 1, end - start - 1, '', line, ...(end < lines.length ? [''] : []));
    return lines.join(NL) + NL;
  }
  let at = end;
  while (at > start + 1 && !lines[at - 1].trim()) at--;
  lines.splice(at, 0, ...(at === start + 1 ? ['', line] : [line]));
  return lines.join(NL) + NL;
}

/** Template hints are editing aids; exports and the AI context do not need them. */
export const withoutPlaceholders = (body = '') => String(body).split(NL).filter(line => !placeholder.test(line)).join(NL).replace(/\n{3,}/g, NL + NL);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const assert = (condition, message = '研究记录格式无效。') => { if (!condition) throw Error(message); };
function object(value, required, optional = []) {
  assert(value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
export const currentNotebook = notebook => notebook?.versions?.at(-1);
export function validateNotebookVersion(value) {
  object(value, ['version', 'body', 'author', 'createdAt'], ['sourceTurnId', 'restoredFrom', 'note']);
  assert(Number.isSafeInteger(value.version) && value.version > 0 && value.version <= NOTEBOOK_LIMITS.versions);
  assert(typeof value.body === 'string' && value.body.length <= NOTEBOOK_LIMITS.body, '工作稿正文最多 24000 字；草稿仍保留，请先另存较长的材料。');
  assert(['reader', 'assistant'].includes(value.author) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) && new Date(value.createdAt).toISOString() === value.createdAt);
  assert(value.sourceTurnId === undefined || uuid(value.sourceTurnId));
  assert(value.author === 'assistant' ? uuid(value.sourceTurnId) && value.restoredFrom === undefined : value.sourceTurnId === undefined);
  assert(value.restoredFrom === undefined || Number.isSafeInteger(value.restoredFrom) && value.restoredFrom > 0 && value.restoredFrom < value.version);
  assert(value.note === undefined || typeof value.note === 'string' && value.note.trim().length > 0 && value.note.length <= NOTEBOOK_LIMITS.note);
  return value;
}
export function validateResearchNotebook(value) {
  object(value, ['versions']);
  assert(Array.isArray(value.versions) && value.versions.length > 0 && value.versions.length <= NOTEBOOK_LIMITS.versions, '工作稿已达到 500 个版本的保存上限，未写入新版本；已有历史仍保留，可以导出当前草稿另存。导出不会释放历史容量。');
  value.versions.forEach((version, index) => { validateNotebookVersion(version); assert(version.version === index + 1, '研究记录版本必须连续。'); });
  const turns = value.versions.flatMap(version => version.sourceTurnId ? [version.sourceTurnId] : []);
  assert(new Set(turns).size === turns.length, '同一次 AI 更新不能重复保存。');
  return value;
}
export function validateNotebookDraft(value) {
  object(value, ['body', 'summary', 'baseNotebookVersion']);
  assert(typeof value.body === 'string' && value.body.trim().length > 0 && value.body.length <= NOTEBOOK_LIMITS.body, 'AI 工作稿需要非空正文，最多 24000 字。');
  assert(typeof value.summary === 'string' && value.summary.trim().length > 0 && value.summary.length <= 2000);
  assert(Number.isSafeInteger(value.baseNotebookVersion) && value.baseNotebookVersion >= 0 && value.baseNotebookVersion < NOTEBOOK_LIMITS.versions);
  return value;
}
export function appendNotebookVersion(notebook, body, { author = 'reader', sourceTurnId, restoredFrom, note, createdAt = new Date().toISOString() } = {}) {
  if (notebook !== undefined) validateResearchNotebook(notebook);
  const prior = currentNotebook(notebook);
  const short = note?.replace(/\s+/g, ' ').trim().slice(0, NOTEBOOK_LIMITS.note);
  const version = { version: (prior?.version ?? 0) + 1, body, author, createdAt, ...(sourceTurnId ? { sourceTurnId } : {}), ...(restoredFrom ? { restoredFrom } : {}), ...(short ? { note: short } : {}) };
  const result = { versions: [...(notebook?.versions ?? []), version] };
  validateResearchNotebook(result);
  return result;
}
