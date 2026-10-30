import { createResearchArtifact, type BriefPurpose, type PortableSource, type ResearchArtifact } from '../../shared/research-artifacts.mjs';
import { BRIEF_PURPOSES, documentPreamble, READING_BRIEF, STAGE_LABELS } from '../../shared/research-documents.mjs';
import workflows from './workflow-refs.json';
import { emptyResearchState, researchSnapshotData, type PersistentEvidenceRef } from '../../shared/research-contract.mjs';
import { personalStore } from '../records/store';
import { contentRepository } from '../content/repository';
import type { AiTurn } from '../assistant/api';
import type { Exploration } from '../records/types';

/** Saves a completed answer as an ordinary research document of a direction. */
export async function saveAnswerArtifact(explorationId: string, turn: AiTurn): Promise<void> {
  if (turn.status !== 'complete' || turn.summaryOnly) throw Error('请先读取完整且已完成的问答。');
  const record = await personalStore.get('explorations', explorationId);
  if (!record) throw Error('研究主题已不存在；回答仍保留在 AI 历史中。');
  const snapshot = turn.context?.researchSnapshot as {explorationId?:string;recordRevision?:number}|undefined;
  if (snapshot?.explorationId !== explorationId || !snapshot.recordRevision) throw Error('回答没有当前探索的研究快照。');
  const research = record.research ?? emptyResearchState();
  if (research.artifacts?.some(a=>a.sourceTurnId === turn.id)) return;
  const heading=turn.answer.match(/^ {0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/m)?.[1]?.trim();
  const firstLine=turn.question.split(/\r?\n/,1)[0].trim()||'研究文档';
  const title=heading?heading.slice(0,200):firstLine.length>80?`${firstLine.slice(0,79)}…`:firstLine;
  const artifact = createResearchArtifact({title,body:turn.answer,recordRevision:snapshot.recordRevision,sourceTurnId:turn.id,evidenceRefs:turnRefs(turn)});
  await personalStore.saveExploration({...record,research:{...research,artifacts:[...(research.artifacts??[]),artifact]}}, record.recordRevision);
}
const turnRefs = (turn: AiTurn): PersistentEvidenceRef[] => turn.sources.map(source=>({turnId:turn.id,citationId:source.id,source:{...source}}));

/**
 * Stores a reading file produced by /选文. Each save is a new document, so earlier
 * versions remain; the catalog snapshot records the inventory at generation time.
 * New library arrivals alone are not evidence that a paper belongs to this topic.
 */
export async function saveReadingBrief(record: Exploration, turn: AiTurn, purpose: BriefPurpose, topic: string): Promise<{ record: Exploration; artifact: ResearchArtifact }> {
  const research = record.research ?? emptyResearchState();
  const existing = research.artifacts?.find(item => item.sourceTurnId === turn.id);
  if (existing) return { record, artifact: existing };
  const snapshot = turn.context?.researchSnapshot as { explorationId?: string; recordRevision?: number } | undefined;
  if (snapshot?.explorationId && snapshot.explorationId !== record.id) throw Error('这份选文文件属于另一个方向，未保存。');
  const artifact = createResearchArtifact({ kind: 'reading-brief', title: `${READING_BRIEF.label}：${topic}`.slice(0, 300), body: turn.answer,
    recordRevision: snapshot?.recordRevision ?? record.recordRevision, sourceTurnId: turn.id, evidenceRefs: turnRefs(turn), purpose, librarySnapshot: currentGuideIds() });
  const saved = await personalStore.saveExploration({ ...record, research: { ...research, artifacts: [...(research.artifacts ?? []), artifact] } }, record.recordRevision);
  return { record: saved, artifact };
}
export function currentGuideIds() { return [...new Set(contentRepository.list().map(entry => entry.guide.metadata.id))]; }
/** Guides in the library now that were absent when the file was saved. */
export function guidesAddedSince(artifact: ResearchArtifact) {
  if (!artifact.librarySnapshot) return [];
  const known = new Set(artifact.librarySnapshot);
  return contentRepository.list().map(entry => entry.guide).filter(guide => !known.has(guide.metadata.id));
}

export async function portableResearchSources(record: Exploration, artifact: ResearchArtifact): Promise<PortableSource[]> {
  const sources: PortableSource[] = [];
  const guideSource = async (guideId:string,revision:number,unitId:string,excerpt:string,turnRef?:unknown,bodySha256?:unknown) => {
    const guide = await contentRepository.get(guideId,revision);
    if (!guide) throw Error('引用的导读修订不可用。请恢复该修订后再导出；现有文档与草稿仍保留。');
    const m = guide.metadata;
    if(bodySha256 !== undefined && bodySha256 !== m.bodySha256) throw Error('保存的导读摘要与固定修订不匹配，未导出。请核对来源。');
    const unit=m.units.find(u=>u.id === unitId);
    if(!unit) throw Error('引用的导读位置不可用，未导出。请核对固定修订与章节；现有文档与草稿仍保留。');
    sources.push({identity:m.paperId,title:m.paperTitle,url:m.source.url,version:m.source.version,locator:unit.heading??unitId,excerpt,provenance:'guide-excerpt',gaps:m.coverage.limitations,guideRef:{guideId,revision,bodySha256:m.bodySha256,unitId},...(turnRef?{turnRef}:{})});
  };
  for (const evidence of record.evidence) {
    if (evidence.provenance === 'guide-excerpt') await guideSource(evidence.target.guideId,evidence.target.revision,evidence.target.unitId,evidence.text);
    else if (evidence.provenance === 'original-excerpt') {
      const identity = evidence.source.identity;
      const url = /^https?:\/\//.test(identity) ? identity : /^10\.\d{4,9}\//.test(identity) ? `https://doi.org/${identity}` : null;
      if (!url) throw Error('原文摘录缺少可携带的公开 URL。请补充原文地址后再导出；现有文档与草稿仍保留。');
      sources.push({identity,title:identity,url,version:evidence.source.version,locator:evidence.source.locator,excerpt:evidence.text,provenance:'reader-entered-original-excerpt',gaps:['来源由读者填写，未自动核验']});
    }
  }
  const references=new Map<string,PersistentEvidenceRef>();
  for(const ref of [...artifact.evidenceRefs,...(record.research?.decisions??[]).flatMap(d=>d.evidenceRefs)]) references.set(`${ref.turnId}/${ref.citationId}`,ref);
  for (const ref of references.values()) {
    const s = ref.source;
    const turnRef = {turnId:ref.turnId,citationId:ref.citationId};
    if (s.kind === 'guide') await guideSource(String(s.guideId),Number(s.revision),String(s.unitId),s.text,turnRef,s.bodySha256);
    else sources.push({identity:String(s.paperId??s.url),title:String(s.title),url:String(s.url),version:typeof s.version === 'string'?s.version:null,locator:String((s.locator as {label?:string})?.label??s.url),excerpt:s.text,provenance:s.kind,gaps:Array.isArray(s.gaps)?s.gaps as string[]:s.kind === 'web'?['联网搜索摘录，不代表已读全文']:[],originalRef:s.kind === 'original'?{paperId:s.paperId,sourceRevisionId:s.sourceRevisionId,materialSha256:s.materialSha256,parserRevision:s.parserRevision,sourceUnitId:s.sourceUnitId,locator:s.locator,verification:s.verification}:undefined,turnRef});
  }
  // JSON serialization omits absent optional originalRef keys, matching the portable file contract.
  return JSON.parse(JSON.stringify(sources));
}

/** Explicit library links describe scope, not reading progress or evidence. */
function relatedBibliography(record: Exploration): string {
  return (record.research?.relatedGuides ?? []).map(target => {
    const guide = contentRepository.getSummary(target.guideId, target.revision);
    if (!guide) return `- ${target.guideId} / r${target.revision}：固定导读当前不可用；保留关联，待恢复后核对书目信息。`;
    const meta = guide.metadata;
    return `- ${meta.paperTitle}（${meta.type === 'survey' ? '综述' : '论文'}）\n  学术身份：${meta.paperId}；来源：${meta.source.url}；版本：${meta.source.version ?? '未知'}\n  固定导读：${meta.id} / r${meta.revision}`;
  }).join('\n') || '尚未关联文献。';
}

/** A deliberate local download; it does not select documents for model context. */
export async function renderResearchDocument(record: Exploration, artifact: ResearchArtifact): Promise<string> {
  const sources=await portableResearchSources(record,artifact);
  const snapshot=researchSnapshotData(record);
  const superseded=new Set(snapshot.decisions.flatMap(decision=>decision.supersedes?[decision.supersedes]:[]));
  const decisionKinds={interpretation:'解释',hypothesis:'假设',constraint:'约束',direction:'方向选择','next-step':'下一步'};
  const decisionStatuses={adopted:'已采纳',deferred:'已暂缓',rejected:'已否定'};
  const decisions=snapshot.decisions.filter(decision=>!superseded.has(decision.id)).map(decision=>`- ${decisionKinds[decision.kind]} / ${decisionStatuses[decision.status]}：${decision.text}\n  理由：${decision.rationale||'尚未填写'}\n  来源：${decision.sourceTurnId?`AI 问答 ${decision.sourceTurnId}`:'手动记录'}`).join('\n');
  const nextAction=record.nextAction?`${record.nextAction.description}${record.nextAction.target?`（固定导读位置：${record.nextAction.target.guideId} / r${record.nextAction.target.revision} / ${record.nextAction.target.unitId}）`:''}`:'尚未选择';
  const currentState=`## 导出时的研究状态（探索 r${record.recordRevision}）\n\n这是导出时当前探索的状态，与正文形成时的探索 r${artifact.sourceRecordRevision} 分别记录；版本不同不表示正文已经据此修订。此附录不新增行动权限。\n\n问题：${snapshot.question}\n\n研究范围：${snapshot.scope||'尚未填写'}\n\n明确约束：${snapshot.constraints||'尚未填写'}\n\n已有解释（保留待核查性质）：${snapshot.interpretation||'尚未填写'}\n\n候选方向：${snapshot.candidates||'尚未填写'}\n\n暂缓方向及原因：${snapshot.deferred||'尚未填写'}\n\n当前有效决定及理由：\n\n${decisions||'尚未记录；不从生成文档推断采纳。'}\n\n尚不确定的地方：${snapshot.unknowns||'尚未填写'}\n\n下一步：${nextAction}`;
  const sourceText=sources.map((source,index)=>{
    const fixed={...(source.guideRef?{guide:source.guideRef}:{}),...(source.originalRef?{original:source.originalRef}:{}),...(source.turnRef?{discussion:source.turnRef}:{})};
    return `### 来源 ${index+1}：${source.title}\n\n学术身份：${source.identity}\n来源 URL：${source.url}\n采用版本：${source.version??'未知'}\n定位：${source.locator}\n材料性质：${source.provenance}\n\n保留摘录：\n\n${source.excerpt.split('\n').map(line=>`> ${line}`).join('\n')}\n\n覆盖限制：${source.gaps.join('；')||'未另行声明；不代表已读或核验全文。'}\n\n固定材料与来源讨论标识：\n\n\`\`\`json\n${JSON.stringify(fixed,null,2)}\n\`\`\``;
  }).join('\n\n');
  const observations=record.evidence.filter(e=>e.provenance==='reader-observation').map(e=>`- 读者观察（未自动核验）：${e.text}`).join('\n');
  // The two primary files open with a short guide for an executor who never saw the discussion.
  const preamble=artifact.kind==='reading-brief'&&artifact.purpose?documentPreamble({purpose:artifact.purpose,savedAt:artifact.updatedAt,containerTitle:record.title,workflows}):'';
  const notebook=snapshot.notebook ? `\n\n## 导出时的研究记录（第 ${snapshot.notebook.version} 版）\n\n${snapshot.notebook.author==='reader'?'读者写入':'AI 整理'} · ${snapshot.notebook.createdAt}。这是当前保存的思考与阶段结果，不表示选文正文已经据此更新。\n\n${snapshot.notebook.body}` : '';
  const body=artifact.body||'正文尚未填写。';
  const [first,...rest]=body.split('\n');
  const titled=/^ {0,3}#[ \t]/.test(first);
  const opening=preamble?(titled?`${first}\n\n${preamble}\n\n${rest.join('\n').replace(/^\s+/,'')}`:`# ${artifact.title}\n\n${preamble}\n\n${body}`):`# ${artifact.title}\n\n${body}`;
  return `${opening}\n\n---\n\n## 文档来源与版本\n\n文档 ID：${artifact.id}\n文档修订：${artifact.recordRevision}\n关联探索：${record.title}（${record.id}）\n文档形成时研究记录修订：${artifact.sourceRecordRevision}\n来源讨论：${artifact.sourceTurnId??'手动文档'}\n创建时间：${artifact.createdAt}\n更新时间：${artifact.updatedAt}\n\n正文来自上述已保存文档。以下附录包含文档保留的引用，以及本次导出时探索第 ${record.recordRevision} 版的材料和决定依据；新增材料不表示正文已据此修订。用户采纳、生成文档或下载均不表示结论已证实。\n\n${currentState}${notebook}\n\n## 明确关联的论文与综述\n\n以下书目通过内容交付或手动操作关联到当前方向；关联不表示已读或作为证据核验。\n\n${relatedBibliography(record)}\n\n## 来源、摘录与覆盖限制\n\n${sourceText||'尚无可携带的来源摘录。执行前需要取得并核查必要公开资料，不得据此假定已有证据支持。'}\n\n${observations?`## 读者观察\n\n${observations}\n\n`:''}## 执行前核对\n\n执行者应区分已有依据、尚待验证的判断和行动建议。缺失的预算、资源或行动授权保持待确认；本文件本身不新增工具安装、费用、部署、发布或内容入库的授权。发现会改变方向的新证据或条件时，应返回讨论。\n`;
}

export function documentFileName(artifact: ResearchArtifact) {
  return artifact.kind === 'reading-brief' ? READING_BRIEF.fileName : '研究文档.md';
}

/** A readable summary of the direction as currently recorded; no model call. */
export function renderDirectionSummary(record: Exploration): string {
  const research = record.research ?? emptyResearchState();
  const superseded = new Set(research.decisions.flatMap(item => item.supersedes ? [item.supersedes] : []));
  const kinds = { interpretation: '解释', hypothesis: '假设', constraint: '约束', direction: '方向选择', 'next-step': '下一步' };
  const statuses = { adopted: '已采纳', deferred: '已暂缓', rejected: '已否定' };
  const block = (label: string, value: string) => `## ${label}\n\n${value.trim() || '尚未记录'}`;
  const decisions = research.decisions.filter(item => !superseded.has(item.id)).map(item => `- ${kinds[item.kind]} / ${statuses[item.status]}：${item.text}\n  理由：${item.rationale || '尚未填写'}`).join('\n');
  const files = (research.artifacts ?? []).filter(item => item.kind === 'reading-brief').map(item => `- ${item.title}（${item.purpose ? BRIEF_PURPOSES[item.purpose].label : '未标注目的'}，${item.updatedAt.slice(0, 10)}）`).join('\n');
  return [`# 研究方向：${record.title}`,
    `> 根据 PaperDesk 中此方向的当前记录生成（第 ${record.recordRevision} 版，${record.updatedAt.slice(0, 10)}）。“已采纳”表示读者的工作选择，不表示已经证实；本文件不新增任何行动授权。`,
    block('阶段', research.stage ? `${STAGE_LABELS[research.stage].label}：${STAGE_LABELS[research.stage].doing}` : '尚未确定'),
    block('核心问题', record.question), block('目前的认识', record.interpretation), block('候选方向', research.candidates), block('暂缓方向及原因', research.deferred),
    ...(research.notebook ? [block('当前研究记录', research.notebook.versions.at(-1)!.body)] : []),
    block('尚不确定', record.unknowns), block('范围', research.scope), block('约束', research.constraints),
    block('读者确认的决定', decisions), block('明确关联的论文与综述（不代表已读或证据）', relatedBibliography(record)), block('下一步', record.nextAction?.description ?? ''), block('已有选文实施文件', files)].join('\n\n') + '\n';
}
