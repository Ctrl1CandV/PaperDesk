import type { ResearchSnapshot, ResearchProposal } from '../../shared/research-contract.mjs';
import type { ResearchMaterials } from '../../shared/research-materials.mjs';
import type { ResearchCommand } from '../../shared/research-documents.mjs';
import type { DirectionDraft } from '../../shared/research-contract.mjs';
import type { NotebookDraft } from '../../shared/research-notebook.mjs';
export type AiProvider = 'api' | 'chatgpt';
export type ConversationScope = { kind: 'guide'; guideId: string; revision: number; bodySha256: string } | { kind: 'exploration'; explorationId: string };
export interface ChatGptAvailability {
  state: 'unknown' | 'available' | 'quota_exhausted';
  checkedAt: string | null; model: string | null; checking: boolean; lastError: string | null;
}
export interface AiStatus {
  storage?: { bytes: number; reservedBytes: number; capacityBytes: number; nearCapacity: boolean; conversations: number; turns: number };
  configured: boolean; model: string | null; searchAvailable: boolean; csrfToken: string;
  provider: AiProvider; apiConfigured: boolean;
  chatgpt: { connected: boolean; loginPending: boolean; needsLogin: boolean; fallbackToApi: boolean; availability: ChatGptAvailability; error?: string };
}
export interface ChatGptAuthorization { authorizationUrl: string; expiresAt: string }
export interface AiSettings {
  revision: string;
  api: { baseURL: string; modelId: string; apiKeyConfigured: boolean };
  chatgpt: { modelId: string; reasoningEffort: string; fallbackToApi: boolean };
  search: { apiKeyConfigured: boolean };
}
export interface AiSettingsResult { settings: AiSettings; status: AiStatus }
export interface ChatGptModels {
  models: { id: string; name: string; reasoningEfforts?: string[]; defaultReasoningEffort?: string | null }[];
  selectedModelId: string;
}
/** Read-only counts for one direction's discussions, with guides read or cited there. */
export interface TopicSummary { conversations: number; turns: number; lastTurnAt: string | null; guides: { guideId: string; revision: number; askedWhileReading: number; cited: number }[] }
export interface AiConversation { id: string; title: string; guideId?: string; revision?: number; conversationScope?: ConversationScope; updatedAt: string }
export interface AiSource {
  id: string; kind: 'guide' | 'web' | 'original'; title: string; url?: string;
  guideId?: string; revision?: number; unitId?: string; text: string; version?: string | null;
  paperId?: string; sourceRevisionId?: string; materialSha256?: string; parserRevision?: string; sourceUnitId?: string;
  locator?: { label: string; physicalPage: number | null; printedPageLabel: string | null; anchor: string | null };
  readRanges?: { start: number; end: number; total: number }[];
  gaps?: string[]; verification?: 'unreviewed' | 'text-checked' | 'visually-checked';
}
export interface AiContext {
  researchSnapshot?: ResearchSnapshot;
  researchProposals?: ResearchProposal[];
  researchMaterials?: ResearchMaterials;
  command?: ResearchCommand;
  directionDraft?: DirectionDraft;
  notebookDraft?: NotebookDraft;
  readingProgress?: ReadingProgress[];
  topicHistory?: { explorationId: string; turns: { turnId: string; conversationId: string; question: string; answer: string; createdAt: string; questionTruncated: boolean; answerTruncated: boolean }[]; windowCount: number; omittedCount: number; omittedTurnIds: string[] };
  provider?: AiProvider;
  model?: string | null;
  fallback?: {
    reason: 'subscription_quota'; stage: 'catalog' | 'answer'; fromModel: string | null;
    previousAnswer: string; previousToolCount: number;
  };
  [key: string]: unknown;
}
export interface AiTurn {
  id: string; question: string; answer: string;
  status: 'running' | 'complete' | 'interrupted' | 'error';
  sources: AiSource[]; context: AiContext | null; createdAt: string;
  summaryOnly?: boolean; sourceCount?: number;
}
export interface AiConversationDetail { conversation: AiConversation; turns: AiTurn[]; nextCursor?: string | null }
export interface AiBackupPreview { counts: { conversations: number; turns: number }; schemaVersion: number; exportedAt: string }
export interface AiMaterialView { text: string; title: string; locator: NonNullable<AiSource['locator']>; gaps: string[]; verification: NonNullable<AiSource['verification']> }
export interface AskInput {
  requestId: string; conversationId?: string; guideId?: string; revision?: number;
  bodySha256?: string; unitId?: string; selection?: string; question: string; webSearch: boolean;
  conversationScope?: ConversationScope; researchSnapshot?: ResearchSnapshot; researchMaterials?: ResearchMaterials;
  command?: ResearchCommand; readingProgress?: ReadingProgress[];
}
export interface ReadingProgress { guideId: string; revision: number; guide: string | null; original: string | null }
export type AiEvent =
  | { type: 'accepted'; conversationId: string; turnId: string }
  | { type: 'status'; text: string }
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'delta'; text: string }
  | { type: 'replace'; text: string }
  | { type: 'reset'; turn: AiTurn }
  | { type: 'done'; turn: AiTurn }
  | { type: 'error'; message: string; turn?: AiTurn };

const ROOT = '/api/ai';
function statusDefaults(status: AiStatus): AiStatus {
  const availability = status.chatgpt?.availability;
  return { ...status, chatgpt: { ...status.chatgpt, fallbackToApi: status.chatgpt?.fallbackToApi ?? true, availability: {
    state: availability?.state === 'available' || availability?.state === 'quota_exhausted' ? availability.state : 'unknown',
    checkedAt: typeof availability?.checkedAt === 'string' ? availability.checkedAt : null,
    model: typeof availability?.model === 'string' ? availability.model : null,
    checking: availability?.checking === true,
    lastError: typeof availability?.lastError === 'string' ? availability.lastError : null,
  } } };
}
function settingsDefaults(settings: AiSettings): AiSettings {
  return { ...settings, chatgpt: { ...settings.chatgpt, reasoningEffort: settings.chatgpt.reasoningEffort ?? '', fallbackToApi: settings.chatgpt.fallbackToApi ?? true } };
}
function settingsResultDefaults(result: AiSettingsResult): AiSettingsResult {
  return { settings: settingsDefaults(result.settings), status: statusDefaults(result.status) };
}
export class AiApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'AiApiError'; }
}
async function responseError(response: Response): Promise<never> {
  let message = response.status === 404 || response.status === 502
    ? '尚未连接到本机 AI 服务。启动服务后可以重试，草稿仍会保留。'
    : response.status === 403 ? '连接凭据已更新，请重试连接后再操作。'
      : `本机 AI 服务未能完成请求（${response.status}），请重试。`;
  try {
    const value = await response.json();
    // Only the local API's structured, sanitized errors are shown, never an HTML error page.
    if (typeof value?.error === 'string') message = value.error.slice(0, 1000);
    else if (typeof value?.message === 'string') message = value.message.slice(0, 1000);
  } catch { /* Keep the local fallback. */ }
  throw new AiApiError(message, response.status);
}
export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  let response: Response;
  try { response = await fetch(`${ROOT}/status`, { signal, cache: 'no-store' }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new AiApiError('尚未连接到本机 AI 服务。可以先写下问题，启动服务后重试。');
  }
  if (!response.ok) return responseError(response);
  let status: AiStatus;
  try { status = await response.json(); }
  catch { throw new AiApiError('本机 AI 服务尚未就绪，请启动服务后重试。'); }
  if (typeof status.configured !== 'boolean' || typeof status.csrfToken !== 'string' || !status.csrfToken)
    throw new AiApiError('本机 AI 服务响应无效，请重试连接。');
  return statusDefaults(status);
}

export function aiClient(token: string) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${ROOT}${path}`, {
      ...options, cache: 'no-store', headers: { 'x-paperdesk-token': token, ...options.headers },
    });
    if (!response.ok) return responseError(response);
    if (response.status === 204) return undefined as T;
    return response.json();
  }
  async function transferFile(file: File, signal?: AbortSignal, preview = false): Promise<AiBackupPreview | { counts: AiBackupPreview['counts'] }> {
    const prefix = await file.slice(0, 4096).text();
    let manifest: { type?: string } | null = null;
    try { manifest = JSON.parse(prefix.split('\n', 1)[0]); } catch { /* Legacy JSON is checked below. */ }
    if (manifest?.type === 'manifest') {
      return request(`/import/stream${preview ? '?preview=1' : ''}`, { method: 'POST', signal, headers: { 'content-type': 'application/x-ndjson' }, body: file });
    }
    if (file.size > 16 * 1024 * 1024) throw new AiApiError('旧 JSON 备份最多 16 MiB；大型记录库请使用新版 NDJSON 分块备份。');
    let value: unknown;
    try { value = JSON.parse(await file.text()); } catch { throw new AiApiError('备份不是有效的 JSON 或 NDJSON 文件。'); }
    return request(`/import${preview ? '?preview=1' : ''}`, { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  }
  return {
    settings: (signal?: AbortSignal) => request<AiSettings>('/settings', { signal }).then(settingsDefaults),
    saveApiSettings: (input: { revision: string; baseURL: string; modelId: string; apiKey?: string }) => request<AiSettingsResult>('/settings/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(settingsResultDefaults),
    saveSearchSettings: (input: { revision: string; apiKey: string }) => request<AiSettingsResult>('/settings/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(settingsResultDefaults),
    saveChatGptSettings: (input: { revision: string; modelId: string; reasoningEffort?: string }) => request<AiSettingsResult>('/settings/chatgpt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(settingsResultDefaults),
    saveFallbackSettings: (input: { revision: string; enabled: boolean }) => request<AiSettingsResult>('/settings/fallback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(settingsResultDefaults),
    chatGptModels: (signal?: AbortSignal, refresh = false) => request<ChatGptModels>(`/chatgpt/models${refresh ? '?refresh=1' : ''}`, { signal }),
    checkChatGpt: (signal: AbortSignal) => request<AiStatus>('/chatgpt/check', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: '{}' }).then(statusDefaults),
    connectChatGpt: () => request<ChatGptAuthorization>('/chatgpt/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    cancelChatGpt: () => request<unknown>('/chatgpt/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    disconnectChatGpt: () => request<AiStatus>('/chatgpt/disconnect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(statusDefaults),
    provider: (provider: AiProvider) => request<AiStatus>('/provider', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider }) }).then(statusDefaults),
    conversations: (guideId: string, revision: number, signal?: AbortSignal, cursor?: string) => request<{ conversations: AiConversation[]; nextCursor?: string | null }>(`/conversations?${new URLSearchParams({ guideId, revision: String(revision), ...(cursor ? { cursor } : {}) })}`, { signal }),
    topicSummary: (explorationId: string, signal?: AbortSignal) => request<TopicSummary>(`/topics/${explorationId}/summary`, { signal }),
    researchConversations: (explorationId: string, signal?: AbortSignal, cursor?: string) => request<{ conversations: AiConversation[]; nextCursor?: string | null }>(`/conversations?${new URLSearchParams({ explorationId, ...(cursor ? { cursor } : {}) })}`, { signal }),
    conversation: (id: string, signal?: AbortSignal, cursor?: string) => request<AiConversationDetail>(`/conversations/${encodeURIComponent(id)}?summary=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
    turn: (id: string, signal?: AbortSignal) => request<{ turn: AiTurn }>(`/turns/${encodeURIComponent(id)}`, { signal }),
    material: (source: AiSource, signal?: AbortSignal) => request<AiMaterialView>(`/materials/${encodeURIComponent(source.sourceRevisionId ?? '')}/${encodeURIComponent(source.parserRevision ?? '')}/${encodeURIComponent(source.sourceUnitId ?? '')}`, { signal }),
    remove: (id: string) => request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    export: () => request<unknown>('/export'),
    previewBackupFile: (file: File, signal?: AbortSignal) => transferFile(file, signal, true) as Promise<AiBackupPreview>,
    importFile: (file: File, signal?: AbortSignal) => transferFile(file, signal),
    async exportFile(signal?: AbortSignal): Promise<Blob | null> {
      // A native save stream keeps a large backup out of JS memory. The bounded
      // fallback is for browsers without the local File System Access API.
      const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }> }).showSaveFilePicker;
      const handle = picker ? await picker.call(window, { suggestedName: 'paperdesk-ai-backup-v3.ndjson', types: [{ description: 'AI 对话分块备份', accept: { 'application/x-ndjson': ['.ndjson'] } }] }) : null;
      const response = await fetch(`${ROOT}/export/stream`, { signal, cache: 'no-store', headers: { 'x-paperdesk-token': token } });
      if (!response.ok) return responseError(response);
      if (!response.body) throw new AiApiError('浏览器未提供备份数据流。');
      if (handle) { await response.body.pipeTo(await handle.createWritable(), { signal }); return null; }
      const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 32 * 1024 * 1024) throw new AiApiError('大型备份需要支持直接保存文件的浏览器，请在桌面 Chrome 或 Edge 中导出。');
          chunks.push(new Uint8Array(value));
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      return new Blob(chunks, { type: 'application/x-ndjson' });
    },
    import: (backup: unknown) => request<{ counts?: unknown; imported?: number }>('/import', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(backup),
    }),
    async ask(input: AskInput, signal: AbortSignal, onEvent: (event: AiEvent) => void): Promise<void> {
      const response = await fetch(`${ROOT}/ask`, {
        method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-paperdesk-token': token },
        body: JSON.stringify(input),
      });
      if (!response.ok) return responseError(response);
      if (!response.body) throw new AiApiError('浏览器未提供流式响应，请刷新对话查看是否已保存。');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '', ended = false;
      const receive = (line: string) => {
        if (!line.trim()) return;
        let event: AiEvent;
        try { event = JSON.parse(line); } catch { throw new AiApiError('回答传输中断。请刷新对话恢复已保存内容。'); }
        if (event.type === 'done' || event.type === 'error') ended = true;
        onEvent(event);
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          if (buffer.length > 4 * 1024 * 1024) throw new AiApiError('回答超出单次传输限制，请刷新对话查看已保存内容。');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n')) >= 0) {
            receive(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1);
          }
          if (done) break;
        }
        if (buffer.trim()) receive(buffer);
        if (!ended) throw new AiApiError('回答连接已中断，请刷新对话恢复已保存内容。');
      } finally { reader.releaseLock(); }
    },
  };
}
