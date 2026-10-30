import { validateNotebookDraft } from '../../shared/research-notebook.mjs';
import { createHash } from 'node:crypto';
import { canonicalResearch, validateResearchSnapshot, validateResearchProposal, validateDirectionDraft } from '../../shared/research-contract.mjs';
import { validateResearchMaterials } from '../../shared/research-materials.mjs';
import { validCommand } from '../../shared/research-documents.mjs';
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
  object(value, ['requestId', 'question', 'webSearch'], ['conversationId', 'selection', 'guideId', 'revision', 'bodySha256', 'unitId', 'conversationScope', 'researchSnapshot', 'researchMaterials', 'command', 'readingProgress']);
  const research = value.conversationScope?.kind === 'exploration';
  if (value.conversationScope !== undefined) validateConversationScope(value.conversationScope);
  if (research) {
    validateSnapshot(value.researchSnapshot);
    if (value.researchSnapshot.explorationId !== value.conversationScope.explorationId) reject('研究主题与快照不一致。');
    if (value.researchMaterials !== undefined) validateMaterials(value.researchMaterials, value.conversationScope.explorationId);
  } else if (value.researchSnapshot !== undefined) reject('研究快照需要关联研究主题。');
  if (!research && value.researchMaterials !== undefined) reject('已选研究材料需要关联研究主题。');
  validateCommandFields(value, research);
  const attachment = value.guideId !== undefined || !research;
  if (value.conversationScope?.kind === 'guide' && ['guideId','revision','bodySha256'].some(key => value.conversationScope[key] !== value[key])) reject('会话与论文版本不一致。');
  if (!attachment && ['revision', 'bodySha256', 'unitId', 'selection'].some(key => value[key] !== undefined)) reject('论文附件身份不完整。');
  if (!isUuid(value.requestId) || value.conversationId !== undefined && !isUuid(value.conversationId)
    || attachment && (!isId(value.guideId) || !isRevision(value.revision) || !isHash(value.bodySha256) || !isId(value.unitId))
    || !isText(value.question, 6000, 1) || !value.question.trim() || typeof value.webSearch !== 'boolean'
    || value.selection !== undefined && !isText(value.selection, 12000)) reject('问题或文章定位无效。问题最多 6000 字，选文最多 12000 字。');
  return value;
}
const readingStates = ['unread', 'reading', 'read', 'deferred'];
// Commands are explicit reader requests; reading marks travel only with a /选文 request.
function validateCommandFields(value, research) {
  if (value.command !== undefined) {
    if (!validCommand(value.command)) reject('指令无效。');
    if (value.command.name === 'notebook' && !research) reject('研究记录需要先关联一个研究方向。');
    if (value.command.name === 'reading-brief' && value.command.purpose === 'research' && !research) reject('推进研究的选文需要先关联一个研究方向。');
  }
  if (value.readingProgress === undefined) return;
  if (value.command?.name !== 'reading-brief' || !Array.isArray(value.readingProgress) || value.readingProgress.length > 300) reject('阅读标记只能随选文指令发送。');
  for (const item of value.readingProgress) {
    object(item, ['guideId', 'revision', 'guide', 'original']);
    if (!isId(item.guideId) || !isRevision(item.revision) || ![item.guide, item.original].every(status => status === null || readingStates.includes(status))) reject('阅读标记无效。');
  }
}
export function validateConversationScope(scope) {
  if (scope?.kind === 'exploration') { object(scope, ['kind', 'explorationId']); if (!isUuid(scope.explorationId)) reject('研究主题编号无效。'); }
  else { object(scope, ['kind', 'guideId', 'revision', 'bodySha256']); if (scope.kind !== 'guide' || !isId(scope.guideId) || !isRevision(scope.revision) || !isHash(scope.bodySha256)) reject('会话范围无效。'); }
}
export function validateSnapshot(value) {
  try {
    validateResearchSnapshot(value);
    const { snapshotSha256, ...data } = value;
    if (createHash('sha256').update(canonicalResearch(data)).digest('hex') !== snapshotSha256) throw Error();
  } catch { reject('研究快照格式或摘要无效。'); }
}
export function validateMaterials(value, explorationId) {
  try {
    validateResearchMaterials(value);
    const {materialsSha256,...data}=value;
    if (value.explorationId!==explorationId || createHash('sha256').update(canonicalResearch(data)).digest('hex')!==materialsSha256) throw Error();
    for (const artifact of value.artifacts) for (const ref of artifact.evidenceRefs) validateSource(ref.source);
  } catch { reject('已选研究材料格式、主题或摘要无效；最多 8 条笔记、3 份文档、48 KiB。'); }
}
function validateTopicHistory(value, explorationId) {
  object(value,['explorationId','turns','windowCount','omittedCount','omittedTurnIds']);
  if (value.explorationId!==explorationId || !Array.isArray(value.turns) || value.turns.length>2
    || !Number.isSafeInteger(value.windowCount) || value.windowCount<0 || value.windowCount>8
    || value.omittedCount!==value.windowCount-value.turns.length || !Array.isArray(value.omittedTurnIds)
    || value.omittedTurnIds.length!==value.omittedCount || !value.omittedTurnIds.every(isUuid)
    || Buffer.byteLength(JSON.stringify(value))>1800) reject('研究历史摘要范围或大小无效。');
  for (const prior of value.turns) {
    object(prior,['turnId','conversationId','question','answer','createdAt','questionTruncated','answerTruncated']);
    if (!isUuid(prior.turnId) || !isUuid(prior.conversationId) || !isTime(prior.createdAt) || !isText(prior.question,300) || !isText(prior.answer,800)
      || typeof prior.questionTruncated!=='boolean' || typeof prior.answerTruncated!=='boolean') reject('研究历史摘要无效。');
  }
  const ids=[...value.turns.map(prior=>prior.turnId),...value.omittedTurnIds];
  if (new Set(ids).size!==ids.length) reject('研究历史摘要包含重复编号。');
}
export function validateSource(source) {
  const originalFields = ['paperId', 'sourceRevisionId', 'materialSha256', 'parserRevision', 'sourceUnitId', 'locator', 'gaps', 'verification', 'readRanges'];
  object(source, ['id', 'kind', 'title', 'text'], ['url', 'guideId', 'revision', 'unitId', 'version', 'bodySha256', ...originalFields]);
  if (source.bodySha256 !== undefined && (source.kind !== 'guide' || !isHash(source.bodySha256))) reject('导读证据指纹无效。');
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
  object(context, ['guideId', 'revision', 'bodySha256', 'unitId', 'selection', 'scope', 'metadataJson', 'historyTurnIds', 'webSearch', 'model', 'toolEvents'], ['provider', 'fallback', 'catalogDigest', 'indexGeneration', 'budget', 'conversationScope', 'researchSnapshot', 'researchProposals', 'researchMaterials', 'topicHistory', 'command', 'readingProgress', 'directionDraft', 'notebookDraft']);
  if (context.conversationScope !== undefined) validateConversationScope(context.conversationScope);
  if (context.conversationScope?.kind === 'guide' && ['guideId','revision','bodySha256'].some(key=>context.conversationScope[key] !== context[key])) reject('上下文的导读范围不一致。');
  if (context.conversationScope?.kind === 'exploration') {
    validateSnapshot(context.researchSnapshot);
    if (context.researchSnapshot.explorationId !== context.conversationScope.explorationId) reject('研究快照属于不同主题。');
    if (context.researchMaterials !== undefined) validateMaterials(context.researchMaterials,context.conversationScope.explorationId);
    if (context.topicHistory !== undefined) validateTopicHistory(context.topicHistory,context.conversationScope.explorationId);
  } else if (context.researchSnapshot !== undefined || context.researchProposals !== undefined || context.researchMaterials !== undefined || context.topicHistory !== undefined || context.scope === 'research') reject('研究上下文缺少主题。');
  validateCommandFields(context, context.conversationScope?.kind === 'exploration');
  if (context.notebookDraft !== undefined) {
    if (context.command?.name !== 'notebook' || context.conversationScope?.kind !== 'exploration') reject('研究记录草稿缺少明确指令和方向。');
    try { validateNotebookDraft(context.notebookDraft); } catch { reject('研究记录草稿无效。'); }
    if (context.notebookDraft.baseNotebookVersion !== (context.researchSnapshot.notebook?.version ?? 0)) reject('研究记录草稿的基础版本不一致。');
  }
  if (context.directionDraft !== undefined) {
    if (context.command?.name !== 'direction' || context.conversationScope?.kind === 'exploration') reject('只有建立方向的指令可以带方向草稿。');
    try { validateDirectionDraft(context.directionDraft); } catch { reject('研究方向草稿无效。'); }
  }
  if (context.researchProposals !== undefined) {
    if (!Array.isArray(context.researchProposals) || context.researchProposals.length > 6) reject('研究提案数量无效。');
    for (const proposal of context.researchProposals) {
      try { validateResearchProposal(proposal); } catch { reject('研究提案格式无效。'); }
      if (proposal.explorationId !== context.researchSnapshot.explorationId || proposal.baseRecordRevision !== context.researchSnapshot.recordRevision || proposal.baseSnapshotSha256 !== context.researchSnapshot.snapshotSha256) reject('研究提案的基础快照不一致。');
      for (const ref of proposal.evidenceRefs) validateSource(ref.source);
    }
  }
  const noGuide = context.scope === 'research' && ['guideId','revision','bodySha256','unitId'].every(key => context[key] === null);
  if (context.scope === 'research' && (!noGuide || context.selection)) reject('未附加论文的研究上下文不能包含论文定位。');
  if (!noGuide && (!isId(context.guideId) || !isRevision(context.revision) || !isHash(context.bodySha256) || !isId(context.unitId))
    || !isText(context.selection, 12000) || !['full-guide', 'section', 'research'].includes(context.scope)
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
    if (!['search_library', 'read_section', 'web_search', 'search_sources', 'read_source_unit', 'resolve_source_locator', 'search_topic_history', 'read_topic_turn', 'propose_research_changes', 'create_research_direction', 'update_research_notebook'].includes(event.name) || !isText(event.argumentsJson, 40000) || !isText(event.resultJson, 40000)
      || event.elapsedMs !== undefined && (typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0)) reject('工具快照无效。');
    try { JSON.parse(event.argumentsJson); JSON.parse(event.resultJson); } catch { reject('工具快照不是有效 JSON。'); }
  }
}
