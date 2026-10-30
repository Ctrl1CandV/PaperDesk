import { useEffect, useState } from 'react';
import { useExplorationSeed } from '../content/hooks';
import { AppLink, navigate } from '../app/navigation';
import { QuickQuestionDialog } from './QuickQuestion';
import { ReadingTarget } from './EvidenceCard';
import { createExploration, pendingDiscussions, statusLabels, useExplorations } from './model';
import { RESEARCH_STAGES } from '../../shared/research-contract.mjs';
import { STAGE_LABELS } from '../../shared/research-documents.mjs';
import './direction.css';
import type { Exploration } from '../records/types';

/** After creation the exploration page opens with the assistant; a chosen discussion waits for Send. */
function openCreated(record: Exploration, discuss: boolean) {
  if (discuss) pendingDiscussions.set(record.id, record.question);
  navigate(`/explore/questions/${record.id}`);
}
import './exploration.css';

export function ExplorePage() {
  const { seed, loading: seedLoading } = useExplorationSeed();
  const { records, loading, error, hasMore, loadMore } = useExplorations();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const visible = records.filter(record => showArchived || record.status !== 'archived');
  const directions = visible.filter(record => record.research?.purpose !== 'accumulation');
  const accumulation = visible.filter(record => record.research?.purpose === 'accumulation');
  useEffect(() => { document.title = '探索 · PaperDesk'; }, []);
  const editorial = seed ? <section className="exploration-editorial" aria-labelledby="editorial-heading"><div className="exploration-section-heading"><div><span className="eyebrow">编辑建议 · 可自由选择</span><h2 id="editorial-heading">起步视角</h2></div></div>
      <p className="exploration-intro">{seed.orientation}</p>
      <div className="exploration-lens-grid">{[...seed.lenses].sort((a, b) => a.rank - b.rank).map(lens => <article className="exploration-lens-card" key={lens.id}>
        <span className="exploration-lens-rank">{String(lens.rank).padStart(2, '0')}{lens.id === 'collaboration' ? ' / 可选延伸' : ' / 阅读起点'}</span>
        <h3><AppLink id={`lens-title-${lens.id}`} to={`/explore/lenses/${lens.id}`}>{lens.title}</AppLink></h3><p>{lens.whyNow}</p>
        <AppLink id={`lens-open-${lens.id}`} className="exploration-text-link" to={`/explore/lenses/${lens.id}`}>了解这个角度 →</AppLink>
      </article>)}</div><p className="exploration-boundary">{seed.evidenceBoundary}</p>
    </section> : <p className="exploration-missing" role="status">{seedLoading ? '正在读取编辑起点…' : '编辑起点暂不可用。个人记录不会因此消失。'}</p>;
  return <main id="main-content" className="exploration-page explore-home" aria-busy={loading || undefined}>
    <header className="explore-heading"><div><h1>探索</h1><p className="exploration-intro">你的研究方向，以及为它们积累的论文、讨论和选文文件。阅读时在 AI 对话里输入 <kbd>/方向</kbd> 建立或更新方向，输入 <kbd>/选文</kbd> 生成交给 Harness 的选文实施文件。</p></div>
      <div className="explore-heading-actions"><label className="exploration-toggle"><input aria-label="包含已归档" type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />包含已归档</label><button className="exploration-secondary" onClick={() => setCreating(true)}>手动新建方向</button></div>
    </header>
    <section aria-labelledby="directions-heading" className="explore-directions">
      <h2 id="directions-heading">研究方向{!loading && directions.length > 0 && <span className="exploration-record-count">{directions.length}</span>}</h2>
      {loading && !records.length ? <p role="status">正在读取本地记录…</p> : error ? <p className="exploration-missing" role="alert">本地存储暂不可用，无法读取方向。你仍可阅读编辑建议。</p>
        : directions.length ? <div className="direction-tiles">{directions.map(record => <DirectionTile key={record.id} record={record} />)}</div>
        : <div className="exploration-empty"><h3>{records.length ? '当前没有未归档的方向' : '还没有研究方向'}</h3><p>读论文时在 AI 对话里聊你的疑惑；觉得值得持续追踪时输入 /方向，AI 会判断讨论是否足够，并直接建立方向。也可以手动新建。</p>
          {seed?.lenses[0] && <ReadingTarget target={seed.lenses[0].nextAction.target} />}</div>}
      {hasMore && <button className="secondary-action" disabled={loading} onClick={() => void loadMore()}>载入更多</button>}
    </section>
    {accumulation.length > 0 && <section aria-labelledby="accumulation-heading" className="explore-accumulation">
      <h2 id="accumulation-heading">阅读积累<span className="exploration-record-count">{accumulation.length}</span></h2>
      <p className="exploration-small">不属于某个方向的选文：想弄清一个主题时用 /选文 积累 生成。</p>
      <div className="accumulation-list">{accumulation.map(record => <AccumulationRow key={record.id} record={record} />)}</div>
    </section>}
    {editorial}
    {creating && <QuickQuestionDialog title="手动新建方向" draftKey="exploration:create:reader" onClose={() => setCreating(false)} onCreated={(record, discuss) => { setCreating(false); openCreated(record, discuss); }} />}
  </main>;
}

const latestBrief = (record: Exploration) => (record.research?.artifacts ?? []).filter(item => item.kind === 'reading-brief').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
function DirectionTile({ record }: { record: Exploration }) {
  const stage = record.research?.stage, at = stage ? RESEARCH_STAGES.indexOf(stage) : -1;
  const files = (record.research?.artifacts ?? []).filter(item => item.kind === 'reading-brief').length;
  return <AppLink id={`exploration-open-${record.id}`} className="direction-tile exploration-record-row" to={`/explore/questions/${record.id}`}>
    <div className="tile-top"><span className="tile-stage">{stage ? STAGE_LABELS[stage].label : '阶段未定'}</span>
      <span className="tile-dots" aria-hidden="true">{RESEARCH_STAGES.map((item, index) => <i key={item} className={index <= at ? 'is-on' : ''} />)}</span>
      {record.status !== 'exploring' && <span className={`exploration-status status-${record.status}`}>{statusLabels[record.status]}</span>}</div>
    <h3>{record.title}</h3>
    <p className="tile-question">{record.question}</p>
    {record.nextAction && <p className="tile-next exploration-row-next"><span>下一步</span>{record.nextAction.description}</p>}
    <p className="tile-meta">{record.evidence.length} 条材料 · 选文文件 {files} · 更新 {record.updatedAt.slice(0, 10)}</p>
  </AppLink>;
}
function AccumulationRow({ record }: { record: Exploration }) {
  const brief = latestBrief(record);
  return <AppLink className="accumulation-row" to={`/explore/questions/${record.id}`}>
    <div><h3>{record.title}</h3><p>{record.question}</p></div>
    <p className="accumulation-meta">{brief ? `选文文件 ${brief.updatedAt.slice(0, 10)}` : '尚无文件'}</p>
  </AppLink>;
}

export function LensPage({ lensId }: { lensId: string }) {
  const { seed, loading } = useExplorationSeed();
  const lens = seed?.lenses.find(item => item.id === lensId);
  const [creating, setCreating] = useState(false);
  useEffect(() => { document.title = `${lens?.title ?? '编辑起点'} · PaperDesk`; }, [lens]);
  if (loading) return <main id="main-content" className="exploration-page" data-navigation-pending="true"><p role="status">正在读取编辑起点…</p></main>;
  if (!seed || !lens) return <main id="main-content" className="exploration-page"><AppLink to="/explore">← 返回探索</AppLink><h1>这个编辑起点暂不可用</h1><p>已保存的个人问题与材料仍会保留。</p></main>;
  return <main id="main-content" className="exploration-page exploration-lens-page"><AppLink className="exploration-back" to="/explore">← 返回探索</AppLink>
    <span className="eyebrow">编辑起点 {String(lens.rank).padStart(2, '0')} · {lens.id === 'collaboration' ? '可选延伸' : '阅读与理解'}</span>
    <h1>{lens.title}</h1><p className="exploration-intro">{lens.orientation}</p>
    <section><h2>为什么现在看这个角度</h2><p>{lens.whyNow}</p></section>
    <section><h2>带着这些目的回到阅读</h2><ol className="exploration-reading-sequence">{lens.guideRefs.map((target, index) => <li key={`${target.guideId}-${target.unitId}`}>
      <span aria-hidden="true">0{index + 1}</span><div><ReadingTarget target={target} /><p>{target.purpose}</p></div>
    </li>)}</ol></section>
    <section className="exploration-prompt"><span className="eyebrow">一个可以改写的起点</span><h2>{lens.prompt}</h2><p className="exploration-boundary">{seed.evidenceBoundary}</p><button className="primary-action" onClick={() => setCreating(true)}>改写成我的问题</button></section>
    <section><h2>可选的理解自检</h2><p>{lens.selfCheck}</p><p className="exploration-small">这是帮助回顾的标准，不是分数、门槛或掌握程度证明。</p></section>
    <section className="exploration-next-reading"><h2>下一步可以做什么</h2><p>{lens.nextAction.description}</p><ReadingTarget target={lens.nextAction.target} /></section>
    {creating && <QuickQuestionDialog title="改写成我的问题" base={createExploration(lens, seed.revision)} draftKey={`exploration:create:${seed.revision}:${lens.id}`} onClose={() => setCreating(false)} onCreated={(record, discuss) => { setCreating(false); openCreated(record, discuss); }} />}
  </main>;
}
