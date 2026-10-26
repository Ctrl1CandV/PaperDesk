import { useEffect, useState } from 'react';
import { AppLink, navigate } from '../navigation';
import { contentRepository } from '../content/repository';
import { personalStore } from '../records/store';
import type { Exploration } from '../records/types';
import { getDraft } from '../ui/drafts';
import { ManualEvidenceDialog } from './AddEvidenceDialog';
import { EvidenceCard, ReadingTarget } from './EvidenceCard';
import { ExplorationEditor, type CachedExplorationDraft } from './ExplorationEditor';
import { actionLabels, statusLabels, useExplorations } from './model';
import { NextReading } from './NextReading';
import './exploration.css';

export function ExplorationPage({ explorationId, onHandoff }: { explorationId: string; onHandoff?: (record: Exploration) => void }) {
  const { records, loading, error } = useExplorations();
  const record = records.find(item => item.id === explorationId);
  const draftKey = `exploration:edit:${explorationId}`;
  const [editing, setEditing] = useState(() => Boolean(getDraft<CachedExplorationDraft>(draftKey)));
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [noteIds, setNoteIds] = useState<Set<string>>();
  useEffect(() => { document.title = `${record?.title ?? '我的探索'} · PaperDesk`; }, [record?.title]);
  useEffect(() => {
    let live = true;
    const refresh = () => { void personalStore.list('notes').then(notes => { if (live) setNoteIds(new Set(notes.map(note => note.id))); }).catch(() => { if (live) setNoteIds(undefined); }); };
    refresh(); const unsubscribe = personalStore.subscribe(refresh);
    return () => { live = false; unsubscribe(); };
  }, []);
  function completed(value: Exploration) {
    setEditing(false); setSaved(true);
    if (value.id !== explorationId) navigate(`/explore/questions/${value.id}`);
  }
  const seed = record?.seedRef ? contentRepository.getExplorationSeed(record.seedRef.revision) : undefined;
  const lens = record?.seedRef ? contentRepository.getLens(record.seedRef.lensId, record.seedRef.revision) : undefined;
  return <main id="main-content" className="exploration-page exploration-detail" aria-busy={loading || undefined}>
    <AppLink className="exploration-back" to="/explore">← 返回研究探索</AppLink>
    {loading ? <p role="status">正在读取这条本地探索…</p> : error ? <><h1>暂时无法读取探索</h1><p role="alert">浏览器本地存储暂不可用。先前的草稿仍留在当前页面会话中，请稍后重试。</p></> : !record ? <>
      <h1>这条探索当前不可用</h1><p>它可能在另一处被删除，或属于另一个浏览器、端口。可以从个人备份恢复；不会用编辑建议代替你的记录。</p>
      {getDraft<CachedExplorationDraft>(draftKey) && <ExplorationEditor initial={getDraft<CachedExplorationDraft>(draftKey)!.draft} expectedRevision={getDraft<CachedExplorationDraft>(draftKey)!.expectedRevision} draftKey={draftKey} onSaved={completed} onCancel={() => navigate('/explore')} />}
      <AppLink to="/backup">打开备份与恢复</AppLink>
    </> : <>
      <div className="exploration-detail-topline"><span className="eyebrow">我的探索 · 仅保存在本地</span><span className={`exploration-status status-${record.status}`}>{statusLabels[record.status]}</span></div>
      <h1>{record.title}</h1>
      {saved && <p className="exploration-saved" role="status">已保存到这个浏览器。</p>}
      {editing ? <section className="exploration-edit-panel"><h2>修改探索</h2><ExplorationEditor initial={record} expectedRevision={record.recordRevision} draftKey={draftKey} onSaved={completed} onCancel={() => setEditing(false)} /></section> : <>
        <div className="exploration-detail-actions"><button className="primary-action" onClick={() => { setEditing(true); setSaved(false); }}>修改问题与下一步</button>{onHandoff && <button className="exploration-secondary" onClick={() => onHandoff(record)}>准备探索上下文</button>}</div>
        <section className="exploration-question"><span className="eyebrow">我想继续追问</span><p>{record.question}</p></section>
        {record.seedRef && <details className="exploration-origin"><summary>来自编辑起点的改写 · 第 {record.seedRef.revision} 版</summary>
          {lens ? <p>{lens.title}</p> : <p className="exploration-missing">原先的编辑起点当前不可用。已保存的问题和材料仍然保留。</p>}
          <p className="exploration-small">{seed?.evidenceBoundary ?? '编辑起点提供阅读背景，不证明研究空白或个人构想有效。'}</p>
        </details>}
        <section className="exploration-next-reading"><span className="eyebrow">下一步</span>{record.nextAction ? <><h2>{actionLabels[record.nextAction.kind]}</h2><p>{record.nextAction.description}</p>{record.nextAction.target && <ReadingTarget target={record.nextAction.target} id={`exploration-next-${record.id}`} />}{record.nextAction.kind === 'search-literature' && <p className="exploration-small">这是你保存的待查行动，平台尚未执行搜索。</p>}</> : <><h2>尚未选择下一步</h2><p>可以继续阅读、核对概念、比较已有材料，或先暂缓这个问题。</p></>}</section>
        <section aria-labelledby="evidence-heading"><div className="exploration-section-heading"><h2 id="evidence-heading">留下的材料</h2><button className="exploration-secondary" onClick={() => setAdding(true)}>添加原文摘录或观察</button></div>
          {record.evidence.length ? <div className="exploration-evidence-list">{record.evidence.map(evidence => <EvidenceCard key={evidence.id} evidence={evidence} noteExists={evidence.relatedNoteId && noteIds ? noteIds.has(evidence.relatedNoteId) : undefined} />)}</div> : <div className="exploration-empty"><p>还没有材料。可以从导读中选择文字加入这个问题，也可以手动保存原文摘录或自己的观察。</p><AppLink to="/library">回到文章库 →</AppLink></div>}
        </section>
        <section className="exploration-thinking"><div><h2>我的解释</h2><p className={!record.interpretation ? 'exploration-small' : ''}>{record.interpretation || '尚未填写。可以先保留问题，等材料充分后再解释。'}</p></div><div><h2>尚不确定的地方</h2><p className={!record.unknowns ? 'exploration-small' : ''}>{record.unknowns || '尚未填写。未知可以继续保持开放。'}</p></div></section>
        <NextReading record={record} onSaved={completed} />
        <p className="exploration-record-footer">状态由你选择；这些材料与解释并不代表原文已读、结论已验证或研究空白已成立。</p>
      </>}
      {adding && <ManualEvidenceDialog record={record} onClose={() => setAdding(false)} onSaved={completed} />}
    </>}
  </main>;
}
