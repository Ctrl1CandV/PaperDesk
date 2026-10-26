import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { contentRepository } from '../content/repository';
import { coverageLabel } from '../content/labels';
import type { Guide } from '../content/types';
import { AppLink, navigate } from '../navigation';
import { personalStore } from '../records/store';
import type { ResumeRecord } from '../records/types';
import { Dialog } from '../ui/Dialog';
import './library.css';

type Category = 'all' | 'survey' | 'paper';
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
export function matchesTitleOrTopic(guide: Guide, query: string) {
  const terms = normalized(query).split(' ').filter(Boolean);
  const fields = [guide.metadata.title, guide.metadata.paperTitle, guide.metadata.orientation?.shortTitle ?? '',
    ...(guide.metadata.orientation?.topics.flatMap(topic => [topic.label, ...topic.aliases]) ?? [])].map(normalized);
  return terms.every(term => fields.some(field => /^[a-z0-9-]+$/i.test(term) ? field.split(/[^a-z0-9-]+/i).some(word => word === term) : field.includes(term)));
}

function Orientation({ guide, resumes, returnToList }: { guide: Guide; resumes: ResumeRecord[]; returnToList: () => void }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const { metadata } = guide, orientation = metadata.orientation;
  const bibliography = orientation?.bibliography;
  const title = titleParts(orientation?.shortTitle ?? metadata.title);
  const resume = resumes.filter(item => item.guideId === metadata.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const resumeAvailable = resume && contentRepository.get(resume.guideId, resume.revision);
  return <section className="article-orientation" aria-labelledby="orientation-title">
    <button className="orientation-back text-action" onClick={returnToList}>← 返回筛选结果</button>
    <header className="orientation-masthead">
      <div className="orientation-top"><p className="article-kind">{typeLabel(metadata.type)}<span>{bibliography?.year ?? '年份待核实'}</span></p><button className="orientation-close" aria-label="关闭导学" onClick={returnToList}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 12" /></svg></button></div>
      <h2 id="orientation-title" tabIndex={-1} className={title.subtitle ? 'has-subtitle' : ''}><span className="article-name">{title.name}</span>{title.subtitle && <><span className="visually-hidden">：</span><span className="article-subtitle">{title.subtitle}</span></>}</h2>
      <p className="paper-original-title" lang="en">{metadata.paperTitle}</p>
      <div className="orientation-abstract"><p>{orientation?.summary ?? metadata.purpose}</p></div>
      <div className="orientation-actions"><AppLink id={`start-${metadata.id}`} className="primary-action" to={resumeAvailable ? `/read/${resume.guideId}/${resume.revision}` : `/read/${metadata.id}/${metadata.revision}`}>{resumeAvailable ? '继续上次阅读' : '进入深入阅读'} <span aria-hidden="true">→</span></AppLink><a className="text-action" href={metadata.source.url} target="_blank" rel="noopener noreferrer">打开原论文 <span aria-hidden="true">↗</span></a></div>
      {resumeAvailable && <p className="orientation-resume"><span>上次读到：{resumeAvailable.units.find(unit => unit.id === resume.unitId)?.heading ?? '阅读起点'} · 导读修订 {resume.revision}</span><AppLink to={`/read/${metadata.id}/${metadata.revision}#orientation`}>从头阅读 →</AppLink></p>}
    </header>
    <div className="orientation-body">
      <section className="orientation-subject"><h3>阅读重点</h3><p>{orientation?.value ?? metadata.purpose}</p></section>
      <div className="orientation-preparation">
        {orientation && <section className="orientation-section reading-value"><h3>带着哪些基础开始</h3><ul>{orientation.prerequisites.map(item => <li key={item}>{item}</li>)}</ul></section>}
        <section className="orientation-section orientation-coverage"><h3>本次阅读的范围</h3><p className="coverage-caption">{coverageLabel(metadata.coverage.scope)} · {guide.units.filter(unit => unit.heading).length} 个章节</p><ul>{(orientation?.boundaries ?? metadata.coverage.limitations).map(item => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <section className="orientation-outline"><div className="orientation-section-heading"><h3>阅读章节</h3><span>{guide.units.filter(unit => unit.heading).length} 节</span></div><ol>{guide.units.filter(unit => unit.heading).map((unit, index) => {
        const target = orientation?.readingTargets.find(item => item.unitId === unit.id);
        return <li key={unit.id}><AppLink to={`/read/${metadata.id}/${metadata.revision}#${unit.id}`}><span className="outline-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span><strong>{unit.heading}</strong>{target && <small>{target.purpose}</small>}</span><span className="outline-arrow" aria-hidden="true">↗</span></AppLink></li>;
      })}</ol></section>
      <footer className="orientation-source"><div><span>原论文 {metadata.source.version ?? '版本未指定'} · 导读修订 {metadata.revision}</span><p>{bibliography?.venue ?? (bibliography?.publicationKind === 'preprint' ? '预印本' : '发表信息待核实')}{bibliography?.year ? ` · ${bibliography.year}` : ''}</p></div><button className="text-action" onClick={() => setSourceOpen(true)}>完整来源与作者 <span aria-hidden="true">↗</span></button></footer>
    </div>
    {sourceOpen && <Dialog title="来源与版本" onClose={() => setSourceOpen(false)} className="orientation-source-dialog"><p lang="en">{metadata.paperTitle}</p><dl>
        <div><dt>完整作者</dt><dd>{bibliography?.authors.length ? bibliography.authors.join(', ') : '作者信息尚未补充'}</dd></div>
        <div><dt>{bibliography?.publicationKind === 'preprint' ? '预印本' : '发表于'}</dt><dd>{bibliography?.venue ? <a href={bibliography.url} target="_blank" rel="noopener noreferrer">{bibliography.venue} · {bibliography.year ?? '年份待核实'} ↗</a> : '发表信息尚未核实'}</dd></div>
        <div><dt>阅读依据</dt><dd><a href={metadata.source.url} target="_blank" rel="noopener noreferrer">{metadata.paperId} · {metadata.source.version ?? '版本未指定'} ↗</a>{bibliography?.preprintYear ? <span className="preprint-year">首次预印本 {bibliography.preprintYear} 年</span> : null}</dd></div>
        {orientation && <div><dt>主要主题</dt><dd>{orientation.topics.map(topic => topic.label).join(' · ')}</dd></div>}
        <div><dt>本地讲解</dt><dd>修订 {metadata.revision}</dd></div>
      </dl></Dialog>}
  </section>;
}

export function Library({ home = false }: { home?: boolean }) {
  const parameters = new URLSearchParams(window.location.search);
  const query = parameters.get('q') ?? '';
  const type = parameters.get('type');
  const category: Category = type === 'survey' || type === 'paper' ? type : 'all';
  const selectedId = parameters.get('article');
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const entries = contentRepository.list();
  const filtered = entries.filter(({ guide }) => (category === 'all' || (category === 'survey' ? guide.metadata.type === 'survey' : guide.metadata.type !== 'survey')) && matchesTitleOrTopic(guide, query));
  const selected = filtered.find(entry => entry.guide.metadata.id === selectedId);
  const detailOpen = Boolean(selected);
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
      // Expanding details changes the card's center; keep its active control reachable.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.tagName === 'SUMMARY' && preview?.contains(active)) {
        const control = active.getBoundingClientRect();
        if (control.top < 16 || control.bottom > window.innerHeight - 16) active.scrollIntoView({ block: 'nearest' });
      }
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
  }, [selected, query, category]);
  useEffect(() => {
    document.title = `${home ? '阅读与探索' : '阅读书架'} · PaperDesk`;
    let live = true;
    personalStore.list('resume').then(records => { if (live) setResumes(records); }).catch(() => { if (live) setStorageError(true); }).finally(() => { if (live) setResumesLoading(false); });
    return () => { live = false; };
  }, [home]);
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
  function returnToList() {
    const id = selected?.guide.metadata.id;
    change({ article: null }, false, { focusId: `choose-${id}`, scrollToId: `choose-${id}` });
  }
  const latest = [...resumes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const resumeGuide = latest && contentRepository.get(latest.guideId, latest.revision);
  return <main id="main-content" data-navigation-pending={resumesLoading} className={`library-page library-workspace${detailOpen ? ' has-selection' : ''}`}>
    <header className="library-heading"><h1>阅读书架</h1><AppLink className="text-action library-explore-link" to="/explore">研究探索 <span aria-hidden="true">↗</span></AppLink></header>
    {latest && <div className="home-resume"><div><span className="eyebrow">上次停留</span><p>{resumeGuide?.metadata.orientation?.shortTitle ?? resumeGuide?.metadata.title ?? '原阅读版本暂不可用'}</p></div><AppLink className="secondary-action" to={`/read/${latest.guideId}/${latest.revision}`}>继续阅读 →</AppLink></div>}
    {storageError && <p className="status-error" role="status">本地位置暂时无法读取，仍可浏览和阅读。</p>}
    <div ref={layoutRef} className="library-layout"><section className="library-shelf" aria-label="选择文章">
      <label className="visually-hidden" htmlFor="library-search">查找文章</label><div className="library-search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input ref={searchRef} id="library-search" type="search" className="library-search" value={query} onChange={event => change({ q: event.target.value || null, article: null }, true)} placeholder="搜索标题或主要主题" />{query && <button aria-label="清除搜索" onClick={() => { change({ q: null, article: null }, true); searchRef.current?.focus(); }}>×</button>}</div>
      <div className="library-categories" role="group" aria-label="文章类型">{categories.map(([value, label]) => <button id={`library-type-${value}`} key={value} aria-pressed={category === value} onClick={() => change({ type: value === 'all' ? null : value, article: null })}>{label}<span>{entries.filter(({ guide }) => value === 'all' || (value === 'survey' ? guide.metadata.type === 'survey' : guide.metadata.type !== 'survey')).length}</span></button>)}</div>
      <p className="library-result-count" role="status">{query ? `“${query}” · ` : ''}{filtered.length} 篇文章</p>
      <div className="guide-list">{filtered.map(({ guide, recommendation }) => {
        const { metadata } = guide, orientation = metadata.orientation;
        const title = titleParts(orientation?.shortTitle ?? metadata.title);
        return <button key={metadata.id} id={`choose-${metadata.id}`} className="guide-entry" aria-label={`${orientation?.shortTitle ?? metadata.title}，查看导学`} aria-pressed={selected?.guide.metadata.id === metadata.id} aria-expanded={selected?.guide.metadata.id === metadata.id} aria-controls="article-preview" onClick={() => select(metadata.id)}>
          <span className="guide-card-meta"><span><DocumentIcon survey={metadata.type === 'survey'} />{typeLabel(metadata.type)}</span><span>{orientation?.bibliography.year ?? '年份待补充'}</span></span>
          <h2><span className="guide-card-name">{title.name}</span>{title.subtitle && <span className="guide-card-subtitle">{title.subtitle}</span>}</h2>
          {!title.subtitle && <span className="guide-card-summary">{orientation?.summary ?? metadata.purpose}</span>}
          <span className="guide-card-purpose">{orientation?.value ?? metadata.purpose}</span>
          <span className="guide-card-bottom"><span>{orientation?.topics.map(topic => topic.label).join(' / ') ?? recommendation.reason}</span><span className="guide-card-arrow" aria-hidden="true">↗</span></span>
        </button>;
      })}</div>
      {!filtered.length && <div className="empty-state"><h2>没有匹配的文章</h2><p>当前只匹配标题和主要主题。可以换一个主题，或查看全部文章。</p><button className="secondary-action" onClick={() => change({ q: null, type: null, article: null })}>查看全部文章</button></div>}
    </section><aside id="article-preview" className="library-preview" hidden={!selected} aria-label="文章导学" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !(event.target instanceof Element && event.target.closest('dialog'))) { event.preventDefault(); event.stopPropagation(); returnToList(); } }}>{selected && <Orientation key={`${selected.guide.metadata.id}/${selected.guide.metadata.revision}`} guide={selected.guide} resumes={resumes} returnToList={returnToList} />}</aside></div>
  </main>;
}
