import { canonicalResearch, researchHash, researchObject, validateEvidenceRefs, validateResearchSnapshot, verifyResearchSnapshot, validLocalId, validRevision, validateResearchLocator } from './research-contract.mjs';
// reading-brief and research-line are the two primary research files; earlier kinds remain readable and editable.
export const ARTIFACT_KINDS = ['reading-brief','research-line','evidence-synthesis','direction-comparison','reading-plan','experiment-plan','stage-plan','harness-task'];
const fail = message => { throw Error(message); };
const requireValue = (ok, message = '研究文档格式无效。') => { if (!ok) fail(message); };
const id = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value,max=40000) => typeof value === 'string' && value.length <= max;
const lines = value => Array.isArray(value) && value.length <= 100 && value.every(v=>text(v,12000));
const positive = value => Number.isSafeInteger(value) && value > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function validateTaskBrief(value) {
  researchObject(value,['format','schemaVersion','taskId','version','snapshotSha256','explorationRef','goal','context','sources','tasks','executionLimits','requiredWorkflows','acceptanceCriteria','createdAt']);
  requireValue(value.format === 'paperdesk-task-brief' && value.schemaVersion === 1 && id(value.taskId) && positive(value.version) && digest(value.snapshotSha256) && time(value.createdAt));
  researchObject(value.explorationRef,['id','recordRevision']); requireValue(id(value.explorationRef.id) && positive(value.explorationRef.recordRevision));
  requireValue(text(value.goal) && value.goal.trim()); validateResearchSnapshot(value.context);
  requireValue(value.context.explorationId === value.explorationRef.id && value.context.recordRevision === value.explorationRef.recordRevision);
  requireValue(Array.isArray(value.sources) && value.sources.length <= 240);
  for (const source of value.sources) {
    researchObject(source,['identity','title','url','version','locator','excerpt','provenance','gaps'],['guideRef','originalRef','turnRef']);
    requireValue(['identity','title','url','locator','excerpt','provenance'].every(k=>text(source[k],100000)) && lines(source.gaps));
    let url; try { url = new URL(source.url); } catch { fail('任务来源需要公开 HTTP(S) 地址。'); }
    requireValue(['https:','http:'].includes(url.protocol) && !url.username && !url.password);
    requireValue(source.version === null || text(source.version,1000));
    if(source.guideRef!==undefined){const r=source.guideRef;researchObject(r,['guideId','revision','bodySha256','unitId']);requireValue(validLocalId(r.guideId)&&validRevision(r.revision)&&digest(r.bodySha256)&&validLocalId(r.unitId));}
    if(source.originalRef!==undefined){const r=source.originalRef;researchObject(r,['paperId','sourceRevisionId','materialSha256','parserRevision','sourceUnitId','locator','verification']);requireValue(text(r.paperId,200)&&validLocalId(r.sourceRevisionId)&&digest(r.materialSha256)&&digest(r.parserRevision)&&validLocalId(r.sourceUnitId)&&['unreviewed','text-checked','visually-checked'].includes(r.verification));validateResearchLocator(r.locator);}
    if(source.turnRef!==undefined){researchObject(source.turnRef,['turnId','citationId']);requireValue(id(source.turnRef.turnId)&&/^[LOW][1-9]\d{0,3}$/.test(source.turnRef.citationId));}
  }
  requireValue(Array.isArray(value.tasks) && value.tasks.length > 0 && value.tasks.length <= 40);
  const taskIds = new Set(value.tasks.map(t=>t.id)); requireValue(taskIds.size === value.tasks.length);
  const seen = new Set();
  for (const task of value.tasks) {
    researchObject(task,['id','question','inputs','dependsOn','deliverables','acceptanceCriteria','stopConditions']);
    requireValue(id(task.id) && text(task.question) && task.question.trim());
    for (const field of ['inputs','dependsOn','deliverables','acceptanceCriteria','stopConditions']) requireValue(lines(task[field]));
    requireValue(task.dependsOn.every(v=>seen.has(v)), '任务依赖必须指向前置任务。'); seen.add(task.id);
    requireValue(task.deliverables.length && task.acceptanceCriteria.length && task.stopConditions.length, '任务必须包含交付物、验收和停止条件。');
  }
  requireValue(text(value.executionLimits) && value.executionLimits.trim() && lines(value.acceptanceCriteria) && value.acceptanceCriteria.length);
  requireValue(Array.isArray(value.requiredWorkflows) && value.requiredWorkflows.length <= 10);
  for (const workflow of value.requiredWorkflows) { researchObject(workflow,['path','sha256']); requireValue(/^docs\/content\/[a-zA-Z0-9/_.-]+\.md$/.test(workflow.path) && !workflow.path.includes('..') && digest(workflow.sha256)); }
  return value;
}
export async function verifyTaskBrief(value) {
  validateTaskBrief(value); const {snapshotSha256,...body}=value;
  requireValue(await researchHash(body) === snapshotSha256,'任务快照摘要不匹配。'); await verifyResearchSnapshot(value.context); return value;
}
export function validateReceipt(value, task) {
  researchObject(value,['format','schemaVersion','runId','taskRef','status','taskResults','unresolvedQuestions','suggestedNextActions','createdAt']);
  requireValue(value.format === 'paperdesk-execution-receipt' && value.schemaVersion === 1 && id(value.runId) && time(value.createdAt));
  researchObject(value.taskRef,['taskId','version','snapshotSha256']);
  requireValue(id(value.taskRef.taskId) && positive(value.taskRef.version) && digest(value.taskRef.snapshotSha256));
  requireValue(['completed','partial','blocked','failed','cancelled'].includes(value.status));
  requireValue(Array.isArray(value.taskResults) && value.taskResults.length <= 40 && lines(value.unresolvedQuestions) && lines(value.suggestedNextActions));
  const seen = new Set();
  for (const result of value.taskResults) {
    researchObject(result,['taskItemId','summary','outputs','evidence','unmetCriteria','blockers','contentStatus']);
    requireValue(id(result.taskItemId) && !seen.has(result.taskItemId) && text(result.summary)); seen.add(result.taskItemId);
    for (const field of ['outputs','evidence','unmetCriteria','blockers']) requireValue(lines(result[field]));
    requireValue(['not-applicable','prepared','validated','imported'].includes(result.contentStatus));
    if (task) requireValue(task.tasks.some(t=>t.id === result.taskItemId), '回执包含未定义的子任务。');
  }
  if (task) {
    requireValue(value.taskRef.taskId === task.taskId && value.taskRef.version === task.version && value.taskRef.snapshotSha256 === task.snapshotSha256, '回执未对应所选任务版本。');
    if (value.status === 'completed') requireValue(value.taskResults.length === task.tasks.length && value.taskResults.every(r=>!r.unmetCriteria.length && !r.blockers.length),'完成回执仍有未完成项。');
  }
  return value;
}
export function validateResearchArtifacts(artifacts) {
  requireValue(Array.isArray(artifacts) && artifacts.length <= 100);
  requireValue(new Set(artifacts.map(a=>a.id)).size === artifacts.length);
  for (const value of artifacts) {
    researchObject(value,['id','kind','title','body','recordRevision','sourceRecordRevision','sourceTurnId','evidenceRefs','createdAt','updatedAt','taskVersions','receipts'],['purpose','librarySnapshot']);
    // A reading file records why it was written and which guides the library held then.
    requireValue(value.purpose === undefined || ['accumulation','research'].includes(value.purpose));
    requireValue(value.librarySnapshot === undefined || Array.isArray(value.librarySnapshot) && value.librarySnapshot.length <= 2000 && value.librarySnapshot.every(validLocalId) && new Set(value.librarySnapshot).size === value.librarySnapshot.length);
    requireValue(id(value.id) && ARTIFACT_KINDS.includes(value.kind) && text(value.title,300) && value.title.trim() && text(value.body,100000) && positive(value.recordRevision) && positive(value.sourceRecordRevision) && (value.sourceTurnId === null || id(value.sourceTurnId)) && time(value.createdAt) && time(value.updatedAt));
    validateEvidenceRefs(value.evidenceRefs);
    requireValue(Array.isArray(value.taskVersions) && value.taskVersions.length <= 50 && Array.isArray(value.receipts) && value.receipts.length <= 200);
    value.taskVersions.forEach((task,i)=>{validateTaskBrief(task);requireValue(task.taskId === value.id && task.version === i+1);});
    const receiptIds = new Set();
    for (const receipt of value.receipts) {
      const task = value.taskVersions.find(t=>t.version === receipt.taskRef?.version);
      requireValue(task && !receiptIds.has(receipt.runId)); validateReceipt(receipt,task); receiptIds.add(receipt.runId);
    }
  }
}
export function createResearchArtifact({kind='stage-plan',title,body='',recordRevision,sourceTurnId=null,evidenceRefs=[],purpose,librarySnapshot}) {
  const now = new Date().toISOString();
  const result = {id:crypto.randomUUID(),kind,title,body,recordRevision:1,sourceRecordRevision:recordRevision,sourceTurnId,evidenceRefs,createdAt:now,updatedAt:now,taskVersions:[],receipts:[],...(purpose?{purpose}:{}),...(librarySnapshot?{librarySnapshot}:{})};
  validateResearchArtifacts([result]); return result;
}
export async function freezeTaskBrief({artifact,snapshot,sources,tasks,executionLimits,acceptanceCriteria,requiredWorkflows}) {
  const data = {format:'paperdesk-task-brief',schemaVersion:1,taskId:artifact.id,version:artifact.taskVersions.length+1,explorationRef:{id:snapshot.explorationId,recordRevision:snapshot.recordRevision},goal:artifact.body,context:snapshot,sources,tasks,executionLimits,requiredWorkflows,acceptanceCriteria,createdAt:new Date().toISOString()};
  const value = {...data,snapshotSha256:await researchHash(data)}; validateTaskBrief(value); return value;
}
export function receiveExecutionReceipt(artifact, receipt) {
  const existing = artifact.receipts.find(r=>r.runId === receipt?.runId);
  if (existing) {
    if (canonicalResearch(existing) === canonicalResearch(receipt)) return artifact;
    fail('同一执行 ID 的回执内容冲突。原回执保持不变，请保留本次文件并核对。');
  }
  const task = artifact.taskVersions.find(t=>t.version === receipt?.taskRef?.version);
  requireValue(task,'找不到回执对应的任务版本。'); validateReceipt(receipt,task);
  return {...artifact,receipts:[...artifact.receipts,structuredClone(receipt)],recordRevision:artifact.recordRevision+1,updatedAt:new Date().toISOString()};
}
export function receiptTemplate(task) {
  return {format:'paperdesk-execution-receipt',schemaVersion:1,runId:crypto.randomUUID(),taskRef:{taskId:task.taskId,version:task.version,snapshotSha256:task.snapshotSha256},status:'partial',taskResults:task.tasks.map(t=>({taskItemId:t.id,summary:'',outputs:[],evidence:[],unmetCriteria:[...t.acceptanceCriteria],blockers:[],contentStatus:'not-applicable'})),unresolvedQuestions:[],suggestedNextActions:[],createdAt:new Date().toISOString()};
}
export function renderTaskBrief(task) {
  validateTaskBrief(task);
  const s = task.context;
  return `# 研究执行任务\n\n任务 ID：${task.taskId}\n版本：${task.version}\n摘要：${task.snapshotSha256}\n\n## 本轮目标与计划\n\n${task.goal}\n\n## 研究背景\n\n${s.title}\n\n问题：${s.question}\n\n已有解释（尚需核查）：${s.interpretation || '未填写'}\n\n未知：${s.unknowns || '未填写'}\n\n范围：${s.scope || '未填写'}\n\n约束：${s.constraints || '未填写'}\n\n候选方向：${s.candidates || '未填写'}\n\n暂缓与理由：${s.deferred || '未填写'}\n\n${s.decisions.map(d=>`- ${d.kind} / ${d.status}：${d.text}；理由：${d.rationale}。用户采纳不代表已获证实。`).join('\n')}\n\n## 执行任务\n\n${task.tasks.map(t=>`### ${t.question}\n\nID：${t.id}\n前置：${t.dependsOn.join(', ') || '无'}\n\n输入：\n${t.inputs.map(x=>`- ${x}`).join('\n')}\n\n交付物：\n${t.deliverables.map(x=>`- ${x}`).join('\n')}\n\n验收：\n${t.acceptanceCriteria.map(x=>`- ${x}`).join('\n')}\n\n停止条件：\n${t.stopConditions.map(x=>`- ${x}`).join('\n')}`).join('\n\n')}\n\n## 行动范围与预算\n\n${task.executionLimits}\n\n## 完成条件\n\n${task.acceptanceCriteria.map(x=>`- ${x}`).join('\n')}\n\n## 来源与保留摘录\n\n${task.sources.map((x,i)=>`### 来源 ${i+1}：${x.title}\n\n学术身份：${x.identity}\n来源：${x.url}\n版本：${x.version ?? '未知'}\n定位：${x.locator}\n性质：${x.provenance}\n\n${x.excerpt}\n\n缺口：${x.gaps.join('；') || '未另行声明；不得据此假定完整核验'}\n\n固定身份：${canonicalResearch({guideRef:x.guideRef??null,originalRef:x.originalRef??null,turnRef:x.turnRef??null})}`).join('\n\n') || '尚无可携带来源。必须在执行中取得并核查公开来源。'}\n\n## 内容工作流\n\n${task.requiredWorkflows.map(w=>`- ${w.path}（SHA-256 ${w.sha256}）`).join('\n')}\n\n执行前核对工作流；内容包基于最新完整目录并保留全部旧修订。内容制作、校验、导入分别报告。研究记录与对话不得复制到公开内容。\n\n## 回传\n\n使用附带 receipt-template.json 填写真实结果，保留 taskRef。每次独立执行使用新的 runId，重传同一执行保留原 ID。分别报告产物、依据、未完成标准、阻塞、新问题和下一步。完成执行不表示用户已读或研究问题已解决。摘要只标识版本，不证明学术正确。\n`;
}
