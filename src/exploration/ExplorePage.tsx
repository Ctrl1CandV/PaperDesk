import { useEffect, useState } from 'react';
import { contentRepository } from '../content/repository';
import { AppLink, navigate } from '../navigation';
import { CreateExplorationDialog } from './ExplorationEditor';
import { ReadingTarget } from './EvidenceCard';
import { createExploration, statusLabels, useExplorations } from './model';
import './exploration.css';

export function ExplorePage() {
  const seed = contentRepository.getExplorationSeed();
  const { records, loading, error } = useExplorations();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [initial, setInitial] = useState(createExploration);
  const visible = records.filter(record => showArchived || record.status !== 'archived');
  useEffect(() => { document.title = '研究探索 · PaperDesk'; }, []);
  const editorial = seed ? <section className="exploration-editorial" aria-labelledby="editorial-heading"><div className="exploration-section-heading"><div><span className="eyebrow">编辑建议 · 可自由选择</span><h2 id="editorial-heading">从阅读进入的观察角度</h2></div></div>
      <p className="exploration-intro">{seed.orientation}</p>
      <div className="exploration-lens-grid">{[...seed.lenses].sort((a, b) => a.rank - b.rank).map(lens => <article className="exploration-lens-card" key={lens.id}>
        <span className="exploration-lens-rank">{String(lens.rank).padStart(2, '0')}{lens.id === 'collaboration' ? ' / 可选延伸' : ' / 阅读起点'}</span>
        <h3><AppLink id={`lens-title-${lens.id}`} to={`/explore/lenses/${lens.id}`}>{lens.title}</AppLink></h3><p>{lens.whyNow}</p>
        <AppLink id={`lens-open-${lens.id}`} className="exploration-text-link" to={`/explore/lenses/${lens.id}`}>了解这个角度 →</AppLink>
      </article>)}</div><p className="exploration-boundary">{seed.evidenceBoundary}</p>
    </section> : <p className="exploration-missing">编辑起点暂不可用。仍可直接创建自己的问题，个人记录不会因此消失。</p>;
  const personal = <section aria-labelledby="personal-heading" className="exploration-personal"><div className="exploration-section-heading"><div><span className="eyebrow">个人记录 · 此浏览器</span><h2 id="personal-heading">我的探索{!loading && records.length > 0 && <span className="exploration-record-count">{visible.length}</span>}</h2></div><label className="exploration-toggle"><input aria-label="包含已归档" type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />包含已归档</label></div>
      {loading ? <p role="status">正在读取本地探索…</p> : error ? <p className="exploration-missing" role="alert">本地存储暂不可用，无法读取探索。你仍可阅读编辑建议；草稿保存失败时可以复制恢复。</p> : visible.length ? <div className="exploration-record-list">{visible.map(record => <AppLink id={`exploration-open-${record.id}`} className="exploration-record-row" key={record.id} to={`/explore/questions/${record.id}`}>
        <div><div className="exploration-row-meta"><span className={`exploration-status status-${record.status}`}>{statusLabels[record.status]}</span><span>{record.evidence.length} 条材料</span></div><h3>{record.title}</h3><p>{record.question}</p>{record.nextAction && <p className="exploration-row-next"><span>下一步</span>{record.nextAction.description}</p>}</div><span aria-hidden="true">→</span>
      </AppLink>)}</div> : <div className="exploration-empty"><h3>{records.length ? '当前没有未归档的探索' : '还没有个人探索记录'}</h3><p>打开编辑建议不会自动创建记录。可以回到一段阅读，选中实际想保留的文字，再写下一个值得继续追问的问题。</p>
        {seed?.lenses[0] && <ReadingTarget target={seed.lenses[0].nextAction.target} />}
      </div>}
    </section>;
  return <main id="main-content" className="exploration-page" aria-busy={loading || undefined}>
    <header className="exploration-page-heading"><div><span className="eyebrow">阅读之后 · 研究探索</span><h1>研究探索</h1><p className="exploration-intro">把阅读里的问题、依据与下一步连在一起。</p></div>
      <button className="primary-action" onClick={() => { setInitial(createExploration()); setCreating(true); }}>创建自己的问题</button>
    </header>
    {records.length > 0 ? <>{personal}{editorial}</> : <>{editorial}{personal}</>}
    {creating && <CreateExplorationDialog initial={initial} draftKey="exploration:create:reader" onClose={() => setCreating(false)} onSaved={record => { setCreating(false); navigate(`/explore/questions/${record.id}`); }} />}
  </main>;
}

export function LensPage({ lensId }: { lensId: string }) {
  const seed = contentRepository.getExplorationSeed();
  const lens = contentRepository.getLens(lensId);
  const [creating, setCreating] = useState(false);
  useEffect(() => { document.title = `${lens?.title ?? '编辑起点'} · PaperDesk`; }, [lens]);
  if (!seed || !lens) return <main id="main-content" className="exploration-page"><AppLink to="/explore">← 返回研究探索</AppLink><h1>这个编辑起点暂不可用</h1><p>已保存的个人问题与材料仍会保留。</p></main>;
  return <main id="main-content" className="exploration-page exploration-lens-page"><AppLink className="exploration-back" to="/explore">← 返回研究探索</AppLink>
    <span className="eyebrow">编辑起点 {String(lens.rank).padStart(2, '0')} · {lens.id === 'collaboration' ? '可选延伸' : '阅读与理解'}</span>
    <h1>{lens.title}</h1><p className="exploration-intro">{lens.orientation}</p>
    <section><h2>为什么现在看这个角度</h2><p>{lens.whyNow}</p></section>
    <section><h2>带着这些目的回到阅读</h2><ol className="exploration-reading-sequence">{lens.guideRefs.map((target, index) => <li key={`${target.guideId}-${target.unitId}`}>
      <span aria-hidden="true">0{index + 1}</span><div><ReadingTarget target={target} /><p>{target.purpose}</p></div>
    </li>)}</ol></section>
    <section className="exploration-prompt"><span className="eyebrow">一个可以改写的起点</span><h2>{lens.prompt}</h2><p className="exploration-boundary">{seed.evidenceBoundary}</p><button className="primary-action" onClick={() => setCreating(true)}>改写成我的问题</button></section>
    <section><h2>可选的理解自检</h2><p>{lens.selfCheck}</p><p className="exploration-small">这是帮助回顾的标准，不是分数、门槛或掌握程度证明。</p></section>
    <section className="exploration-next-reading"><h2>下一步可以做什么</h2><p>{lens.nextAction.description}</p><ReadingTarget target={lens.nextAction.target} /></section>
    {creating && <CreateExplorationDialog initial={createExploration(lens, seed.revision)} draftKey={`exploration:create:${seed.revision}:${lens.id}`} onClose={() => setCreating(false)} onSaved={record => { setCreating(false); navigate(`/explore/questions/${record.id}`); }} />}
  </main>;
}
