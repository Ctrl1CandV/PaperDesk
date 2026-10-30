// A living, reader-owned Markdown document. Prior saves are never rewritten.
export const NOTEBOOK_LIMITS = Object.freeze({ body: 24000, versions: 500 });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const assert = (condition, message = '研究记录格式无效。') => { if (!condition) throw Error(message); };
function object(value, required, optional = []) {
  assert(value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
export const currentNotebook = notebook => notebook?.versions?.at(-1);
export function validateNotebookVersion(value) {
  object(value, ['version', 'body', 'author', 'createdAt'], ['sourceTurnId', 'restoredFrom']);
  assert(Number.isSafeInteger(value.version) && value.version > 0 && value.version <= NOTEBOOK_LIMITS.versions);
  assert(typeof value.body === 'string' && value.body.length <= NOTEBOOK_LIMITS.body, '研究记录正文最多 24000 字；草稿仍保留，请先另存较长的材料。');
  assert(['reader', 'assistant'].includes(value.author) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) && new Date(value.createdAt).toISOString() === value.createdAt);
  assert(value.sourceTurnId === undefined || uuid(value.sourceTurnId));
  assert(value.author === 'assistant' ? uuid(value.sourceTurnId) && value.restoredFrom === undefined : value.sourceTurnId === undefined);
  assert(value.restoredFrom === undefined || Number.isSafeInteger(value.restoredFrom) && value.restoredFrom > 0 && value.restoredFrom < value.version);
  return value;
}
export function validateResearchNotebook(value) {
  object(value, ['versions']);
  assert(Array.isArray(value.versions) && value.versions.length > 0 && value.versions.length <= NOTEBOOK_LIMITS.versions, '研究记录已达到 500 个版本的保存上限，未写入新版本；已有历史仍保留，可以导出当前草稿另存。导出不会释放历史容量。');
  value.versions.forEach((version, index) => { validateNotebookVersion(version); assert(version.version === index + 1, '研究记录版本必须连续。'); });
  const turns = value.versions.flatMap(version => version.sourceTurnId ? [version.sourceTurnId] : []);
  assert(new Set(turns).size === turns.length, '同一次 AI 更新不能重复保存。');
  return value;
}
export function validateNotebookDraft(value) {
  object(value, ['body', 'summary', 'baseNotebookVersion']);
  assert(typeof value.body === 'string' && value.body.trim().length > 0 && value.body.length <= NOTEBOOK_LIMITS.body, 'AI 研究记录需要非空正文，最多 24000 字。');
  assert(typeof value.summary === 'string' && value.summary.trim().length > 0 && value.summary.length <= 2000);
  assert(Number.isSafeInteger(value.baseNotebookVersion) && value.baseNotebookVersion >= 0 && value.baseNotebookVersion < NOTEBOOK_LIMITS.versions);
  return value;
}
export function appendNotebookVersion(notebook, body, { author = 'reader', sourceTurnId, restoredFrom, createdAt = new Date().toISOString() } = {}) {
  if (notebook !== undefined) validateResearchNotebook(notebook);
  const prior = currentNotebook(notebook);
  const version = { version: (prior?.version ?? 0) + 1, body, author, createdAt, ...(sourceTurnId ? { sourceTurnId } : {}), ...(restoredFrom ? { restoredFrom } : {}) };
  const result = { versions: [...(notebook?.versions ?? []), version] };
  validateResearchNotebook(result);
  return result;
}
