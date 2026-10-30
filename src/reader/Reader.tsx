import { useCallback, useEffect, useRef, useState } from 'react';
import type { Citation, Guide } from '../content/types';
import { coverageLabel } from '../content/labels';
import { AppLink, isHistoryNavigation, isReloadNavigation, libraryReturnPath, navigate } from '../app/navigation';
import { personalStore, guideKey, originalKey } from '../records/store';
import type { GuideEvidence, GuideState, OriginalState, ReadingStatus, ResumeRecord } from '../records/types';
import { NoteEditor } from '../notes/Notes';
import { AddEvidenceDialog } from '../exploration/AddEvidenceDialog';
import { rememberReaderTopic } from '../exploration/model';
import type { TopicRequest } from '../assistant/AiPanel';
import { PacketDialog, type ReadingContext } from '../handoff/PacketDialog';
import { Dialog } from '../ui/Dialog';
import { Markdown } from './Markdown';
import { SourceDialog, type SourceSelection } from './SourceDialog';
import { sectionContext } from './readingContext';
import { ReaderAssistant } from './ReaderAssistant';

function Contents({ guide, active, onChoose }: { guide: Guide; active: string; onChoose?: () => void }) {
  return <nav aria-label="章节目录"><ol>{guide.units.map((unit, index) => <li key={unit.id}>
    <a href={`#${unit.id}`} aria-label={unit.heading ?? '阅读起点'} title={unit.heading ?? '阅读起点'} aria-current={active === unit.id ? 'location' : undefined} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onChoose?.(); navigate(`#${unit.id}`);
    }}><span className="toc-number" aria-hidden="true">{String(index).padStart(2, '0')}</span><span>{navigationLabels[unit.heading ?? ''] ?? unit.heading ?? '阅读起点'}</span></a>
  </li>)}</ol></nav>;
}
// Presentation-only aliases; approved headings, section IDs and accessible names stay intact.
const navigationLabels: Record<string, string> = {
  'Agent 的基本视角：主体、环境与行动': '主体、环境与行动',
  '四个组成部分，分别回应持续任务中的不同需要': '系统的四个组成部分',
  '把组成连接起来，仍要解释能力从哪里来': '组成联系与能力来源',
  '应用不同，“做好了”的含义也不同': '应用与评价条件',
  '开放问题来自这些组成之间尚未解决的矛盾': '组成之间的开放问题',
  '这篇怎样成为以后阅读的起点': '后续阅读的起点',
  '哪些原文值得亲自读': '值得亲读的原文',
};
function ReadingActionIcon({ kind }: { kind: 'note' | 'explore' | 'copy' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'note' ? <><path d="M14 4H5v16h14v-9M10 14l1-4 7-7 3 3-7 7-4 1Z" /></> : kind === 'explore' ? <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 6c6 0 3 6 8 6" /></> : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>}</svg>;
}
const statuses: [ReadingStatus, string][] = [['unread', '未读'], ['reading', '阅读中'], ['read', '已读'], ['deferred', '暂缓']];
// Navigation buffers only; a selected passage is never a saved personal record.
const readingEditors = new Map<string, { selection?: ReadingContext; noteContext?: ReadingContext; evidence?: GuideEvidence }>();

export function Reader({ guide }: { guide: Guide }) {
  const bufferKey = `${guide.metadata.id}/${guide.metadata.revision}`;
  const [buffer] = useState(() => readingEditors.get(bufferKey));
  const [source, setSource] = useState<SourceSelection | null>(null);
  const [active, setActive] = useState(guide.units[0].id);
  const [fontSize, setFontSize] = useState(18);
  const [selection, setSelection] = useState<ReadingContext | undefined>(buffer?.selection);
  const [noteContext, setNoteContext] = useState<ReadingContext | undefined>(buffer?.noteContext);
  const [evidence, setEvidence] = useState<GuideEvidence | undefined>(buffer?.evidence);
  const [packet, setPacket] = useState<ReadingContext>();
  const [stateOpen, setStateOpen] = useState(false);
  const [guideState, setGuideState] = useState<GuideState>();
  const [originalState, setOriginalState] = useState<OriginalState>();
  const [storageError, setStorageError] = useState('');
  const [stateMessage, setStateMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sidebarTools, setSidebarTools] = useState(() => window.matchMedia('(min-width: 801px) and (max-width: 1099px), (min-width: 1200px)').matches);
  const [assistantWide, setAssistantWide] = useState(() => window.matchMedia('(min-width:1100px)').matches);
  const [assistantOpen, setAssistantOpen] = useState(() => window.matchMedia('(min-width:1100px)').matches);
  const [topicRequest, setTopicRequest] = useState<TopicRequest>();
  useEffect(() => {
    const media = window.matchMedia('(min-width:1100px)');
    const sidebarMedia = window.matchMedia('(min-width: 801px) and (max-width: 1099px), (min-width: 1200px)');
    const update = () => { setAssistantWide(media.matches); setSidebarTools(sidebarMedia.matches); };
    media.addEventListener('change', update); sidebarMedia.addEventListener('change', update);
    return () => { media.removeEventListener('change', update); sidebarMedia.removeEventListener('change', update); };
  }, []);
  const ready = useRef(false);
  const openCitation = useCallback((citation: Citation, label: string, trigger: HTMLButtonElement) => setSource({ citation, label, trigger }), []);
  useEffect(() => { readingEditors.set(bufferKey, { selection, noteContext, evidence }); }, [bufferKey, selection, noteContext, evidence]);
  useEffect(() => {
    document.title = `${guide.metadata.title} · PaperDesk`;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined, last: ResumeRecord | undefined;
    const fromHistory = isHistoryNavigation();
    const id = guide.metadata.id, revision = guide.metadata.revision;
    ready.current = false;
    const savePosition = () => { if (last && ready.current) personalStore.setResume(last).catch(() => { if (!cancelled) setStorageError('当前位置暂未保存；阅读仍可继续。请检查本地存储或导出已有记录。'); }); };
    const track = () => {
      const unit = guide.units.filter(unit => (document.getElementById(unit.id)?.getBoundingClientRect().top ?? Infinity) < 180).at(-1) ?? guide.units[0];
      setActive(unit.id);
      if (!ready.current) return;
      const element = document.getElementById(unit.id);
      if (!element) return;
      last = { guideId: id, revision, unitId: unit.id, offset: Math.max(0, Math.min(1, -element.getBoundingClientRect().top / Math.max(1, element.getBoundingClientRect().height))), updatedAt: new Date().toISOString() };
      clearTimeout(timer); timer = setTimeout(savePosition, 350);
    };
    personalStore.get('resume', guideKey(id, revision)).then(saved => {
      if (cancelled) return;
      const hash = window.location.hash.slice(1);
      if (saved && !fromHistory && (!hash || (isReloadNavigation() && hash === saved.unitId))) {
        const started = performance.now();
        const restore = () => {
          if (cancelled) return;
          if (document.querySelector('.diagram-scroll[aria-busy="true"]') && performance.now() - started < 2500) { requestAnimationFrame(restore); return; }
          const element = document.getElementById(saved.unitId);
          if (element) window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top + saved.offset * element.getBoundingClientRect().height);
          ready.current = true; track();
        }; requestAnimationFrame(restore);
      } else { ready.current = true; track(); }
    }).catch(() => { ready.current = true; if (!cancelled) setStorageError('本地存储暂不可用，阅读功能仍可使用；个人记录未被标记为已保存。'); });
    personalStore.getPreferences().then(preferences => { if (!cancelled && preferences.fontSize) setFontSize(preferences.fontSize); }).catch(() => {});
    const refreshStates = () => Promise.all([personalStore.get('guideStates', guideKey(id, revision)), personalStore.get('originalStates', originalKey(guide.metadata.source.id, guide.metadata.source.version))]).then(([a, b]) => { if (!cancelled) { setGuideState(a); setOriginalState(b); } }).catch(() => {});
    refreshStates(); const unsubscribe = personalStore.subscribe(refreshStates);
    window.addEventListener('scroll', track, { passive: true });
    window.addEventListener('pagehide', savePosition);
    return () => { cancelled = true; clearTimeout(timer); savePosition(); unsubscribe(); window.removeEventListener('scroll', track); window.removeEventListener('pagehide', savePosition); };
  }, [guide]);
  useEffect(() => {
    const capture = () => {
      const chosen = window.getSelection();
      if (!chosen || chosen.isCollapsed || !chosen.rangeCount) return;
      const range = chosen.getRangeAt(0);
      const start = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('section[data-unit]');
      const end = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest<HTMLElement>('section[data-unit]');
      if (!start || start !== end || !start.closest('.prose')) return;
      const clone = range.cloneContents(); clone.querySelectorAll('[aria-hidden="true"],.teaching-diagram').forEach(node => node.remove());
      const text = clone.textContent?.trim(); if (!text) return;
      const context = sectionContext(guide, start.id);
      const paragraph = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest('[data-paragraph]')?.getAttribute('data-paragraph');
      setSelection({ ...context, text, locator: `${context.locator}${paragraph ? ` / ${paragraph}` : ''} / 选中文本` });
    };
    document.addEventListener('selectionchange', capture); return () => document.removeEventListener('selectionchange', capture);
  }, [guide]);
  const context = () => selection ?? sectionContext(guide, active);
  const contextHeading = guide.units.find(unit => unit.id === (selection?.unitId ?? active))?.heading ?? '阅读起点';
  const statusLabel = (status?: ReadingStatus) => statuses.find(item => item[0] === status)?.[1] ?? '未记录';
  function adjustFont(delta: number) { const next = fontSize + delta; setFontSize(next); personalStore.savePreferences({ fontSize: next }).catch(() => setStorageError('本次字号已调整，但偏好未能保存。')); }
  async function mark(kind: 'guide' | 'original', status: ReadingStatus) {
    setSaving(true); setStateMessage('');
    try {
      const updatedAt = new Date().toISOString();
      if (kind === 'guide') { const record = { guideId: guide.metadata.id, revision: guide.metadata.revision, status, updatedAt }; await personalStore.setGuideState(record); setGuideState(record); }
      else { const record = { sourceId: guide.metadata.source.id, sourceVersion: guide.metadata.source.version, status, updatedAt }; await personalStore.setOriginalState(record); setOriginalState(record); }
      setStateMessage('已保存。');
    } catch { setStateMessage('保存失败，请重试或检查本地存储。'); } finally { setSaving(false); }
  }
  const controls = <div className="font-controls" role="group" aria-label="正文字号"><span>字号</span><button aria-label="减小字号" disabled={fontSize <= 16} onClick={() => adjustFont(-1)}>A−</button><button aria-label="增大字号" disabled={fontSize >= 22} onClick={() => adjustFont(1)}>A+</button></div>;
  const readingTools = <div className="reader-action-bar reading-tools" role="group" aria-label="阅读积累"><div className="reading-tool-context"><span>{selection ? '选中文本' : '当前章节'}</span><strong title={contextHeading}>{contextHeading}</strong></div>{selection && <button className="text-action clear-selection" onClick={() => { setSelection(undefined); window.getSelection()?.removeAllRanges(); }}>清除选择</button>}<button id="reader-note-action" className="tool-primary" aria-haspopup="dialog" onClick={() => setNoteContext(context())}><ReadingActionIcon kind="note" /><span>记笔记</span></button><button id="reader-explore-action" className="tool-primary" aria-haspopup="dialog" onClick={() => { const selected = context(); setEvidence({ id: crypto.randomUUID(), provenance: 'guide-excerpt', text: selected.text, target: { guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: selected.unitId }, sources: selected.sources }); }}><ReadingActionIcon kind="explore" /><span>加入探索</span></button><button id="reader-packet-action" className="tool-secondary" aria-haspopup="dialog" onClick={() => setPacket(context())}><ReadingActionIcon kind="copy" /><span>复制上下文</span></button></div>;
  return <>
    <div className={`mobile-tools${assistantWide ? ' assistant-mobile-tools' : ''}`}><details className="mobile-contents"><summary>本文目录</summary><Contents guide={guide} active={active} onChoose={() => document.querySelector('.mobile-contents')?.removeAttribute('open')} /></details>{controls}</div>
    <div className={`reader-layout${assistantWide ? ' with-assistant' : ''}`}><aside className="reading-sidebar"><AppLink to={libraryReturnPath(guide.metadata.id)} className="back-link">← 阅读书架</AppLink><div className="toc-heading">本文目录 <span>{guide.units.length - 1} 节</span></div><Contents guide={guide} active={active} /><div className="sidebar-footer"><AppLink to="/explore">研究探索 →</AppLink></div>{sidebarTools && readingTools}</aside>
      <main id="main-content" className="reading-main"><AppLink to={libraryReturnPath(guide.metadata.id)} className="reader-mobile-back">← 返回导学与书架</AppLink><div className="article-topline"><div className="article-labels"><span>{guide.metadata.type === 'survey' ? '综述解读' : '论文解读'}</span><span>导读修订 {guide.metadata.revision}</span><span>{coverageLabel(guide.metadata.coverage.scope)}</span></div></div>
        <div className="reading-identity"><a className="reading-original" href={guide.metadata.source.url} target="_blank" rel="noopener noreferrer">原论文 · {guide.metadata.source.version ?? '版本未指定'} ↗</a><div className="reader-heading-actions"><div className="desktop-font">{controls}</div><button id="reader-ai-action" className="reader-ai-trigger" aria-expanded={assistantOpen} aria-controls="reader-assistant" onClick={() => setAssistantOpen(value => !value)}>AI 解读 <span aria-hidden="true">{assistantOpen ? '−' : '+'}</span></button><button id="reader-state-action" className="reading-state-trigger" aria-label="阅读记录" aria-haspopup="dialog" onClick={() => setStateOpen(true)} title={`本篇解读 · ${statusLabel(guideState?.status)}；原论文 · ${statusLabel(originalState?.status)}`}><strong>阅读记录</strong><span aria-hidden="true">⌄</span></button></div></div>
        {storageError && <p className="status-warning" role="status">{storageError}</p>}
        <article className="prose" style={{ '--reading-size': `${fontSize}px` } as React.CSSProperties}>{guide.units.map(unit => <section id={unit.id} tabIndex={-1} key={unit.id} data-unit={unit.id}><Markdown guide={guide} markdown={unit.markdown} unitId={unit.id} onCitation={openCitation} /></section>)}</article>
        <footer className="reading-footer"><AppLink to="#orientation">回到阅读起点 ↑</AppLink><AppLink to="/explore">研究探索 →</AppLink></footer>
      </main>
      {assistantOpen && <ReaderAssistant guide={guide} unitId={selection?.unitId ?? active} selection={selection?.text} wide={assistantWide} topicRequest={topicRequest} onClose={() => { setAssistantOpen(false); setTopicRequest(undefined); }} />}
    </div>
    {!sidebarTools && readingTools}
    {source && <SourceDialog selection={source} guide={guide} onClose={() => setSource(null)} />}
    {noteContext && <NoteEditor target={{ guideId: guide.metadata.id, revision: guide.metadata.revision, unitId: noteContext.unitId }} quote={noteContext.text} onClose={() => setNoteContext(undefined)} />}
    {evidence && <AddEvidenceDialog evidence={evidence} onClose={() => setEvidence(undefined)} onDiscuss={(record, question) => {
      // Continue beside the article: the panel switches to this topic and waits for Send.
      rememberReaderTopic(record.id);
      setTopicRequest({ explorationId: record.id, question, nonce: Date.now() }); setAssistantOpen(true);
    }} />}
    {packet && <PacketDialog reading={packet} onClose={() => setPacket(undefined)} />}
    {stateOpen && <Dialog title="阅读记录" className="reading-state-dialog" busy={saving} onClose={() => setStateOpen(false)}><p className="quiet-copy">选择后立即保存。</p><label className="field-label">本篇解读（导读修订 {guide.metadata.revision}）<select aria-label="导读阅读状态" value={guideState?.status ?? ''} disabled={saving} onChange={event => mark('guide', event.target.value as ReadingStatus)}><option value="" disabled>未记录</option>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field-label">原论文（{guide.metadata.source.version ?? '版本未指定'}）<select aria-label="原论文阅读状态" value={originalState?.status ?? ''} disabled={saving} onChange={event => mark('original', event.target.value as ReadingStatus)}><option value="" disabled>未记录</option>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{stateMessage && <p role="status">{stateMessage}</p>}<AppLink to="/backup">备份与恢复个人积累 →</AppLink></Dialog>}
  </>;
}
