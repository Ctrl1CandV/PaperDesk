import { useRef, useState } from 'react';
import type { Evidence, Exploration, GuideEvidence, GuideTarget } from '../records/types';
import { Dialog } from '../ui/Dialog';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { EvidenceCard } from './EvidenceCard';
import { TargetSelect } from './ExplorationEditor';
import { QuickQuestionForm } from './QuickQuestion';
import { statusLabels, useExplorations } from './model';
import { SaveFeedback, useExplorationSave } from './SaveFeedback';
import './exploration.css';

export function AddEvidenceDialog({ evidence, onClose, onSaved, onDiscuss }: {
  evidence: GuideEvidence; onClose: () => void; onSaved?: (record: Exploration) => void;
  /** Continue in the reading assistant with this topic; a new question is prefilled. */
  onDiscuss?: (record: Exploration, question?: string) => void;
}) {
  const { records, loading, error, hasMore, loadMore } = useExplorations();
  const draftKey = `exploration:from-reading:${evidence.target.guideId}/${evidence.target.revision}/${evidence.target.unitId}:${evidence.text}`;
  const attachmentKey = `${draftKey}:attachment`;
  const cached = getDraft<{selected: Exploration | null; comment: string}>(attachmentKey);
  const [mode, setMode] = useState<'new' | 'existing'>(cached?.selected ? 'existing' : 'new');
  const [selectedId, setSelectedId] = useState(cached?.selected?.id ?? '');
  const selected = records.find(record => record.id === selectedId) ?? (cached?.selected?.id === selectedId ? cached.selected : null) ?? records[0] ?? null;
  const [comment, setComment] = useState(cached?.comment ?? '');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const discuss = useRef(false);
  useUnloadWarning(Boolean(comment));
  function completed(record: Exploration, start = discuss.current) {
    clearDraft(draftKey); clearDraft(attachmentKey); onSaved?.(record); onClose();
    if (start) onDiscuss?.(record);
  }
  const state = useExplorationSave(record => completed(record));
  const discard = () => { clearDraft(draftKey); clearDraft(attachmentKey); onClose(); };
  const busy = state.busy || creatingBusy;
  return <Dialog title="加入探索" onClose={onClose} busy={busy} className="exploration-dialog reader-editor">
    <p className="exploration-small">选中的导读文字会作为材料保留。它仍是导读摘录，不代表读过原文或已验证结论。</p>
    <div className="quick-mode" role="radiogroup" aria-label="加入方式">
      <label><input type="radio" name="evidence-destination" checked={mode === 'new'} disabled={busy} onChange={() => setMode('new')} />新建方向</label>
      <label><input type="radio" name="evidence-destination" checked={mode === 'existing'} disabled={busy || !loading && !records.length} onChange={() => setMode('existing')} />加到已有方向{!loading && !records.length ? '（暂无）' : ''}</label>
    </div>
    {error && <p className="exploration-missing" role="alert">暂时不能读取已有探索。仍可写下新问题；保存失败时会保留草稿。</p>}
    {mode === 'new' ? <QuickQuestionForm evidence={evidence} draftKey={draftKey} onCancel={onClose} onBusyChange={setCreatingBusy}
      onCreated={(record, start) => { clearDraft(attachmentKey); onSaved?.(record); onClose(); if (start) onDiscuss?.(record, record.question); }} />
    : <form className="exploration-form" onSubmit={event => {
      event.preventDefault(); if (!selected) return;
      discuss.current = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'discuss';
      void state.save({ ...selected, evidence: [...selected.evidence, { ...evidence, ...(comment ? { comment } : {}) }] }, selected.recordRevision);
    }}>
      <fieldset className="exploration-form-body" disabled={state.busy}>
      <EvidenceCard evidence={evidence} />
      <label className="exploration-destination">保存到<select aria-label="保存到哪个探索" value={selected?.id ?? ''} onChange={event => { setSelectedId(event.target.value); keepDraft(attachmentKey, { selected: records.find(record => record.id === event.target.value) ?? null, comment }); state.clearError(); }} disabled={loading || busy}>
        {records.map(record => <option key={record.id} value={record.id}>{record.title} · {statusLabels[record.status]}</option>)}
      </select></label>
      {hasMore && <button type="button" className="text-action" disabled={loading || busy} onClick={() => void loadMore()}>载入更多可选探索</button>}
      {selected && <div className="exploration-attachment-context"><p>{selected.question}</p><p className="exploration-small">现有 {selected.evidence.length} 条材料会完整保留。</p></div>}
      <label>这条材料的批注（可选）<textarea aria-label="这条材料的批注（可选）" value={comment} onChange={event => { setComment(event.target.value); keepDraft(attachmentKey, { selected, comment: event.target.value }); state.clearError(); }} maxLength={12000} rows={3} /></label>
      <SaveFeedback state={state} />
      {onDiscuss && <p className="exploration-small">选择“保存并继续讨论”后，旁边的 AI 对话会关联这个方向；它的记录会随你之后发送的提问交给所选模型。</p>}
      <div className="exploration-form-actions">{onDiscuss && <button type="submit" value="discuss" className="primary-action" disabled={state.busy || !selected}>保存并继续讨论</button>}<button type="submit" value="save" className={onDiscuss ? undefined : 'primary-action'} disabled={state.busy || !selected}>{state.busy ? '正在保存…' : '保存材料到此探索'}</button><button type="button" onClick={onClose} disabled={state.busy}>收起（保留草稿）</button>{comment && <button type="button" onClick={discard} disabled={state.busy}>丢弃草稿</button>}</div>
      </fieldset>
    </form>}
  </Dialog>;
}

interface ManualDraft {
  base: Exploration; provenance: 'original-excerpt' | 'reader-observation'; text: string;
  identity: string; locator: string; version: string; comment: string; target?: GuideTarget;
}
export function ManualEvidenceDialog({ record, onClose, onSaved }: { record: Exploration; onClose: () => void; onSaved: (record: Exploration) => void }) {
  const draftKey = `exploration:manual:${record.id}`;
  const [draft, setDraft] = useState<ManualDraft>(() => getDraft<ManualDraft>(draftKey) ?? { base: record, provenance: 'original-excerpt', text: '', identity: '', locator: '', version: '', comment: '' });
  const dirty = Boolean(draft.text || draft.identity || draft.locator || draft.comment);
  useUnloadWarning(dirty);
  function change(patch: Partial<ManualDraft>) { const next = { ...draft, ...patch }; setDraft(next); keepDraft(draftKey, next); state.clearError(); }
  const state = useExplorationSave(saved => { clearDraft(draftKey); onSaved(saved); onClose(); });
  function save() {
    const common = { id: crypto.randomUUID(), text: draft.text, ...(draft.comment ? { comment: draft.comment } : {}), ...(draft.target ? { target: draft.target } : {}) };
    const evidence: Evidence = draft.provenance === 'original-excerpt'
      ? { ...common, provenance: 'original-excerpt', source: { identity: draft.identity, locator: draft.locator, version: draft.version || null } }
      : { ...common, provenance: 'reader-observation' };
    void state.save({ ...draft.base, evidence: [...draft.base.evidence, evidence] }, draft.base.recordRevision);
  }
  const discard = () => { clearDraft(draftKey); onClose(); };
  return <Dialog title="添加材料" onClose={onClose} busy={state.busy} className="exploration-dialog reader-editor"><form className="exploration-form" onSubmit={event => { event.preventDefault(); save(); }}>
    <fieldset className="exploration-form-body" disabled={state.busy}>
    <p className="exploration-small">导读摘录请从阅读页选择。这里可以记下亲自核对的原文片段，或保留一条自己的观察。</p>
    <label>材料类型<select aria-label="材料类型" value={draft.provenance} onChange={event => change({ provenance: event.target.value as ManualDraft['provenance'] })}>
      <option value="original-excerpt">原文摘录（手动填写来源）</option><option value="reader-observation">个人观察（不要求外部来源）</option>
    </select></label>
    {draft.provenance === 'original-excerpt' && <>
      <label>原文来源 URL 或学术标识<input aria-label="原文来源 URL 或学术标识" required maxLength={4096} value={draft.identity} onChange={event => change({ identity: event.target.value })} placeholder="填写实际来源地址或论文标识" /></label>
      <label>原文位置<input aria-label="原文位置" required maxLength={600} value={draft.locator} onChange={event => change({ locator: event.target.value })} placeholder="章节、页码、图号或其他可回查位置" /></label>
      <label>来源版本（未知可留空）<input aria-label="来源版本（未知可留空）" value={draft.version} maxLength={100} onChange={event => change({ version: event.target.value })} /></label>
    </>}
    <label>{draft.provenance === 'original-excerpt' ? '原文摘录' : '我的观察'}<textarea aria-label={draft.provenance === 'original-excerpt' ? '原文摘录' : '我的观察'} required value={draft.text} maxLength={20000} rows={6} onChange={event => change({ text: event.target.value })} /></label>
    <TargetSelect value={draft.target} onChange={target => change({ target })} />
    <label>我的批注（可选）<textarea aria-label="我的批注（可选）" value={draft.comment} maxLength={12000} rows={3} onChange={event => change({ comment: event.target.value })} /></label>
    {draft.provenance === 'original-excerpt' && <p className="exploration-small">归属由你手动填写，平台不会将其显示为已经独立核验的来源。</p>}
    <SaveFeedback state={state} />
    <p className="exploration-small">收起后保留本次会话的草稿；刷新或关闭浏览器前请保存。</p>
    <div className="exploration-form-actions"><button type="submit" className="primary-action" disabled={state.busy}>{state.busy ? '正在保存…' : '保存这条材料'}</button><button type="button" disabled={state.busy} onClick={onClose}>收起编辑（保留草稿）</button>{dirty && <button type="button" disabled={state.busy} onClick={discard}>丢弃草稿</button>}</div>
    </fieldset>
  </form></Dialog>;
}
