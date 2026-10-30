import { useEffect, useId, useRef, useState } from 'react';
import type { Guide } from '../content/types';
import type { Exploration } from '../records/types';
import { personalStore } from '../records/store';
import { useRecords } from '../records/hooks';
import { useExploration } from '../exploration/model';
import { createResearchSnapshot, researchSnapshotData } from '../../shared/research-contract.mjs';
import { ResearchProposals, ResearchSnapshotView } from './ResearchProposals';
import { ResearchMaterialsPicker, emptyMaterialSelection, prepareSelectedMaterials, type MaterialSelection } from './ResearchMaterials';
import { saveAnswerArtifact } from '../research/artifact-actions';
import { BRIEF_PURPOSES, parseCommand, type ResearchCommand } from '../../shared/research-documents.mjs';
import { applyCommandTurn, commandOutcome, readingProgress, type CommandOutcome } from '../research/commands';
import { CommandMenu, CommandResult, commandHint, matchingOptions, type CommandOption } from './Commands';
import { Dialog } from '../ui/Dialog';
import { clearDraft, getDraft, keepDraft, useUnloadWarning } from '../ui/drafts';
import { aiClient, AiApiError, getAiStatus, type AiConversation, type AiStatus, type AiTurn, type AskInput } from './api';
import { ChatGptConnection, providerLabel } from './ChatGptConnection';
import { Answer, AnswerIdentity, PreviousAnswer, Sources, TurnMaterial } from './Answer';
import './ai.css';

type QuestionMaterial = { unitId: string; selection?: string };
type SessionDraft = { question: string; conversationId?: string; webSearch: boolean; material?: QuestionMaterial; selectedMaterials?: MaterialSelection };
export type TopicRequest = { explorationId: string; question?: string; notice?: string; nonce: number };
/** A prepared question for a topic; applied once, after the panel is ready. */
export type ResearchRequest = { explorationId: string; question: string; artifactIds?: string[]; nonce: number };
const conversationSelections = new Map<string, string | undefined>();
const handledTopicRequests = new Set<number>(), handledResearchRequests = new Set<number>();
const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : '操作未完成，请保留草稿并重试。';
const recapPrompt = '我对这一节的理解是：';
const suggestions = [`${recapPrompt}\n\n请对照导读和原文指出我的遗漏或偏差，先不要直接给出完整讲解。`, '请就这一节提两个检验理解的问题，先不要给答案；等我回答后，再对照导读和原文指出遗漏或偏差。', '这一节的核心思路是什么？请结合文章解释。'];
const suggestionLabels = ['我先复述，请你检查', '就这一节考我两个问题', '解释这一节的核心思路'];
const researchSuggestions = ['请帮我把这个问题想清楚：它背后可能有哪些值得调查的方向？已有材料能说明什么、还缺什么？', '比较目前能想到的几个方向：区别在哪里，各自有什么依据和主要疑点？', '当前判断还缺哪些证据？什么发现会改变我们的判断？'];
const researchSuggestionLabels = ['把问题想清楚', '比较可能的方向', '检查依据与反例'];
const timeLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
function PanelIcon({ kind }: { kind: 'new' | 'history' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'new' ? <path d="M12 5v14M5 12h14" /> : <><path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>}</svg>;
}

type PanelProps = { guide?: Guide; unitId?: string; selection?: string; exploration?: Exploration; suggestedQuestion?: string; topicRequest?: TopicRequest; researchRequest?: ResearchRequest; onClose?: () => void };
const topicSelectId = 'ai-topic-select';
function readSession(key: string) { try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; } }
function writeSession(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch { /* Session memory remains usable. */ } }
export function AiPanel(props: PanelProps) {
  const [topicId, setTopicId] = useState(() => props.exploration?.id ?? readSession('paperdesk-ai-topic'));
  const [locked, setLocked] = useState(false);
  const [suggestion, setSuggestion] = useState<string>();
  const [pendingTopic, setPendingTopic] = useState<TopicRequest>();
  const [shellNotice, setShellNotice] = useState('');
  const topics = useRecords('explorations');
  // Reading-accumulation entries hold files for a learning goal; conversations link to directions.
  const directions = topics.records.filter(item => item.research?.purpose !== 'accumulation');
  const refocusPicker = useRef(false);
  function switchTopic(id: string, question?: string, notice = '') { setTopicId(id); writeSession('paperdesk-ai-topic', id); setSuggestion(question); setShellNotice(notice); }
  // The picker sits inside the remounted panel; keep keyboard focus on it after a switch.
  useEffect(() => { if (refocusPicker.current) { refocusPicker.current = false; document.getElementById(topicSelectId)?.focus({ preventScroll: true }); } });
  useEffect(() => {
    // Apply each request once, even if the panel is closed and reopened later.
    const request = props.topicRequest;
    if (!request || props.exploration || handledTopicRequests.has(request.nonce)) return;
    handledTopicRequests.add(request.nonce); setPendingTopic(request);
  }, [props.topicRequest?.nonce]);
  // A notice about the last switch stays until the next question starts.
  useEffect(() => { if (locked) setShellNotice(''); }, [locked]);
  // Never switch away from a running answer; apply the reader's request once it settles.
  useEffect(() => { if (pendingTopic && !locked) { switchTopic(pendingTopic.explorationId, pendingTopic.question, pendingTopic.notice); setPendingTopic(undefined); } }, [pendingTopic, locked]);
  const selected = useExploration(props.exploration?.id ?? topicId);
  const exploration = props.exploration ?? selected.record;
  const topicMissing = Boolean(!props.exploration && topicId && !selected.loading && !selected.record);
  const key = `${exploration ? `exploration:${exploration.id}:` : ''}${props.guide?.metadata.id}/${props.guide?.metadata.revision}`;
  const picker = !props.exploration && <div className="ai-topic-picker"><label><span>方向</span><select id={topicSelectId} aria-label="关联方向" title="关联后，提问会带上这个方向的记录；不关联则只讨论这篇导读" disabled={locked || selected.loading} value={topicId} onChange={event => { refocusPicker.current = true; switchTopic(event.target.value); }}>
      <option value="">不关联方向</option>
      {topicId && !directions.some(item => item.id === topicId) && <option value={topicId}>{exploration?.title ?? '正在读取方向'}</option>}
      {directions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>{topics.hasMore && <button type="button" disabled={locked || topics.loading} onClick={() => void topics.loadMore()}>更多</button>}{topics.error && <p role="alert">{topics.error}</p>}{pendingTopic && <p role="status">当前回答结束后切换方向。</p>}{shellNotice && <p role="status">{shellNotice}</p>}</div>;
  const content = !topicMissing && !(topicId && !props.exploration && selected.loading);
  return <div className="ai-research-shell">
    {!content && picker}
    {topicMissing ? <p role="alert">关联的方向当前不可用，请选择另一个方向或不关联。不会从旧会话恢复你的研究记录。</p> : !content ? <p role="status">正在读取方向…</p> : <AiPanelContent key={key} {...props} picker={picker || undefined} suggestedQuestion={props.suggestedQuestion ?? suggestion} exploration={exploration} onBusyChange={setLocked}
      onDirectionCreated={props.exploration ? undefined : record => switchTopic(record.id, undefined, `已建立并关联方向《${record.title}》，之后的讨论会归入这个方向。`)} />}
  </div>;
}

function AiPanelContent({ guide, unitId, selection, exploration, suggestedQuestion, researchRequest, picker, onClose, onBusyChange, onDirectionCreated }: PanelProps & { picker?: React.ReactNode; onBusyChange: (busy: boolean) => void; onDirectionCreated?: (record: Exploration) => void }) {
  const guideKey = exploration ? `exploration:${exploration.id}` : `${guide?.metadata.id}/${guide?.metadata.revision}`;
  const draftKey = `ai:${guideKey}${exploration ? `:${guide?.metadata.id ?? 'topic'}/${guide?.metadata.revision ?? 0}` : ''}`;
  const [cached] = useState(() => getDraft<SessionDraft>(draftKey));
  const [question, setQuestion] = useState(cached?.question ?? '');
  const [material, setMaterial] = useState<QuestionMaterial | undefined>(cached?.material);
  const [selectedMaterials, setSelectedMaterials] = useState<MaterialSelection>(cached?.selectedMaterials ?? emptyMaterialSelection());
  const [commandMenu, setCommandMenu] = useState(0), [menuDismissed, setMenuDismissed] = useState<string>();
  const turnsRef = useRef<AiTurn[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, CommandOutcome>>({});
  const [materialsPickerOpen, setMaterialsPickerOpen] = useState(false);
  const [webSearch, setWebSearch] = useState(cached?.webSearch ?? false);
  const [status, setStatus] = useState<AiStatus>();
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null), [turnCursor, setTurnCursor] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(cached?.conversationId ?? conversationSelections.get(guideKey) ?? (exploration ? readSession(`paperdesk-ai-conversation:${guideKey}`) || undefined : undefined));
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ file: File; bytes: number; conversationCount: number; turnCount: number; schemaVersion: number }>();
  const transfer = useRef<AbortController | undefined>(undefined);
  const [copyText, setCopyText] = useState<string>();
  const headingId = useId(), questionId = useId();
  const controller = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true), connectGeneration = useRef(0);
  const statusVersion = useRef(0);
  const connectedId = useRef(conversationId);
  const pendingRequest = useRef<{ input: AskInput; accepted: boolean } | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null), messages = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true), fileInput = useRef<HTMLInputElement>(null);
  const currentUnit = guide?.units.find(item => item.id === unitId) ?? guide?.units[0];
  const questionMaterial = material ?? { unitId: currentUnit?.id ?? '', selection };
  const unit = guide?.units.find(item => item.id === questionMaterial.unitId) ?? currentUnit;
  const questionSelection = questionMaterial.selection;
  const materialChanged = unit?.id !== currentUnit?.id || questionSelection !== selection;
  const selectionTooLong = Boolean(questionSelection && questionSelection.length > 12000);
  const hasRunning = turns.some(turn => turn.status === 'running');
  const locked = busy || sending;
  useEffect(() => { onBusyChange(locked); return () => onBusyChange(false); }, [locked, onBusyChange]);
  const loginPending = Boolean(status?.chatgpt?.loginPending);
  const ready = Boolean(status?.configured && !loginPending && !connecting && !connectionError);
  useUnloadWarning(sending);
  useEffect(() => {
    if (suggestedQuestion && !cached?.question) { setQuestion(suggestedQuestion); input.current?.focus(); }
    else if (suggestedQuestion) setNotice('现有问题草稿已保留。请先处理草稿，再带着结果继续讨论。');
  }, []);
  useEffect(() => {
    // The owning page keeps the request, so one prepared while the panel was busy or remounting is not lost.
    const detail = researchRequest;
    if (!detail || handledResearchRequests.has(detail.nonce)) return;
    handledResearchRequests.add(detail.nonce);
    if (detail.explorationId !== exploration?.id || typeof detail.question !== 'string' || detail.question.length > 6000) return;
    if (question || locked) { setNotice('现有问题草稿已保留。请先处理草稿，再带着结果继续讨论。'); return; }
    editQuestion(detail.question);
    // A document chosen through its own “update” action is an explicit, still revocable selection.
    const chosen = (exploration?.research?.artifacts ?? []).filter(item => detail.artifactIds?.includes(item.id) && !selectedMaterials.artifacts.some(value => value.id === item.id));
    if (chosen.length) {
      const artifacts = [...selectedMaterials.artifacts, ...chosen.map(item => structuredClone(item))].slice(-3);
      setSelectedMaterials({ ...selectedMaterials, artifacts });
      setNotice(`已选入《${chosen.map(item => item.title).join('》《')}》作为本轮参考，可在“选择笔记与研究文档”中撤销。`);
    }
    input.current?.scrollIntoView({ block: 'center' }); input.current?.focus();
  }, [researchRequest?.nonce]);

  useEffect(() => {
    if (question || selectedMaterials.notes.length || selectedMaterials.artifacts.length) keepDraft(draftKey, { question, conversationId, webSearch, material, selectedMaterials } satisfies SessionDraft);
    else clearDraft(draftKey);
    conversationSelections.set(guideKey, conversationId);
    if (exploration) writeSession(`paperdesk-ai-conversation:${guideKey}`, conversationId ?? '');
  }, [draftKey, guideKey, question, conversationId, webSearch, material, selectedMaterials]);
  useEffect(() => {
    alive.current = true; void connect();
    return () => { alive.current = false; connectGeneration.current++; controller.current?.abort(); transfer.current?.abort(); };
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
  // Follow new content while the reader is at the end. The panel's own scrolling must not count as
  // the reader leaving the end: content can grow between setting scrollTop and the scroll event.
  const autoTop = useRef<number | undefined>(undefined);
  const stickToBottom = () => { const node = messages.current; if (node) { node.scrollTop = node.scrollHeight; autoTop.current = node.scrollTop; } };
  useEffect(() => {
    if (!nearBottom.current) return;
    stickToBottom();
    const frame = requestAnimationFrame(() => { if (nearBottom.current) stickToBottom(); });
    return () => cancelAnimationFrame(frame);
  }, [turns, phase, outcomes]);

  async function loadList(currentStatus: AiStatus) {
    const result = exploration ? await aiClient(currentStatus.csrfToken).researchConversations(exploration.id)
      : await aiClient(currentStatus.csrfToken).conversations(guide!.metadata.id, guide!.metadata.revision);
    if (alive.current) { setConversations(result.conversations); setConversationCursor(result.nextCursor ?? null); }
    return result.conversations;
  }
  function receiveStatus(next: AiStatus) {
    if (!alive.current) return;
    statusVersion.current++; setStatus(next);
  }
  async function loadConversation(id: string, currentStatus = status, preserveScroll = false, reconcileTurnId?: string) {
    if (!currentStatus) return;
    const value = await aiClient(currentStatus.csrfToken).conversation(id);
    if (reconcileTurnId && value.turns.some(turn => turn.id === reconcileTurnId && turn.summaryOnly)) {
      const detail = await aiClient(currentStatus.csrfToken).turn(reconcileTurnId);
      value.turns = value.turns.map(turn => turn.id === reconcileTurnId ? detail.turn : turn);
    }
    if (!alive.current) return;
    if (exploration ? value.conversation.conversationScope?.kind !== 'exploration' || value.conversation.conversationScope.explorationId !== exploration.id
      : value.conversation.guideId !== guide?.metadata.id || value.conversation.revision !== guide?.metadata.revision) throw new Error('该对话属于另一个研究主题或导读修订，请从对应位置打开。');
    connectedId.current = id; setConversationId(id);
    setTurns(previous => {
      if (!preserveScroll) return value.turns;
      const incoming = new Map(value.turns.map(turn => [turn.id, turn]));
      const merged = previous.map(turn => {
        const next = incoming.get(turn.id); incoming.delete(turn.id);
        return !next || next.summaryOnly && !turn.summaryOnly && next.status === turn.status ? turn : next;
      });
      return [...merged, ...incoming.values()];
    });
    if (!preserveScroll) setTurnCursor(value.nextCursor ?? null);
    if (!preserveScroll) nearBottom.current = true;
    return value;
  }
  async function loadMore(kind: 'conversations' | 'turns') {
    if (!status || locked) return; setBusy(true); setError('');
    try {
      if (kind === 'conversations' && conversationCursor) {
        const result = exploration ? await aiClient(status.csrfToken).researchConversations(exploration.id, undefined, conversationCursor)
          : await aiClient(status.csrfToken).conversations(guide!.metadata.id, guide!.metadata.revision, undefined, conversationCursor);
        setConversations(previous => [...previous, ...result.conversations.filter(item => !previous.some(old => old.id === item.id))]); setConversationCursor(result.nextCursor ?? null);
      } else if (kind === 'turns' && conversationId && turnCursor) {
        const id = conversationId, height = messages.current?.scrollHeight ?? 0, top = messages.current?.scrollTop ?? 0;
        const result = await aiClient(status.csrfToken).conversation(id, undefined, turnCursor);
        if (connectedId.current !== id) return;
        nearBottom.current = false;
        setTurns(previous => [...result.turns.filter(item => !previous.some(old => old.id === item.id)), ...previous]); setTurnCursor(result.nextCursor ?? null);
        requestAnimationFrame(() => { if (messages.current) messages.current.scrollTop = top + messages.current.scrollHeight - height; });
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function readTurn(id: string) {
    if (!status || locked) return; setBusy(true); setError(''); const owner = connectedId.current;
    try { const result = await aiClient(status.csrfToken).turn(id); if (alive.current && connectedId.current === owner) setTurns(previous => previous.map(turn => turn.id === id ? result.turn : turn)); }
    catch (reason) { setError(errorText(reason)); } finally { if (alive.current) setBusy(false); }
  }
  async function connect() {
    const generation = ++connectGeneration.current;
    setConnecting(true); setConnectionError(''); setError('');
    try {
      const next = await getAiStatus();
      if (!alive.current || generation !== connectGeneration.current) return;
      receiveStatus(next);
      await loadList(next);
      if (!alive.current || generation !== connectGeneration.current) return;
      const remembered = connectedId.current;
      if (remembered) {
        try { await loadConversation(remembered, next); }
        catch (reason) { if (!(reason instanceof AiApiError) || reason.status !== 404) throw reason; connectedId.current = undefined; setConversationId(undefined); setTurns([]); setTurnCursor(null); }
      }
    } catch (reason) { if (alive.current && generation === connectGeneration.current) setConnectionError(errorText(reason)); }
    finally { if (alive.current && generation === connectGeneration.current) setConnecting(false); }
  }
  async function chooseConversation(id: string) {
    if (locked || connecting) return false;
    setError(''); setNotice('');
    if (!id) { connectedId.current = undefined; setConversationId(undefined); setTurns([]); setTurnCursor(null); pendingRequest.current = undefined; return true; }
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
    // A leading /方向 or /选文 is the reader's explicit request to create or save a result.
    const parsed = parseCommand(text);
    let command: ResearchCommand | undefined;
    if (parsed?.command.name === 'direction') command = { name: 'direction' };
    else if (parsed) {
      const purpose = parsed.command.purpose ?? (exploration ? 'research' : 'accumulation');
      if (purpose === 'research' && !exploration) { setError('推进类选文需要先关联方向：在上方选择方向，或先输入 /方向 建立。问题草稿已保留。'); return; }
      command = { name: 'reading-brief', purpose };
    }
    let researchSnapshot, researchMaterials, progress;
    if (exploration || command?.name === 'reading-brief') {
      setBusy(true);
      try {
        if (exploration) {
          const current = await personalStore.get('explorations', exploration.id);
          if (!current) throw new Error('关联的方向已不可用。问题草稿仍保留。');
          researchSnapshot = await createResearchSnapshot(current);
          researchMaterials = await prepareSelectedMaterials(exploration.id, selectedMaterials);
        }
        if (command?.name === 'reading-brief') progress = await readingProgress();
      } catch (reason) { setError(errorText(reason)); setBusy(false); return; }
      setBusy(false);
      if (!alive.current) return;
    }
    const base = { conversationId, ...(guide && unit ? { guideId: guide.metadata.id, revision: guide.metadata.revision,
      bodySha256: guide.metadata.bodySha256, unitId: unit.id, ...(questionSelection ? { selection: questionSelection } : {}) } : {}),
      ...(exploration ? { conversationScope: { kind: 'exploration' as const, explorationId: exploration.id }, researchSnapshot, ...(researchMaterials ? { researchMaterials } : {}) } : {}),
      ...(command ? { command, ...(progress ? { readingProgress: progress } : {}) } : {}), question: text,
      webSearch: Boolean(webSearch && status.searchAvailable) };
    const previous = pendingRequest.current;
    const oldBase = previous ? (({ requestId: _id, ...rest }) => rest)(previous.input) : undefined;
    const request: AskInput = { ...base, requestId: previous && !previous.accepted && JSON.stringify(oldBase) === JSON.stringify(base) ? previous.input.requestId : crypto.randomUUID() };
    pendingRequest.current = { input: request, accepted: false };
    const abort = new AbortController(); controller.current = abort;
    let localId = `pending-${request.requestId}`, acceptedId: string | undefined, completed = false, finished: AiTurn | undefined;
    const optimistic: AiTurn = { id: localId, question: text, answer: '', status: 'running', sources: [], context: {
      guideId: request.guideId, revision: request.revision, unitId: request.unitId, selection: request.selection ?? '',
      scope: 'pending', webSearch: request.webSearch,
      researchSnapshot,
      ...(researchMaterials ? { researchMaterials } : {}),
      ...(command ? { command } : {}),
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
        else if (event.type === 'done') { update(() => event.turn); completed = event.turn.status === 'complete'; finished = event.turn; }
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
        try { await loadList(status); if (acceptedId) await loadConversation(acceptedId, status, true, completed ? undefined : localId); }
        catch { if (alive.current) setNotice('本页回答仍保留，尚未确认服务端状态。请刷新对话核对。'); }
        finally {
          // A provider may have reported an expired login or refreshed model choice.
          try { const next = await getAiStatus(); receiveStatus(next); } catch { /* Keep the answer and the last known status. */ }
          if (alive.current) {
            if (completed) { setQuestion(''); setMaterial(undefined); clearDraft(draftKey); pendingRequest.current = undefined; }
            setSending(false); setPhase('');
            // Keep the composer locked until the result is saved; a new direction switches the panel.
            if (completed && finished?.context?.command) { setBusy(true); try { await runCommand(finished, acceptedId); } finally { if (alive.current) setBusy(false); } }
          }
        }
      }
    }
  }
  function editQuestion(value: string) {
    if (value && !material && currentUnit) setMaterial({ unitId: currentUnit.id, selection });
    if (!value) setMaterial(undefined);
    setQuestion(value);
  }
  turnsRef.current = turns;
  async function runCommand(turn: AiTurn, owner = connectedId.current) {
    setOutcomes(current => { const next = { ...current }; delete next[turn.id]; return next; });
    try {
      const linked = exploration ? await personalStore.get('explorations', exploration.id) : undefined;
      const outcome = await applyCommandTurn(turn, { linked, conversation: turnsRef.current, conversationId: owner });
      if (!alive.current) return;
      setOutcomes(current => ({ ...current, [turn.id]: outcome }));
      if (outcome.kind === 'direction-created') onDirectionCreated?.(outcome.record);
    } catch (reason) {
      if (!alive.current) return;
      setOutcomes(current => ({ ...current, [turn.id]: { kind: 'pending' } }));
      setError(`指令结果未能保存：${errorText(reason)} 可以点这一轮下方的“保存结果”重试。`);
    }
  }
  // History shows what earlier commands produced, read from saved records without writing.
  useEffect(() => {
    let live = true;
    const unknown = turns.filter(turn => turn.context?.command && turn.status === 'complete' && !turn.summaryOnly && !outcomes[turn.id]);
    if (!unknown.length) return;
    void Promise.all(unknown.map(async turn => [turn.id, await commandOutcome(turn, exploration).catch((): CommandOutcome => ({ kind: 'pending' }))] as const))
      .then(entries => { if (live) setOutcomes(current => ({ ...Object.fromEntries(entries), ...current })); });
    return () => { live = false; };
  }, [turns, exploration?.recordRevision]);
  const menuOptions = menuDismissed === question ? [] : matchingOptions(question, exploration);
  function pickCommand(option: CommandOption) {
    const value = `${option.token} `; editQuestion(value); setMenuDismissed(value); setCommandMenu(0); input.current?.focus();
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
      connectedId.current = undefined; setConversationId(undefined); setTurns([]); setTurnCursor(null); setDeleteOpen(false);
      pendingRequest.current = undefined; await loadList(status); setNotice('这段对话已从本机服务删除。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function exportAll() {
    if (!status || locked) return;
    setBusy(true); setError(''); const operation = new AbortController(); transfer.current = operation;
    try {
      const backup = await aiClient(status.csrfToken).exportFile(operation.signal);
      if (backup) {
        const url = URL.createObjectURL(backup), anchor = document.createElement('a'); anchor.href = url; anchor.download = `paperdesk-ai-backup-${new Date().toISOString().slice(0, 10)}.ndjson`;
        anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice('已生成全部 AI 对话的备份下载，请在浏览器下载列表确认文件。');
    } catch (reason) { setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function previewFile(file?: File) {
    setError(''); setImportPreview(undefined);
    if (!file || !status) return;
    const operation = new AbortController(); transfer.current?.abort(); transfer.current = operation; setBusy(true);
    try {
      const result = await aiClient(status.csrfToken).previewBackupFile(file, operation.signal);
      if (!operation.signal.aborted) setImportPreview({ file, bytes: file.size, schemaVersion: result.schemaVersion, conversationCount: result.counts.conversations, turnCount: result.counts.turns });
    } catch (reason) { if (!operation.signal.aborted) setError(errorText(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function importAll() {
    if (!status || !importPreview || locked) return;
    setBusy(true); setError(''); const operation = new AbortController(); transfer.current = operation;
    try {
      await aiClient(status.csrfToken).importFile(importPreview.file, operation.signal);
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
      {picker}
      {exploration && <div className="ai-research-line">{!guide && <strong>{exploration.title}</strong>}<details className="ai-research-preview"><summary>方向记录 r{exploration.recordRevision}</summary><p>关联方向后，每次提问会带上这个方向的问题、认识、决定、材料和下一步，并参考同方向的旧讨论；其他方向和未选笔记不会发送。</p><ResearchSnapshotView snapshot={researchSnapshotData(exploration)} /></details>
        <button type="button" className="ai-inline-action" disabled={locked} onClick={() => setMaterialsPickerOpen(true)}>{selectedMaterials.notes.length || selectedMaterials.artifacts.length ? `资料 · 已选 ${selectedMaterials.notes.length} 条笔记、${selectedMaterials.artifacts.length} 份文档` : '资料 · 默认不发送'}</button></div>}
      {unit && <>
      <button type="button" className="ai-material-trigger" onClick={() => setMaterialOpen(true)} aria-label="查看本次提问资料">
        <span><span className="ai-context-label">{sending ? '本次提问位置' : question ? '已固定提问位置' : '围绕这一节提问'}</span><span className="ai-context-current">{questionSelection ? '选文 · ' : ''}{unit.heading ?? '阅读起点'}</span></span><span className="ai-material-info">资料</span>
      </button>
      {materialChanged && !sending && currentUnit && <button type="button" className="ai-material-change" disabled={locked} onClick={() => setMaterial({ unitId: currentUnit.id, selection })}>{selection ? '改用当前选文' : '改用当前阅读章节'} <span aria-hidden="true">↗</span></button>}
      </>}
    </div>
    <div className="ai-messages" ref={messages} role="region" aria-label="AI 解读对话" tabIndex={0} onScroll={event => { const node = event.currentTarget; if (autoTop.current !== undefined && Math.abs(node.scrollTop - autoTop.current) < 2) return; autoTop.current = undefined; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; }}>
      {exploration && !conversationId && conversations.length > 0 && !connecting && !connectionError && <div className="ai-service-state"><p>这个方向已有讨论：{conversations[0].title}</p><button type="button" className="ai-inline-action" disabled={locked} onClick={() => void chooseConversation(conversations[0].id)}>继续最近的讨论</button><p>只恢复对话，当前问题草稿与资料选择保持不变。</p></div>}
      {connecting ? <p className="ai-service-state" role="status">正在连接…</p> : connectionError ? <div className="ai-service-state"><p>{connectionError}</p><button type="button" className="ai-inline-action" onClick={() => void connect()}>重试连接</button></div> : status && !status.configured ? <div className="ai-service-state"><p>{status.provider === 'chatgpt' ? '连接 ChatGPT 后即可提问。' : '连接 ChatGPT 订阅，或配置自己的 API。'}</p><button type="button" className="ai-inline-action" onClick={() => setSettingsOpen(true)}>打开 AI 设置</button></div> : null}
      {!turns.length && <div className="ai-empty"><p className="ai-empty-heading">{exploration ? `继续讨论《${exploration.title}》` : '从这篇导读继续追问'}</p><p className="ai-empty-copy">{exploration ? '说出新的疑惑或想法即可。讨论有了变化时输入 /方向 更新这个方向；需要更多论文时输入 /选文。' : '读到想深入的地方，可以输入 /方向 建立研究方向，或输入 /选文 让 Harness 补充综述和论文。'}</p><div className="ai-suggestions">{(exploration ? researchSuggestions : suggestions).map((value, index) => <button key={value} type="button" disabled={locked} onClick={() => {
        editQuestion(value); const caret = value.startsWith(recapPrompt) ? recapPrompt.length : value.length;
        requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); });
      }}>{exploration ? researchSuggestionLabels[index] : suggestionLabels[index]}<span aria-hidden="true">↗</span></button>)}</div></div>}
      {turnCursor && <button type="button" className="ai-inline-action" disabled={locked} onClick={() => void loadMore('turns')}>读取更早的问答</button>}
      {turns.map((turn, index) => <section className="ai-turn" key={turn.id} aria-label={`问题 ${index + 1}`}>
        <div className="ai-question"><span className="ai-speaker">{turn.context?.command ? '指令' : '你的问题'}{turn.summaryOnly ? ' · 历史摘要' : ''}</span><p>{turn.question}</p>{!turn.summaryOnly && <TurnMaterial turn={turn} />}</div>
        <div className="ai-response"><div className="ai-response-label"><span>AI 解读</span>{turn.status !== 'complete' && <span className="ai-turn-state">{turn.status === 'running' ? '生成中' : turn.status === 'interrupted' ? '未完成' : '出错'}</span>}</div>
          <AnswerIdentity turn={turn} />
          {turn.context?.fallback?.reason === 'subscription_quota' && <p className="ai-fallback-notice">订阅或应用额度已达上限 · 本轮由 API 回答</p>}
          {turn.answer ? <Answer turn={turn} /> : <p className="ai-empty-answer">{turn.status === 'running' ? '正在阅读文章上下文…' : '这轮还没有可显示的回答。问题已保留。'}</p>}
          {turn.summaryOnly ? <button type="button" className="ai-inline-action" disabled={locked} onClick={() => void readTurn(turn.id)}>读取完整问答与 {turn.sourceCount ?? 0} 条依据</button> : <><PreviousAnswer turn={turn} /><Sources sources={turn.sources} turnId={turn.id} /></>}
          {turn.answer && !turn.summaryOnly && <button type="button" className="ai-inline-action ai-copy" onClick={() => void copy(turn.answer)}>复制{turn.status === 'complete' ? '回答' : '已有内容'}</button>}
          {exploration && !turn.summaryOnly && <ResearchProposals turn={turn} exploration={exploration} disabled={locked} />}
          {turn.context?.command && <CommandResult turn={turn} outcome={outcomes[turn.id]} disabled={locked} onRetry={() => void runCommand(turn)} />}
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
      {menuOptions.length > 0 && <CommandMenu options={menuOptions} active={Math.min(commandMenu, menuOptions.length - 1)} onHover={setCommandMenu} onPick={pickCommand} />}
      {commandHint(question, exploration) && <p className="ai-command-hint">{commandHint(question, exploration)}</p>}
      <div className="ai-input-surface"><label className="ai-visually-hidden" htmlFor={questionId}>向 AI 提问</label><textarea id={questionId} ref={input} rows={3} value={question} maxLength={6000} disabled={locked} placeholder={exploration ? '继续讨论这个方向；输入 / 使用指令' : '关于这篇文章，你想进一步理解什么？输入 / 使用指令'} onChange={event => editQuestion(event.target.value)} onKeyDown={event => {
        if (menuOptions.length && !event.nativeEvent.isComposing) {
          const enabled = menuOptions.filter(option => !option.disabled);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setCommandMenu(index => (index + (event.key === 'ArrowDown' ? 1 : menuOptions.length - 1)) % menuOptions.length); return; }
          if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && enabled.length) { event.preventDefault(); const chosen = menuOptions[Math.min(commandMenu, menuOptions.length - 1)]; pickCommand(chosen.disabled ? enabled[0] : chosen); return; }
          if (event.key === 'Escape') { event.preventDefault(); setMenuDismissed(question); return; }
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(); }
      }} />
      <div className="ai-composer-actions"><button type="button" className="ai-provider-trigger" disabled={locked} aria-label={`AI 设置：${providerLabel(status)}，${webSearch && status?.searchAvailable ? '联网已开启' : '联网关闭'}`} title="设置模型连接与联网查证" onClick={() => setSettingsOpen(true)}><span className={ready ? 'is-connected' : ''} aria-hidden="true" /><span>{providerLabel(status)}<span className="ai-provider-search">{webSearch && status?.searchAvailable ? ' · 联网' : ' · 不联网'}</span></span><span className="ai-provider-chevron" aria-hidden="true">⌄</span></button>{sending ? <button type="button" className="ai-send" onClick={() => controller.current?.abort()}>停止</button> : <button className="ai-send" type="submit" disabled={!ready || locked || hasRunning || selectionTooLong || !question.trim() || question.length > 6000}>发送 <span aria-hidden="true">↑</span></button>}</div></div>
      {(sending || question.length > 5000) && <p className="ai-composer-hint">{sending ? '关闭会停止回答' : `${question.length} / 6000`}</p>}
    </form>
    {deleteOpen && <Dialog title="删除这段 AI 对话" className="ai-small-dialog" busy={busy} onClose={() => setDeleteOpen(false)}><p>将删除整段对话与引用，无法撤销。笔记与阅读记录会保留。</p><p>可先在“AI 对话备份”中导出。</p>{error && <p role="alert" className="ai-error">{error}</p>}<div className="form-actions"><button className="secondary-action" disabled={busy} onClick={() => setDeleteOpen(false)}>保留对话</button><button className="danger-action" disabled={busy} onClick={() => void remove()}>确认删除这段对话</button></div></Dialog>}
    {copyText !== undefined && <Dialog title="手动复制回答" onClose={() => setCopyText(undefined)}><p>浏览器自动复制不可用。选中下方文字后使用 Ctrl+C 或系统复制。</p><textarea className="ai-copy-fallback" aria-label="回答完整内容" readOnly value={copyText} rows={12} onFocus={event => event.currentTarget.select()} /><button className="secondary-action" onClick={event => { const area = event.currentTarget.parentElement?.querySelector('textarea'); area?.focus(); area?.select(); }}>选中全部内容</button></Dialog>}
    {materialOpen && guide && unit && <Dialog title="本次提问资料" className="ai-material-dialog ai-small-dialog" onClose={() => setMaterialOpen(false)}>
      <p className="ai-guide-title">{guide.metadata.title}<span>导读 r{guide.metadata.revision} · {unit.heading ?? '阅读起点'}</span></p>
      <dl className="ai-material-list"><div><dt>随问题发送</dt><dd>本篇导读（按本轮预算可能仅发送开篇与提问章节，必要时为节选）、来源与覆盖说明，以及预算内最多 6 轮近期对话。精确范围保存在每轮「提问时的资料」中。</dd></div><div><dt>按需取证</dt><dd>提问后可检索已明确导入的固定原文文本，来源区分导读、原文与网页摘录；未取得或未核验的部分会保留缺口。</dd></div><div><dt>不包含</dt><dd>{exploration ? '其他探索、未选笔记和阅读历史；不会自动下载原论文。' : '个人笔记、探索记录和阅读历史；不会自动下载原论文。'}</dd></div></dl>
      {questionSelection && <section className="ai-selected-material"><h3>附带选文</h3><blockquote>{questionSelection}</blockquote><button type="button" className="ai-inline-action" disabled={locked} onClick={() => setMaterial({ unitId: unit.id })}>不附带选文</button></section>}
      <p className="ai-fine-print">AI 可以继续查找本地书库与相关导读章节。改变阅读位置不会替换正在编辑或已发出问题的资料。</p>
      {status?.provider === 'chatgpt' && status.apiConfigured && status.chatgpt.fallbackToApi && <p className="ai-fine-print">订阅或此应用额度用尽时，同一问题与资料会转交已配置的备用 API，可能产生 API 费用。</p>}
    </Dialog>}
    {settingsOpen && <Dialog title="AI 设置" onClose={() => setSettingsOpen(false)} className="ai-settings-dialog ai-small-dialog"><ChatGptConnection status={status} disabled={locked || hasRunning} webSearch={webSearch} onWebSearch={setWebSearch} onStatus={next => { receiveStatus(next); setConnectionError(''); }} /></Dialog>}
    {materialsPickerOpen && exploration && <ResearchMaterialsPicker exploration={exploration} selected={selectedMaterials} onChange={setSelectedMaterials} disabled={locked} onClose={() => setMaterialsPickerOpen(false)} />}
    {historyOpen && <Dialog title="历史对话" className="ai-history-dialog ai-small-dialog" busy={busy} onClose={() => setHistoryOpen(false)}><p className="ai-dialog-intro">{exploration ? `${exploration.title} · 研究主题的讨论` : `这篇导读的讨论 · r${guide?.metadata.revision}`}</p>
      {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}
      <div className="ai-history-list">{conversations.length ? conversations.map(item => <button key={item.id} type="button" aria-current={conversationId === item.id ? 'true' : undefined} disabled={locked || connecting || !status || Boolean(connectionError)} onClick={async () => { if (await chooseConversation(item.id)) setHistoryOpen(false); }}><span>{item.title}</span><time>{timeLabel(item.updatedAt)}</time></button>) : <p>还没有保存的对话。</p>}</div>
      {conversationCursor && <button type="button" className="ai-inline-action" disabled={locked} onClick={() => void loadMore('conversations')}>读取更多对话</button>}
      <div className="ai-history-actions"><button type="button" className="ai-inline-action" disabled={locked || !status} onClick={() => void refresh()}>刷新对话</button><button type="button" className="ai-inline-action ai-danger" disabled={locked || !conversationId || hasRunning} onClick={() => { setDeleteOpen(true); setError(''); }}>删除当前对话…</button><button type="button" className="ai-inline-action" disabled={locked} onClick={() => { setBackupOpen(true); setError(''); setNotice(''); }}>备份与恢复</button></div>
      <p className="ai-fine-print">对话保存在本机服务，与浏览器笔记分别保存。</p>
    </Dialog>}
    {backupOpen && <Dialog title="AI 对话备份" busy={busy} onClose={() => { setBackupOpen(false); setImportPreview(undefined); }} className="ai-backup-dialog ai-small-dialog"><p className="ai-dialog-intro">导出或恢复全部文章的 AI 对话。</p><p className="ai-fine-print">包含提问、回答与引用，可能有私人文字，请妥善保管。浏览器笔记与连接授权不在此备份中。</p>
      {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}
      <div className="ai-backup-actions"><button className="primary-action" disabled={busy || !status || Boolean(connectionError)} onClick={() => void exportAll()}>导出全部 AI 对话</button><button className="secondary-action" disabled={busy || !status || Boolean(connectionError)} onClick={() => fileInput.current?.click()}>选择备份文件…</button></div><p className="ai-fine-print">新版 NDJSON 分块校验备份；兼容旧 JSON（16 MiB 内）。大备份直接写入所选文件，导入前完整校验，不会请求模型。原文材料需另行备份。</p>
      {status?.storage?.nearCapacity && <p className="ai-error">AI 记录接近运行容量，请先备份再整理旧对话。</p>}
      {busy && <button type="button" onClick={() => { transfer.current?.abort(); setNotice('已请求取消；已提交的恢复以重新读取的记录为准。'); }}>取消文件操作</button>}
      <input className="ai-visually-hidden" ref={fileInput} type="file" accept=".json,.ndjson,application/json,application/x-ndjson" aria-label="选择 AI 对话备份" onChange={event => { void previewFile(event.target.files?.[0]); event.target.value = ''; }} />
      {importPreview && <section className="ai-import-preview"><h3>导入前检查</h3><p>{importPreview.conversationCount} 段对话，{importPreview.turnCount} 轮问答 · {(importPreview.bytes / 1024).toFixed(1)} KiB · 格式 v{importPreview.schemaVersion}</p><p>完整文件及引用已在本机服务校验。已有相同对话或问答时，整份文件不会导入。请保留备份并核对现有对话。</p><div className="form-actions"><button className="primary-action" disabled={busy} onClick={() => void importAll()}>确认导入 AI 备份</button><button className="secondary-action" disabled={busy} onClick={() => setImportPreview(undefined)}>取消</button></div></section>}
    </Dialog>}
  </aside>;
}
