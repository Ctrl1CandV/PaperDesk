import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type { Guide } from '../content/types';
import { contentRepository } from '../content/repository';
import { AppLink } from '../navigation';
import { Dialog } from '../ui/Dialog';
import { Formula } from '../reader/Markdown';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { isSafeExternalUrl } from '../../scripts/content-policy.mjs';
import { aiClient, getAiStatus, type AiConversation, type AiSource, type AiStatus, type AiTurn, type AskInput } from './api';
import { ChatGptConnection, providerLabel } from './ChatGptConnection';
import './ai.css';

type QuestionMaterial = { unitId: string; selection?: string };
type SessionDraft = { question: string; conversationId?: string; webSearch: boolean; material?: QuestionMaterial };
const conversationSelections = new Map<string, string | undefined>();
const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : '操作未完成，请保留草稿并重试。';
const suggestions = ['这一节的核心思路是什么？请结合文章解释。', '这里的结论依赖哪些条件，有什么局限？', '把文中的方法串起来，解释它们之间的关系。'];
const suggestionLabels = ['解释这一节的核心思路', '梳理结论的条件与局限', '串起文中方法的关系'];
const timeLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
function PanelIcon({ kind }: { kind: 'new' | 'history' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'new' ? <path d="M12 5v14M5 12h14" /> : <><path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>}</svg>;
}

function sourceTarget(source: AiSource): string | undefined {
  if (source.kind === 'web') return source.url && isSafeExternalUrl(source.url) ? source.url : undefined;
  if (!source.guideId || !Number.isSafeInteger(source.revision) || !source.unitId) return;
  const guide = contentRepository.get(source.guideId, source.revision!);
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
        for (const match of node.value.matchAll(/\[([LW][1-9]\d{0,3})\]/g)) {
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
function Sources({ sources, turnId }: { sources: AiSource[]; turnId: string }) {
  if (!sources.length) return null;
  return <details className="ai-sources"><summary>查看依据 · {sources.length}</summary>
    <ol>{sources.map((source, index) => {
      const target = sourceTarget(source);
      return <li key={`${source.id}-${index}`} id={`ai-source-${turnId}-${source.id}`} tabIndex={-1}><div className="ai-source-heading"><span className="ai-source-id">[{source.id}]</span><span>{source.kind === 'guide' ? '导读章节' : '网页检索'}{source.version ? ` · ${source.version}` : ''}</span></div>
        {target ? source.kind === 'guide' ? <AppLink to={target}>{source.title}</AppLink> : <a href={target} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <span>{source.title}（原位置暂不可用）</span>}
        <p>{source.text}</p>
      </li>;
    })}</ol>
  </details>;
}
function Answer({ turn }: { turn: AiTurn }) {
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
function AnswerIdentity({ turn }: { turn: AiTurn }) {
  const provider = turn.context?.provider === 'api' ? 'API' : turn.context?.provider === 'chatgpt' ? 'ChatGPT' : undefined;
  const model = typeof turn.context?.model === 'string' ? turn.context.model : undefined;
  const label = provider ? `${provider} · ${model || '模型待确认'}` : model ? `模型：${model}` : turn.status === 'running' ? '正在确认模型' : '此记录未包含模型信息';
  return <p className="ai-answer-model" aria-label="本轮使用的模型">{label}</p>;
}
function TurnMaterial({ turn }: { turn: AiTurn }) {
  const context = turn.context;
  const guide = typeof context?.guideId === 'string' && typeof context.revision === 'number'
    ? contentRepository.get(context.guideId, context.revision) : undefined;
  const unit = guide?.units.find(item => item.id === context?.unitId);
  const selected = typeof context?.selection === 'string' ? context.selection : '';
  const target = guide && unit ? `/read/${guide.metadata.id}/${guide.metadata.revision}#${unit.id}` : undefined;
  const historyCount = Array.isArray(context?.historyTurnIds) ? context.historyTurnIds.length : undefined;
  return <details className="ai-turn-material"><summary>提问时的资料{unit && <span>{selected ? '选文' : '章节'} · {unit.heading ?? '阅读起点'}</span>}</summary>
    {target ? <AppLink to={target}>返回提问位置 · 导读 r{guide!.metadata.revision}</AppLink> : <p>这条记录没有可定位的提问章节；可查看下方保留的来源。</p>}
    {selected && <blockquote>{selected}</blockquote>}
    {context?.scope === 'full-guide' ? <p>本篇完整导读，包含来源与覆盖说明；不含原论文全文。</p> : context?.scope === 'section' ? <p>导读开篇与提问章节，包含来源与覆盖说明；其余章节未随问题发送。</p> : null}
    {(historyCount !== undefined || typeof context?.webSearch === 'boolean') && <p>{historyCount !== undefined ? `带入 ${historyCount} 轮已完成对话。` : ''}{typeof context?.webSearch === 'boolean' ? context.webSearch ? '本轮允许网页检索；实际取得的资料见回答依据。' : '本轮未开启网页检索。' : ''}</p>}
  </details>;
}
function PreviousAnswer({ turn }: { turn: AiTurn }) {
  const fallback = turn.context?.fallback;
  if (fallback?.reason !== 'subscription_quota' || !fallback.previousAnswer) return null;
  return <details className="ai-previous-answer"><summary>订阅未完成的回答</summary>
    <p>以下是切换前保留的内容，不是最终回答。{fallback.fromModel && <span>ChatGPT · {fallback.fromModel}</span>}</p>
    <div className="ai-previous-text">{fallback.previousAnswer}</div>
  </details>;
}

export function AiPanel({ guide, unitId, selection, onClose }: { guide: Guide; unitId: string; selection?: string; onClose?: () => void }) {
  const guideKey = `${guide.metadata.id}/${guide.metadata.revision}`;
  return <AiPanelContent key={guideKey} guide={guide} unitId={unitId} selection={selection} onClose={onClose} />;
}

function AiPanelContent({ guide, unitId, selection, onClose }: { guide: Guide; unitId: string; selection?: string; onClose?: () => void }) {
  const guideKey = `${guide.metadata.id}/${guide.metadata.revision}`;
  const draftKey = `ai:${guideKey}`;
  const [cached] = useState(() => getDraft<SessionDraft>(draftKey));
  const [question, setQuestion] = useState(cached?.question ?? '');
  const [material, setMaterial] = useState<QuestionMaterial | undefined>(cached?.material);
  const [webSearch, setWebSearch] = useState(cached?.webSearch ?? false);
  const [status, setStatus] = useState<AiStatus>();
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(cached?.conversationId ?? conversationSelections.get(guideKey));
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ data: unknown; text: string; bytes: number; conversationCount: number | null; turnCount: number | null }>();
  const [copyText, setCopyText] = useState<string>();
  const headingId = useId(), questionId = useId();
  const controller = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true), connectGeneration = useRef(0);
  const statusVersion = useRef(0);
  const connectedId = useRef(conversationId);
  const pendingRequest = useRef<{ input: AskInput; accepted: boolean } | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null), messages = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true), fileInput = useRef<HTMLInputElement>(null);
  const currentUnit = guide.units.find(item => item.id === unitId) ?? guide.units[0];
  const questionMaterial = material ?? { unitId: currentUnit.id, selection };
  const unit = guide.units.find(item => item.id === questionMaterial.unitId) ?? currentUnit;
  const questionSelection = questionMaterial.selection;
  const materialChanged = unit.id !== currentUnit.id || questionSelection !== selection;
  const selectionTooLong = Boolean(questionSelection && questionSelection.length > 12000);
  const fullGuide = guide.body.length <= 40000;
  const hasRunning = turns.some(turn => turn.status === 'running');
  const locked = busy || sending;
  const loginPending = Boolean(status?.chatgpt?.loginPending);
  const ready = Boolean(status?.configured && !loginPending && !connecting && !connectionError);
  useUnloadWarning(sending);

  useEffect(() => {
    if (question) keepDraft(draftKey, { question, conversationId, webSearch, material } satisfies SessionDraft);
    else clearDraft(draftKey);
    conversationSelections.set(guideKey, conversationId);
  }, [draftKey, guideKey, question, conversationId, webSearch, material]);
  useEffect(() => {
    alive.current = true; void connect();
    return () => { alive.current = false; connectGeneration.current++; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (settingsOpen || locked || connecting) return;
    // Authorization continues outside the settings dialog. Poll only this local
    // status endpoint while pending; returning to the page also refreshes it.
    let cancelled = false, inFlight = false, attempts = 0, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const check = async () => {
      if (cancelled || inFlight || ++attempts > 300) return;
      inFlight = true;
      const version = statusVersion.current;
      try {
        const next = await getAiStatus(AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]));
        if (cancelled || version !== statusVersion.current) return;
        receiveStatus(next); failures = 0;
        if (next.chatgpt.loginPending) timer = setTimeout(() => void check(), 2000);
      } catch {
        if (!cancelled && loginPending && ++failures < 3) timer = setTimeout(() => void check(), 2000);
      } finally { inFlight = false; }
    };
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer); attempts = 0; failures = 0; void check();
    };
    window.addEventListener('focus', onReturn); document.addEventListener('visibilitychange', onReturn);
    if (loginPending) timer = setTimeout(() => void check(), 2000);
    return () => {
      cancelled = true; clearTimeout(timer); abort.abort();
      window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn);
    };
  }, [settingsOpen, locked, connecting, loginPending]);
  useEffect(() => {
    if (nearBottom.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [turns, phase]);

  async function loadList(currentStatus: AiStatus) {
    const result = await aiClient(currentStatus.csrfToken).conversations(guide.metadata.id, guide.metadata.revision);
    if (alive.current) setConversations(result.conversations);
    return result.conversations;
  }
  function receiveStatus(next: AiStatus) {
    if (!alive.current) return;
    statusVersion.current++; setStatus(next);
  }
  async function loadConversation(id: string, currentStatus = status, preserveScroll = false) {
    if (!currentStatus) return;
    const value = await aiClient(currentStatus.csrfToken).conversation(id);
    if (!alive.current) return;
    if (value.conversation.guideId !== guide.metadata.id || value.conversation.revision !== guide.metadata.revision) throw new Error('该对话属于另一个导读修订，请从对应文章打开。');
    connectedId.current = id; setConversationId(id); setTurns(value.turns);
    if (!preserveScroll) nearBottom.current = true;
    return value;
  }
  async function connect() {
    const generation = ++connectGeneration.current;
    setConnecting(true); setConnectionError(''); setError('');
    try {
      const next = await getAiStatus();
      if (!alive.current || generation !== connectGeneration.current) return;
      receiveStatus(next);
      const list = await loadList(next);
      if (!alive.current || generation !== connectGeneration.current) return;
      const remembered = connectedId.current;
      if (remembered && list.some(item => item.id === remembered)) await loadConversation(remembered, next);
      else if (remembered) { connectedId.current = undefined; setConversationId(undefined); setTurns([]); }
    } catch (reason) { if (alive.current && generation === connectGeneration.current) setConnectionError(errorText(reason)); }
    finally { if (alive.current && generation === connectGeneration.current) setConnecting(false); }
  }
  async function chooseConversation(id: string) {
    if (locked || connecting) return false;
    setError(''); setNotice('');
    if (!id) { connectedId.current = undefined; setConversationId(undefined); setTurns([]); pendingRequest.current = undefined; return true; }
    setBusy(true);
    try { await loadConversation(id); pendingRequest.current = undefined; return true; }
    catch (reason) { setError(errorText(reason)); return false; }
    finally { if (alive.current) setBusy(false); }
  }
  async function refresh() {
    if (!status || locked) return;
    setBusy(true); setError('');
    try {
      await loadList(status);
      if (connectedId.current) await loadConversation(connectedId.current);
      setNotice('已从本机服务重新读取对话。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function send() {
    if (!ready || !status || locked || hasRunning || selectionTooLong || !question.trim() || question.length > 6000) return;
    const text = question.trim();
    const base = { conversationId, guideId: guide.metadata.id, revision: guide.metadata.revision,
      bodySha256: guide.metadata.bodySha256, unitId: unit.id, ...(questionSelection ? { selection: questionSelection } : {}), question: text,
      webSearch: Boolean(webSearch && status.searchAvailable) };
    const previous = pendingRequest.current;
    const oldBase = previous ? (({ requestId: _id, ...rest }) => rest)(previous.input) : undefined;
    const request: AskInput = { ...base, requestId: previous && !previous.accepted && JSON.stringify(oldBase) === JSON.stringify(base) ? previous.input.requestId : crypto.randomUUID() };
    pendingRequest.current = { input: request, accepted: false };
    const abort = new AbortController(); controller.current = abort;
    let localId = `pending-${request.requestId}`, acceptedId: string | undefined, completed = false;
    const optimistic: AiTurn = { id: localId, question: text, answer: '', status: 'running', sources: [], context: {
      guideId: request.guideId, revision: request.revision, unitId: request.unitId, selection: request.selection ?? '',
      scope: fullGuide ? 'full-guide' : 'section', webSearch: request.webSearch,
    }, createdAt: new Date().toISOString() };
    setTurns(current => [...current.filter(turn => turn.id !== optimistic.id), optimistic]); setSending(true); setError(''); setNotice(''); setPhase('正在准备文章上下文'); nearBottom.current = true;
    const update = (change: (turn: AiTurn) => AiTurn) => {
      const targetId = localId;
      if (alive.current) setTurns(current => current.map(turn => turn.id === targetId ? change(turn) : turn));
    };
    try {
      await aiClient(status.csrfToken).ask(request, abort.signal, event => {
        if (!alive.current) return;
        if (event.type === 'accepted') {
          acceptedId = event.conversationId; connectedId.current = event.conversationId; setConversationId(event.conversationId);
          if (pendingRequest.current) pendingRequest.current.accepted = true;
          update(turn => ({ ...turn, id: event.turnId })); localId = event.turnId;
        } else if (event.type === 'status') setPhase(event.text);
        else if (event.type === 'sources') update(turn => ({ ...turn, sources: event.sources }));
        else if (event.type === 'reset') {
          update(() => event.turn); localId = event.turn.id;
          setPhase('订阅或应用额度已达上限，正在等待 API 回答');
        }
        else if (event.type === 'delta') { update(turn => ({ ...turn, answer: turn.answer + event.text })); setPhase('正在组织回答'); }
        else if (event.type === 'replace') { update(turn => ({ ...turn, answer: event.text })); setPhase('正在组织回答'); }
        else if (event.type === 'done') { update(() => event.turn); completed = event.turn.status === 'complete'; }
        else if (event.type === 'error') {
          if (event.turn) update(() => event.turn!); else update(turn => ({ ...turn, status: 'error' }));
          setError(event.message);
        }
      });

    } catch (reason) {
      if (alive.current) {
        update(turn => ({ ...turn, status: 'interrupted' }));
        setError(abort.signal.aborted ? '已停止接收回答。问题仍保留；刷新对话可确认服务端最终保存的内容。' : errorText(reason));
      }
    } finally {
      if (alive.current) {
        setPhase('正在确认对话已保存'); controller.current = undefined;
        // A reload also resolves ambiguous failures and preserves a partial response already saved by the service.
        try { await loadList(status); if (acceptedId) await loadConversation(acceptedId, status, true); }
        catch { if (alive.current) setNotice('本页回答仍保留，尚未确认服务端状态。请刷新对话核对。'); }
        finally {
          // A provider may have reported an expired login or refreshed model choice.
          try { const next = await getAiStatus(); receiveStatus(next); } catch { /* Keep the answer and the last known status. */ }
          if (alive.current) {
            if (completed) { setQuestion(''); setMaterial(undefined); clearDraft(draftKey); pendingRequest.current = undefined; }
            setSending(false); setPhase('');
          }
        }
      }
    }
  }
  function editQuestion(value: string) {
    if (value && !material) setMaterial({ unitId: currentUnit.id, selection });
    if (!value) setMaterial(undefined);
    setQuestion(value);
  }
  async function copy(answer: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(answer); setNotice('已复制回答。');
    } catch { setCopyText(answer); }
  }
  async function remove() {
    if (!status || !conversationId || locked) return;
    setBusy(true); setError('');
    try {
      await aiClient(status.csrfToken).remove(conversationId);
      connectedId.current = undefined; setConversationId(undefined); setTurns([]); setDeleteOpen(false);
      pendingRequest.current = undefined; await loadList(status); setNotice('这段对话已从本机服务删除。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function exportAll() {
    if (!status || locked) return;
    setBusy(true); setError('');
    try {
      const backup = await aiClient(status.csrfToken).export();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `paperdesk-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('已生成全部 AI 对话的备份下载，请在浏览器下载列表确认文件。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function previewFile(file?: File) {
    setError(''); setImportPreview(undefined);
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { setError('AI 备份超过 16 MiB，未读取或发送。'); return; }
    try {
      const text = await file.text(), data: unknown = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('请选择完整的 AI 备份 JSON 对象。');
      const record = data as { conversations?: unknown; turns?: unknown };
      setImportPreview({ data, text, bytes: file.size,
        conversationCount: Array.isArray(record.conversations) ? record.conversations.length : null,
        turnCount: Array.isArray(record.turns) ? record.turns.length : null });
    } catch (reason) { setError(reason instanceof SyntaxError ? '文件不是有效 JSON，尚未导入。' : errorText(reason)); }
  }
  async function importAll() {
    if (!status || !importPreview || locked) return;
    setBusy(true); setError('');
    try {
      await aiClient(status.csrfToken).import(importPreview.data);
      await loadList(status);
      if (connectedId.current) await loadConversation(connectedId.current);
      setImportPreview(undefined); setNotice('AI 备份已导入，并已重新读取对话列表。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }

  return <aside className="ai-panel" aria-labelledby={headingId}>
    <header className="ai-panel-heading"><h2 id={headingId}>AI解读</h2>
      <div className="ai-heading-actions"><button type="button" className="ai-icon-button" aria-label="开始新对话" title="新对话" disabled={locked || connecting} onClick={() => void chooseConversation('')}><PanelIcon kind="new" /></button><button type="button" className="ai-icon-button" aria-label="查看历史对话" title="历史对话" disabled={locked} onClick={() => { setHistoryOpen(true); setError(''); setNotice(''); }}><PanelIcon kind="history" /></button>{onClose && <button type="button" className="ai-icon-button" aria-label="收起 AI 解读" title="收起" onClick={onClose}>×</button>}</div>
    </header>
    <div className="ai-context">
      <button type="button" className="ai-material-trigger" onClick={() => setMaterialOpen(true)} aria-label="查看本次提问资料">
        <span><span className="ai-context-label">{sending ? '本次提问位置' : question ? '已固定提问位置' : '围绕这一节提问'}</span><span className="ai-context-current">{questionSelection ? '选文 · ' : ''}{unit.heading ?? '阅读起点'}</span></span><span className="ai-material-info">资料</span>
      </button>
      {materialChanged && !sending && <button type="button" className="ai-material-change" disabled={locked} onClick={() => setMaterial({ unitId: currentUnit.id, selection })}>{selection ? '改用当前选文' : '改用当前阅读章节'} <span aria-hidden="true">↗</span></button>}
    </div>
    <div className="ai-messages" ref={messages} role="region" aria-label="AI 解读对话" tabIndex={0} onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; }}>
      {connecting ? <p className="ai-service-state" role="status">正在连接…</p> : connectionError ? <div className="ai-service-state"><p>{connectionError}</p><button type="button" className="ai-inline-action" onClick={() => void connect()}>重试连接</button></div> : status && !status.configured ? <div className="ai-service-state"><p>{status.provider === 'chatgpt' ? '连接 ChatGPT 后即可提问。' : '连接 ChatGPT 订阅，或配置自己的 API。'}</p><button type="button" className="ai-inline-action" onClick={() => setSettingsOpen(true)}>打开 AI 设置</button></div> : null}
      {!turns.length && <div className="ai-empty"><p className="ai-empty-heading">从这篇导读继续追问</p><div className="ai-suggestions">{suggestions.map((value, index) => <button key={value} type="button" disabled={locked} onClick={() => { editQuestion(value); input.current?.focus(); }}>{suggestionLabels[index]}<span aria-hidden="true">↗</span></button>)}</div></div>}
      {turns.map((turn, index) => <section className="ai-turn" key={turn.id} aria-label={`问题 ${index + 1}`}>
        <div className="ai-question"><span className="ai-speaker">你的问题</span><p>{turn.question}</p><TurnMaterial turn={turn} /></div>
        <div className="ai-response"><div className="ai-response-label"><span>AI 解读</span>{turn.status !== 'complete' && <span className="ai-turn-state">{turn.status === 'running' ? '生成中' : turn.status === 'interrupted' ? '未完成' : '出错'}</span>}</div>
          <AnswerIdentity turn={turn} />
          {turn.context?.fallback?.reason === 'subscription_quota' && <p className="ai-fallback-notice">订阅或应用额度已达上限 · 本轮由 API 回答</p>}
          {turn.answer ? <Answer turn={turn} /> : <p className="ai-empty-answer">{turn.status === 'running' ? '正在阅读文章上下文…' : '这轮还没有可显示的回答。问题已保留。'}</p>}
          <PreviousAnswer turn={turn} /><Sources sources={turn.sources} turnId={turn.id} />
          {turn.answer && <button type="button" className="ai-inline-action ai-copy" onClick={() => void copy(turn.answer)}>复制{turn.status === 'complete' ? '回答' : '已有内容'}</button>}
        </div>
      </section>)}
      {sending && <p className="ai-progress" role="status"><span aria-hidden="true" />{phase || '正在生成'}</p>}
      {hasRunning && !sending && <div className="ai-service-state"><p>这段对话仍标记为处理中，可能来自另一个页面或中断的连接。刷新后可恢复已保存内容。</p><button type="button" disabled={busy} className="ai-inline-action" onClick={() => void refresh()}>刷新对话</button></div>}
    </div>
    <form className="ai-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {error && <div className="ai-error" role="alert"><p>{error}</p>{conversationId && <button type="button" disabled={locked} onClick={() => void refresh()}>刷新对话</button>}<button type="button" disabled={locked} onClick={() => void connect()}>重试连接</button><button type="button" disabled={locked} onClick={() => setSettingsOpen(true)}>AI 设置</button></div>}
      {notice && <p className="ai-notice" role="status">{notice}</p>}
      {loginPending && <p className="ai-notice" role="status">正在等待 ChatGPT 授权。完成或取消这次登录后即可发送，问题草稿仍保留。</p>}
      {selectionTooLong && <p className="ai-error" role="alert">选文超过 12,000 字符。请打开“资料”，选择“不附带选文”，或改用较短的当前选文；没有自动截断。</p>}
      <div className="ai-input-surface"><label className="ai-visually-hidden" htmlFor={questionId}>向 AI 提问</label><textarea id={questionId} ref={input} rows={3} value={question} maxLength={6000} disabled={sending} placeholder="关于这篇文章，你想进一步理解什么？" onChange={event => editQuestion(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(); }
      }} />
      <div className="ai-composer-actions"><button type="button" className="ai-provider-trigger" disabled={locked} aria-label={`AI 设置：${providerLabel(status)}，${webSearch && status?.searchAvailable ? '联网已开启' : '联网关闭'}`} title="设置模型连接与联网查证" onClick={() => setSettingsOpen(true)}><span className={ready ? 'is-connected' : ''} aria-hidden="true" /><span>{providerLabel(status)}<span className="ai-provider-search">{webSearch && status?.searchAvailable ? ' · 联网' : ' · 不联网'}</span></span><span className="ai-provider-chevron" aria-hidden="true">⌄</span></button>{sending ? <button type="button" className="ai-send" onClick={() => controller.current?.abort()}>停止</button> : <button className="ai-send" type="submit" disabled={!ready || locked || hasRunning || selectionTooLong || !question.trim() || question.length > 6000}>发送 <span aria-hidden="true">↑</span></button>}</div></div>
      {(sending || question.length > 5000) && <p className="ai-composer-hint">{sending ? '关闭会停止回答' : `${question.length} / 6000`}</p>}
    </form>
    {deleteOpen && <Dialog title="删除这段 AI 对话" className="ai-small-dialog" busy={busy} onClose={() => setDeleteOpen(false)}><p>将删除整段对话与引用，无法撤销。笔记与阅读记录会保留。</p><p>可先在“AI 对话备份”中导出。</p>{error && <p role="alert" className="ai-error">{error}</p>}<div className="form-actions"><button className="secondary-action" disabled={busy} onClick={() => setDeleteOpen(false)}>保留对话</button><button className="danger-action" disabled={busy} onClick={() => void remove()}>确认删除这段对话</button></div></Dialog>}
    {copyText !== undefined && <Dialog title="手动复制回答" onClose={() => setCopyText(undefined)}><p>浏览器自动复制不可用。选中下方文字后使用 Ctrl+C 或系统复制。</p><textarea className="ai-copy-fallback" aria-label="回答完整内容" readOnly value={copyText} rows={12} onFocus={event => event.currentTarget.select()} /><button className="secondary-action" onClick={event => { const area = event.currentTarget.parentElement?.querySelector('textarea'); area?.focus(); area?.select(); }}>选中全部内容</button></Dialog>}
    {materialOpen && <Dialog title="本次提问资料" className="ai-material-dialog ai-small-dialog" onClose={() => setMaterialOpen(false)}>
      <p className="ai-guide-title">{guide.metadata.title}<span>导读 r{guide.metadata.revision} · {unit.heading ?? '阅读起点'}</span></p>
      <dl className="ai-material-list"><div><dt>随问题发送</dt><dd>{fullGuide ? '本篇完整导读' : '导读开篇与提问章节（全文超出长度限制）'}、来源与覆盖说明，以及最多 6 轮近期对话。</dd></div><div><dt>不包含</dt><dd>原论文全文、个人笔记、探索记录和阅读历史。</dd></div></dl>
      {questionSelection && <section className="ai-selected-material"><h3>附带选文</h3><blockquote>{questionSelection}</blockquote><button type="button" className="ai-inline-action" disabled={locked} onClick={() => setMaterial({ unitId: unit.id })}>不附带选文</button></section>}
      <p className="ai-fine-print">AI 可以继续查找本地书库与相关导读章节。改变阅读位置不会替换正在编辑或已发出问题的资料。</p>
      {status?.provider === 'chatgpt' && status.apiConfigured && status.chatgpt.fallbackToApi && <p className="ai-fine-print">订阅或此应用额度用尽时，同一问题与资料会转交已配置的备用 API，可能产生 API 费用。</p>}
    </Dialog>}
    {settingsOpen && <Dialog title="AI 设置" onClose={() => setSettingsOpen(false)} className="ai-settings-dialog ai-small-dialog"><ChatGptConnection status={status} disabled={locked || hasRunning} webSearch={webSearch} onWebSearch={setWebSearch} onStatus={next => { receiveStatus(next); setConnectionError(''); }} /></Dialog>}
    {historyOpen && <Dialog title="历史对话" className="ai-history-dialog ai-small-dialog" busy={busy} onClose={() => setHistoryOpen(false)}><p className="ai-dialog-intro">这篇导读的讨论 · r{guide.metadata.revision}</p>
      {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}
      <div className="ai-history-list">{conversations.length ? conversations.map(item => <button key={item.id} type="button" aria-current={conversationId === item.id ? 'true' : undefined} disabled={locked || connecting || !status || Boolean(connectionError)} onClick={async () => { if (await chooseConversation(item.id)) setHistoryOpen(false); }}><span>{item.title}</span><time>{timeLabel(item.updatedAt)}</time></button>) : <p>还没有保存的对话。</p>}</div>
      <div className="ai-history-actions"><button type="button" className="ai-inline-action" disabled={locked || !status} onClick={() => void refresh()}>刷新对话</button><button type="button" className="ai-inline-action ai-danger" disabled={locked || !conversationId || hasRunning} onClick={() => { setDeleteOpen(true); setError(''); }}>删除当前对话…</button><button type="button" className="ai-inline-action" disabled={locked} onClick={() => { setBackupOpen(true); setError(''); setNotice(''); }}>备份与恢复</button></div>
      <p className="ai-fine-print">对话保存在本机服务，与浏览器笔记分别保存。</p>
    </Dialog>}
    {backupOpen && <Dialog title="AI 对话备份" busy={busy} onClose={() => { setBackupOpen(false); setImportPreview(undefined); }} className="ai-backup-dialog ai-small-dialog"><p className="ai-dialog-intro">导出或恢复全部文章的 AI 对话。</p><p className="ai-fine-print">包含提问、回答与引用，可能有私人文字，请妥善保管。浏览器笔记与连接授权不在此备份中。</p>
      {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}
      <div className="ai-backup-actions"><button className="primary-action" disabled={busy || !status || Boolean(connectionError)} onClick={() => void exportAll()}>导出全部 AI 对话</button><button className="secondary-action" disabled={busy || !status || Boolean(connectionError)} onClick={() => fileInput.current?.click()}>选择备份文件…</button></div><p className="ai-fine-print">JSON 文件，最大 16 MiB。导入前可预览，不会重新请求模型。</p>
      <input className="ai-visually-hidden" ref={fileInput} type="file" accept=".json,application/json" aria-label="选择 AI 对话备份" onChange={event => { void previewFile(event.target.files?.[0]); event.target.value = ''; }} />
      {importPreview && <section className="ai-import-preview"><h3>导入前检查</h3><p>{importPreview.conversationCount ?? '无法识别'} 段对话，{importPreview.turnCount ?? '无法识别'} 轮问答 · {(importPreview.bytes / 1024).toFixed(1)} KiB</p><p>已有相同对话或问答时，整份文件不会导入。请保留备份并核对现有对话。</p><details><summary>查看完整导入内容</summary><textarea readOnly aria-label="AI 备份完整预览" rows={10} value={importPreview.text} /></details><div className="form-actions"><button className="primary-action" disabled={busy} onClick={() => void importAll()}>确认导入 AI 备份</button><button className="secondary-action" disabled={busy} onClick={() => setImportPreview(undefined)}>取消</button></div></section>}
    </Dialog>}
  </aside>;
}
