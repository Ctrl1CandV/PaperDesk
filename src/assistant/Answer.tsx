import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { contentRepository } from '../content/repository';
import { AppLink } from '../app/navigation';
import { Dialog } from '../ui/Dialog';
import { Formula } from '../reader/Markdown';
import { isSafeExternalUrl } from '../../shared/content-policy.mjs';
import { getAiStatus, type AiSource, type AiTurn } from './api';
import { ResearchSnapshotView } from './ResearchProposals';
import { ResearchMaterialsView } from './ResearchMaterials';

const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : '操作未完成，请保留草稿并重试。';

function sourceTarget(source: AiSource): string | undefined {
  if (source.kind === 'web' || source.kind === 'original') return source.url && isSafeExternalUrl(source.url) ? source.url : undefined;
  if (!source.guideId || !Number.isSafeInteger(source.revision) || !source.unitId) return;
  const guide = contentRepository.getSummary(source.guideId, source.revision!);
  return guide?.units.some(unit => unit.id === source.unitId)
    ? `/read/${source.guideId}/${source.revision}#${source.unitId}` : undefined;
}
function citationPlugin(sources: AiSource[], turnId: string) {
  const known = new Set(sources.map(source => source.id));
  return function plugin() {
    return (tree: any) => {
      visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
        if (index === undefined || !parent || ['link', 'linkReference'].includes(parent.type)) return;
        const parts: any[] = []; let offset = 0;
        for (const match of node.value.matchAll(/\[([LOW][1-9]\d{0,3})\]/g)) {
          if (!known.has(match[1])) continue;
          if (match.index > offset) parts.push({ type: 'text', value: node.value.slice(offset, match.index) });
          parts.push({ type: 'link', url: `#ai-source-${turnId}-${match[1]}`, children: [{ type: 'text', value: match[0] }] });
          offset = match.index + match[0].length;
        }
        if (!parts.length) return;
        if (offset < node.value.length) parts.push({ type: 'text', value: node.value.slice(offset) });
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      });
    };
  };
}
function revealCitation(id: string) {
  const element = document.getElementById(id);
  const details = element?.closest('details');
  if (details) details.open = true;
  element?.focus({ preventScroll: true });
  const container = element?.closest('.ai-messages');
  if (container && element) container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 18;
}
export function Sources({ sources, turnId }: { sources: AiSource[]; turnId: string }) {
  if (!sources.length) return null;
  return <details className="ai-sources"><summary>查看依据 · {sources.length}</summary>
    <ol>{sources.map((source, index) => {
      const target = sourceTarget(source);
      return <li key={`${source.id}-${index}`} id={`ai-source-${turnId}-${source.id}`} tabIndex={-1}><div className="ai-source-heading"><span className="ai-source-id">[{source.id}]</span><span>{source.kind === 'guide' ? '导读章节' : source.kind === 'original' ? '固定原文' : '网页摘录'}{source.version ? ` · ${source.version}` : ''}</span></div>
        {target ? source.kind === 'guide' ? <AppLink to={target}>{source.title}</AppLink> : <a href={target} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <span>{source.title}（原位置暂不可用）</span>}
        <p>{source.text}</p>
        {source.kind === 'original' && <OriginalSource source={source} />}
      </li>;
    })}</ol>
  </details>;
}
function OriginalSource({ source }: { source: AiSource }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function show() {
    setOpen(true); setError(''); setLoading(true);
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    try {
      const status = await getAiStatus(request.signal);
      const response = await fetch(`/api/ai/materials/${source.sourceRevisionId}/${source.parserRevision}/${source.sourceUnitId}`, { signal: request.signal, headers: { 'x-paperdesk-token': status.csrfToken }, cache: 'no-store' });
      if (!response.ok) throw new Error('本地固定材料暂不可用。保留的回答来源仍可阅读，也可打开上方公共原文入口。');
      const value = await response.json();
      if (typeof value.text !== 'string' || value.text.length > 100000) throw new Error('本地材料响应无效。');
      if (!request.signal.aborted) setText(value.text);
    } catch (reason) { if (!request.signal.aborted) setError(errorText(reason)); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  return <><p className="ai-fine-print">{source.locator?.label} · {source.verification === 'visually-checked' ? '对应内容已核图' : source.verification === 'text-checked' ? '已核对文本' : '解析文本，尚未独立核验'}</p>
    {source.gaps?.map(gap => <p className="ai-fine-print" key={gap}>{gap}</p>)}
    <button type="button" className="secondary-action" onClick={() => void show()}>读取本地固定材料</button>
    {open && <Dialog title={source.title} onClose={() => { controller.current?.abort(); setOpen(false); }} className="ai-material-dialog">
      <p>{source.locator?.label}</p><p className="ai-fine-print">这是固定解析版本的文本；表格、公式与图像按上方缺口说明使用。原始 HTML 不在页面执行。</p>
      {loading ? <p role="status">正在读取本地材料…</p> : error ? <p role="alert">{error}</p> : <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>}
    </Dialog>}</>;
}
export function Answer({ turn }: { turn: AiTurn }) {
  const permitted = new Set(turn.sources.map(sourceTarget).filter((value): value is string => Boolean(value)));
  const citations = new Set(turn.sources.map(source => `#ai-source-${turn.id}-${source.id}`));
  citations.forEach(url => permitted.add(url));
  const plugin = useMemo(() => citationPlugin(turn.sources, turn.id), [turn.sources, turn.id]);
  return <div className="ai-answer"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath, plugin]}
    urlTransform={url => permitted.has(url) ? url : ''}
    components={{
      a: ({ href, children }) => !href ? <span>{children}</span> : citations.has(href) ? <a className="ai-citation" href={href} aria-label={`查看来源 ${String(children)}`} onClick={event => { event.preventDefault(); revealCitation(href.slice(1)); }}>{children}</a> : href.startsWith('/read/') ? <AppLink to={href}>{children}</AppLink> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ alt }) => <span className="ai-image-suppressed">{alt ? `图片说明：${alt}` : '图片未加载'}</span>,
      pre: ({ children }) => <div className="ai-code-block">{children}</div>,
      code: ({ className, children }) => className?.includes('language-math')
        ? <Formula source={String(children).trimEnd()} display={className.includes('math-display')} />
        : <code className={className}>{children}</code>,
      table: ({ children }) => <div className="ai-table" tabIndex={0} role="region" aria-label="回答中的表格，可横向滚动"><table>{children}</table></div>,
      h1: ({ children }) => <h4>{children}</h4>, h2: ({ children }) => <h4>{children}</h4>, h3: ({ children }) => <h4>{children}</h4>,
    }}>{turn.answer}</ReactMarkdown></div>;
}
export function AnswerIdentity({ turn }: { turn: AiTurn }) {
  const provider = turn.context?.provider === 'api' ? 'API' : turn.context?.provider === 'chatgpt' ? 'ChatGPT' : undefined;
  const model = typeof turn.context?.model === 'string' ? turn.context.model : undefined;
  const label = provider ? `${provider} · ${model || '模型待确认'}` : model ? `模型：${model}` : turn.status === 'running' ? '正在确认模型' : '此记录未包含模型信息';
  return <p className="ai-answer-model" aria-label="本轮使用的模型">{label}</p>;
}
export function TurnMaterial({ turn }: { turn: AiTurn }) {
  const context = turn.context;
  const guide = typeof context?.guideId === 'string' && typeof context.revision === 'number'
    ? contentRepository.getSummary(context.guideId, context.revision) : undefined;
  const unit = guide?.units.find(item => item.id === context?.unitId);
  const selected = typeof context?.selection === 'string' ? context.selection : '';
  const target = guide && unit ? `/read/${guide.metadata.id}/${guide.metadata.revision}#${unit.id}` : undefined;
  const historyCount = Array.isArray(context?.historyTurnIds) ? context.historyTurnIds.length : undefined;
  return <details className="ai-turn-material"><summary>提问时的资料{unit && <span>{selected ? '选文' : '章节'} · {unit.heading ?? '阅读起点'}</span>}</summary>
    {context?.researchSnapshot && <details><summary>研究快照 · {context.researchSnapshot.title} · r{context.researchSnapshot.recordRevision}</summary><ResearchSnapshotView snapshot={context.researchSnapshot} /><p className="ai-fine-print">快照摘要：{context.researchSnapshot.snapshotSha256}</p></details>}
    {context?.researchMaterials && <ResearchMaterialsView materials={context.researchMaterials} />}
    {context?.topicHistory && <details><summary>带入的主题历史 · {context.topicHistory.turns.length} 条讨论摘要</summary><p>以下用于恢复研究讨论；旧回答不能替代论文证据。</p>{context.topicHistory.turns.map(item => <details key={item.turnId}><summary>{item.question}{item.questionTruncated ? '（问题节选）' : ''}</summary><p>{item.answer}</p>{item.answerTruncated && <p>此回答为预算内节选，可从历史对话回看完整问答。</p>}</details>)}{context.topicHistory.omittedCount > 0 && <p>本次历史窗口另有 {context.topicHistory.omittedCount} 条未纳入，完整历史仍可按主题查找。</p>}</details>}
    {target ? <AppLink to={target}>返回提问位置 · 导读 r{guide!.metadata.revision}</AppLink> : <p>这条记录没有可定位的提问章节；可查看下方保留的来源。</p>}
    {selected && <blockquote>{selected}</blockquote>}
    {context?.scope === 'full-guide' ? <p>本篇完整导读，包含来源与覆盖说明；不含原论文全文。</p> : context?.scope === 'section' ? <p>导读开篇与提问章节的预算内材料，可能为节选；包含来源与覆盖说明，其余文本未随问题发送。</p> : null}
    {(historyCount !== undefined || typeof context?.webSearch === 'boolean') && <p>{historyCount !== undefined ? `带入 ${historyCount} 轮已完成对话。` : ''}{typeof context?.webSearch === 'boolean' ? context.webSearch ? '本轮允许网页检索；实际取得的资料见回答依据。' : '本轮未开启网页检索。' : ''}</p>}
  </details>;
}
export function PreviousAnswer({ turn }: { turn: AiTurn }) {
  const fallback = turn.context?.fallback;
  if (fallback?.reason !== 'subscription_quota' || !fallback.previousAnswer) return null;
  return <details className="ai-previous-answer"><summary>订阅未完成的回答</summary>
    <p>以下是切换前保留的内容，不是最终回答。{fallback.fromModel && <span>ChatGPT · {fallback.fromModel}</span>}</p>
    <div className="ai-previous-text">{fallback.previousAnswer}</div>
  </details>;
}
