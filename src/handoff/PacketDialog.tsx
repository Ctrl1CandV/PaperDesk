import { useEffect, useRef, useState } from 'react';
import type { Guide } from '../content/types';
import type { Exploration, Note, SourceSnapshot } from '../records/types';
import { personalStore } from '../records/store';
import { Dialog } from '../ui/Dialog';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';

export interface ReadingContext { guide: Guide; unitId: string; text: string; locator: string; sources: SourceSnapshot[] }
const formatSources = (sources: SourceSnapshot[]) => sources.length ? sources.map(source => `- ${source.label} | ${source.version ?? '版本未指定'} | ${source.url}`).join('\n') : '本段没有匹配到来源链接，请结合导读的来源定位查证。';
export function readingPacket(context: ReadingContext, question: string, notes: Note[]) {
  const { metadata } = context.guide;
  return `阅读上下文\n论文：${metadata.paperTitle}\n论文标识：${metadata.paperId}\n主要来源：${metadata.source.url}\n来源版本：${metadata.source.version ?? '未指定'}\n导读：${metadata.title}（修订 ${metadata.revision}）\n位置：${context.locator}\n返回：/read/${metadata.id}/${metadata.revision}#${context.unitId}\n\n导读摘录（不等于原文摘录）：\n${context.text}\n\n相关来源：\n${formatSources(context.sources)}\n\n覆盖范围：${metadata.coverage.scope}\n覆盖缺口：\n${metadata.coverage.limitations.map(item => `- ${item}`).join('\n')}\n来源审阅基础：${metadata.coverage.reviewBasis}\n\n本次问题（读者输入）：\n${question || '尚未填写'}${notes.length ? `\n\n明确选入的个人笔记（读者撰写）：\n${notes.map(note => note.text).join('\n\n')}` : ''}`;
}
function explorationPacket(record: Exploration, included: Set<string>) {
  const blocks = ['研究探索上下文', '以下是读者保存的探索材料，不能单独证明研究空白、构想有效或已阅读原文。'];
  if (included.has('question')) blocks.push(`读者的问题：${record.title}\n${record.question}`);
  for (const evidence of record.evidence.filter(item => included.has(item.id))) {
    const attribution = evidence.provenance === 'guide-excerpt' ? `导读摘录，修订 ${evidence.target.revision}\n返回：/read/${evidence.target.guideId}/${evidence.target.revision}#${evidence.target.unitId}\n${formatSources(evidence.sources)}` : evidence.provenance === 'original-excerpt' ? `原文摘录（由读者手动标注，未独立核验）\n来源：${evidence.source.identity}\n定位：${evidence.source.locator}\n版本：${evidence.source.version ?? '未指定'}` : '读者观察（读者撰写）';
    blocks.push(`${attribution}\n${evidence.text}${evidence.comment ? `\n读者备注：${evidence.comment}` : ''}`);
  }
  if (included.has('interpretation')) blocks.push(`读者的解释：\n${record.interpretation || '尚未填写'}`);
  if (included.has('unknowns')) blocks.push(`读者仍不确定的内容：\n${record.unknowns || '尚未填写'}`);
  if (included.has('nextAction')) blocks.push(`读者选择的下一步：\n${record.nextAction?.description ?? '尚未选择'}${record.nextAction?.target ? `\n返回：/read/${record.nextAction.target.guideId}/${record.nextAction.target.revision}#${record.nextAction.target.unitId}` : ''}`);
  return blocks.join('\n\n');
}
export function PacketDialog({ reading, exploration, onClose }: { reading?: ReadingContext; exploration?: Exploration; onClose: () => void }) {
  const draftKey = reading ? `packet:reading:${reading.guide.metadata.id}/${reading.guide.metadata.revision}/${reading.unitId}:${reading.text}` : `packet:exploration:${exploration?.id}/${exploration?.recordRevision}`;
  const [cached] = useState(() => getDraft<{ included: string[]; question: string; preview: string; manual: boolean; pending: boolean }>(draftKey));
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteLoad, setNoteLoad] = useState<'loading' | 'ready' | 'error'>(reading ? 'loading' : 'ready');
  const [noteRetry, setNoteRetry] = useState(0);
  const [included, setIncluded] = useState(new Set<string>(cached?.included));
  const [question, setQuestion] = useState(cached?.question ?? '');
  const [preview, setPreview] = useState(() => cached?.preview ?? (reading ? readingPacket(reading, '', []) : exploration ? explorationPacket(exploration, new Set()) : ''));
  const [manual, setManual] = useState(cached?.manual ?? false);
  const [pending, setPending] = useState(cached?.pending ?? false);
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const sourceSelection = JSON.stringify([question, [...included].sort()]);
  const previousSelection = useRef(sourceSelection);
  const dirty = Boolean(question || included.size || manual);
  const unavailableNotes = Boolean(reading && included.size && (noteLoad === 'error' || (noteLoad === 'ready' && [...included].some(id => !notes.some(note => note.id === id)))));
  const sourceBlocked = noteLoad === 'loading' || unavailableNotes;
  useUnloadWarning(dirty);
  const generate = () => reading ? readingPacket(reading, question, notes.filter(note => included.has(note.id))) : exploration ? explorationPacket(exploration, included) : '';
  useEffect(() => {
    let live = true;
    if (reading) {
      setNoteLoad('loading');
      personalStore.list('notes').then(items => { if (live) { setNotes(items.filter(note => note.guideId === reading.guide.metadata.id && note.revision === reading.guide.metadata.revision && note.unitId === reading.unitId)); setNoteLoad('ready'); } }).catch(() => { if (live) setNoteLoad('error'); });
    }
    return () => { live = false; };
  }, [reading, noteRetry]);
  useEffect(() => {
    if (previousSelection.current === sourceSelection) return;
    previousSelection.current = sourceSelection;
    if (manual) setPending(true);
    else { setPreview(generate()); setPending(false); }
    setMessage('');
    // Only deliberate source selections trigger regeneration. Late optional notes
    // and manually edited text never overwrite the current exact preview.
  }, [sourceSelection]);
  useEffect(() => { if (dirty) keepDraft(draftKey, { included: [...included], question, preview, manual, pending }); else clearDraft(draftKey); }, [draftKey, dirty, included, question, preview, manual, pending]);
  function toggle(key: string) { setIncluded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  async function copy() {
    setCopying(true); setMessage('');
    try { if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable'); await navigator.clipboard.writeText(preview); setMessage('已复制。仅复制上方预览内容，未发送到任何服务。'); }
    catch { setMessage('自动复制不可用。请选中下方预览，使用 Ctrl+C 或系统复制操作。'); }
    finally { setCopying(false); }
  }
  return <Dialog title={reading ? '复制阅读上下文' : '复制探索上下文'} onClose={onClose} className="packet-dialog" busy={copying}>
    <p className="quiet-copy">预览就是将要复制的全部内容，可直接编辑。不会自动发送给模型或其他服务。</p>
    {noteLoad === 'loading' && <p className="draft-hint" role="status">正在读取本章可选笔记。已有预览保持不变，加载完成后可调整问题与选入项。</p>}
    {noteLoad === 'error' && <p className="draft-hint" role="alert">本章笔记暂时无法读取，当前预览未改动。<button className="text-action" disabled={copying} onClick={() => setNoteRetry(value => value + 1)}>重试读取笔记</button></p>}
    {unavailableNotes && <div className="preview-update"><p>此前选入的部分笔记当前无法读取。你仍可检查并复制已有预览；重建前请先移除不可用的选入项。</p><button className="text-action" disabled={copying} onClick={() => setIncluded(previous => new Set([...previous].filter(id => noteLoad === 'ready' && notes.some(note => note.id === id))))}>移除不可用的笔记选项</button></div>}
    {cached && <p className="draft-hint">已恢复本次会话中这份上下文的草稿，包括此前明确选入的内容。请检查完整预览。</p>}
    {reading && <><label className="field-label">这次想问什么？<textarea aria-label="这次想问什么？" disabled={copying || sourceBlocked} rows={2} value={question} maxLength={6000} onChange={event => setQuestion(event.target.value)} /></label>{notes.length > 0 && <fieldset disabled={copying || sourceBlocked}><legend>可选个人笔记（默认不包含）</legend>{notes.map(note => <label className="check-row" key={note.id}><input type="checkbox" checked={included.has(note.id)} onChange={() => toggle(note.id)} /><span>{note.text}</span></label>)}</fieldset>}</>}
    {exploration && <fieldset disabled={copying}><legend>明确选择要包含的个人内容</legend>{[['question', '问题'], ['interpretation', '我的解释'], ['unknowns', '仍不确定'], ['nextAction', '下一步']].map(([id, label]) => <label key={id} className="check-row"><input type="checkbox" checked={included.has(id)} onChange={() => toggle(id)} />{label}</label>)}{exploration.evidence.map((item, index) => <label className="check-row" key={item.id}><input type="checkbox" checked={included.has(item.id)} onChange={() => toggle(item.id)} /><span>证据 {index + 1} · {item.provenance === 'guide-excerpt' ? '导读摘录' : item.provenance === 'original-excerpt' ? '原文摘录（手动归属）' : '读者观察'}<span className="packet-excerpt">{item.text}</span></span></label>)}</fieldset>}
    {pending && <div className="preview-update" role="alert"><p>选项或问题已变更，手动编辑的预览尚未被覆盖。请决定本次复制采用哪份内容。</p><div className="draft-actions"><button className="secondary-action" disabled={sourceBlocked} onClick={() => { setPreview(generate()); setManual(false); setPending(false); }}>按当前选项重建预览</button><button className="text-action" onClick={() => setPending(false)}>继续使用手改预览</button></div></div>}
    <p className="quiet-copy">{manual ? '当前使用手动编辑的预览；复制始终以下方文字为准。' : '更改问题或选入项会更新预览。'}{preview.length.toLocaleString()} / 12,000 字符</p>
    <label className="field-label">完整复制预览<textarea disabled={copying} aria-label="完整复制预览" className="packet-preview" rows={14} value={preview} onChange={event => { setPreview(event.target.value); setManual(true); setMessage(''); }} spellCheck={false} /></label>
    {preview.length > 12000 && <p className="status-error" role="alert">超过 12,000 字符，请在预览中缩短内容后再复制；没有自动截断。</p>}
    {message && <p className="status-message" role="status">{message}</p>}
    <p className="draft-hint">关闭会保留本次会话的草稿；刷新或关闭浏览器前请自行复制需要保留的内容。</p>
    <div className="form-actions"><button className="primary-action" disabled={copying || noteLoad === 'loading' || pending || !preview.trim() || preview.length > 12000} onClick={copy}>{copying ? '正在复制…' : '复制预览内容'}</button><button className="secondary-action" disabled={copying || noteLoad === 'loading' || pending} onClick={event => { const textarea = event.currentTarget.closest('dialog')!.querySelector<HTMLTextAreaElement>('.packet-preview')!; textarea.focus(); textarea.select(); }}>选中预览手动复制</button><button className="text-action" disabled={copying} onClick={onClose}>收起面板</button>{dirty && <button className="text-action" disabled={copying} onClick={() => { clearDraft(draftKey); onClose(); }}>丢弃草稿</button>}</div>
  </Dialog>;
}
