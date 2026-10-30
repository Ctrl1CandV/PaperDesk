import { useEffect, useRef, useState } from 'react';
import { AppLink, navigate } from '../app/navigation';
import { useExplorationSeed } from '../content/hooks';
import { contentRepository } from '../content/repository';
import type { GuideSummary } from '../content/types';
import { guideKey, personalStore } from '../records/store';
import type { Exploration, GuideState } from '../records/types';
import { getDraft } from '../ui/drafts';
import { Dialog } from '../ui/Dialog';
import { ManualEvidenceDialog } from './AddEvidenceDialog';
import { EvidenceCard } from './EvidenceCard';
import { ExplorationEditor, type CachedExplorationDraft } from './ExplorationEditor';
import { actionLabels, pendingDiscussions, statusLabels, targetPath, useExploration } from './model';
import { AiPanel, type ResearchRequest } from '../assistant/AiPanel';
import { aiClient, getAiStatus, type TopicSummary } from '../assistant/api';
import { decisionKinds, decisionStatuses } from '../assistant/ResearchProposals';
import { emptyResearchState, type ResearchDecision } from '../../shared/research-contract.mjs';
import type { ResearchArtifact } from '../../shared/research-artifacts.mjs';
import { BRIEF_PURPOSES, checkDocumentSections, READING_BRIEF, STAGE_LABELS } from '../../shared/research-documents.mjs';
import { documentFileName, renderResearchDocument } from '../research/artifact-actions';
import { NotebookDraftRecovery, ResearchNotebook } from './ResearchNotebook';
import './exploration.css';
import './direction.css';

const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : '操作未完成，请重试。';
function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/markdown;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const briefs = (record: Exploration) => (record.research?.artifacts ?? []).filter(item => item.kind === 'reading-brief').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const expandedOverviews = new Set<string>();

/** Discussion counts for this direction from the local AI service; null when it is unavailable. */
function useTopicSummary(record?: Exploration) {
  const [summary, setSummary] = useState<TopicSummary | null>();
  const id = record?.id, revision = record?.recordRevision;
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    void getAiStatus(abort.signal).then(status => aiClient(status.csrfToken).topicSummary(id, abort.signal)).then(setSummary).catch(() => { if (!abort.signal.aborted) setSummary(null); });
    return () => abort.abort();
  }, [id, revision]);
  return summary;
}

export function ExplorationPage({ explorationId }: { explorationId: string; onHandoff?: (record: Exploration) => void }) {
  const { record, loading, error } = useExploration(explorationId);
  const draftKey = `exploration:edit:${explorationId}`;
  const [editing, setEditing] = useState(() => Boolean(getDraft<CachedExplorationDraft>(draftKey)));
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(() => expandedOverviews.has(explorationId));
  // A question handed over from creation waits in the conversation until the reader presses Send.
  const [suggestedQuestion] = useState(() => pendingDiscussions.get(explorationId));
  useEffect(() => { pendingDiscussions.delete(explorationId); }, [explorationId]);
  const [conversation, setConversation] = useState<{ request?: ResearchRequest } | undefined>(() => suggestedQuestion ? {} : undefined);
  const [handoff, setHandoff] = useState(suggestedQuestion);
  useEffect(() => {
    let sequence = 0;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ResearchRequest, 'nonce'>>).detail;
      if (detail?.explorationId === explorationId) setConversation({ request: { ...detail, nonce: Date.now() * 1000 + (sequence++ % 1000) } });
    };
    window.addEventListener('paperdesk:research-question', receive);
    return () => window.removeEventListener('paperdesk:research-question', receive);
  }, [explorationId]);
  const discuss = (question?: string, autoSend = false) => setConversation(question ? { request: { explorationId, question, autoSend, nonce: Date.now() } } : {});
  useEffect(() => { document.title = `${record?.title ?? '研究方向'} · PaperDesk`; }, [record?.title]);
  function completed(value: Exploration) {
    setEditing(false); setSaved(true);
    if (value.id !== explorationId) navigate(`/explore/questions/${value.id}`);
  }
  const { seed } = useExplorationSeed(record?.seedRef?.revision, Boolean(record?.seedRef));
  const lens = record?.seedRef ? seed?.lenses.find(item => item.id === record.seedRef!.lensId) : undefined;
  const summary = useTopicSummary(record);
  const accumulation = record?.research?.purpose === 'accumulation';
  // Excerpts keep their text when a linked note is deleted; show that the note itself is gone.
  const [noteIds, setNoteIds] = useState<Set<string>>();
  useEffect(() => {
    let live = true, generation = 0;
    const ids = [...new Set(record?.evidence.flatMap(item => item.relatedNoteId ? [item.relatedNoteId] : []) ?? [])];
    const refresh = () => {
      const request = ++generation;
      void Promise.all(ids.map(id => personalStore.get('notes', id))).then(notes => {
        if (live && request === generation) setNoteIds(new Set(notes.flatMap(note => note ? [note.id] : [])));
      }).catch(() => { if (live && request === generation) setNoteIds(undefined); });
    };
    refresh(); const unsubscribe = personalStore.subscribe(changed => { if (!changed || changed === 'notes') refresh(); });
    return () => { live = false; unsubscribe(); };
  }, [record]);
  return <main id="main-content" className="exploration-page direction-page" aria-busy={loading || undefined}>
    <AppLink className="exploration-back" to="/explore">← 探索</AppLink>
    {loading ? <p role="status">正在读取这个方向…</p> : error ? <><h1>暂时无法读取</h1><p role="alert">浏览器本地存储暂不可用。先前的草稿仍留在当前页面会话中，请稍后重试。</p></> : !record ? <>
      <h1>这个方向当前不可用</h1><p>它可能在另一处被删除，或属于另一个浏览器、端口。可以从个人备份恢复；不会用编辑建议代替你的记录。</p>
      <NotebookDraftRecovery explorationId={explorationId} />
      {getDraft<CachedExplorationDraft>(draftKey) && <ExplorationEditor initial={getDraft<CachedExplorationDraft>(draftKey)!.draft} expectedRevision={getDraft<CachedExplorationDraft>(draftKey)!.expectedRevision} draftKey={draftKey} onSaved={completed} onCancel={() => navigate('/explore')} />}
      <AppLink to="/backup">打开备份与恢复</AppLink>
    </> : <>
      <header className="direction-header">
        <div className="direction-kicker"><span>{accumulation ? '阅读积累' : '研究方向'}</span>{record.status !== 'exploring' && <span className={`exploration-status status-${record.status}`}>{statusLabels[record.status]}</span>}{record.research?.stage && <span>{STAGE_LABELS[record.research.stage].label}</span>}<span>更新于 {record.updatedAt.slice(0, 10)}</span></div>
        <h1>{record.title}</h1>
        <p className="direction-question">{record.question}</p>
        {!editing && <div className="direction-actions">
          <button type="button" className="primary-action" onClick={() => discuss()}>继续讨论</button>
          <button type="button" className="exploration-secondary" onClick={() => { setEditing(true); setSaved(false); }}>编辑方向</button>
        </div>}
        {saved && <p className="exploration-saved" role="status">已保存到这个浏览器。</p>}
      </header>
      {editing ? <section className="exploration-edit-panel"><h2>编辑方向</h2><p className="exploration-small">修改方向的问题、范围和状态。讨论中形成的变化，也可以在对话里输入 /方向 让 AI 写入。</p><ExplorationEditor initial={record} expectedRevision={record.recordRevision} draftKey={draftKey} onSaved={completed} onCancel={() => setEditing(false)} /></section> : <>
        <div className="direction-grid">
          <div className="direction-main">
            <ResearchNotebook key={record.id} record={record} onDiscuss={question => discuss(question)} />
            {!accumulation && <details className="direction-overview-fold" open={overviewOpen} onToggle={event => { const open = event.currentTarget.open; setOverviewOpen(open); if (open) expandedOverviews.add(explorationId); else expandedOverviews.delete(explorationId); }}><summary>方向概况与决定</summary><Overview record={record} /></details>}
            {record.seedRef && <details className="exploration-origin"><summary>来自编辑起点的改写 · 第 {record.seedRef.revision} 版</summary>
              {lens ? <p>{lens.title}</p> : <p className="exploration-missing">原先的编辑起点当前不可用。已保存的问题和材料仍然保留。</p>}
              <p className="exploration-small">{seed?.evidenceBoundary ?? '编辑起点提供阅读背景，不证明研究空白或个人构想有效。'}</p>
            </details>}
            <section className="direction-section" aria-labelledby="accumulated-heading">
              <div className="direction-section-heading"><h2 id="accumulated-heading">研究过程与材料</h2><button type="button" className="text-action" onClick={() => setAdding(true)}>添加原文摘录或观察</button></div>
              {!accumulation && <DiscussionLine summary={summary} onDiscuss={() => discuss()} />}
              {record.research?.seedDiscussion && <details className="exploration-seed"><summary>起点讨论 · 来自《{record.research.seedDiscussion.guideTitle}》的 {record.research.seedDiscussion.turns.length} 轮问答节选</summary><p className="exploration-small">建立方向时带入的模型回答节选，不是论文证据。</p><ol>{record.research.seedDiscussion.turns.map(turn => <li key={turn.turnId}><strong>{turn.question}</strong><p>{turn.answer}{turn.answerTruncated ? '…' : ''}</p></li>)}</ol></details>}
              {(record.research?.artifacts ?? []).filter(item => item.kind !== 'reading-brief').map(item => <details className="direction-saved-document" key={item.id}><summary>{item.title}</summary><div className="brief-preview">{item.body}</div></details>)}
              {record.evidence.length ? <div className="exploration-evidence-list">{record.evidence.map(evidence => <EvidenceCard key={evidence.id} evidence={evidence} noteExists={evidence.relatedNoteId && noteIds ? noteIds.has(evidence.relatedNoteId) : undefined} />)}</div>
                : <p className="exploration-small">还没有摘录。阅读时选中文字点“加入探索”，就会作为材料留在这里。</p>}
            </section>
          </div>
          <aside className="direction-side">
            <RelatedPapers record={record} summary={summary} />
          </aside>
        </div>
        <Files record={record} onDiscuss={discuss} />
        <p className="exploration-record-footer">阶段与状态由你确认；这些材料、整理与文件不代表原文已读、结论已验证或研究空白已成立。</p>
      </>}
      {adding && <ManualEvidenceDialog record={record} onClose={() => setAdding(false)} onSaved={completed} />}
      {conversation && <ConversationDrawer record={record} request={conversation.request} suggestedQuestion={handoff} onClose={() => { setConversation(undefined); setHandoff(undefined); }} />}
    </>}
  </main>;
}

const overviewFields = [['interpretation', '目前的认识'], ['candidates', '候选方向'], ['unknowns', '尚不确定'], ['deferred', '暂缓方向及原因'], ['scope', '范围'], ['constraints', '约束']] as const;
function Overview({ record }: { record: Exploration }) {
  const research = record.research;
  const value = (field: typeof overviewFields[number][0]) => field === 'interpretation' || field === 'unknowns' ? record[field] : research?.[field] ?? '';
  const filled = overviewFields.filter(([field]) => value(field).trim());
  const superseded = new Set(research?.decisions.flatMap(item => item.supersedes ? [item.supersedes] : []) ?? []);
  const effective = research?.decisions.filter(item => !superseded.has(item.id)) ?? [];
  const replaced = research?.decisions.filter(item => superseded.has(item.id)) ?? [];
  const decision = (item: ResearchDecision) => <details key={item.id}><summary><span className="decision-kind">{decisionKinds[item.kind]} · {decisionStatuses[item.status]}</span>{item.text}</summary><p>理由：{item.rationale || '尚未填写'}</p><p className="exploration-small">{item.sourceTurnId ? '来自对话' : '手动记录'} · {item.createdAt.slice(0, 10)}{item.supersedes && ' · 替代了一项较早的决定'}</p>{item.evidenceRefs.map((ref, index) => <blockquote key={index}>[{ref.citationId}] {ref.source.text}</blockquote>)}</details>;
  return <section className="direction-section" aria-labelledby="overview-heading">
    <h2 id="overview-heading">目前的认识与问题</h2>
    {filled.length ? <dl className="direction-overview">{filled.map(([field, label]) => <div key={field} className={field === 'interpretation' || field === 'candidates' ? 'is-wide' : ''}><dt>{label}</dt><dd>{value(field)}</dd></div>)}</dl>
      : <p className="exploration-small">还没有整理的认识。讨论一段后在对话中输入 /方向，AI 会把认识、候选方向和下一步写进来。</p>}
    {record.nextAction && <div className="direction-next"><span>下一步 · {actionLabels[record.nextAction.kind]}</span><p>{record.nextAction.description}</p>{record.nextAction.target && <AppLink id={`exploration-next-${record.id}`} to={targetPath(record.nextAction.target)}>去阅读 →</AppLink>}</div>}
    {effective.length > 0 && <div className="direction-decisions"><h3>你确认的决定</h3>{effective.map(decision)}
      {replaced.length > 0 && <details className="exploration-replaced"><summary>已被替代的决定（{replaced.length}）</summary>{replaced.map(decision)}</details>}</div>}
  </section>;
}

function DiscussionLine({ summary, onDiscuss }: { summary?: TopicSummary | null; onDiscuss: () => void }) {
  return <div className="discussion-line">
    {summary === undefined ? <p className="exploration-small">正在读取讨论记录…</p> : summary === null ? <p className="exploration-small">讨论记录暂时读不到（本机 AI 服务未连接）。方向记录不受影响。</p>
      : summary.turns ? <p><strong>{summary.conversations} 段讨论 · {summary.turns} 轮问答</strong>{summary.lastTurnAt && <span>最近一次 {summary.lastTurnAt.slice(0, 10)}</span>}</p> : <p>还没有讨论。</p>}
    <button type="button" className="text-action" onClick={onDiscuss}>打开讨论</button>
  </div>;
}

type Related = { guide: GuideSummary; reasons: string[]; weight: number };
function RelatedPapers({ record, summary }: { record: Exploration; summary?: TopicSummary | null }) {
  const [states, setStates] = useState<Record<string, GuideState | undefined>>({});
  const [linking, setLinking] = useState(false);
  const byGuide = new Map<string, Related>();
  const add = (guideId: string, revision: number, reason: string, weight: number) => {
    const guide = contentRepository.getSummary(guideId, revision) ?? contentRepository.list().find(entry => entry.guide.metadata.id === guideId)?.guide;
    if (!guide) return;
    const entry = byGuide.get(guideId) ?? { guide, reasons: [], weight: 0 };
    entry.reasons.push(reason); entry.weight += weight; byGuide.set(guideId, entry);
  };
  for (const target of record.research?.relatedGuides ?? []) add(target.guideId, target.revision, '已关联', 4);
  const excerpts = new Map<string, { revision: number; count: number }>();
  for (const evidence of record.evidence) if (evidence.target) excerpts.set(evidence.target.guideId, { revision: evidence.target.revision, count: (excerpts.get(evidence.target.guideId)?.count ?? 0) + 1 });
  for (const [guideId, { revision, count }] of excerpts) add(guideId, revision, `摘录 ${count}`, count * 3);
  for (const item of summary?.guides ?? []) {
    if (item.askedWhileReading) add(item.guideId, item.revision, `边读边问 ${item.askedWhileReading}`, item.askedWhileReading * 2);
    if (item.cited) add(item.guideId, item.revision, `讨论引用 ${item.cited}`, item.cited);
  }
  if (record.nextAction?.target) add(record.nextAction.target.guideId, record.nextAction.target.revision, '下一步要读', 5);
  const rows = [...byGuide.values()].sort((a, b) => b.weight - a.weight);
  const key = rows.map(row => `${row.guide.metadata.id}/${row.guide.metadata.revision}`).join('|');
  useEffect(() => {
    let live = true;
    void Promise.all(rows.map(async row => [row.guide.metadata.id, await personalStore.get('guideStates', guideKey(row.guide.metadata.id, row.guide.metadata.revision))] as const))
      .then(entries => { if (live) setStates(Object.fromEntries(entries)); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  const marks = { unread: '未读', reading: '阅读中', read: '已读', deferred: '暂缓' };
  return <section className="direction-card" aria-labelledby="related-heading">
    <div className="related-heading"><h2 id="related-heading">相关论文与综述{rows.length > 0 && <span className="direction-count">{rows.length}</span>}</h2><button type="button" className="text-action" onClick={() => setLinking(true)}>关联文献</button></div>
    {rows.length ? <ul className="related-papers">{rows.map(({ guide, reasons }) => <li key={guide.metadata.id}>
      <AppLink to={`/read/${guide.metadata.id}/${guide.metadata.revision}`}><span className="paper-type">{guide.metadata.type === 'survey' ? '综述' : '论文'}</span><strong>{guide.metadata.orientation?.shortTitle ?? guide.metadata.title}</strong><span className="paper-title">{guide.metadata.paperTitle}</span></AppLink>
      <p>{reasons.join(' · ')}{states[guide.metadata.id] && <span className="paper-mark">导读{marks[states[guide.metadata.id]!.status]}</span>}</p>
    </li>)}</ul> : <p className="exploration-small">还没有关联的文献。阅读时关联这个方向并讨论，或把相关摘录加入这里，便会留下对应论文与综述。</p>}
    {summary === null && <p className="exploration-small">讨论中读过和引用的论文暂时读不到（本机 AI 服务未连接）。</p>}
    {linking && <LinkPapers record={record} onClose={() => setLinking(false)} />}
  </section>;
}

function LinkPapers({ record, onClose }: { record: Exploration; onClose: () => void }) {
  const [base] = useState(record);
  const [selected, setSelected] = useState(() => record.research?.relatedGuides ?? []);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const guides = contentRepository.list().map(entry => entry.guide);
  // Explicit old links remain removable even after a guide is taken off the shelf.
  for (const target of base.research?.relatedGuides ?? []) {
    if (!guides.some(guide => guide.metadata.id === target.guideId)) {
      const retained = contentRepository.getSummary(target.guideId, target.revision);
      if (retained) guides.push(retained);
    }
  }
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try {
      await personalStore.saveExploration({ ...base, research: { ...(base.research ?? emptyResearchState()), relatedGuides: selected } }, base.recordRevision);
      onClose();
    } catch (reason) { setError(`${errorText(reason)} 选择仍保留；如方向已在另一处更新，请关闭后重新选择。`); }
    finally { setBusy(false); }
  }
  return <Dialog title="关联本库文献" onClose={onClose} busy={busy} className="direction-link-dialog">
    <p className="exploration-small">选择属于这个方向的论文与综述。关联只建立联系，不改变阅读标记；摘录和讨论引用会另外保留。</p>
    <label className="link-paper-search">查找文献<input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} /></label>
    <div className="link-paper-list">{guides.filter(guide => `${guide.metadata.title} ${guide.metadata.paperTitle}`.toLowerCase().includes(query.trim().toLowerCase())).map(guide => {
      const id = guide.metadata.id, checked = selected.some(target => target.guideId === id);
      return <label key={id}><input type="checkbox" checked={checked} disabled={busy} onChange={event => setSelected(event.target.checked ? [...selected, { guideId: id, revision: guide.metadata.revision }] : selected.filter(target => target.guideId !== id))} /><span><span className="paper-type">{guide.metadata.type === 'survey' ? '综述' : '论文'}</span>{guide.metadata.orientation?.shortTitle ?? guide.metadata.title}<small>{guide.metadata.paperTitle}</small></span></label>;
    })}</div>
    {error && <p role="alert" className="exploration-missing">{error}</p>}
    <div className="link-paper-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : `保存关联（${selected.length}）`}</button><button type="button" className="exploration-secondary" disabled={busy} onClick={onClose}>取消</button></div>
  </Dialog>;
}

function Files({ record, onDiscuss }: { record: Exploration; onDiscuss: (question?: string, autoSend?: boolean) => void }) {
  const items = briefs(record);
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState('');
  const save = (artifact: ResearchArtifact) => { setError(''); void renderResearchDocument(record, artifact).then(text => download(documentFileName(artifact), text)).catch(reason => setError(errorText(reason))); };
  return <section className="direction-files" aria-labelledby="files-heading">
    <div className="direction-files-heading"><div><h2 id="files-heading">{READING_BRIEF.label}{items.length > 0 && <span className="direction-count">{items.length}</span>}</h2><p>把下一轮阅读的方向、筛选条件和添加要求交给 Harness。</p></div>
      <button type="button" className="primary-action" onClick={() => onDiscuss('/选文 积累 请根据当前方向、已有材料和讨论，生成继续阅读这一方向的综述与代表论文、补充知识积累的选文实施文件。明确筛选条件、避免重复与入库要求；数量和执行权限沿用已明确的约定，尚未约定的保留待确认。', true)}>一键生成积累选文文件</button>
    </div>
    <p className="direction-generate-note">点击后使用当前 AI 生成并保存新文件；会附带方向记录、本库目录和阅读标记。</p>
    <div className="brief-purpose-options">
      <div><strong>继续积累</strong><p>补全这个方向的知识框架，阅读综述和代表论文。</p><button type="button" className="text-action" onClick={() => onDiscuss('我想继续阅读这个方向的文章、补充积累。请先和我讨论还缺哪些内容、需要怎样的综述与代表论文，确定后再生成选文实施文件。')}>先讨论阅读范围 →</button></div>
      <div><strong>探索问题</strong><p>围绕尚未解决的问题，寻找方法、证据、比较和反例。</p><button type="button" className="text-action" onClick={() => onDiscuss('我想进一步探索这个方向中面临的问题。请结合当前认识与尚不确定之处，和我确定这轮要推进的子问题及文献筛选条件，确定后再生成选文实施文件。')}>讨论要推进的问题 →</button></div>
    </div>
    {items.length ? <ul className="brief-list">{items.map((artifact, index) => {
      const missing = checkDocumentSections(artifact.body).missing;
      return <li key={artifact.id}>
        <div className="brief-meta"><span className={`brief-purpose purpose-${artifact.purpose ?? 'none'}`}>{artifact.purpose ? BRIEF_PURPOSES[artifact.purpose].label : '未标注'}</span><span>{artifact.updatedAt.slice(0, 10)}{index === 0 ? ' · 最新' : ''}</span></div>
        <strong>{artifact.title.replace(`${READING_BRIEF.label}：`, '')}</strong>
        {missing.length > 0 && <p className="brief-missing">缺少：{missing.join('、')}</p>}
        <div className="brief-actions"><button type="button" className="text-action" onClick={() => save(artifact)}>下载</button><button type="button" className="text-action" aria-expanded={open === artifact.id} onClick={() => setOpen(open === artifact.id ? undefined : artifact.id)}>{open === artifact.id ? '收起' : '查看'}</button></div>
        {open === artifact.id && <div className="brief-preview">{artifact.body}</div>}
      </li>;
    })}</ul> : <p className="exploration-small">还没有保存的选文文件。可以直接生成积累文件，也可以先讨论，再按需要生成。</p>}
    {error && <p role="alert" className="exploration-missing">{error}</p>}
  </section>;
}

/** The same conversation as in reading, opened over this page for cross-paper discussion. */
function ConversationDrawer({ record, request, suggestedQuestion, onClose }: { record: Exploration; request?: ResearchRequest; suggestedQuestion?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="conversation-drawer" aria-label={`讨论：${record.title}`} onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); onClose(); } }}>
    <AiPanel exploration={record} researchRequest={request} suggestedQuestion={suggestedQuestion} onClose={onClose} />
  </dialog>;
}
