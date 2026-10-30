import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Formula } from '../reader/Markdown';
import { currentNotebook, NOTEBOOK_LIMITS } from '../../shared/research-notebook.mjs';
import { isSafeExternalUrl } from '../../shared/content-policy.mjs';
import { notebookFileName, renderResearchNotebook, restoreResearchNotebook, saveResearchNotebook } from '../research/notebook-actions';
import { ConflictError } from '../records/store';
import type { Exploration } from '../records/types';
import { clearDraft, getDraft, keepDraft } from '../ui/drafts';
import { Dialog } from '../ui/Dialog';
import { AppLink } from '../app/navigation';
import './research-notebook.css';

type NotebookDraft = { body: string; base: Exploration };
const dateLabel = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const errorText = (error: unknown) => error instanceof Error ? error.message : '保存未完成，草稿仍然保留。';
const internalGuide = (url: string) => /^\/read\/[a-z0-9-]+\/[1-9][0-9]*(#[a-z0-9-]+)?$/.test(url);
function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Personal Markdown never executes HTML or loads remote images on opening a direction. */
export function NotebookText({ body }: { body: string }) {
  return <div className="notebook-prose"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    urlTransform={url => isSafeExternalUrl(url) || internalGuide(url) ? url : ''}
    components={{ a: ({ href, children }) => href ? internalGuide(href) ? <AppLink to={href}>{children}</AppLink> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span className="notebook-image-alt">[图片：{alt || '未显示'}]</span>,
      pre: ({ children }) => <div className="notebook-code-block">{children}</div>,
      code: ({ className, children }) => className?.includes('language-math') ? <Formula source={String(children).trimEnd()} display={className.includes('math-display')} /> : <code className={className}>{children}</code>,
      table: ({ children }) => <div className="notebook-table" role="region" tabIndex={0} aria-label="研究记录表格，可横向滚动"><table>{children}</table></div>,
    }}>{body}</ReactMarkdown></div>;
}

/** Deleting a direction elsewhere must not strand the editor buffer left on this page. */
export function NotebookDraftRecovery({ explorationId }: { explorationId: string }) {
  const draft = getDraft<NotebookDraft>(`research-notebook:${explorationId}`);
  if (!draft) return null;
  return <section className="research-notebook notebook-recovery"><div className="notebook-heading"><h2>未保存的研究记录</h2></div><div className="notebook-editor"><p className="exploration-small">方向已经不可用，下面的草稿仍可复制或下载。</p><textarea readOnly aria-label="可恢复的研究记录草稿" value={draft.body} /><button type="button" className="notebook-plain" onClick={() => download('research-notebook-draft.md', draft.body)}>下载草稿</button></div></section>;
}

/** A direction's living document; the editor buffer is deliberately separate from saved versions. */
export function ResearchNotebook({ record, onDiscuss }: { record: Exploration; onDiscuss: (question: string) => void }) {
  const draftKey = `research-notebook:${record.id}`;
  const [cached] = useState(() => getDraft<NotebookDraft>(draftKey));
  const [editing, setEditing] = useState(Boolean(cached));
  const [base, setBase] = useState(cached?.base ?? record);
  const [body, setBody] = useState(cached?.body ?? currentNotebook(record.research?.notebook)?.body ?? '');
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<Exploration | null>();
  const input = useRef<HTMLTextAreaElement>(null), writeButton = useRef<HTMLButtonElement>(null);
  const current = currentNotebook(record.research?.notebook);
  const dirty = editing && body !== (currentNotebook(base.research?.notebook)?.body ?? '');
  useEffect(() => {
    if (dirty) keepDraft(draftKey, { body, base } satisfies NotebookDraft);
    else clearDraft(draftKey);
  }, [draftKey, dirty, body, base]);
  useEffect(() => { if (editing && !preview) input.current?.focus({ preventScroll: true }); }, [editing, preview]);
  function edit() {
    setBase(record); setBody(current?.body ?? ''); setError(''); setNotice(''); setConflict(undefined); setEditing(true); setPreview(false);
  }
  async function save() {
    if (busy || body.length > NOTEBOOK_LIMITS.body) return;
    setBusy(true); setError('');
    try {
      const result = await saveResearchNotebook(base, body);
      clearDraft(draftKey); setEditing(false); setBase(result.record); setConflict(undefined);
      setNotice(`已保存研究记录 · 第 ${result.version.version} 版`);
      requestAnimationFrame(() => writeButton.current?.focus({ preventScroll: true }));
    } catch (reason) {
      setError(errorText(reason));
      if (reason instanceof ConflictError) setConflict(reason.current as Exploration | null);
    } finally { setBusy(false); }
  }
  function cancel() {
    // Cancellation explicitly discards only this unsaved buffer, never a saved version.
    clearDraft(draftKey); setEditing(false); setError(''); setConflict(undefined); setNotice('');
    requestAnimationFrame(() => writeButton.current?.focus({ preventScroll: true }));
  }
  return <section className="research-notebook" aria-labelledby="notebook-heading" aria-busy={busy || undefined}>
    <div className="notebook-heading"><div><h2 id="notebook-heading">研究记录</h2><p className="notebook-meta">{current ? `第 ${current.version} 版 · ${current.author === 'assistant' ? 'AI 整理' : '手动写入'} · ${dateLabel(current.createdAt)}` : '从一个想法开始，慢慢写成你的研究过程。'}</p></div>
      {!editing && <div className="notebook-tools"><button ref={writeButton} type="button" className="notebook-write" onClick={edit}>{current ? '编辑' : '开始记录'}</button><button type="button" onClick={() => onDiscuss('/记录 请结合已保存的研究记录和我们的讨论，整理这次新增的想法、问题、尝试与阶段收获，更新研究记录。保留我的判断和尚未解决的问题；没有依据的内容明确标为待验证，不要替我宣布研究结束。')}>让 AI 整理</button>{current && <><button type="button" onClick={() => download(notebookFileName(record), renderResearchNotebook(record))}>下载</button><button type="button" onClick={() => setHistory(true)}>历史 · {record.research!.notebook!.versions.length}</button></>}</div>}
    </div>
    {editing ? <div className="notebook-editor">
      <div className="notebook-editor-bar"><span>编辑研究记录 <span className="notebook-unsaved">{dirty ? '· 未保存' : ''}</span></span><button type="button" disabled={busy} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? '继续编辑' : '预览排版'}</button></div>
      {preview ? <div className="notebook-draft-preview">{body ? <NotebookText body={body} /> : <p className="notebook-meta">写入内容后可在这里预览。</p>}</div> : <textarea ref={input} aria-label="研究记录正文" value={body} disabled={busy} onChange={event => setBody(event.target.value)} placeholder="今天读到或想到什么？有哪些疑问，做过哪些尝试？也可以写下阶段收获、改变的判断，以及接下来想做的事。" spellCheck={false} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); } }} />}
      <p className="notebook-editor-help">支持 Markdown；保存后才会进入 AI 的方向上下文。<span className={body.length > NOTEBOOK_LIMITS.body ? 'is-over-limit' : ''}>{body.length.toLocaleString()} / {NOTEBOOK_LIMITS.body.toLocaleString()} 字符</span></p>
      {error && <p className="notebook-error" role="alert">{error}</p>}
      {conflict !== undefined && <div className="notebook-conflict">{conflict ? <><details open><summary>比较当前已保存的记录</summary>{currentNotebook(conflict.research?.notebook)?.body ? <NotebookText body={currentNotebook(conflict.research?.notebook)!.body} /> : <p>当前还没有研究记录正文。</p>}</details><p>你的草稿保留在上方。可先合并需要保留的内容，再继续保存。</p><button type="button" disabled={busy} onClick={() => { setBase(conflict); setConflict(undefined); setError(''); setNotice('已按最新版本继续编辑；请核对草稿后保存。'); }}>已比较，按最新版本继续编辑</button></> : <p>这个方向已被删除；请先复制或下载上方草稿。</p>}</div>}
      <div className="notebook-editor-actions"><button type="button" className="primary-action" disabled={busy || !body.trim() || body.length > NOTEBOOK_LIMITS.body || conflict !== undefined} onClick={() => void save()}>{busy ? '正在保存…' : '保存记录'}</button><button type="button" className="exploration-secondary" disabled={busy} onClick={cancel}>取消编辑</button><button type="button" className="notebook-plain" disabled={!body} onClick={() => download('research-notebook-draft.md', body)}>下载草稿</button></div>
    </div> : current ? <div className="notebook-page"><NotebookText body={current.body} /></div> : <div className="notebook-empty"><p>随手的想法和疑问、阅读中的理解、实践的结果，都可以留在这里。</p><p>边写边讨论，让 AI 帮你整理。只想了解和实践时，写下已达到的目标；想进一步写论文时，这些积累就是起点。</p><button type="button" onClick={edit}>写下第一段 →</button></div>}
    {notice && <p className="notebook-notice" role="status">{notice}</p>}
    {history && <NotebookHistory record={record} onClose={() => setHistory(false)} onRestored={version => { setHistory(false); setNotice(`已恢复为第 ${version} 版，原有历史仍保留。`); }} />}
  </section>;
}

function NotebookHistory({ record, onClose, onRestored }: { record: Exploration; onClose: () => void; onRestored: (version: number) => void }) {
  const versions = record.research?.notebook?.versions ?? [];
  const [selected, setSelected] = useState(versions.at(-1)!.version), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const version = versions.find(item => item.version === selected)!;
  async function restore() {
    if (busy) return; setBusy(true); setError('');
    try { const result = await restoreResearchNotebook(record, selected); onRestored(result.version.version); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <Dialog title="研究记录历史" onClose={onClose} busy={busy} className="notebook-history-dialog">
    <div className="notebook-history-controls"><label>查看版本<select aria-label="研究记录版本" disabled={busy} value={selected} onChange={event => { setSelected(Number(event.target.value)); setError(''); }}>{[...versions].reverse().map(item => <option key={item.version} value={item.version}>第 {item.version} 版 · {item.author === 'assistant' ? 'AI 整理' : '手动写入'} · {dateLabel(item.createdAt)}{item.version === versions.at(-1)?.version ? ' · 当前' : ''}</option>)}</select></label><button type="button" disabled={busy} onClick={() => download(notebookFileName(record).replace(/\.md$/, `-v${selected}.md`), renderResearchNotebook(record, selected))}>下载此版</button></div>
    <div className="notebook-history-body"><NotebookText body={version.body} /></div>
    {error && <p className="notebook-error" role="alert">{error}</p>}
    <div className="notebook-history-footer"><p>恢复会保存为新的一版，之后的记录也会保留。</p><button type="button" className="primary-action" disabled={busy || selected === versions.at(-1)?.version} onClick={() => void restore()}>{busy ? '正在恢复…' : '恢复为新版本'}</button></div>
  </Dialog>;
}
