import { useMemo, useRef, useState } from 'react';
import type { Exploration, ExplorationDraft, GuideEvidence } from '../records/types';
import { createSeedDiscussion, emptyResearchState } from '../../shared/research-contract.mjs';
import { Dialog } from '../ui/Dialog';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { EvidenceCard } from './EvidenceCard';
import { SaveFeedback, useExplorationSave } from './SaveFeedback';
import { createExploration, titleFromQuestion } from './model';
import './exploration.css';

export interface SeedSource { conversationId: string; guideId: string; revision: number; guideTitle: string; turns: { id: string; question: string; answer: string }[] }
type QuickDraft = { question: string; title: string; carry: boolean };

/**
 * Starting a topic needs only the reader's question. Interpretation, candidates,
 * decisions and next steps are organized later in discussion and adopted explicitly.
 */
export function QuickQuestionForm({ base, evidence, seed, initialQuestion = '', draftKey, onCreated, onCancel, onBusyChange }: {
  base?: ExplorationDraft; evidence?: GuideEvidence; seed?: SeedSource; initialQuestion?: string; draftKey: string;
  onCreated: (record: Exploration, discuss: boolean) => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<QuickDraft>(() => getDraft<QuickDraft>(draftKey) ?? { question: initialQuestion || base?.question || '', title: '', carry: true });
  // A ref, because the save callback is bound before this submit's choice renders.
  const mode = useRef<'discuss' | 'save'>('discuss');
  const seedDiscussion = useMemo(() => seed ? createSeedDiscussion(seed) : undefined, [seed]);
  const state = useExplorationSave(record => { clearDraft(draftKey); onBusyChange?.(false); onCreated(record, mode.current === 'discuss'); });
  const dirty = draft.question.trim() !== (initialQuestion || base?.question || '').trim() || Boolean(draft.title);
  useUnloadWarning(dirty);
  function change(patch: Partial<QuickDraft>) { const next = { ...draft, ...patch }; setDraft(next); keepDraft(draftKey, next); state.clearError(); }
  function submit(chosen: 'discuss' | 'save') {
    if (!draft.question.trim()) return;
    mode.current = chosen; onBusyChange?.(true);
    const start = base ?? createExploration();
    const research = seedDiscussion && draft.carry ? { ...(start.research ?? emptyResearchState()), seedDiscussion } : start.research;
    void state.save({ ...start, title: draft.title.trim() || titleFromQuestion(draft.question), question: draft.question.trim(),
      evidence: evidence ? [...start.evidence, evidence] : start.evidence, ...(research ? { research } : {}) }, null).finally(() => onBusyChange?.(false));
  }
  const sent = ['问题', ...(evidence ? ['这段摘录'] : []), ...(seedDiscussion && draft.carry ? ['带入的讨论节选'] : [])].join('、');
  return <form className="exploration-form quick-question" aria-busy={state.busy || undefined} onSubmit={event => {
    event.preventDefault();
    submit(((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'save' ? 'save' : 'discuss');
  }}>
    <fieldset className="exploration-form-body" disabled={state.busy}>
      {evidence && <EvidenceCard evidence={evidence} />}
      <label>想弄清楚的问题<textarea aria-label="想弄清楚的问题" autoFocus required rows={4} maxLength={12000} value={draft.question} onChange={event => change({ question: event.target.value })} placeholder="写下读到这里时的疑惑或粗略想法，不必写成研究题目。" /></label>
      <p className="exploration-small">不需要先想好方向和计划。之后在讨论中输入 /方向，AI 会把认识、候选方向、阶段和下一步写进来；输入 /选文 可生成交给 Harness 的选文文件。</p>
      {seedDiscussion && <div className="quick-seed">
        <label className="quick-check"><input type="checkbox" checked={draft.carry} onChange={event => change({ carry: event.target.checked })} />带上刚才的 {seedDiscussion.turns.length} 轮导读讨论作为起点</label>
        <details><summary>查看将带入的节选</summary><p className="exploration-small">来自《{seedDiscussion.guideTitle}》的普通讨论。它们是模型回答的节选，不是论文证据；研究助手需要时可回看完整问答。</p>
          <ol>{seedDiscussion.turns.map(turn => <li key={turn.turnId}><strong>{turn.question}</strong><p>{turn.answer}{turn.answerTruncated ? '…' : ''}</p></li>)}</ol></details>
      </div>}
      <details className="exploration-extra"><summary>标题（可选，默认取问题开头）</summary><label>探索标题<input aria-label="探索标题" value={draft.title} maxLength={300} onChange={event => change({ title: event.target.value })} placeholder={draft.question.trim() ? titleFromQuestion(draft.question) : '便于以后找到这个问题'} /></label></details>
      <SaveFeedback state={state} />
      <p className="exploration-small">只保存在这个浏览器。开始讨论后，{sent}以及之后由你采纳的研究记录，会随你发送的提问交给所选模型。</p>
      <div className="exploration-form-actions">
        <button type="submit" value="discuss" className="primary-action" disabled={state.busy || !draft.question.trim()}>{state.busy && mode.current === 'discuss' ? '正在保存…' : '保存并开始讨论'}</button>
        <button type="submit" value="save" disabled={state.busy || !draft.question.trim()}>只保存问题</button>
        <button type="button" disabled={state.busy} onClick={() => { clearDraft(draftKey); onCancel(); }}>取消</button>
      </div>
    </fieldset>
  </form>;
}

export function QuickQuestionDialog({ title = '从一个问题开始', onClose, ...props }: Omit<Parameters<typeof QuickQuestionForm>[0], 'onCancel' | 'onBusyChange'> & { title?: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Dialog title={title} onClose={onClose} busy={busy} className="exploration-dialog reader-editor">
    <QuickQuestionForm {...props} onCancel={onClose} onBusyChange={setBusy} />
  </Dialog>;
}
