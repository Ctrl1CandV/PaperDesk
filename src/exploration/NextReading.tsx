import { useEffect, useRef, useState } from 'react';
import { contentRepository } from '../content/repository';
import { AppLink } from '../navigation';
import { guideKey, originalKey, personalStore } from '../records/store';
import type { Exploration, GuideState, NextAction, OriginalState, ReadingStatus } from '../records/types';
import { clearDraft, getDraft, keepDraft } from '../ui/drafts';
import { SaveFeedback, useExplorationSave } from './SaveFeedback';
import { findNextReadings, literatureBrief, orientationFor, type ReadingCandidate, type ReadingRequest } from './next-reading';
import './next-reading.css';

interface ReadingDraft {
  base: Exploration; useQuestion: boolean; useUnknowns: boolean; goal: string; topicIds: string[];
  request?: ReadingRequest; brief: string; briefEdited: boolean;
}
const labels: Record<ReadingStatus, string> = { unread: '未读', reading: '阅读中', read: '已读', deferred: '暂缓' };

export function NextReading({ record, onSaved }: { record: Exploration; onSaved: (value: Exploration) => void }) {
  const draftKey = `next-reading:${record.id}`;
  const [cached] = useState(() => getDraft<ReadingDraft>(draftKey));
  const [open, setOpen] = useState(Boolean(cached));
  const [draft, setDraft] = useState<ReadingDraft>(() => cached ?? { base: record, useQuestion: false, useUnknowns: false, goal: '', topicIds: [], brief: '', briefEdited: false });
  const [states, setStates] = useState<Record<string, { guide?: GuideState; original?: OriginalState }>>({});
  const [stateError, setStateError] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const goal = useRef<HTMLTextAreaElement>(null);
  const guides = contentRepository.list().map(entry => entry.guide);
  const topics = [...new Map(guides.flatMap(guide => orientationFor(guide)?.topics ?? []).map(topic => [topic.id, topic])).values()];
  const candidates = draft.request ? findNextReadings(guides, draft.request) : [];
  const candidateKey = candidates.map(item => `${item.target.guideId}/${item.target.revision}`).join('|');
  const state = useExplorationSave(value => {
    clearDraft(draftKey); setOpen(false); setDraft({ base: value, useQuestion: false, useUnknowns: false, goal: '', topicIds: [], brief: '', briefEdited: false });
    onSaved(value); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  });
  const busy = state.busy || copying;
  function change(patch: Partial<ReadingDraft>) {
    const next = { ...draft, ...patch }; setDraft(next); keepDraft(draftKey, next); setCopied(false); setCopyMessage('');
  }
  useEffect(() => {
    if (!open) return;
    let live = true;
    const refresh = async () => {
      try {
        const items = await Promise.all(candidates.map(async ({ guide }) => {
          const [guideState, original] = await Promise.all([
            personalStore.get('guideStates', guideKey(guide.metadata.id, guide.metadata.revision)),
            personalStore.get('originalStates', originalKey(guide.metadata.source.id, guide.metadata.source.version)),
          ]);
          return [guide.metadata.id, { guide: guideState, original }] as const;
        }));
        if (live) { setStates(Object.fromEntries(items)); setStateError(false); }
      } catch { if (live) setStateError(true); }
    };
    void refresh(); const unsubscribe = personalStore.subscribe(changed => { if (!changed || changed === 'guideStates' || changed === 'originalStates') void refresh(); });
    return () => { live = false; unsubscribe(); };
    // Catalog identity is immutable during this page session.
  }, [open, candidateKey]);
  function toggleTopic(id: string) { change({ topicIds: draft.topicIds.includes(id) ? draft.topicIds.filter(value => value !== id) : [...draft.topicIds, id] }); }
  function search() {
    const request = { text: [draft.goal, draft.useQuestion ? draft.base.question : '', draft.useUnknowns ? draft.base.unknowns : ''].filter(Boolean).join('\n\n').trim(), topicIds: [...draft.topicIds] };
    const found = findNextReadings(guides, request);
    change({ request, brief: draft.briefEdited ? draft.brief : literatureBrief(request, topics, found) });
    state.clearError();
  }
  function selectNext(candidate: ReadingCandidate) {
    const action: NextAction = { kind: 'read-guide', description: `${orientationFor(candidate.guide)!.shortTitle} · ${candidate.heading}：${candidate.purpose}`, target: candidate.target };
    void state.save({ ...draft.base, nextAction: action }, draft.base.recordRevision);
  }
  async function copyBrief() {
    setCopying(true); setCopyMessage('');
    try { if (!navigator.clipboard?.writeText) throw new Error('unavailable'); await navigator.clipboard.writeText(draft.brief); setCopied(true); setCopyMessage('已复制这份预览，未发送到任何服务。'); }
    catch { setCopyMessage('自动复制不可用。可选中预览后使用 Ctrl+C 或系统复制。'); }
    finally { setCopying(false); }
  }
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }
  const hasInput = Boolean(draft.goal.trim() || draft.topicIds.length || (draft.useQuestion && draft.base.question.trim()) || (draft.useUnknowns && draft.base.unknowns.trim()));
  const selectedText = [draft.goal, draft.useQuestion ? draft.base.question : '', draft.useUnknowns ? draft.base.unknowns : ''].filter(Boolean).join('\n\n').trim();
  const requestChanged = draft.request && (draft.request.text !== selectedText || [...draft.request.topicIds].sort().join('|') !== [...draft.topicIds].sort().join('|'));
  return <section className="next-reading-assistant" aria-label="寻找下一步阅读">
    <div className="next-reading-heading"><div><span className="eyebrow">让问题带着阅读继续</span><h2>接下来读什么</h2><p>从当前问题里选一个目标，看看本库有哪些具体章节可以帮助你。</p></div>
      <button ref={trigger} className="exploration-secondary" aria-expanded={open} aria-controls={`next-reading-${record.id}`} disabled={busy} onClick={() => {
        if (open) close(); else { if (!getDraft(draftKey)) setDraft({ base: record, useQuestion: false, useUnknowns: false, goal: '', topicIds: [], brief: '', briefEdited: false }); setOpen(true); requestAnimationFrame(() => goal.current?.focus({ preventScroll: true })); }
      }}>{open ? '收起阅读建议' : '寻找下一步阅读'}</button>
    </div>
    {open && <div id={`next-reading-${record.id}`} className="next-reading-panel">
      <p className="exploration-small">按你选入的问题与主题，查找本库已有章节。需要库外文献时，可以在下方准备交给协作助手的检索任务。</p>
      <fieldset className="next-reading-inputs" disabled={busy}>
        <legend>选择这次要解决什么</legend>
        <label className="next-reading-check"><input type="checkbox" checked={draft.useQuestion} onChange={event => change({ useQuestion: event.target.checked })} /><span>使用当前问题<span className="next-reading-selected-text">{draft.base.question}</span></span></label>
        {draft.base.unknowns && <label className="next-reading-check"><input type="checkbox" checked={draft.useUnknowns} onChange={event => change({ useUnknowns: event.target.checked })} /><span>使用尚不确定的地方<span className="next-reading-selected-text">{draft.base.unknowns}</span></span></label>}
        <label className="next-reading-goal">补充主题词或阅读目标<textarea ref={goal} aria-label="补充主题词或阅读目标" value={draft.goal} maxLength={4000} rows={3} onChange={event => change({ goal: event.target.value })} placeholder="例如：Agent 的规划，或评价指标的适用条件" /></label>
        <div className="next-reading-topics" role="group" aria-label="本库主要主题">{topics.map(topic => <button type="button" key={topic.id} aria-pressed={draft.topicIds.includes(topic.id)} onClick={() => toggleTopic(topic.id)}>{topic.label}</button>)}</div>
        <button className="primary-action" disabled={!hasInput} onClick={search}>{draft.request ? '按当前选择重新查找' : '查找本库阅读'}</button>
        {draft.request && <span className="exploration-small">手动编辑的检索任务会保留，只有主动重建时才替换。</span>}
      </fieldset>
      {draft.request && <>
        {requestChanged && <p className="status-warning" role="status">选择已更改。下方仍是上一次查找结果，请重新查找后再设为下一步。</p>}
        <details className="next-reading-match-input"><summary>查看本次实际使用的内容</summary><p className="preserve-text">{draft.request.text || '仅使用下方选定主题。'}</p><p>指定主题：{topics.filter(topic => draft.request!.topicIds.includes(topic.id)).map(topic => topic.label).join('、') || '未指定'}</p></details>
        {stateError && <p className="status-warning" role="status">阅读状态暂不可用，下面不会推断是否已读。</p>}
        <div className="next-reading-results" aria-live="polite">{candidates.length ? <><h3>本库可以继续读</h3><p className="exploration-small">每篇选出一个相符章节。依据是主题或概念匹配，是否真正解决问题仍需阅读判断。</p>{candidates.map(candidate => {
          const saved = states[candidate.guide.metadata.id];
          return <article className="next-reading-candidate" key={candidate.guide.metadata.id}>
            <div className="next-reading-candidate-meta"><span>{candidate.guide.metadata.type === 'survey' ? '综述' : '论文'}</span><span>已有深入阅读内容</span></div>
            <h4>{orientationFor(candidate.guide)!.shortTitle}</h4><p className="next-reading-why">匹配依据：{[...candidate.matchedTopics.map(term => `主题「${term}」`), ...candidate.matchedConcepts.map(term => `概念「${term}」`)].join('、')}</p>
            <dl><div><dt>建议读</dt><dd>{candidate.heading}</dd></div><div><dt>阅读目的</dt><dd>{candidate.purpose}</dd></div><div><dt>仍有边界</dt><dd>{candidate.limit}</dd></div></dl>
            <p className="next-reading-state">本讲解版本：{stateError ? '状态不可用' : saved?.guide ? `${labels[saved.guide.status]} · 由你标记` : '未记录'}；原论文：{stateError ? '状态不可用' : saved?.original ? `${labels[saved.original.status]} · 由你标记` : '未记录'}。</p>
            {saved?.guide?.status === 'read' && <p className="exploration-small">这份讲解已被你标为已读，仍可按当前问题回看该章节。</p>}
            <div className="next-reading-actions"><AppLink className="text-action" id={`next-reading-preview-${candidate.guide.metadata.id}`} to={`/read/${candidate.target.guideId}/${candidate.target.revision}#${candidate.target.unitId}`}>先看这一节 →</AppLink><button className="secondary-action" disabled={busy || state.conflict !== undefined || Boolean(requestChanged)} onClick={() => selectNext(candidate)}>设为下一步</button></div>
          </article>;
        })}</> : <div className="next-reading-no-match"><h3>本库暂时没有合适的阅读目标</h3><p>没有找到相符的主题或章节概念。可以调整关键词，或整理下面的检索任务去寻找新材料；不会用不相关的文章补满结果。</p></div>}</div>
        <p className="exploration-small">“设为下一步”会替换这条探索现有的下一步；问题、材料和状态保持不变。只是查看建议不会保存。</p>
        <SaveFeedback state={state} onUseCurrent={current => change({ base: current })} />
        <details className="next-reading-search-brief" open={!candidates.length}>
          <summary>{candidates.length ? '还需要库外材料？整理检索任务' : '整理下一次文献检索任务'}</summary>
          <p className="exploration-small">整理本次阅读目标，复制给协作助手，用于查找、核验并补充新的论文或综述。预览可以修改；复制不会自动发送内容。</p>
          {draft.briefEdited && <p className="exploration-small">这份手动编辑的任务保持原样，可能包含先前选择的内容。<button className="text-action" disabled={busy || Boolean(requestChanged)} onClick={() => change({ brief: literatureBrief(draft.request!, topics, candidates), briefEdited: false })}>根据本次查找重建任务并替换编辑</button></p>}
          <label>完整检索任务预览<textarea aria-label="完整检索任务预览" value={draft.brief} rows={12} disabled={busy} onChange={event => change({ brief: event.target.value, briefEdited: true })} /></label>
          <p className="exploration-small">{draft.brief.length.toLocaleString()} / 12,000 字符可复制；设为下一步需不超过 2,000 字符。不会自动截断。</p>
          <div className="next-reading-actions"><button className="secondary-action" disabled={busy || !draft.brief.trim() || draft.brief.length > 12000} onClick={() => void copyBrief()}>{copying ? '正在复制…' : copied ? '再次复制任务' : '复制检索任务'}</button><button className="text-action" disabled={busy} onClick={event => { const textarea = event.currentTarget.closest('details')!.querySelector('textarea')!; textarea.focus(); textarea.select(); }}>选中预览手动复制</button><button className="secondary-action" disabled={busy || state.conflict !== undefined || !draft.brief.trim() || draft.brief.length > 2000} onClick={() => void state.save({ ...draft.base, nextAction: { kind: 'search-literature', description: draft.brief } }, draft.base.recordRevision)}>设为文献检索下一步</button></div>
          {copyMessage && <p role="status">{copyMessage}</p>}
        </details>
      </>}
      <div className="next-reading-close"><span className="exploration-small">未保存的选择与任务只在本次页面会话保留。</span><button className="text-action" disabled={busy} onClick={close}>收起</button><button className="text-action" disabled={busy} onClick={() => { clearDraft(draftKey); setDraft({ base: record, useQuestion: false, useUnknowns: false, goal: '', topicIds: [], brief: '', briefEdited: false }); state.clearError(); close(); }}>丢弃本次选择与草稿</button></div>
    </div>}
  </section>;
}
