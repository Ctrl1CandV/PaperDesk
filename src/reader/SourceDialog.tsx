import { useEffect, useRef } from 'react';
import type { Citation, Guide } from '../content/types';
import { coverageLabel } from '../content/labels';

export interface SourceSelection { citation: Citation; label: string; trigger: HTMLButtonElement }
export function SourceDialog({ selection, guide, onClose }: { selection: SourceSelection; guide: Guide; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const y = window.scrollY;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = previousOverflow;
      window.scrollTo(0, y);
      document.getElementById(selection.trigger.id)?.focus({ preventScroll: true });
      requestAnimationFrame(() => document.getElementById(selection.trigger.id)?.focus({ preventScroll: true }));
    };
  }, [selection]);
  const { citation, label } = selection;
  return <dialog ref={ref} className="source-dialog" aria-labelledby="source-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const targets = Array.from(ref.current!.querySelectorAll<HTMLElement>('button, a[href]'));
    const first = targets[0], last = targets.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div className="dialog-heading"><span className="eyebrow">对照与查证</span><button autoFocus className="close-source" onClick={onClose}>返回阅读 <span aria-hidden="true">×</span></button></div>
    <h2 id="source-title">来源详情</h2>
    <p className="source-locator">{label}</p>
    <dl className="source-facts">
      <div><dt>来源用途</dt><dd>{citation.role === 'primary' ? '本文原始来源' : '补充背景来源'}</dd></div>
      <div><dt>来源版本</dt><dd>{citation.sourceVersion ?? '未指定固定版本'}</dd></div>
      <div><dt>当前导读</dt><dd>修订 {guide.metadata.revision} · {coverageLabel(guide.metadata.coverage.scope)}</dd></div>
    </dl>
    {citation.role === 'primary' && <p className="source-paper">{guide.metadata.paperTitle}</p>}
    <p className="manual-locator">若网页未跳至指定章节，或 PDF 未跳至对应页，请按上方章节、图号或页码手动查找。PDF 页码从文件第 1 页起算。</p>
    <p className="source-url">{citation.url}</p>
    <a className="primary-action" href={citation.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">打开原文（新标签页） <span aria-hidden="true">↗</span></a>
    <p className="dialog-footnote">阅读页会保持当前位置。打开来源不会标记导读或原论文已读。</p>
  </dialog>;
}
