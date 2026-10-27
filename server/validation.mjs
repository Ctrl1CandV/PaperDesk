export class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const reject = (message, status) => { throw new PublicError(message, status); };
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
export const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isRevision = value => Number.isSafeInteger(value) && value > 0;
export const isTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const isText = (value, max, min = 0) => typeof value === 'string' && value.length >= min && value.length <= max;
export function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) reject('数据字段不符合 AI 记录格式。');
}
export function safeWebUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && value.length < 4096; } catch { return false; }
}
export function validateAsk(value) {
  object(value, ['requestId', 'guideId', 'revision', 'bodySha256', 'unitId', 'question', 'webSearch'], ['conversationId', 'selection']);
  if (!isUuid(value.requestId) || value.conversationId !== undefined && !isUuid(value.conversationId)
    || !isId(value.guideId) || !isRevision(value.revision) || !isHash(value.bodySha256) || !isId(value.unitId)
    || !isText(value.question, 6000, 1) || !value.question.trim() || typeof value.webSearch !== 'boolean'
    || value.selection !== undefined && !isText(value.selection, 12000)) reject('问题或文章定位无效。问题最多 6000 字，选文最多 12000 字。');
  return value;
}
export function validateSource(source) {
  const originalFields = ['paperId', 'sourceRevisionId', 'materialSha256', 'parserRevision', 'sourceUnitId', 'locator', 'gaps', 'verification', 'readRanges'];
  object(source, ['id', 'kind', 'title', 'text'], ['url', 'guideId', 'revision', 'unitId', 'version', ...originalFields]);
  if (!/^[LWO][1-9]\d{0,3}$/.test(source.id) || !['guide', 'web', 'original'].includes(source.kind)
    || !isText(source.title, 1000, 1) || !isText(source.text, 100000)
    || source.version !== undefined && source.version !== null && !isText(source.version, 100)) reject('来源快照无效。');
  if (source.kind !== 'original' && originalFields.some(key => Object.hasOwn(source, key))) reject('来源类型与原文字段不一致。');
  if (source.kind === 'original') {
    if (!source.id.startsWith('O') || !safeWebUrl(source.url) || !isText(source.paperId, 200, 1) || !isId(source.sourceRevisionId)
      || !isHash(source.materialSha256) || !isHash(source.parserRevision) || !isId(source.sourceUnitId)
      || source.guideId !== undefined || source.revision !== undefined || source.unitId !== undefined
      || !Array.isArray(source.gaps) || source.gaps.length > 20 || !source.gaps.every(gap => isText(gap, 1000, 1))
      || !['unreviewed', 'text-checked', 'visually-checked'].includes(source.verification)) reject('原文来源身份或核验状态无效。');
    if (source.readRanges !== undefined) {
      if (!Array.isArray(source.readRanges) || !source.readRanges.length || source.readRanges.length > 32) reject('原文读取范围无效。');
      let previousEnd = -1, total;
      for (const range of source.readRanges) {
        object(range, ['start', 'end', 'total']);
        if (![range.start, range.end, range.total].every(Number.isSafeInteger) || range.start < 0 || range.end <= range.start || range.end > range.total || range.total > 100000 || range.start <= previousEnd || total !== undefined && total !== range.total) reject('原文读取范围无效。');
        previousEnd = range.end; total = range.total;
      }
    }
    object(source.locator, ['label', 'physicalPage', 'printedPageLabel', 'anchor']);
    const locator = source.locator;
    if (!isText(locator.label, 1000, 1) || locator.physicalPage !== null && !isRevision(locator.physicalPage)
      || locator.printedPageLabel !== null && !isText(locator.printedPageLabel, 100, 1)
      || locator.anchor !== null && !isText(locator.anchor, 300, 1)) reject('原文来源定位无效。');
  } else if (source.kind === 'guide') {
    if (!source.id.startsWith('L') || !isId(source.guideId) || !isRevision(source.revision) || !isId(source.unitId)
      || source.url !== `/read/${source.guideId}/${source.revision}#${source.unitId}`) reject('导读来源定位无效。');
  } else if (!source.id.startsWith('W') || !safeWebUrl(source.url) || source.guideId !== undefined || source.revision !== undefined || source.unitId !== undefined) reject('网页来源定位无效。');
}
// A snapshot is deliberately data-only. Metadata is preserved as a bounded JSON string,
// so future content fields survive export without becoming executable configuration.
export function validateContext(context) {
  object(context, ['guideId', 'revision', 'bodySha256', 'unitId', 'selection', 'scope', 'metadataJson', 'historyTurnIds', 'webSearch', 'model', 'toolEvents'], ['provider', 'fallback', 'catalogDigest', 'indexGeneration', 'budget']);
  if (!isId(context.guideId) || !isRevision(context.revision) || !isHash(context.bodySha256) || !isId(context.unitId)
    || !isText(context.selection, 12000) || !['full-guide', 'section'].includes(context.scope)
    || !isText(context.metadataJson, 100000) || !isText(context.model, 200, 1) || typeof context.webSearch !== 'boolean'
    || !Array.isArray(context.historyTurnIds) || context.historyTurnIds.length > 6 || !context.historyTurnIds.every(isUuid)
    || !Array.isArray(context.toolEvents) || context.toolEvents.length > 8) reject('问答上下文快照无效。');
  if (context.provider !== undefined && !['api', 'chatgpt'].includes(context.provider)) reject('回答服务来源无效。');
  for (const key of ['catalogDigest', 'indexGeneration']) if (context[key] !== undefined && !isHash(context[key])) reject('检索目录或索引代次无效。');
  if (context.budget !== undefined) {
    object(context.budget, ['method', 'inputTokens', 'outputTokens', 'limit']);
    const budget = context.budget;
    if (budget.method !== 'utf8-bytes-upper-bound' || !isRevision(budget.inputTokens) || !isRevision(budget.outputTokens) || !isRevision(budget.limit)
      || budget.inputTokens + budget.outputTokens > budget.limit) reject('问答 token 预算无效。');
  }
  if (context.fallback !== undefined) {
    const fallback = context.fallback;
    object(fallback, ['reason', 'stage', 'fromModel', 'previousAnswer', 'previousToolCount']);
    if (context.provider !== 'api' || fallback.reason !== 'subscription_quota' || !['catalog', 'answer'].includes(fallback.stage)
      || fallback.fromModel !== null && !isText(fallback.fromModel, 200, 1) || !isText(fallback.previousAnswer, 40000)
      || !Number.isSafeInteger(fallback.previousToolCount) || fallback.previousToolCount < 0 || fallback.previousToolCount > context.toolEvents.length
      || fallback.stage === 'catalog' && (fallback.previousAnswer || fallback.previousToolCount)
      || fallback.stage === 'answer' && fallback.fromModel === null) reject('备用 API 切换记录无效。');
  }
  try { const parsed = JSON.parse(context.metadataJson); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(); } catch { reject('文章元数据快照无效。'); }
  for (const event of context.toolEvents) {
    object(event, ['name', 'argumentsJson', 'resultJson'], ['elapsedMs']);
    if (!['search_library', 'read_section', 'web_search', 'search_sources', 'read_source_unit', 'resolve_source_locator'].includes(event.name) || !isText(event.argumentsJson, 2000) || !isText(event.resultJson, 40000)
      || event.elapsedMs !== undefined && (typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0)) reject('工具快照无效。');
    try { JSON.parse(event.argumentsJson); JSON.parse(event.resultJson); } catch { reject('工具快照不是有效 JSON。'); }
  }
}
