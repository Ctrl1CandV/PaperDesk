import { useState } from 'react';
import type { Exploration, Note } from '../records/types';
import type { ResearchArtifact } from '../../shared/research-artifacts.mjs';
import type { ResearchMaterials } from '../../shared/research-materials.mjs';
import { createResearchMaterials } from '../../shared/research-materials.mjs';
import { personalStore } from '../records/store';
import { useRecords } from '../records/hooks';
import { contentRepository } from '../content/repository';
import { AppLink } from '../app/navigation';
import { Dialog } from '../ui/Dialog';

export interface MaterialSelection { notes: Note[]; artifacts: ResearchArtifact[] }
export const emptyMaterialSelection = (): MaterialSelection => ({ notes: [], artifacts: [] });
function guideLabel(note: Pick<Note, 'guideId' | 'revision' | 'unitId'>) {
  const guide = contentRepository.getSummary(note.guideId, note.revision);
  return `${guide?.metadata.title ?? note.guideId} · 导读 r${note.revision} · ${guide?.units.find(unit => unit.id === note.unitId)?.heading ?? note.unitId}`;
}
export async function refreshMaterialSelection(explorationId: string, selected: MaterialSelection): Promise<MaterialSelection> {
  const exploration = await personalStore.get('explorations', explorationId);
  if (!exploration) throw Error('当前探索已不可用，问题草稿与资料选择仍保留。');
  const notes = await Promise.all(selected.notes.map(async item => {
    const current = await personalStore.get('notes', item.id);
    if (!current) throw Error('已选笔记已删除或不可用，请先撤销该笔记的选择。');
    return current;
  }));
  const artifacts = selected.artifacts.map(item => {
    const current = exploration.research?.artifacts?.find(value => value.id === item.id);
    if (!current) throw Error('已选研究文档已删除或不属于当前探索，请先撤销该文档的选择。');
    return current;
  });
  return structuredClone({ notes, artifacts });
}
export async function prepareSelectedMaterials(explorationId: string, selected: MaterialSelection) {
  if (!selected.notes.length && !selected.artifacts.length) return undefined;
  const frozen = await createResearchMaterials(explorationId, selected.notes, selected.artifacts);
  const current = await refreshMaterialSelection(explorationId, selected);
  const latest = await createResearchMaterials(explorationId, current.notes, current.artifacts);
  if (frozen.materialsSha256 !== latest.materialsSha256) throw Error('已选笔记或文档已修改。请打开“选择笔记与研究文档”，预览并更新选择，或撤销；问题草稿仍保留。');
  return frozen;
}
export function ResearchMaterialsPicker({ exploration, selected, onChange, onClose, disabled }: {
  exploration: Exploration; selected: MaterialSelection; onChange: (value: MaterialSelection) => void; onClose: () => void; disabled: boolean;
}) {
  const notes = useRecords('notes');
  const [filter, setFilter] = useState(''), [error, setError] = useState(''), [updating, setUpdating] = useState(false);
  const matching = notes.records.filter(note => !filter.trim() || `${note.text} ${note.quote ?? ''} ${guideLabel(note)}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  const artifacts = exploration.research?.artifacts ?? [];
  const locked = disabled || updating;
  function toggleNote(note: Note, enabled: boolean) {
    if (enabled && selected.notes.length >= 8) { setError('一次最多选择 8 条笔记。'); return; }
    setError(''); onChange({ ...selected, notes: enabled ? [...selected.notes, structuredClone(note)] : selected.notes.filter(value => value.id !== note.id) });
  }
  function toggleArtifact(artifact: ResearchArtifact, enabled: boolean) {
    if (enabled && selected.artifacts.length >= 3) { setError('一次最多选择 3 份研究文档。'); return; }
    setError(''); onChange({ ...selected, artifacts: enabled ? [...selected.artifacts, structuredClone(artifact)] : selected.artifacts.filter(value => value.id !== artifact.id) });
  }
  return <Dialog title="选择笔记与研究文档" onClose={onClose} className="ai-material-dialog" busy={updating}>
    <p>仅发送勾选资料的固定副本，最多 8 条笔记、3 份当前探索文档，总计 48 KiB。正文不会自动截断。个人笔记表达你的理解，不等同于论文证据。</p>
    <p>当前选择：{selected.notes.length} 条笔记、{selected.artifacts.length} 份文档。撤销选择立即影响下一次发送；已发送快照仍保留在对应问答中。</p>
    {(selected.notes.length > 0 || selected.artifacts.length > 0) && <section className="ai-material-selected"><h3>已选固定副本</h3>
      {selected.notes.map(note => <details key={note.id}><summary>笔记 r{note.recordRevision} · {note.text.slice(0, 60)}</summary><p>{guideLabel(note)}</p><p>{note.text}</p>{note.quote && <blockquote>{note.quote}</blockquote>}<button type="button" disabled={locked} onClick={() => toggleNote(note, false)}>撤销此笔记</button></details>)}
      {selected.artifacts.map(artifact => <details key={artifact.id}><summary>文档 r{artifact.recordRevision} · {artifact.title}</summary><p>{artifact.body || '正文为空'}</p><button type="button" disabled={locked} onClick={() => toggleArtifact(artifact, false)}>撤销此文档</button></details>)}
      <button type="button" disabled={locked} onClick={async () => { setUpdating(true); setError(''); try { onChange(await refreshMaterialSelection(exploration.id, selected)); } catch (reason) { setError(reason instanceof Error ? reason.message : '更新失败，原选择仍保留。'); } finally { setUpdating(false); } }}>更新已选资料到最新版本</button>
    </section>}
    {error && <p role="alert">{error}</p>}
    <h3>选择个人笔记</h3><label>筛选已加载笔记<input aria-label="筛选已加载笔记" value={filter} onChange={event => setFilter(event.target.value)} /></label>
    {notes.error && <p role="alert">{notes.error}</p>}
    <div className="ai-material-options">{matching.map(note => <div key={note.id}><label><input type="checkbox" disabled={locked} checked={selected.notes.some(value => value.id === note.id)} onChange={event => toggleNote(note, event.target.checked)} />{note.text.slice(0, 80)} · r{note.recordRevision}</label><details><summary>预览笔记与关联导读</summary><AppLink to={`/read/${note.guideId}/${note.revision}#${note.unitId}`}>{guideLabel(note)}</AppLink><p>{note.text}</p>{note.quote && <blockquote>{note.quote}</blockquote>}</details>{selected.notes.some(value => value.id === note.id && value.recordRevision !== note.recordRevision) && <p role="status">此笔记已有新修订，请更新选择或撤销。</p>}</div>)}</div>
    {!matching.length && <p>{notes.loading ? '正在读取笔记…' : '已加载笔记中没有匹配项。'}</p>}
    {notes.hasMore && <button type="button" disabled={locked || notes.loading} onClick={() => void notes.loadMore()}>读取更多笔记后继续筛选</button>}
    <h3>当前探索的已保存文档</h3><div className="ai-material-options">{artifacts.map(artifact => <div key={artifact.id}><label><input type="checkbox" disabled={locked} checked={selected.artifacts.some(value => value.id === artifact.id)} onChange={event => toggleArtifact(artifact, event.target.checked)} />{artifact.title} · r{artifact.recordRevision}</label><details><summary>预览文档正文</summary><p>{artifact.body || '正文为空'}</p></details>{selected.artifacts.some(value => value.id === artifact.id && value.recordRevision !== artifact.recordRevision) && <p role="status">此文档已有新修订，请更新选择或撤销。</p>}</div>)}</div>
    {!artifacts.length && <p>当前探索尚无已保存文档。</p>}<button type="button" disabled={locked} onClick={onClose}>完成选择</button>
  </Dialog>;
}
export function ResearchMaterialsView({ materials }: { materials: ResearchMaterials }) {
  return <details className="ai-research-materials"><summary>主动选入的资料 · {materials.notes.length} 条笔记、{materials.artifacts.length} 份文档</summary><p>以下为本轮实际发送的固定副本。个人笔记与研究文档不是独立核验的论文结论。</p>
    {materials.notes.map(note => <details key={note.id}><summary>笔记 r{note.recordRevision} · {guideLabel(note)}</summary><p>{note.text}</p>{note.quote && <blockquote>{note.quote}</blockquote>}<AppLink to={`/read/${note.guideId}/${note.revision}#${note.unitId}`}>返回关联导读</AppLink></details>)}
    {materials.artifacts.map(artifact => <details key={artifact.id}><summary>{artifact.title} · 文档 r{artifact.recordRevision}</summary><p>{artifact.body}</p><p>基于探索记录 r{artifact.sourceRecordRevision}</p>{artifact.evidenceRefs.length > 0 && <pre>{JSON.stringify(artifact.evidenceRefs, null, 2)}</pre>}</details>)}
    <p className="ai-fine-print">资料摘要：{materials.materialsSha256}</p>
  </details>;
}
