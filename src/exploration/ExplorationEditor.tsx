import { useEffect, useState } from 'react';
import type { Exploration, ExplorationDraft, GuideTarget, NextAction } from '../records/types';
import { contentRepository } from '../content/repository';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { Dialog } from '../ui/Dialog';
import { EvidenceCard } from './EvidenceCard';
import { SaveFeedback, useExplorationSave } from './SaveFeedback';
import { actionLabels, statusLabels, targetLabel } from './model';
import { emptyResearchState } from '../../shared/research-contract.mjs';
import type { ResearchDecision } from '../../shared/research-contract.mjs';
import { decisionKinds, decisionStatuses } from '../assistant/ResearchProposals';

export interface CachedExplorationDraft { draft: ExplorationDraft; expectedRevision: number | null }
const encodeTarget = (target?: GuideTarget) => target ? `${target.guideId}/${target.revision}/${target.unitId}` : '';
function decodeTarget(value: string): GuideTarget | undefined {
  const [guideId, revision, unitId] = value.split('/');
  return guideId && revision && unitId ? { guideId, revision: Number(revision), unitId } : undefined;
}

export function TargetSelect({ value, onChange, label = '关联阅读位置', required = false }: {
  value?: GuideTarget; onChange: (target: GuideTarget | undefined) => void; label?: string; required?: boolean;
}) {
  const entries = contentRepository.list().flatMap(({ guide }) => guide.units.map(unit => ({
    target: { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: unit.id },
    label: `${guide.metadata.title.split('：')[0]} · ${unit.heading ?? '阅读起点'}`,
  })));
  const encoded = encodeTarget(value);
  const retained = value && !entries.some(item => encodeTarget(item.target) === encoded);
  return <label>{label}<select aria-label={label} required={required} value={encoded} onChange={event => onChange(decodeTarget(event.target.value))}>
    <option value="">{required ? '请选择具体章节' : '不关联导读'}</option>
    {retained && <option value={encoded}>{targetLabel(value) ?? '原先保存的阅读位置（当前不可用）'}</option>}
    {entries.map(item => <option key={encodeTarget(item.target)} value={encodeTarget(item.target)}>{item.label}</option>)}
  </select>{retained && <span className="exploration-target-summary">保留的阅读位置 · 导读修订 {value.revision}<br />{targetLabel(value) ?? '原先保存的位置当前不可用，原始标识仍保留。'}</span>}</label>;
}

export function ExplorationEditor({ initial, expectedRevision, draftKey, onSaved, onCancel, creating = false, onBusyChange, onDiscard }: {
  initial: ExplorationDraft; expectedRevision: number | null; draftKey: string;
  onSaved: (record: Exploration) => void; onCancel: () => void; creating?: boolean; onBusyChange?: (busy: boolean) => void; onDiscard?: () => void;
}) {
  const restored = getDraft<CachedExplorationDraft>(draftKey);
  const [draft, setDraft] = useState(restored?.draft ?? initial);
  const [expected, setExpected] = useState(restored?.expectedRevision ?? expectedRevision);
  const [notice, setNotice] = useState(restored ? '已恢复这页尚未保存的草稿。' : '');
  const [decisionText, setDecisionText] = useState(''), [decisionReason, setDecisionReason] = useState('');
  const [decisionKind, setDecisionKind] = useState<ResearchDecision['kind']>('hypothesis');
  const [decisionStatus, setDecisionStatus] = useState<ResearchDecision['status']>('adopted');
  const [supersedes, setSupersedes] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnloadWarning(dirty);
  const state = useExplorationSave(record => { clearDraft(draftKey); onSaved(record); });
  useEffect(() => { onBusyChange?.(state.busy); }, [onBusyChange, state.busy]);
  function update(patch: Partial<ExplorationDraft>) {
    const changed = { ...draft, ...patch };
    setDraft(changed); keepDraft(draftKey, { draft: changed, expectedRevision: expected }); setNotice(''); state.clearError();
  }
  function actionUpdate(patch: Partial<NextAction>) {
    if (draft.nextAction) update({ nextAction: { ...draft.nextAction, ...patch } });
  }
  const extraFields = <>
    <label>我的解释<textarea aria-label="我的解释" value={draft.interpretation} maxLength={20000} rows={4} onChange={event => update({ interpretation: event.target.value })} placeholder="目前怎样理解这些材料？可以留空。" /></label>
    <label>尚不确定的地方<textarea aria-label="尚不确定的地方" value={draft.unknowns} maxLength={20000} rows={4} onChange={event => update({ unknowns: event.target.value })} placeholder="还缺哪些证据，或哪些条件需要查证？" /></label>
  </>;
  return <form className="exploration-form" aria-busy={state.busy || undefined} onSubmit={event => { event.preventDefault(); void state.save(draft, expected); }}>
    <fieldset className="exploration-form-body" disabled={state.busy}>
    {notice && <p className="exploration-small" role="status">{notice}</p>}
    <label>探索标题<input aria-label="探索标题" autoFocus value={draft.title} required maxLength={300} onChange={event => update({ title: event.target.value })} placeholder="给这个问题一个便于回访的名字" /></label>
    <label>我想继续追问的问题<textarea aria-label="我想继续追问的问题" value={draft.question} required maxLength={12000} rows={4} onChange={event => update({ question: event.target.value })} placeholder="从当前阅读里的一处疑问开始，不必一次写成研究题目。" /></label>
    {draft.origin === 'adapted-editorial' && <p className="exploration-small">由编辑起点改写。保存后才成为你的个人记录；编辑建议并不证明研究空白或方法有效。</p>}
    <label>当前状态<select aria-label="当前状态" value={draft.status} onChange={event => update({ status: event.target.value as Exploration['status'] })}>
      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {creating ? <details className="exploration-extra"><summary>补充解释与未知（可稍后再写）</summary>{extraFields}</details> : extraFields}
    <details className="exploration-extra"><summary>研究范围、约束与候选方向</summary>
      {([['scope', '研究范围'], ['constraints', '明确约束'], ['candidates', '候选方向'], ['deferred', '暂缓方向及原因']] as const).map(([field, label]) => <label key={field}>{label}<textarea aria-label={label} value={draft.research?.[field] ?? ''} rows={3} maxLength={12000} onChange={event => update({ research: { ...(draft.research ?? emptyResearchState()), [field]: event.target.value } })} /></label>)}
    </details>
    <details className="exploration-extra"><summary>记录一项研究决定或修订</summary>
      <p className="exploration-small">旧决定保留。修订时选择被替代的决定；采纳假设只表示准备调查它。</p>
      <label>决定类型<select aria-label="决定类型" value={decisionKind} onChange={event => setDecisionKind(event.target.value as ResearchDecision['kind'])}>{Object.entries(decisionKinds).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>处理状态<select aria-label="决定处理状态" value={decisionStatus} onChange={event => setDecisionStatus(event.target.value as ResearchDecision['status'])}>{Object.entries(decisionStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>决定内容<textarea aria-label="决定内容" value={decisionText} maxLength={12000} rows={3} onChange={event => setDecisionText(event.target.value)} /></label>
      <label>形成理由<textarea aria-label="形成理由" value={decisionReason} maxLength={12000} rows={2} onChange={event => setDecisionReason(event.target.value)} /></label>
      <label>替代旧决定<select aria-label="替代旧决定" value={supersedes} onChange={event => setSupersedes(event.target.value)}><option value="">新增独立决定</option>{draft.research?.decisions.map(item => <option key={item.id} value={item.id}>{item.text}</option>)}</select></label>
      <button type="button" disabled={!decisionText.trim()} onClick={() => {
        const research = draft.research ?? emptyResearchState();
        update({ research: { ...research, decisions: [...research.decisions, { id: crypto.randomUUID(), kind: decisionKind, status: decisionStatus, text: decisionText.trim(), rationale: decisionReason, sourceTurnId: null, evidenceRefs: [], createdAt: new Date().toISOString(), ...(supersedes ? { supersedes } : {}) }] } });
        setDecisionText(''); setDecisionReason(''); setSupersedes(''); setNotice('决定已加入编辑草稿，点击保存修改后写入研究记录。');
      }}>加入决定草稿</button>
      {draft.research?.decisions.map(item => <p className="exploration-small" key={item.id}>{decisionKinds[item.kind]} · {decisionStatuses[item.status]}：{item.text}</p>)}
    </details>
    <fieldset><legend>下一步</legend>
      <label>行动类型<select aria-label="行动类型" value={draft.nextAction?.kind ?? ''} onChange={event => {
        const kind = event.target.value as NextAction['kind'] | '';
        update({ nextAction: kind ? { kind, description: draft.nextAction?.description ?? '', ...(draft.nextAction?.target ? { target: draft.nextAction.target } : {}) } : null });
      }}><option value="">尚未选择</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.nextAction && <>
        <label>具体准备做什么<textarea aria-label="具体准备做什么" required value={draft.nextAction.description} maxLength={2000} rows={2} onChange={event => actionUpdate({ description: event.target.value })} /></label>
        <TargetSelect value={draft.nextAction.target} onChange={target => {
          const { target: _old, ...action } = draft.nextAction!;
          update({ nextAction: target ? { ...action, target } : action });
        }} required={draft.nextAction.kind === 'read-guide'} label="下一步的阅读位置" />
        {draft.nextAction.kind === 'search-literature' && <p className="exploration-small">这里只保存待查问题，不会自动搜索或生成书目。</p>}
      </>}
    </fieldset>
    {draft.evidence.length > 0 && <section className="exploration-editor-evidence"><h3>随记录保留的材料</h3>{draft.evidence.map((item, index) => <div key={item.id}>
      <EvidenceCard evidence={item} />
      <label>这条材料的批注<textarea aria-label="这条材料的批注" value={item.comment ?? ''} rows={2} maxLength={12000} onChange={event => update({ evidence: draft.evidence.map((entry, at) => at === index ? { ...entry, comment: event.target.value } : entry) })} /></label>
      <button className="exploration-remove" type="button" onClick={() => update({ evidence: draft.evidence.filter(entry => entry.id !== item.id) })}>从草稿移除此材料</button>
    </div>)}</section>}
    <SaveFeedback state={state} onUseCurrent={record => {
      clearDraft(draftKey); setDraft(record); setExpected(record.recordRevision); setNotice('已采用另一个已保存版本。');
    }} />
    <div className="exploration-form-actions"><button className="primary-action" type="submit" disabled={state.busy}>{state.busy ? '正在保存…' : creating ? '保存探索' : '保存修改'}</button>
      <button type="button" disabled={state.busy} onClick={onCancel}>收起编辑（保留草稿）</button>{dirty && <button type="button" disabled={state.busy} onClick={() => { clearDraft(draftKey); (onDiscard ?? onCancel)(); }}>丢弃草稿</button>}</div>
    <p className="exploration-small">只有点击保存才写入个人记录。收起后在本次会话中保留草稿；刷新或关闭浏览器前请保存，或复制草稿以便恢复。</p>
    </fieldset>
  </form>;
}

export function CreateExplorationDialog({ initial, draftKey, onSaved, onClose }: {
  initial: ExplorationDraft; draftKey: string; onSaved: (record: Exploration) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return <Dialog title="创建一个探索问题" onClose={onClose} busy={busy} className="exploration-dialog reader-editor">
    <ExplorationEditor initial={initial} expectedRevision={null} draftKey={draftKey} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} creating />
  </Dialog>;
}
