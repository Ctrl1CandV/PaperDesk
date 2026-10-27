import { useEffect, useState } from 'react';
import { contentRepository } from '../content/repository';
import { AppLink } from '../app/navigation';
import { personalStore, ConflictError } from '../records/store';
import { useRecords } from '../records/hooks';
import type { GuideTarget, Note, NoteDraft } from '../records/types';
import { Dialog } from '../ui/Dialog';
import { getDraft, listDrafts, keepDraft, clearDraft, useUnloadWarning } from '../ui/drafts';
import '../records/records.css';

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NoteEditor({ target, quote, note, onClose, onSaved, closeLabel = '返回阅读' }: { target: GuideTarget; quote?: string; note?: Note; onClose: () => void; onSaved?: (note: Note) => void; closeLabel?: string }) {
  // A new selection in the same section gets its own buffer; it cannot silently
  // restore an earlier quote under a different visible selection.
  const sectionPrefix = `note:${target.guideId}/${target.revision}/${target.unitId}:`;
  const initialKey = note ? `note:${note.id}` : `${sectionPrefix}${quote ?? ''}`;
  const [draftKey, setDraftKey] = useState(initialKey);
  const [cached] = useState(() => getDraft<{ draft: NoteDraft; base?: Note }>(draftKey));
  const [base, setBase] = useState(cached ? cached.base : note);
  const [draft, setDraft] = useState<NoteDraft>(() => cached?.draft ?? (note ? { ...note } : { id: crypto.randomUUID(), guideId: target.guideId, revision: target.revision, unitId: target.unitId, text: '', ...(quote === undefined ? {} : { quote }), status: 'open' }));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Note | null>();
  const otherDrafts = note ? [] : listDrafts<{ draft: NoteDraft; base?: Note }>(sectionPrefix).filter(item => item.key !== draftKey);
  const dirty = draft.text !== (base?.text ?? '') || draft.status !== (base?.status ?? 'open') || draft.quote !== (base?.quote ?? quote);
  useUnloadWarning(dirty);
  useEffect(() => { if (dirty) keepDraft(draftKey, { draft, base }); else clearDraft(draftKey); }, [draft, base, dirty, draftKey]);
  const guide = contentRepository.getSummary(target.guideId, target.revision);
  function restoreDraft(key: string) {
    if (dirty) keepDraft(draftKey, { draft, base });
    const restored = getDraft<{ draft: NoteDraft; base?: Note }>(key);
    setDraftKey(key); setBase(restored?.base);
    setDraft(restored?.draft ?? { id: crypto.randomUUID(), guideId: target.guideId, revision: target.revision, unitId: target.unitId, text: '', ...(quote === undefined ? {} : { quote }), status: 'open' });
    setError(''); setConflict(undefined); setSaved(false);
  }
  async function save(asCopy = false) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await personalStore.saveNote({ ...draft, id: asCopy ? crypto.randomUUID() : draft.id }, asCopy ? null : base?.recordRevision ?? null);
      setBase(result); setDraft(result); setConflict(undefined); setSaved(true); clearDraft(draftKey); onSaved?.(result);
      if (asCopy) onClose();
    } catch (cause) {
      if (cause instanceof ConflictError) setConflict(cause.current as Note | null);
      setError(cause instanceof ConflictError ? '另一处已修改这条笔记。你的草稿仍在，请选择如何继续。' : '保存失败，草稿仍在。可重试或下载草稿恢复。');
      keepDraft(draftKey, { draft, base });
    } finally { setBusy(false); }
  }
  return <Dialog title={note ? '编辑笔记' : '留下一条笔记'} onClose={onClose} busy={busy} className="reader-editor">
    <p className="quiet-copy">{guide?.metadata.title ?? '导读版本暂不可用'} · {guide?.units.some(unit => unit.id === target.unitId) ? guide.units.find(unit => unit.id === target.unitId)?.heading ?? '阅读起点' : '原章节暂不可用'}</p>
    {cached && <p className="draft-hint">已恢复与这条笔记或当前摘录关联的会话草稿。</p>}
    {draftKey !== initialKey && <p className="draft-hint">正在编辑本章先前摘录的草稿。下方显示的是它原来的摘录。<button className="text-action" disabled={busy} onClick={() => restoreDraft(initialKey)}>返回本次选中的摘录</button></p>}
    {otherDrafts.length > 0 && <details className="other-note-drafts"><summary>本章其他草稿（{otherDrafts.length}）</summary><p className="draft-hint">恢复会同时带回对应摘录；当前未保存文字会留在自己的草稿中。</p><ul>{otherDrafts.map(item => <li key={item.key}><p className="draft-quote-preview">{item.value.draft.quote ? `${item.value.draft.quote.slice(0, 100)}${item.value.draft.quote.length > 100 ? '…' : ''}` : '未附摘录'}</p><button className="text-action" disabled={busy} onClick={() => restoreDraft(item.key)}>恢复此摘录草稿</button></li>)}</ul></details>}
    {draft.quote && <blockquote className="saved-quote">{draft.quote}</blockquote>}
    {(draft.quote?.length ?? 0) > 20000 && <p className="status-warning" role="alert">当前摘录超过 20,000 字符。可返回阅读选择更短片段，或<button className="text-action" onClick={() => { const { quote: _quote, ...remaining } = draft; setDraft(remaining); }}>移除摘录，仅保存笔记</button>。没有自动截断文字。</p>}
    <label className="field-label">我的笔记或问题<textarea aria-label="我的笔记或问题" disabled={busy} rows={7} value={draft.text} maxLength={20000} onChange={event => { setDraft({ ...draft, text: event.target.value }); setSaved(false); }} /></label>
    <label className="field-label">问题状态<select aria-label="问题状态" disabled={busy} value={draft.status} onChange={event => { setDraft({ ...draft, status: event.target.value as Note['status'] }); setSaved(false); }}><option value="open">待继续</option><option value="resolved">已解决（由我标记）</option></select></label>
    {error && <p className="status-error" role="alert">{error}</p>}
    {conflict !== undefined && <div className="conflict-panel"><h3>{conflict ? '另一处已保存的内容' : '这条笔记已在另一处删除'}</h3>{conflict && <p className="preserve-text">{conflict.text}</p>}<div className="form-actions">{conflict && <button className="secondary-action" onClick={() => { setBase(conflict); setDraft(conflict); setConflict(undefined); setError(''); clearDraft(draftKey); }}>采用已保存版本</button>}<button className="secondary-action" onClick={() => save(true)}>将我的草稿另存一条</button></div></div>}
    <p className="quiet-copy" role="status">{saved ? '已保存到此浏览器' : dirty ? '尚未保存。关闭后在本次会话中保留草稿。' : '只在点击保存后写入个人记录。'}</p>
    <div className="form-actions"><button className="primary-action" disabled={busy || !draft.text.trim() || conflict !== undefined} onClick={() => save()}>{busy ? '正在保存…' : '保存笔记'}</button><button className="secondary-action" disabled={busy} onClick={() => downloadText('paperdesk-note-draft.txt', `${draft.quote ? `导读摘录：\n${draft.quote}\n\n` : ''}我的草稿：\n${draft.text}`)}>下载草稿</button><button className="text-action" disabled={busy} onClick={onClose}>{closeLabel}</button>{dirty && <button className="text-action" disabled={busy} onClick={() => { clearDraft(draftKey); onClose(); }}>丢弃草稿</button>}</div>
  </Dialog>;
}

// Filtering is temporary UI state; private search text stays out of URLs and backups.
let noteFilters = { query: '', status: 'all' };
export function NotesPage() {
  const { records: notes, loading, error: readError, reload: refresh, hasMore, loadMore } = useRecords('notes');
  const [actionError, setError] = useState('');
  const error = actionError || readError;
  const [query, setQuery] = useState(noteFilters.query);
  const [status, setStatus] = useState(noteFilters.status);
  const [editing, setEditing] = useState<Note>();
  const [removing, setRemoving] = useState<Note>();
  useEffect(() => { document.title = '我的笔记 · PaperDesk'; }, []);
  async function remove() {
    if (!removing) return;
    try { await personalStore.deleteNote(removing.id, removing.recordRevision); setRemoving(undefined); await refresh(); }
    catch { setError('未能删除。记录可能已在另一处更改，请刷新后确认。'); }
  }
  function filter(nextQuery: string, nextStatus: string) {
    setQuery(nextQuery); setStatus(nextStatus);
    noteFilters = { query: nextQuery, status: nextStatus };
  }
  const visible = [...notes].filter(note => {
    const guide = contentRepository.getSummary(note.guideId, note.revision);
    const text = [note.text, note.quote, guide?.metadata.title, guide?.units.find(unit => unit.id === note.unitId)?.heading].filter(Boolean).join(' ').toLocaleLowerCase();
    return (status === 'all' || note.status === status) && text.includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <main id="main-content" className="platform-page notes-page"><header className="accumulation-heading"><div><span className="eyebrow">个人积累 · 此浏览器</span><h1>我的笔记</h1><p className="page-lead">留下理解与疑问，沿着摘录回到阅读。</p></div><AppLink to="/library" className="secondary-action">回到阅读书架</AppLink></header>
    {notes.length > 0 && <div className="notes-tools"><label className="notes-search">查找笔记<input id="notes-search" type="search" aria-label="查找笔记" placeholder="笔记、摘录或文章标题" value={query} onChange={event => filter(event.target.value, status)} /></label><label className="notes-status-filter">问题状态<select id="notes-status-filter" aria-label="筛选笔记状态" value={status} onChange={event => filter(query, event.target.value)}><option value="all">全部状态</option><option value="open">待继续</option><option value="resolved">已解决</option></select></label><span className="notes-count" role="status">{visible.length} / {notes.length} 条笔记</span></div>}
    {error && <p className="status-error" role="alert">{error}<button onClick={() => { setError(''); refresh(); }}>重试</button></p>}
    {loading && <p className="quiet-copy" role="status">正在读取本地笔记…</p>}
    {!loading && !notes.length && !error && <div className="empty-state"><span className="eyebrow">从一段阅读开始</span><h2>还没有保存笔记</h2><p>阅读时选中一段文字，或在当前章节点击“记笔记”。它会保留导读版本和返回位置。</p><AppLink to="/library" className="primary-action">选择一篇文章 →</AppLink></div>}
    {!loading && notes.length > 0 && !visible.length && <div className="empty-state"><h2>没有匹配的笔记</h2><p>可以换一个关键词，或查看全部状态。</p><button className="text-action" onClick={() => filter('', 'all')}>清除筛选</button></div>}
    <div className="note-list">{visible.map(note => {
      const guide = contentRepository.getSummary(note.guideId, note.revision), unit = guide?.units.find(unit => unit.id === note.unitId);
      return <article className="note-entry" key={note.id} id={`note-${note.id}`}><div className="note-entry-heading"><h2>{guide?.metadata.title ?? '导读版本暂不可用'}</h2><span className={`note-status note-status-${note.status}`}>{note.status === 'open' ? '待继续' : '已解决 · 由你标记'}</span></div><div className="entry-meta"><span>{unit ? unit.heading ?? '阅读起点' : '原章节暂不可用'}</span><span>导读修订 {note.revision}</span></div><p className="note-text preserve-text">{note.text}</p>{note.quote && <div className="note-excerpt"><span className="eyebrow">保留的导读摘录</span><blockquote className="saved-quote">{note.quote}</blockquote></div>}<div className="note-entry-footer">{unit ? <AppLink id={`note-reading-${note.id}`} to={`/read/${note.guideId}/${note.revision}#${note.unitId}`}>回到阅读位置 →</AppLink> : <p className="status-warning">原导读位置暂不可用，保存的文字仍然保留。</p>}<div className="form-actions"><button className="secondary-action" onClick={() => setEditing(note)}>编辑笔记</button><button className="text-action danger-text" onClick={() => setRemoving(note)}>删除笔记</button></div></div></article>;
    })}</div>
    {hasMore && <div><p className="quiet-copy">当前筛选已载入的 {notes.length} 条笔记；可继续载入较早记录。</p><button className="secondary-action" disabled={loading} onClick={() => void loadMore()}>载入更多笔记</button></div>}
    <footer className="accumulation-footer"><p>笔记与摘录只保存在此浏览器，导出备份可在更换浏览器时恢复。</p><AppLink to="/backup" className="text-action">备份与恢复 →</AppLink></footer>
    {editing && <NoteEditor target={editing} note={editing} closeLabel="返回笔记" onSaved={() => refresh()} onClose={() => setEditing(undefined)} />}
    {removing && <Dialog title="删除这条笔记？" onClose={() => setRemoving(undefined)}>{error && <p role="alert" className="status-error">{error}</p>}<p>此操作删除笔记。已经加入探索的摘录会独立保留。建议先导出备份。</p><AppLink to="/backup">前往备份与恢复</AppLink><div className="form-actions"><button className="danger-action" onClick={remove}>确认删除笔记</button><button className="secondary-action" onClick={() => setRemoving(undefined)}>取消</button></div></Dialog>}
  </main>;
}
