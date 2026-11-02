import { useEffect, useState } from 'react';
import { useLocation } from '../app/navigation';
import { Dialog } from '../ui/Dialog';
import { personalStore } from './store';
import type { Exploration } from './types';
import { explorationFileState, resolveExplorationFile, startExplorationFileSync, subscribeExplorationFiles, syncExplorations, type ExplorationFileConflict } from './exploration-sync';
import './exploration-sync.css';

function download(name: string, record: Exploration | null) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Version({ label, record, suffix }: { label: string; record: Exploration | null; suffix: string }) {
  return <div className="exploration-sync-version"><h3>{label}</h3>{record ? <><strong>{record.title}</strong><p>{record.question}</p>{record.research?.notebook?.versions.at(-1) && <pre>{record.research.notebook.versions.at(-1)!.body}</pre>}<p className="exploration-sync-meta">工作稿 {record.research?.notebook?.versions.length ?? 0} 版 · 关联文献 {record.research?.relatedGuides?.length ?? 0} 篇 · 摘录 {record.evidence.length} 条</p></> : <p>此版本已删除这个方向。</p>}<button type="button" className="text-action" onClick={() => download(`exploration-${suffix}.json`, record)}>下载完整{label}</button></div>;
}
function Compare({ conflict, onClose }: { conflict: ExplorationFileConflict; onClose: () => void }) {
  const [selected, setSelected] = useState(conflict.heads[0].hash), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function choose(selection: string) {
    if (busy) return; setBusy(true); setError('');
    try { await resolveExplorationFile(conflict, selection); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '未能保存选择，请稍后重试。'); }
    finally { setBusy(false); }
  }
  const project = conflict.heads.find(head => head.hash === selected)!;
  return <Dialog title="比较探索版本" onClose={onClose} busy={busy} className="exploration-sync-dialog">
    <p>两边都有变化，尚未自动覆盖。请选择接下来继续使用的一版；未采用的内容会保留在项目的版本文件中，也可以先下载。</p>
    {conflict.heads.length > 1 && <label className="exploration-sync-selector">项目中的分支版本<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>{conflict.heads.map((head, index) => <option key={head.hash} value={head.hash}>分支 {index + 1} · {head.record?.updatedAt.slice(0, 10) ?? '已删除'} · {head.hash.slice(0, 8)}</option>)}</select></label>}
    <div className="exploration-sync-compare"><Version label="浏览器版本" record={conflict.local} suffix="browser" /><Version label="项目版本" record={project.record} suffix="project" /></div>
    {error && <p role="alert" className="exploration-sync-error">{error}</p>}
    <div className="exploration-sync-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void choose('local')}>{busy ? '正在保存…' : conflict.local ? '继续使用浏览器版本' : '保留浏览器中的删除'}</button><button type="button" disabled={busy} onClick={() => void choose(selected)}>{project.record ? '采用此项目版本' : '采用项目中的删除'}</button><button type="button" disabled={busy} onClick={onClose}>稍后处理</button></div>
  </Dialog>;
}

/** Application-wide controller; only research/backup pages display routine status. */
export function ExplorationSync() {
  const location = useLocation(), [state, setState] = useState(explorationFileState), [open, setOpen] = useState<ExplorationFileConflict>();
  useEffect(() => { const unsubscribe = subscribeExplorationFiles(() => setState(explorationFileState())); const stop = startExplorationFileSync(); return () => { unsubscribe(); stop(); }; }, []);
  const relevant = location.startsWith('/explore') || location.startsWith('/backup');
  if (!relevant && state.phase !== 'conflict') return null;
  return <aside className={`exploration-file-sync sync-${state.phase}`} aria-label="探索项目保存">
    {state.phase === 'loading' && <p>正在检查并保存探索项目文件…</p>}
    {state.phase === 'ready' && <><p>{state.count ? `${state.count} 个探索已保存到项目文件，可随 Git 提交；另一台电脑拉取后会载入。` : '探索会自动保存到项目文件，供 Git 在电脑之间传递。'}</p><button type="button" className="text-action" onClick={() => void syncExplorations()}>检查项目更新</button></>}
    {state.phase === 'offline' && <><p>{state.message} 当前修改尚未确认写入项目。</p><button type="button" className="text-action" onClick={() => void syncExplorations()}>重试项目保存</button></>}
    {state.phase === 'paused' && <><p>探索项目同步已暂停。项目文件仍保留，恢复后会重新载入。</p><button type="button" className="text-action" onClick={() => void personalStore.resumeExplorationSync().then(() => syncExplorations())}>恢复项目同步</button></>}
    {state.phase === 'conflict' && <><p>有 {state.conflicts.length} 个探索需要比较版本，内容均已保留。</p>{state.conflicts.map(conflict => <button type="button" className="text-action" key={conflict.id} onClick={() => setOpen(conflict)}>比较「{conflict.local?.title ?? conflict.heads.find(head => head.record)?.record?.title ?? '已删除方向'}」</button>)}</>}
    {open && <Compare key={`${open.id}:${open.heads.map(head => head.hash).join(',')}`} conflict={open} onClose={() => setOpen(undefined)} />}
  </aside>;
}
