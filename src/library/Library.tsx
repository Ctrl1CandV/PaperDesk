import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { contentRepository } from '../content/repository';
import type { GuideSummary } from '../content/types';
import { AppLink, navigate } from '../app/navigation';
import { guideKey, personalStore } from '../records/store';
import type { Exploration, ReadingStatus, ResumeRecord } from '../records/types';
import { marksText, useReadingMarks, type ReadingMarks } from '../records/reading-marks';
import { libraryBrief, sourceVersionLabel } from './briefs';
import { publication, venueRanking } from './venueRankings';
import { collectionForQuery, collectionTerms } from './collections';
import { PaperFigure } from '../reader/PaperFigure';
import './library.css';

type Category = 'all' | 'survey' | 'paper';
type MarkFilter = 'unmarked' | Exclude<ReadingStatus, 'unread'>;
const markFilters: [MarkFilter, string][] = [['unmarked', '未读'], ['reading', '阅读中'], ['read', '已读'], ['deferred', '暂缓']];
const categories: [Category, string][] = [['all', '全部'], ['survey', '综述'], ['paper', '论文']];
const typeLabel = (type: string) => type === 'survey' ? '综述' : type === 'evaluation' ? '评价研究' : type === 'method' ? '方法研究' : '研究论文';
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const compactLibrary = () => window.matchMedia('(max-width: 800px)').matches || (document.querySelector<HTMLElement>('.library-layout')?.clientWidth ?? Infinity) <= 760;
function titleParts(title: string) {
  const separator = title.search(/[：:]/);
  return separator > 0 && separator < 24
    ? { name: title.slice(0, separator), subtitle: title.slice(separator + 1).trim() }
    : { name: title, subtitle: '' };
}
function DocumentIcon({ survey = false }: { survey?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {survey ? <><path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /><path d="M12 5v15M6 8h3M6 11h3M15 8h3M15 11h3" /></> : <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v5h5M8 12h8M8 16h6" /></>}
  </svg>;
}
export function matchesTitleOrTopic(guide: GuideSummary, query: string) {
  // A query that is exactly a category word (“通信”) means that reading collection.
  const named = collectionForQuery(query);
  if (named) return named.guideIds.includes(guide.metadata.id);
  const terms = normalized(query).split(' ').filter(Boolean);
  const fields = [guide.metadata.title, guide.metadata.paperTitle, guide.metadata.orientation?.shortTitle ?? '',
    ...(guide.metadata.orientation?.topics.flatMap(topic => [topic.label, ...topic.aliases]) ?? []), ...collectionTerms(guide)].map(normalized);
  return terms.every(term => fields.some(field => /^[a-z0-9-]+$/i.test(term) ? field.split(/[^a-z0-9-]+/i).some(word => word === term) : field.includes(term)));
}

// Briefs may run to several paragraphs, separated by one blank line.
const paragraphs = (text: string) => text.split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>);

function Orientation({ guide, resumes, marks, returnToList, openRelated }: { guide: GuideSummary; resumes: ResumeRecord[]; marks: ReadingMarks; returnToList: () => void; openRelated: (id: string) => void }) {
  const { metadata } = guide, orientation = metadata.orientation;
  const bibliography = orientation?.bibliography;
  const title = titleParts(orientation?.shortTitle ?? metadata.title);
  const brief = libraryBrief(metadata);
  const figure = brief.figure ? contentRepository.figure(metadata.id, metadata.revision, brief.figure) : undefined;
  const chapters = guide.units.filter(unit => unit.heading);
  const resume = resumes.filter(item => item.guideId === metadata.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const resumeGuide = resume && contentRepository.getSummary(resume.guideId, resume.revision);
  const resumeUnit = resumeGuide?.units.find(unit => unit.id === resume?.unitId);
  const canResume = Boolean(resumeUnit);
  const currentResume = canResume && resume.revision === metadata.revision;
  const resumeLabel = currentResume ? brief.chapterLabels[resume.unitId] ?? resumeUnit?.heading : resumeUnit?.heading;
  const ranking = venueRanking(metadata);
  // A ranked conference reads well by its short name; journals and unranked venues are written out in full.
  const published = publication(metadata);
  const venue = published && (ranking && published.kind === 'conference' ? published.short : published.name);
  const recorded = marksText(marks, metadata.id, metadata.source);
  const talk = contentRepository.presentationInfo(metadata.id, metadata.revision);
  const aims = new Map(orientation?.readingTargets.map(target => [target.unitId, target]) ?? []);
  const related = metadata.related.map(item => contentRepository.list().find(entry => entry.guide.metadata.id === item.guideId)?.guide).filter((item): item is GuideSummary => Boolean(item));
  return <section className="article-orientation" aria-labelledby="orientation-title">
    <button className="orientation-back text-action" onClick={returnToList}>← 返回筛选结果</button>
    <header className="orientation-masthead">
      <div className="orientation-title-row"><h2 id="orientation-title" tabIndex={-1}>{title.name}</h2><span className="orientation-kind">{typeLabel(metadata.type)}</span><button className="orientation-close" aria-label="关闭导学" onClick={returnToList}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 12" /></svg></button></div>
      <p className="paper-original-title" lang="en">{metadata.paperTitle}</p>
      <div className="orientation-bibliography"><p>{bibliography?.authors[0]}{bibliography && bibliography.authors.length > 1 ? ' 等' : ''}{venue && <span className="orientation-venue" title={published.detail}> · {published.source ? <a href={published.source} target="_blank" rel="noopener noreferrer">{venue}</a> : venue}</span>}{published?.year && <span> {published.year}</span>}{ranking && <span className="orientation-ranking"><a href={ranking.source} target="_blank" rel="noopener noreferrer" title={ranking.description} aria-label={`${ranking.label} · ${ranking.edition}。${ranking.description}`}><span>{ranking.label}</span><span className="ranking-edition">{ranking.edition}</span></a></span>}{published?.basis && <span className="orientation-basis">{published.basis}</span>}</p><a className="text-action" href={metadata.source.url} target="_blank" rel="noopener noreferrer">原论文 <span aria-hidden="true">↗</span></a></div>
      <div className={`orientation-actions${canResume ? ' has-resume' : ''}`}>
        {canResume && <p className="orientation-resume" title={resumeUnit?.heading ?? undefined}>上次读到：{resumeLabel ?? '阅读起点'}{!currentResume && <span> · 导读修订 {resume.revision}</span>}</p>}
        <AppLink id={`start-${metadata.id}`} className="primary-action" to={canResume ? `/read/${resume.guideId}/${resume.revision}` : `/read/${metadata.id}/${metadata.revision}`}>{canResume ? '继续阅读' : '开始导读'} <span aria-hidden="true">→</span></AppLink>
        {canResume && <AppLink className="text-action" to={`/read/${metadata.id}/${metadata.revision}#${guide.units[0].id}`}>{currentResume ? '从头阅读' : `从头阅读第 ${metadata.revision} 版`}</AppLink>}
        {talk && <AppLink id={`present-${metadata.id}`} className="text-action orientation-talk" to={`/present/${metadata.id}/${metadata.revision}`}>组会汇报 · {talk.minutes} 分钟</AppLink>}
        {recorded && <p className="orientation-marks">{recorded}</p>}
      </div>
    </header>
    <div className="orientation-body">
      <div className="orientation-prose">
        <section><h3>{metadata.type === 'survey' ? '综述概述' : '论文概述'}</h3>{paragraphs(brief.overview)}{figure && <PaperFigure figure={figure} compact />}</section>
        {brief.value && <section><h3>为什么值得读</h3>{paragraphs(brief.value)}</section>}
        {brief.advice && <section><h3>阅读建议</h3>{paragraphs(brief.advice)}</section>}
      </div>
      <nav className="orientation-outline" aria-label="阅读章节"><div className="orientation-section-heading"><h3>阅读章节</h3><span>{chapters.length} 节</span></div><ol>{chapters.map((unit, index) =>
        <li key={unit.id}><AppLink to={`/read/${metadata.id}/${metadata.revision}#${unit.id}`} title={unit.heading ?? undefined} aria-current={currentResume && resume.unitId === unit.id ? 'location' : undefined}><span className="outline-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{brief.chapterLabels[unit.id] ?? unit.heading}</span></AppLink>{aims.get(unit.id) && <p className="outline-aim">{aims.get(unit.id)!.purpose}</p>}</li>
      )}</ol></nav>
      {related.length > 0 && <nav className="orientation-related" aria-label="相关导读"><h3>相关导读</h3><ul>{related.map(item => {
        const text = marksText(marks, item.metadata.id, item.metadata.source);
        return <li key={item.metadata.id}><button type="button" className="text-action" onClick={() => openRelated(item.metadata.id)}>{titleParts(item.metadata.orientation?.shortTitle ?? item.metadata.title).name}</button>{text && <span>{text}</span>}</li>;
      })}</ul></nav>}
      <footer className="orientation-source"><span>{metadata.paperId} · 原文 {sourceVersionLabel(metadata.source.version)}</span>{brief.sourceUpdatedAt && <a href={brief.sourceRecordUrl ?? metadata.source.url} target="_blank" rel="noopener noreferrer">原文版本日期 <time dateTime={brief.sourceUpdatedAt}>{brief.sourceUpdatedAt}</time></a>}<span>导读修订 {metadata.revision}</span></footer>
    </div>
  </section>;
}

export function Library({ home = false }: { home?: boolean }) {
  const parameters = new URLSearchParams(window.location.search);
  const query = parameters.get('q') ?? '';
  const type = parameters.get('type');
  const category: Category = type === 'survey' || type === 'paper' ? type : 'all';
  const selectedId = parameters.get('article');
  const markParameter = parameters.get('mark');
  const markFilter = markFilters.find(([value]) => value === markParameter)?.[0];
  const marks = useReadingMarks();
  const [direction, setDirection] = useState<Exploration>();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const returningRow = useRef<string | undefined>(undefined);
  const entries = contentRepository.list();
  const guideMark = (id: string) => { const status = marks.guides.get(id)?.status; return !status || status === 'unread' ? 'unmarked' : status; };
  const filtered = entries.filter(({ guide }) => (category === 'all' || (category === 'survey' ? guide.metadata.type === 'survey' : guide.metadata.type !== 'survey')) && matchesTitleOrTopic(guide, query) && (!markFilter || guideMark(guide.metadata.id) === markFilter));
  const selected = filtered.find(entry => entry.guide.metadata.id === selectedId);
  const detailOpen = Boolean(selected);
  useLayoutEffect(() => {
    if (detailOpen || !returningRow.current) return;
    const id = returningRow.current;
    returningRow.current = undefined;
    // Closing the preview changes every shelf row's width and the page height.
    // Recheck after that reflow and navigation's focus restore, so scroll
    // anchoring cannot leave the focused article outside the viewport.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const row = document.getElementById(`choose-${id}`);
        if (!row || document.activeElement !== row) return;
        const bounds = row.getBoundingClientRect();
        if (bounds.top < 0 || bounds.bottom > window.innerHeight) row.scrollIntoView({ block: 'nearest' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailOpen]);
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const row = selected && document.getElementById(`choose-${selected.guide.metadata.id}`);
    const preview = document.getElementById('article-preview');
    if (!layout) return;
    const alignPreview = () => {
      const bounds = layout.getBoundingClientRect();
      // Convert visual coordinates to layout pixels, including CSS zoom.
      const scale = bounds.width / layout.offsetWidth || 1;
      const rowBounds = row?.getBoundingClientRect();
      const cardHeight = preview?.getBoundingClientRect().height ?? 0;
      const offset = rowBounds && !compactLibrary()
        ? Math.max(0, (rowBounds.top + rowBounds.height / 2 - bounds.top - cardHeight / 2) / scale) : 0;
      layout.style.setProperty('--preview-offset', `${offset}px`);
    };
    alignPreview();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(alignPreview);
    });
    observer.observe(layout);
    const shelf = layout.querySelector('.library-shelf');
    if (shelf) observer.observe(shelf);
    if (preview) observer.observe(preview);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [selected, query, category, markFilter]);
  useEffect(() => {
    // The most recently updated direction that has a recorded next step; nothing is inferred.
    let live = true;
    personalStore.list('explorations').then(items => {
      const next = items.filter(item => item.status !== 'archived' && item.research?.purpose !== 'accumulation' && item.nextAction).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (live) setDirection(next);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    document.title = `${home ? '阅读与探索' : '阅读书架'} · PaperDesk`;
    let live = true;
    setResumesLoading(true);
    Promise.all([
      personalStore.listPage('resume', { limit: 1 }),
      Promise.all(selectedId ? contentRepository.revisions(selectedId).map(revision => personalStore.get('resume', guideKey(selectedId, revision))) : []),
    ]).then(([latest, selectedResumes]) => {
      if (live) { setResumes([...new Map([...latest.records, ...selectedResumes.filter((item): item is ResumeRecord => Boolean(item))].map(item => [guideKey(item.guideId, item.revision), item])).values()]); setStorageError(false); }
    }).catch(() => { if (live) setStorageError(true); }).finally(() => { if (live) setResumesLoading(false); });
    return () => { live = false; };
  }, [home, selectedId]);
  function change(patch: Record<string, string | null>, replace = false, target?: { focusId: string; scrollToId?: string }) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    navigate(`${home ? '/' : '/library'}${next.size ? `?${next}` : ''}`, { replace, preservePosition: !target, ...target });
  }
  function select(id: string) {
    if (selectedId === id) {
      const heading = document.getElementById('orientation-title')?.getBoundingClientRect();
      const action = document.getElementById(`start-${id}`)?.getBoundingClientRect();
      if (!heading || heading.top < 16 || !action || action.bottom > window.innerHeight - 16) document.getElementById('article-preview')?.scrollIntoView({ block: 'start' });
      document.getElementById('orientation-title')?.focus({ preventScroll: true });
      return;
    }
    change({ article: id }, false, { focusId: 'orientation-title', scrollToId: 'article-preview' });
  }
  function openRelated(id: string) {
    change({ article: id, q: null, type: null, mark: null }, false, { focusId: 'orientation-title', scrollToId: 'article-preview' });
  }
  function returnToList() {
    const id = selected?.guide.metadata.id;
    returningRow.current = id;
    change({ article: null }, false, { focusId: `choose-${id}`, scrollToId: `choose-${id}` });
  }
  const latest = [...resumes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const resumeGuide = latest && contentRepository.getSummary(latest.guideId, latest.revision);
  return <main id="main-content" data-navigation-pending={resumesLoading} className={`library-page library-workspace${detailOpen ? ' has-selection' : ''}`}>
    <header className="library-heading"><h1>阅读书架</h1></header>
    {(latest || direction) && <div className="home-resume">
      {latest && <div className="home-resume-item"><span className="eyebrow">上次停留</span><p>{resumeGuide?.metadata.orientation?.shortTitle ?? resumeGuide?.metadata.title ?? '原阅读版本暂不可用'}</p><AppLink className="text-action" to={`/read/${latest.guideId}/${latest.revision}`}>继续阅读 →</AppLink></div>}
      {direction?.nextAction && <div className="home-resume-item"><span className="eyebrow">方向《{direction.title}》的下一步</span><p>{direction.nextAction.description}</p><AppLink className="text-action" to={`/explore/questions/${direction.id}`}>查看方向 →</AppLink></div>}
    </div>}
    {storageError && <p className="status-error" role="status">本地位置暂时无法读取，仍可浏览和阅读。</p>}
    <div ref={layoutRef} className="library-layout"><section className="library-shelf" aria-label="选择文章">
      <div className="library-toolbar"><label className="visually-hidden" htmlFor="library-search">查找文章</label><div className="library-search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input ref={searchRef} id="library-search" type="search" className="library-search" value={query} onChange={event => change({ q: event.target.value || null, article: null }, true)} placeholder="搜索标题、主题或类别，如“通信”“评价”" />{query && <button aria-label="清除搜索" onClick={() => { change({ q: null, article: null }, true); searchRef.current?.focus(); }}>×</button>}</div>
      <div className="library-categories" role="group" aria-label="文章类型">{categories.map(([value, label]) => <button id={`library-type-${value}`} key={value} aria-pressed={category === value} onClick={() => change({ type: value === 'all' ? null : value, article: null })}>{label}<span>{entries.filter(({ guide }) => value === 'all' || (value === 'survey' ? guide.metadata.type === 'survey' : guide.metadata.type !== 'survey')).length}</span></button>)}</div>
      <div className="library-result-row"><p className="library-result-count" role="status">{filtered.length < entries.length ? `${query ? `“${query}” · ` : ''}${markFilter ? `${markFilters.find(([value]) => value === markFilter)?.[1]} · ` : ''}${filtered.length} 篇文章` : ''}</p>
        <label className="library-mark-filter"><span className="visually-hidden">按导读阅读状态筛选</span><select value={markFilter ?? ''} onChange={event => change({ mark: event.target.value || null, article: null }, true)}><option value="">全部阅读状态</option>{markFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      {filtered.length > 0 && <div className="guide-list">{filtered.map(({ guide }) => {
        const { metadata } = guide, orientation = metadata.orientation;
        const title = titleParts(orientation?.shortTitle ?? metadata.title);
        const recorded = marksText(marks, metadata.id, metadata.source);
        const status = marks.guides.get(metadata.id)?.status;
        const published = publication(metadata);
        return <button key={metadata.id} id={`choose-${metadata.id}`} className="guide-entry" data-status={status} aria-label={`${orientation?.shortTitle ?? metadata.title}，查看导学`} aria-pressed={selected?.guide.metadata.id === metadata.id} aria-expanded={selected?.guide.metadata.id === metadata.id} aria-controls="article-preview" onClick={() => select(metadata.id)}>
          <span className="guide-card-main">
            <h3><span className="guide-card-name">{title.name}</span>{title.subtitle && <span className="guide-card-subtitle">{title.subtitle}</span>}</h3>
          </span>
          <span className="guide-card-purpose">{orientation?.value ?? metadata.purpose}</span>
          <span className="guide-card-bottom"><span className="guide-card-source"><DocumentIcon survey={metadata.type === 'survey'} />{typeLabel(metadata.type)} · {[published?.short, published?.year].filter(Boolean).join(' ') || '年份待补充'}</span>{recorded && <span className="guide-card-marks">{recorded}</span>}{contentRepository.presentationInfo(metadata.id, metadata.revision) && <span className="guide-card-talk">有汇报稿</span>}</span>
        </button>;
      })}</div>}
      {!filtered.length && <div className="empty-state"><h2>没有匹配的文章</h2><p>{markFilter ? '当前阅读状态下没有文章。' : '当前匹配标题、主要主题和类别（基础、通信、评价）。可以换一个词，或查看全部文章。'}</p><button className="secondary-action" onClick={() => change({ q: null, type: null, mark: null, article: null })}>查看全部文章</button></div>}
    </section><aside id="article-preview" className="library-preview" hidden={!selected} aria-label="文章导学" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !(event.target instanceof Element && event.target.closest('dialog'))) { event.preventDefault(); event.stopPropagation(); returnToList(); } }}>{selected && <Orientation key={`${selected.guide.metadata.id}/${selected.guide.metadata.revision}`} guide={selected.guide} resumes={resumes} marks={marks} returnToList={returnToList} openRelated={openRelated} />}</aside></div>
  </main>;
}
