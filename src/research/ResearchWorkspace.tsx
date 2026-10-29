import { useEffect, useState } from 'react';
import { ARTIFACT_KINDS, createResearchArtifact, freezeTaskBrief, receiptTemplate, receiveExecutionReceipt, renderTaskBrief, validateReceipt, type ArtifactKind, type ResearchArtifact, type TaskBriefVersion, type ExecutionReceipt } from '../../shared/research-artifacts.mjs';
import { createResearchSnapshot, emptyResearchState } from '../../shared/research-contract.mjs';
import { personalStore } from '../records/store';
import type { Exploration } from '../records/types';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { portableResearchSources, renderResearchDocument } from './artifact-actions';
import workflows from './workflow-refs.json';
import './research.css';

const labels:Record<ArtifactKind,string> = {'evidence-synthesis':'证据综合','direction-comparison':'方向比较','reading-plan':'阅读计划','experiment-plan':'实验方案','stage-plan':'阶段计划','harness-task':'Harness 任务'};
const receiptStatuses={completed:'已完成',partial:'部分完成',blocked:'遇到阻塞',failed:'执行失败',cancelled:'已取消'};
const contentStatuses={'not-applicable':'未涉及内容入库',prepared:'已准备内容包',validated:'已校验内容包',imported:'已报告导入'};
function download(name:string,value:string) { const url=URL.createObjectURL(new Blob([value],{type:name.endsWith('.json')?'application/json':'text/markdown;charset=utf-8'})); const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
const split = (value:string) => value.split('\n').map(s=>s.trim()).filter(Boolean);
type WorkspaceDraft={selected?:string;draft?:{title:string;body:string;kind:ArtifactKind};base:number;taskForm:boolean;deliverables:string;acceptance:string;stop:string;limits:string;receiptText:string};
export function ResearchWorkspace({record}:{record:Exploration}) {
  const artifacts=record.research?.artifacts??[];
  const draftKey=`research-workspace:${record.id}`;
  const [cached]=useState(()=>getDraft<WorkspaceDraft>(draftKey));
  const [selected,setSelected]=useState<string|undefined>(cached?.selected);
  const artifact=artifacts.find(a=>a.id===selected);
  const [draft,setDraft]=useState<WorkspaceDraft['draft']>(cached?.draft);
  const [base,setBase]=useState(cached?.base??record.recordRevision);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [taskForm,setTaskForm]=useState(cached?.taskForm??false),[preview,setPreview]=useState<TaskBriefVersion>();
  const [deliverables,setDeliverables]=useState(cached?.deliverables??''),[acceptance,setAcceptance]=useState(cached?.acceptance??''),[stop,setStop]=useState(cached?.stop??''),[limits,setLimits]=useState(cached?.limits??'');
  const [receiptText,setReceiptText]=useState(cached?.receiptText??''),[receiptPreview,setReceiptPreview]=useState<ReturnType<typeof validateReceipt>>();
  const [advancedOpen,setAdvancedOpen]=useState(Boolean(cached?.taskForm||cached?.receiptText));
  useUnloadWarning(Boolean(draft || receiptText || taskForm));
  useEffect(()=>{
    if(draft||receiptText||taskForm)keepDraft(draftKey,{selected,draft,base,taskForm,deliverables,acceptance,stop,limits,receiptText} satisfies WorkspaceDraft);
    else clearDraft(draftKey);
  },[draftKey,selected,draft,base,taskForm,deliverables,acceptance,stop,limits,receiptText]);
  async function perform(action:()=>Promise<void>) {setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'保存失败；草稿仍保留。');}finally{setBusy(false);}}
  async function persist(next:ResearchArtifact, expected=record.recordRevision) {
    const research=record.research??emptyResearchState();
    await personalStore.saveExploration({...record,research:{...research,artifacts:artifacts.some(a=>a.id===next.id)?artifacts.map(a=>a.id===next.id?next:a):[...artifacts,next]}},expected);
  }
  function edit(item?:ResearchArtifact) {setSelected(item?.id);setBase(record.recordRevision);setDraft({title:item?.title??'',body:item?.body??'',kind:item?.kind??'stage-plan'});setPreview(undefined);setTaskForm(false);setError('');}
  async function saveDraft() {if(!draft)return; const next=artifact?{...artifact,...draft,recordRevision:artifact.recordRevision+1,updatedAt:new Date().toISOString()}:createResearchArtifact({...draft,recordRevision:record.recordRevision});await persist(next,base);setSelected(next.id);setDraft(undefined);setNotice('文档已保存；没有改变研究决定。');}
  async function prepareTask() {
    if(!artifact)return;
    if(!split(deliverables).length||!split(acceptance).length||!split(stop).length||!limits.trim()) throw Error('请填写交付物、验收、停止条件和行动预算。');
    const snapshot=await createResearchSnapshot(record);
    const task=await freezeTaskBrief({artifact,snapshot,sources:await portableResearchSources(record,artifact),tasks:[{id:artifact.taskVersions.at(-1)?.tasks[0]?.id??crypto.randomUUID(),question:artifact.title,inputs:['本任务携带的研究状态、固定来源与摘录'],dependsOn:[],deliverables:split(deliverables),acceptanceCriteria:split(acceptance),stopConditions:split(stop)}],executionLimits:limits,acceptanceCriteria:split(acceptance),requiredWorkflows:workflows});
    setBase(record.recordRevision);setPreview(task);
  }
  async function confirmTask() {if(!artifact||!preview)return;await persist({...artifact,taskVersions:[...artifact.taskVersions,preview],recordRevision:artifact.recordRevision+1,updatedAt:new Date().toISOString()},base);setPreview(undefined);setTaskForm(false);setNotice('已保存固定任务版本，可以下载交接文件。后续编辑草稿不会改写此版本。');}
  function prepareDiscussion(mode:'implementation'|'document') {
    const question=mode==='implementation'
      ? '请结合当前探索中我已授权带入的研究状态、资料，以及本研究主题的历史讨论，整理一份可交给新 Harness 会话独立执行的完整 Markdown 实施文件。请包含：本轮目标及选择它的理由；已有结论、尚待验证的假设和暂缓方向；依据、固定来源位置与覆盖缺口；任务顺序与依赖；具体交付物；完成条件及停止或返回讨论的条件；已经明确授权的行动和仍待确认的事项。保留研究判断的条件和不确定性，不把采纳的假设写成已证实结论。没有明确依据时，不虚构预算、资源、工具安装或执行授权。只追问会实质改变实施方案的问题，其他未知项可以明确标注待确认。若需要已保存研究文档，请仅使用我在本轮明确选入的文档；未选入的文档不要假定已读。'
      : '请围绕我在本轮明确选入的研究文档继续讨论，结合已授权带入的当前研究状态和相关历史：核对目标与依据，指出需要修订的判断、缺失资料和下一步，帮助完善可交给 Harness 执行的实施文件。先确认本轮是否已选入该文档；未选入时请提醒我选择，不要假定已读。保留假设与结论、计划与结果的区别，不新增未经明确授权的预算、安装或执行行动。';
    window.dispatchEvent(new CustomEvent('paperdesk:research-question',{detail:{explorationId:record.id,question}}));
    setError('');
    setNotice(`已打开研究助手，发送前请检查问题与材料；已有问题和文档草稿会保留。${artifact?'若要参考选中文档，请在 AI 面板中将它选为本轮附件。':'只会使用你在 AI 面板中明确选入的资料。'}`);
  }
  async function exportDocument() {
    if(!artifact)return;
    const markdown=await renderResearchDocument(record,artifact);
    download('研究文档.md',markdown);
    setNotice('已生成研究文档下载，包含已保存正文和来源附录。请在浏览器下载列表确认文件已保存。');
  }
  function discussReceipt(receipt:ExecutionReceipt) {
    const task=artifact?.taskVersions.find(t=>t.version===receipt.taskRef.version);
    const question=`请结合当前研究状态分析这份执行回执：哪些判断受到支持或限制，哪些未完成项应继续调查？这是执行者报告，不自动视为已经核实的事实。请先回查相关证据，再提出研究修改建议。\n\n任务目标：${task?.goal??'任务不可用'}\n\n执行回执：\n${JSON.stringify(receipt,null,2)}`;
    if(question.length>6000){setError('完整回执超过提问长度，请从回执中选取本轮需要讨论的结果，粘贴到研究对话。已保存回执保持完整。');return;}
    window.dispatchEvent(new CustomEvent('paperdesk:research-question',{detail:{explorationId:record.id,question}}));
    setNotice('已准备研究问题；检查对话输入框并明确发送后才会调用模型。');
  }
  return <section className="research-workspace" aria-labelledby="research-documents-heading">
    <div className="research-heading"><div><span className="eyebrow">讨论形成下一步</span><h2 id="research-documents-heading">研究文档</h2></div><button className="research-primary" onClick={()=>prepareDiscussion('implementation')} disabled={busy}>让助手整理实施文件</button></div>
    <p className="exploration-small">和助手讨论下一阶段的目标、依据与行动，保存回答后即可下载带来源的研究文档，交给 Harness 继续实施。</p>
    <div className="research-actions"><button onClick={()=>edit()} disabled={busy||Boolean(draft)||Boolean(receiptText)}>新建研究文档</button><span className="exploration-small">整理动作先准备问题，检查后发送才会调用模型。</span></div>
    {artifacts.length>0 && <label>选择文档<select value={selected??''} onChange={e=>{setSelected(e.target.value||undefined);setDraft(undefined);setTaskForm(false);setPreview(undefined);setReceiptText('');setReceiptPreview(undefined);}} disabled={Boolean(draft)||Boolean(receiptText)||busy}><option value="">选择已保存的研究文档</option>{artifacts.map(a=><option key={a.id} value={a.id}>{a.title} · {labels[a.kind]}</option>)}</select></label>}
    {draft ? <div className="research-editor">
      <label>文档类型<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as ArtifactKind})}>{ARTIFACT_KINDS.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
      <label>文档标题<input value={draft.title} maxLength={300} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
      <label>研究文档正文<textarea rows={14} maxLength={100000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})} placeholder="说明目标、已有依据、未知、方向选择及理由。实验方案须说明竞争解释、基线、控制变量、评价与失败条件。"/></label>
      <div className="research-actions"><button onClick={()=>void perform(saveDraft)} disabled={busy||!draft.title.trim()}>保存文档草稿</button><button onClick={()=>download('research-draft.md',`# ${draft.title}\n\n${draft.body}`)}>下载草稿副本</button><button onClick={()=>setDraft(undefined)} disabled={busy}>取消编辑</button></div>
    </div> : artifact && <>
      <h3>{artifact.title}</h3><p className="exploration-small">{labels[artifact.kind]} · 草稿修订 {artifact.recordRevision} · 基于研究记录第 {artifact.sourceRecordRevision} 版{artifact.sourceTurnId?' · 来源：AI 问答':' · 手动文档'}。保存或采纳不表示结论已验证。</p>
      <div className="research-prose">{artifact.body || '正文尚未填写。'}</div>
      {artifact.evidenceRefs.length>0 && <details><summary>保留的问答依据（{artifact.evidenceRefs.length}）</summary>{artifact.evidenceRefs.map(ref=><div key={`${ref.turnId}/${ref.citationId}`}><p>{ref.citationId} · {String(ref.source.title)} · 来源问答 {ref.turnId}</p><blockquote>{ref.source.text}</blockquote></div>)}</details>}
      <div className="research-actions"><button className="research-primary" onClick={()=>void perform(exportDocument)} disabled={busy||!artifact.body.trim()}>下载研究文档.md</button><button onClick={()=>prepareDiscussion('document')} disabled={busy}>围绕此文档继续讨论</button><button onClick={()=>edit(artifact)} disabled={busy}>编辑文档</button></div>
      <p className="exploration-small">下载包含已保存正文、来源讨论与修订、固定引用、摘录和覆盖限制。继续讨论时，请在 AI 面板中主动选入需要参考的文档。</p>
      <details className="research-advanced" open={advancedOpen} onToggle={event=>setAdvancedOpen(event.currentTarget.open)}><summary>可选：固定任务版本与执行回执</summary>
      <p className="exploration-small">需要精确追踪任务版本或接收执行结果时，可以使用这些附加记录；研究文档已可直接下载交接。</p>
      <div className="research-actions"><button onClick={()=>{setTaskForm(!taskForm);setPreview(undefined);}} disabled={busy||!artifact.body.trim()}>准备执行任务</button></div>
      {taskForm && <div className="research-editor"><h3>任务执行边界</h3><p>计划正文和当前研究状态会进入任务预览。以下条目每行一项；来源与版本随任务固定。</p>
        <label>交付物<textarea value={deliverables} onChange={e=>{setDeliverables(e.target.value);setPreview(undefined);}} placeholder="例如：候选文献及纳入/排除理由、比较表、未取得材料"/></label>
        <label>完成与验收条件<textarea value={acceptance} onChange={e=>{setAcceptance(e.target.value);setPreview(undefined);}} placeholder="说明取得什么证据才足以推进问题"/></label>
        <label>停止或返回讨论的条件<textarea value={stop} onChange={e=>{setStop(e.target.value);setPreview(undefined);}}/></label>
        <label>行动范围与预算<textarea value={limits} onChange={e=>{setLimits(e.target.value);setPreview(undefined);}} placeholder="明确允许检索、制作、导入或运行到什么程度；时间、数量与资源限制"/></label>
        <button disabled={busy} onClick={()=>void perform(prepareTask)}>预览固定任务</button>
        {preview && <><pre className="research-task-preview">{renderTaskBrief(preview)}</pre><button disabled={busy} onClick={()=>void perform(confirmTask)}>确定并保存任务版本</button></>}
      </div>}
      {artifact.taskVersions.map(task=><details key={task.version}><summary>执行任务 v{task.version} · {task.createdAt.slice(0,10)}</summary><pre className="research-task-preview">{renderTaskBrief(task)}</pre><div className="research-actions"><button onClick={()=>download('brief.md',renderTaskBrief(task))}>下载 brief.md</button><button onClick={()=>download('brief.json',JSON.stringify(task,null,2))}>下载 brief.json</button><button onClick={()=>download('receipt-template.json',JSON.stringify(receiptTemplate(task),null,2))}>下载回执模板</button></div></details>)}
      {artifact.taskVersions.length>0 && <div className="research-receipt"><h3>接收执行回执</h3><label>选择回执 JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void perform(async()=>{if(file.size>1024*1024)throw Error('回执超过 1 MiB。');const value=await file.text();setReceiptText(value);setReceiptPreview(undefined);});e.target.value='';}}/></label>
        {receiptText && <><button disabled={busy} onClick={()=>{setReceiptText("");setReceiptPreview(undefined);setError("");}}>取消回执导入</button><button onClick={()=>void perform(async()=>{const value=JSON.parse(receiptText);const task=artifact.taskVersions.find(t=>t.version===value.taskRef?.version);if(!task)throw Error('对应任务版本不存在。');setReceiptPreview(validateReceipt(value,task));setBase(record.recordRevision);})} disabled={busy}>预览回执</button><button onClick={()=>download('receipt-preserved.json',receiptText)}>下载保留本次回执</button></>}
        {receiptPreview && <><pre className="research-task-preview">{JSON.stringify(receiptPreview,null,2)}</pre><p>这只保存执行报告；不会标记论文已读、自动导入内容或采纳研究判断。</p><button disabled={busy} onClick={()=>void perform(async()=>{const next=receiveExecutionReceipt(artifact,receiptPreview);if(next!==artifact)await persist(next,base);setReceiptPreview(undefined);setReceiptText('');setNotice(next===artifact?'重复回执，无变化。':'执行结果已保存，可据此继续研究讨论。');})}>保存执行回执</button></>}
      </div>}
      {artifact.receipts.map(receipt=><details key={receipt.runId}><summary>执行结果 · v{receipt.taskRef.version} · {receiptStatuses[receipt.status]}</summary>{receipt.taskResults.map(result=><div key={result.taskItemId}><p className="research-prose">{result.summary}</p><p>内容状态：{contentStatuses[result.contentStatus]}</p><p>产物：{result.outputs.join('；')||'未报告'}</p><p>依据：{result.evidence.join('；')||'未报告'}</p><p>未完成：{[...result.unmetCriteria,...result.blockers].join('；')||'未报告'}</p></div>)}<p>新问题：{receipt.unresolvedQuestions.join('；')||'未报告'}</p><p>建议下一步：{receipt.suggestedNextActions.join('；')||'未报告'}</p><button onClick={()=>discussReceipt(receipt)}>带着结果继续讨论</button></details>)}
      </details>
    </>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
