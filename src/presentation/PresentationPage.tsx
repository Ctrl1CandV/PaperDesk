/*
 * 组会汇报页 —— 先给导师看一张完整的导图，再按导图顺序往下讲。
 * 1. 类别：给别人看一次的展示页，投影在组会上；讲者自己滚动。不要翻页式幻灯片或计时条。
 * 2. 颜色和图形：品牌酒红只给根节点和操作；每个分支一种颜色，只用来区分部分。图形就是导图本身，原图来自论文。
 * 3. 内容的形状决定版式：
 *    - 因为导师要先知道大致讲什么，一篇只有 3 个分支、7 个讲解点，所以页面顶部是一张完整、读得清的导图。
 *    - 因为讲解按导图顺序往下走，所以下面左侧是一张跟着滚动的导图：开场只画主干，讲到哪个分支就展开它、
 *      收起别的，讲到哪一点就点亮它并展开关键词；右侧是这一点的结论、原图或表、出处和讲稿提示。
 *    - 因为讲者备查的讲稿提示不一定要投影，所以它有开关；打印讲义是导图在前、各分支随后。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../app/navigation';
import { contentRepository } from '../content/repository';
import type { Guide, GuideSummary, Presentation, TalkPoint, TalkSource, TalkStop } from '../content/types';
import { Markdown } from '../reader/Markdown';
import { Dialog } from '../ui/Dialog';
import { TalkOverview, TalkStage, type MapTarget, type Reveal } from './TalkMap';
import './presentation.css';


function PrintIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7Z" /></svg>;
}

function Points({ points }: { points: TalkPoint[] }) {
  return <dl className="stop-points">{points.map((point, at) => <div key={at}>{point.key && <dt>{point.key}</dt>}<dd>{point.text}</dd></div>)}</dl>;
}
function Sources({ sources, unitId, onGuide }: { sources?: TalkSource[]; unitId?: string; onGuide?: (unitId: string) => void }) {
  if (!sources?.length && !(unitId && onGuide)) return null;
  return <footer className="stop-sources">{sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
    {unitId && onGuide && <button type="button" className="stop-guide" onClick={() => onGuide(unitId)}>导读原文</button>}</footer>;
}
function Evidence({ talk, stop }: { talk: Presentation; stop: TalkStop }) {
  const figure = stop.figure ? contentRepository.figure(talk.guideId, talk.revision, stop.figure.asset) : undefined;
  return <>
    {figure && <figure className="stop-figure"><img src={figure.url} alt={figure.alt} width={figure.width} height={figure.height} /><figcaption>{stop.figure!.caption}</figcaption></figure>}
    {stop.table && <div className="stop-table" role="region" tabIndex={0} aria-label={`${stop.title}：表格`}><table><thead><tr>{stop.table.columns.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{stop.table.rows.map((row, at) => <tr key={at}>{row.map((cell, column) => column ? <td key={column} className={[...cell].length <= 4 ? 'is-short' : undefined}>{cell}</td> : <th key={column} scope="row">{cell}</th>)}</tr>)}</tbody></table>
      {stop.table.note && <p className="stop-table-note">{stop.table.note}</p>}</div>}
  </>;
}

export function PresentationPage({ guideId, revision }: { guideId: string; revision: number }) {
  const guide = contentRepository.getSummary(guideId, revision);
  const info = contentRepository.presentationInfo(guideId, revision);
  const [state, setState] = useState<{ talk?: Presentation; loading: boolean; error?: string }>({ loading: Boolean(info) });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!info) return;
    const controller = new AbortController();
    setState({ loading: true });
    contentRepository.getPresentation(guideId, revision, controller.signal).then(talk => { if (!controller.signal.aborted) setState({ talk, loading: false }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : '暂时无法读取汇报内容。' }); });
    return () => controller.abort();
  }, [guideId, revision, attempt]);
  useEffect(() => { document.title = `汇报 · ${guide?.metadata.orientation?.shortTitle ?? guide?.metadata.title ?? '论文'} · PaperDesk`; }, [guide]);
  const reader = `/read/${guideId}/${revision}`;
  if (!guide) return <main id="main-content" className="error-page"><h1>没有找到这个阅读版本</h1><AppLink className="primary-action" to="/library">返回阅读书架</AppLink></main>;
  if (!info) return <main id="main-content" className="talk-page talk-missing"><AppLink className="talk-back" to={reader}>← 返回导读</AppLink><h1>这篇导读还没有汇报稿</h1>
    <p>汇报稿是在导读之上另外整理的一层内容：把论文组织成一张导图，几个分支、七八个讲解点，十几分钟讲清论文的价值；每个点配一句结论、原图或表和出处。它和导读一样先整理、核对，再放进内容目录，页面不会临时生成。</p>
    <p>需要汇报这篇论文时，按 <code>docs/content/workflows/PRESENTATION.md</code> 的格式准备 <code>content/presentations/{guideId}.r{revision}.json</code>。</p>
    <AppLink className="primary-action" to={reader}>先读导读 →</AppLink></main>;
  if (state.loading) return <main id="main-content" className="talk-page" data-navigation-pending="true"><p role="status">正在读取汇报内容…</p></main>;
  if (state.error || !state.talk) return <main id="main-content" className="talk-page talk-missing"><h1>暂时无法读取汇报内容</h1><p role="alert">{state.error}</p><button className="primary-action" onClick={() => setAttempt(value => value + 1)}>重试读取</button> <AppLink to={reader}>返回导读</AppLink></main>;
  return <Talk talk={state.talk} guide={guide} />;
}

/** Sections of the story in reading order; the one that has reached the upper third of the window is the current one. */
type Step = { kind: 'opening' } | { kind: 'part'; part: number } | { kind: 'stop'; part: number; stop: TalkStop; order: number } | { kind: 'closing' };
const stepId = (step: Step, talk: Presentation) => step.kind === 'part' ? talk.parts[step.part].id : step.kind === 'stop' ? step.stop.id : step.kind;

function Talk({ talk, guide }: { talk: Presentation; guide: GuideSummary }) {
  const shortTitle = guide.metadata.orientation?.shortTitle ?? talk.title;
  // The centre of the map carries the paper's short name; the full title is in the header.
  const rootLabel = shortTitle.split(/[：:]/)[0].trim() || shortTitle;
  const reader = `/read/${talk.guideId}/${talk.revision}`;
  const steps = useMemo(() => {
    const list: Step[] = [{ kind: 'opening' }]; let order = 0;
    talk.parts.forEach((part, at) => { list.push({ kind: 'part', part: at }); for (const stop of part.stops) list.push({ kind: 'stop', part: at, stop, order: ++order }); });
    list.push({ kind: 'closing' });
    return list;
  }, [talk]);
  const totalStops = steps.filter(step => step.kind === 'stop').length;
  const indexOf = useCallback((id: string) => steps.findIndex(step => stepId(step, talk) === id), [steps, talk]);
  const [active, setActive] = useState(() => Math.max(0, indexOf(window.location.hash.slice(1))));
  const [notes, setNotes] = useState(true);
  const [guideUnit, setGuideUnit] = useState<string>();
  const sections = useRef(new Map<number, HTMLElement>());
  const scrolling = useRef(0);
  const remember = useCallback((index: number) => history.replaceState(history.state, '', `${location.pathname}${location.search}${index ? `#${stepId(steps[index], talk)}` : ''}`), [steps, talk]);
  // The story is one document: the section that has reached the upper third of the window is the current one.
  useEffect(() => {
    let frame = 0, retry = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // While a chosen section is being scrolled to, wait; then look again, so scrolling meanwhile is not lost.
        const wait = scrolling.current - performance.now();
        if (wait > 0) { clearTimeout(retry); retry = window.setTimeout(track, wait + 20); return; }
        let found = 0;
        for (const [index, element] of sections.current) if (element.getBoundingClientRect().top < innerHeight * .36) found = Math.max(found, index);
        setActive(previous => { if (previous !== found) remember(found); return found; });
      });
    };
    window.addEventListener('scroll', track, { passive: true }); track();
    return () => { cancelAnimationFrame(frame); clearTimeout(retry); window.removeEventListener('scroll', track); };
  }, [remember]);
  useEffect(() => {
    const target = sections.current.get(indexOf(window.location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }, []);
  function goTo(index: number) {
    const element = sections.current.get(index);
    setActive(index); remember(index);
    scrolling.current = performance.now() + 800;
    element?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    (element?.querySelector('h2, h3') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  const select = (target: MapTarget) => goTo(target.kind === 'root' ? steps.length - 1 : target.kind === 'part' ? steps.findIndex(step => step.kind === 'part' && step.part === target.part) : indexOf(target.id));
  const register = (index: number) => (element: HTMLElement | null) => { if (element) sections.current.set(index, element); else sections.current.delete(index); };
  const step = steps[active];
  const current = step.kind === 'stop' ? step.stop.id : undefined;
  // The following map: the trunk at the opening; one branch open while it is told; every branch at the closing.
  const part = step.kind === 'part' || step.kind === 'stop' ? step.part : undefined;
  const reveal: Reveal = { parts: at => step.kind === 'closing' || at === part, points: id => id === current };
  return <main id="main-content" className="talk-page">
    <header className="talk-header">
      <div className="talk-heading">
        <AppLink className="talk-back" to={reader}>← 返回导读</AppLink>
        <h1><span>汇报</span>{shortTitle}</h1>
        <p className="talk-meta"><span>{talk.minutes} 分钟</span><span>{talk.parts.length} 个分支 · {totalStops} 个讲解点</span><span>依据导读修订 {talk.revision}</span></p>
      </div>
      <div className="talk-actions">
        <label className="talk-toggle"><input type="checkbox" checked={notes} onChange={event => setNotes(event.target.checked)} />讲稿提示</label>
        <button type="button" className="talk-print" onClick={() => window.print()} title="导图在前，各分支随后；可在打印对话框里另存为 PDF"><PrintIcon /><span>打印讲义</span></button>
      </div>
    </header>

    <section className="talk-overview" aria-labelledby="talk-thesis">
      <p className="talk-thesis" id="talk-thesis"><span>一句话</span>{talk.thesis}</p>
      <TalkOverview talk={talk} rootLabel={rootLabel} current={current} onSelect={select} />
      <ol className="talk-route" aria-label="汇报顺序">
        <li>开场</li>
        {talk.parts.map((item, at) => <li key={item.id} data-part={at % 6}>{item.title}</li>)}
        <li>价值与边界</li>
      </ol>
    </section>

    <div className="talk-story">
      <div className="talk-story-map">
        <TalkStage talk={talk} rootLabel={rootLabel} reveal={reveal} selected={step.kind === 'closing' ? 'root' : current} focus={part} onSelect={select} outlineBelow={300} label="当前位置的导图" frameFocus />
      </div>
      <div className="talk-story-content">
        <section className="talk-section is-opening" ref={register(0)} id="opening" aria-labelledby="talk-opening">
          <p className="stop-kicker"><span className="stop-part">开场</span></p>
          <h2 id="talk-opening" tabIndex={-1}>{talk.title}</h2>
          <p className="talk-paper" lang="en">{guide.metadata.paperTitle}</p>
          <p className="stop-lead">{talk.opening.message}</p>
          <Sources sources={talk.opening.sources} unitId={talk.opening.unitId} onGuide={setGuideUnit} />
          {notes && <aside className="stop-notes" aria-label="讲稿提示"><span>讲稿提示</span><ul>{talk.opening.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></aside>}
        </section>
        {talk.parts.map((item, at) => {
          const intro = steps.findIndex(entry => entry.kind === 'part' && entry.part === at);
          return <section key={item.id} className="talk-part" data-part={at % 6} aria-labelledby={`part-${item.id}`}>
            <header className="talk-part-head" ref={register(intro)} id={item.id}>
              <p className="stop-kicker"><span className="stop-part">分支 {at + 1}</span><span>{item.stops.length} 个讲解点</span></p>
              <h2 id={`part-${item.id}`} tabIndex={-1}>{item.title}</h2>
              <p>{item.summary}</p>
            </header>
            {item.stops.map(stop => {
              const index = indexOf(stop.id), entry = steps[index] as Extract<Step, { kind: 'stop' }>;
              return <article key={stop.id} className="talk-section stop" ref={register(index)} id={stop.id} aria-current={index === active ? 'step' : undefined} aria-labelledby={`stop-${stop.id}`}>
                <p className="stop-kicker"><span className="stop-part">{item.title}</span><span>{String(entry.order).padStart(2, '0')} / {totalStops}</span></p>
                <h3 id={`stop-${stop.id}`} tabIndex={-1}>{stop.title}</h3>
                <p className="stop-lead">{stop.message}</p>
                <div className="stop-body"><Evidence talk={talk} stop={stop} />{stop.points && <Points points={stop.points} />}</div>
                <Sources sources={stop.sources} unitId={stop.unitId} onGuide={setGuideUnit} />
                {notes && <aside className="stop-notes" aria-label="讲稿提示"><span>讲稿提示</span><ul>{stop.notes.map((note, noteAt) => <li key={noteAt}>{note}</li>)}</ul></aside>}
              </article>;
            })}
          </section>;
        })}
        <section className="talk-section is-closing" ref={register(steps.length - 1)} id="closing" aria-labelledby="talk-closing">
          <p className="stop-kicker"><span className="stop-part">收束 · 论文价值</span></p>
          <h2 id="talk-closing" tabIndex={-1}>{talk.closing.title}</h2>
          <p className="stop-lead">{talk.closing.message}</p>
          <Points points={talk.closing.points} />
          <Sources sources={talk.closing.sources} unitId={talk.closing.unitId} onGuide={setGuideUnit} />
          {notes && <aside className="stop-notes" aria-label="讲稿提示"><span>讲稿提示</span><ul>{talk.closing.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></aside>}
        </section>
      </div>
    </div>
    <footer className="talk-footer"><p>{talk.review}</p><p>图表与数字沿用导读中的出处和条件；汇报页不代表已读原文。</p></footer>
    {guideUnit && <GuideSection guideId={talk.guideId} revision={talk.revision} unitId={guideUnit} onClose={() => setGuideUnit(undefined)} />}
  </main>;
}

/** The reviewed guide section behind a stop, for questions during or after the talk. */
function GuideSection({ guideId, revision, unitId, onClose }: { guideId: string; revision: number; unitId: string; onClose: () => void }) {
  const [guide, setGuide] = useState<Guide>(), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    contentRepository.get(guideId, revision, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) value ? setGuide(value) : setError('导读暂不可用。'); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '导读暂不可用。'); });
    return () => controller.abort();
  }, [guideId, revision]);
  const unit = guide?.units.find(item => item.id === unitId);
  return <Dialog title={unit?.heading ?? '导读原文'} className="talk-guide-dialog" onClose={onClose}>
    <p className="talk-guide-meta">导读修订 {revision} · 这一节的完整讲解 <AppLink to={`/read/${guideId}/${revision}#${unitId}`}>在阅读页打开 →</AppLink></p>
    {error ? <p role="alert">{error}</p> : !guide ? <p role="status">正在读取导读…</p> : unit ? <div className="prose talk-guide-prose"><Markdown guide={guide} unitId={unit.id} markdown={unit.markdown} onCitation={citation => window.open(citation.url, '_blank', 'noopener,noreferrer')} /></div> : <p>这一节在当前修订中不可用。</p>}
  </Dialog>;
}
