import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Formula } from '../reader/Markdown';
import { currentNotebook, NOTEBOOK_LIMITS, WORKING_PAPER_SECTIONS } from '../../shared/research-notebook.mjs';
import { isSafeExternalUrl } from '../../shared/content-policy.mjs';
import { notebookFileName, renderResearchNotebook, restoreResearchNotebook, saveResearchNotebook, templateFromRecord } from '../research/notebook-actions';
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
const HINT = '\u2063';
const becomes = new Map(WORKING_PAPER_SECTIONS.map(section => [section.heading, section.becomes]));
const plainText = (node: React.ReactNode): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(plainText).join('') : '';
/** Personal Markdown never executes HTML or loads remote images on opening a direction. */
export function NotebookText({ body }: { body: string }) {
  // An empty section's <!-- hint --> is shown as a quiet placeholder instead of disappearing.
  const text = body.replace(/^[ \t]*<!--\s*(.+?)\s*-->[ \t]*$/gm, `${HINT}$1`);
  return <div className="notebook-prose"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    urlTransform={url => isSafeExternalUrl(url) || internalGuide(url) ? url : ''}
    components={{ a: ({ href, children }) => href ? internalGuide(href) ? <AppLink to={href}>{children}</AppLink> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span className="notebook-image-alt">[图片：{alt || '未显示'}]</span>,
      pre: ({ children }) => <div className="notebook-code-block">{children}</div>,
      code: ({ className, children }) => className?.includes('language-math') ? <Formula source={String(children).trimEnd()} display={className.includes('math-display')} /> : <code className={className}>{children}</code>,
      table: ({ children }) => <div className="notebook-table" role="region" tabIndex={0} aria-label="工作稿表格，可横向滚动"><table>{children}</table></div>,
      p: ({ children }) => { const value = plainText(children); return value.startsWith(HINT) ? <p className="notebook-placeholder">{value.slice(1)}</p> : <p>{children}</p>; },
      h2: ({ children }) => { const role = becomes.get(plainText(children).trim()); return <h2>{children}{role && <span className="section-becomes" aria-hidden="true">{role}</span>}</h2>; },
    }}>{text}</ReactMarkdown></div>;
}

/** Deleting a direction elsewhere must not strand the editor buffer left on this page. */
export function NotebookDraftRecovery({ explorationId }: { explorationId: string }) {
  const draft = getDraft<NotebookDraft>(`research-notebook:${explorationId}`);
  if (!draft) return null;
  return <section className="research-notebook notebook-recovery"><div className="notebook-heading"><h2>未保存的研究工作稿</h2></div><div className="notebook-editor"><p className="exploration-small">方向已经不可用，下面的草稿仍可复制或下载。</p><textarea readOnly aria-label="可恢复的工作稿草稿" value={draft.body} /><button type="button" className="notebook-plain" onClick={() => download('research-notebook-draft.md', draft.body)}>下载草稿</button></div></section>;
}

/**
 * The direction's working paper: one Markdown document the reader and the AI both
 * revise, shaped like the opening file of a paper project. The editor buffer is
 * deliberately separate from saved versions.
 */
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
  function edit(start = current?.body ?? '') {
    setBase(record); setBody(start); setError(''); setNotice(''); setConflict(undefined); setEditing(true); setPreview(false);
  }
  async function save() {
    if (busy || body.length > NOTEBOOK_LIMITS.body) return;
    setBusy(true); setError('');
    try {
      const result = await saveResearchNotebook(base, body);
      clearDraft(draftKey); setEditing(false); setBase(result.record); setConflict(undefined);
      setNotice(`已保存工作稿 · 第 ${result.version.version} 版`);
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
  const author = (version: { author: string }) => version.author === 'assistant' ? 'AI 整理' : '手动写入';
  return <section className="research-notebook" aria-labelledby="notebook-heading" aria-busy={busy || undefined}>
    <div className="notebook-heading"><div><h2 id="notebook-heading">研究工作稿</h2>{current ? <p className="notebook-meta"><button type="button" className="notebook-version" aria-label={`查看历史版本（共 ${record.research!.notebook!.versions.length} 版）`} title="查看历史与改动" onClick={() => setHistory(true)}>第 {current.version} 版 · {author(current)} · {dateLabel(current.createdAt)}</button>{current.note && <span className="notebook-note" title={current.note}>{current.note}</span>}</p> : <p className="notebook-meta">还没有工作稿</p>}</div>
      {!editing && current && <div className="notebook-tools"><button ref={writeButton} type="button" onClick={() => edit()}>编辑</button><button type="button" onClick={() => onDiscuss('/记录 把最近讨论中的新认识和进展整理进工作稿')}>让 AI 整理</button></div>}
    </div>
    {editing ? <div className="notebook-editor">
      <div className="notebook-editor-bar"><span>编辑工作稿 <span className="notebook-unsaved">{dirty ? '· 未保存' : ''}</span></span><button type="button" disabled={busy} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? '继续编辑' : '预览排版'}</button></div>
      {preview ? <div className="notebook-draft-preview">{body ? <NotebookText body={body} /> : <p className="notebook-meta">写入内容后可在这里预览。</p>}</div> : <textarea ref={input} aria-label="研究工作稿正文" value={body} disabled={busy} onChange={event => setBody(event.target.value)} placeholder="今天读到或想到什么？有哪些疑问，做过哪些尝试？也可以写下阶段收获、改变的判断，以及接下来想做的事。" spellCheck={false} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); } }} />}
      <p className="notebook-editor-help"><span>支持 Markdown。二级标题对应论文的各个部分，可以改名或删除；&lt;!-- --&gt; 里是空小节的提示。保存后才会进入 AI 的方向上下文。</span><span className={body.length > NOTEBOOK_LIMITS.body ? 'is-over-limit' : ''}>{body.length.toLocaleString()} / {NOTEBOOK_LIMITS.body.toLocaleString()} 字符</span></p>
      {error && <p className="notebook-error" role="alert">{error}</p>}
      {conflict !== undefined && <div className="notebook-conflict">{conflict ? <><details open><summary>比较当前已保存的记录</summary>{currentNotebook(conflict.research?.notebook)?.body ? <NotebookText body={currentNotebook(conflict.research?.notebook)!.body} /> : <p>当前还没有研究记录正文。</p>}</details><p>你的草稿保留在上方。可先合并需要保留的内容，再继续保存。</p><button type="button" disabled={busy} onClick={() => { setBase(conflict); setConflict(undefined); setError(''); setNotice('已按最新版本继续编辑；请核对草稿后保存。'); }}>已比较，按最新版本继续编辑</button></> : <p>这个方向已被删除；请先复制或下载上方草稿。</p>}</div>}
      <div className="notebook-editor-actions"><button type="button" className="primary-action" disabled={busy || !body.trim() || body.length > NOTEBOOK_LIMITS.body || conflict !== undefined} onClick={() => void save()}>{busy ? '正在保存…' : '保存工作稿'}</button><button type="button" className="exploration-secondary" disabled={busy} onClick={cancel}>取消编辑</button><button type="button" className="notebook-plain" disabled={!body} onClick={() => download('research-notebook-draft.md', body)}>下载草稿</button></div>
    </div> : current ? <div className="notebook-page"><NotebookText body={current.body} /></div> : <div className="notebook-empty">
      <p>工作稿是这个方向的研究底稿，你和 AI 都可以改。读书、讨论中的收获随时写进来；觉得可以做实验了，导出就是论文项目的起始文件。</p>
      <ol className="notebook-outline">{WORKING_PAPER_SECTIONS.map(section => <li key={section.heading}><strong>{section.heading}</strong><span>{section.hint}</span><em>{section.becomes}</em></li>)}</ol>
      <div className="notebook-empty-actions"><button ref={writeButton} type="button" className="primary-action" onClick={() => edit(templateFromRecord(record))}>按这个骨架开始写</button><button type="button" className="exploration-secondary" onClick={() => onDiscuss('/记录 根据这个方向已有的记录和我们的讨论，起草第一版工作稿')}>让 AI 根据讨论起草</button></div>
    </div>}
    {notice && <p className="notebook-notice" role="status">{notice}</p>}
    {history && <NotebookHistory record={record} onClose={() => setHistory(false)} onRestored={version => { setHistory(false); setNotice(`已恢复为第 ${version} 版，原有历史仍保留。`); }} />}
  </section>;
}

type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };
/** Line-level comparison; very large documents fall back to showing the version alone. */
function lineDiff(before: string, after: string): DiffLine[] | undefined {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length * b.length > 4_000_000) return undefined;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const lines: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { lines.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (j < b.length && (i === a.length || rows[i][j + 1] >= rows[i + 1][j])) lines.push({ kind: 'added', text: b[j++] });
    else lines.push({ kind: 'removed', text: a[i++] });
  }
  return lines;
}
function VersionDiff({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  if (!lines) return <p className="notebook-meta">正文较长，无法逐行比较；可以分别下载两版对照。</p>;
  if (!lines.some(line => line.kind !== 'same')) return <p className="notebook-meta">与上一版相同。</p>;
  // Long unchanged stretches fold away so the changes stay in view.
  const shown: (DiffLine | { kind: 'gap'; count: number })[] = [];
  lines.forEach((line, index) => {
    const near = lines.slice(Math.max(0, index - 2), index + 3).some(item => item.kind !== 'same');
    if (line.kind !== 'same' || near) shown.push(line);
    else { const last = shown.at(-1); if (last?.kind === 'gap') last.count++; else shown.push({ kind: 'gap', count: 1 }); }
  });
  return <div className="notebook-diff" role="region" tabIndex={0} aria-label="与上一版的逐行比较">{shown.map((line, index) => line.kind === 'gap'
    ? <p key={index} className="diff-gap">未改动 {line.count} 行</p>
    : <p key={index} className={`diff-${line.kind}`}><span aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span><span className="visually-hidden">{line.kind === 'added' ? '新增：' : line.kind === 'removed' ? '删除：' : ''}</span>{line.text || ' '}</p>)}</div>;
}

function NotebookHistory({ record, onClose, onRestored }: { record: Exploration; onClose: () => void; onRestored: (version: number) => void }) {
  const versions = record.research?.notebook?.versions ?? [];
  const [selected, setSelected] = useState(versions.at(-1)!.version), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [compare, setCompare] = useState(false);
  const version = versions.find(item => item.version === selected)!;
  const previous = versions.find(item => item.version === selected - 1);
  async function restore() {
    if (busy) return; setBusy(true); setError('');
    try { const result = await restoreResearchNotebook(record, selected); onRestored(result.version.version); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  const author = (item: { author: string }) => item.author === 'assistant' ? 'AI 整理' : '手动写入';
  return <Dialog title="工作稿历史" onClose={onClose} busy={busy} className="notebook-history-dialog">
    <div className="notebook-history-controls"><label>查看版本<select aria-label="工作稿版本" disabled={busy} value={selected} onChange={event => { setSelected(Number(event.target.value)); setError(''); }}>{[...versions].reverse().map(item => <option key={item.version} value={item.version}>第 {item.version} 版 · {author(item)} · {dateLabel(item.createdAt)}{item.version === versions.at(-1)?.version ? ' · 当前' : ''}</option>)}</select></label>
      {previous && <label className="notebook-compare"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />与上一版对比</label>}
      <button type="button" disabled={busy} onClick={() => download(notebookFileName(record).replace(/\.md$/, `-v${selected}.md`), renderResearchNotebook(record, selected))}>下载此版</button></div>
    {version.note && <p className="notebook-history-note">这一版：{version.note}</p>}
    <div className="notebook-history-body">{compare && previous ? <VersionDiff before={previous.body} after={version.body} /> : <NotebookText body={version.body} />}</div>
    {error && <p className="notebook-error" role="alert">{error}</p>}
    <div className="notebook-history-footer"><p>恢复会保存为新的一版，之后的版本也会保留。</p><button type="button" className="primary-action" disabled={busy || selected === versions.at(-1)?.version} onClick={() => void restore()}>{busy ? '正在恢复…' : '恢复为新版本'}</button></div>
  </Dialog>;
}
