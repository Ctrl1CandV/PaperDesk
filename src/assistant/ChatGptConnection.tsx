import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { AiApiError, aiClient, getAiStatus, type AiProvider, type AiSettings, type AiStatus, type ChatGptAuthorization, type ChatGptModels } from './api';

const reasoningLabels: Record<string, string> = { none: '关闭', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高' };

// The browser receives only the official authorization URL and public connection
// status. Access/refresh tokens stay in the local backend and never enter this UI.
export function officialAuthorizationUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || url.username || url.password || url.port) return;
    return url.href;
  } catch { return; }
}

export function providerLabel(status?: AiStatus): string {
  if (!status) return '连接模型';
  if (status.provider === 'chatgpt') {
    if (status.chatgpt?.loginPending) return 'ChatGPT · 等待授权';
    if (status.chatgpt?.needsLogin) return 'ChatGPT · 需要重连';
    return status.chatgpt?.connected ? 'ChatGPT · 已连接' : 'ChatGPT · 未连接';
  }
  return status.configured ? 'API · 已配置' : '连接模型';
}

function checkedAtLabel(value?: string | null): string | undefined {
  if (!value) return;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return;
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ChatGptConnection({ status, disabled = false, onStatus }: {
  status?: AiStatus; disabled?: boolean; onStatus: (status: AiStatus) => void;
}) {
  const formId = useId();
  const [view, setView] = useState<AiProvider>(status?.provider ?? 'chatgpt');
  const [settings, setSettings] = useState<AiSettings>();
  const [baseURL, setBaseURL] = useState(''), [apiModel, setApiModel] = useState(''), [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [fallbackToApi, setFallbackToApi] = useState(status?.chatgpt?.fallbackToApi ?? true);
  const [models, setModels] = useState<ChatGptModels['models']>();
  const [modelError, setModelError] = useState(''), [modelsLoading, setModelsLoading] = useState(false);
  const [modelReload, setModelReload] = useState(0);
  const refreshModels = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'cancel' | 'disconnect' | 'provider' | 'save' | 'fallback' | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authorization, setAuthorization] = useState<ChatGptAuthorization>();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [probeRunning, setProbeRunning] = useState(false), [probeError, setProbeError] = useState('');
  const alive = useRef(true);
  const publish = useRef(onStatus); publish.current = onStatus;
  const currentStatus = useRef(status); currentStatus.current = status;
  const refreshController = useRef<AbortController | undefined>(undefined);
  const probeController = useRef<AbortController | undefined>(undefined);
  const connection = status?.chatgpt;
  const availability = connection?.availability;
  const probing = probeRunning || availability?.checking === true;
  const checkedAt = checkedAtLabel(availability?.checkedAt);
  const availabilityError = probeError || availability?.lastError;
  const pending = Boolean(connection?.loginPending || authorization);
  const connected = Boolean(connection?.connected && !connection.needsLogin);
  const apiConfigured = status?.apiConfigured ?? false;
  const activeProvider = status?.provider ?? 'api';
  const locked = Boolean(disabled || busy || refreshing || probing);
  const apiDirty = Boolean(settings && (baseURL !== settings.api.baseURL || apiModel !== settings.api.modelId || apiKey));
  const needsNewKey = Boolean(settings?.api.apiKeyConfigured && baseURL.trim() !== settings.api.baseURL);
  const chatDirty = Boolean(settings && (chatModel !== settings.chatgpt.modelId || reasoningEffort !== settings.chatgpt.reasoningEffort));
  const selectedModel = chatModel ? models?.find(model => model.id === chatModel) : models?.[0];
  const reasoningEfforts = selectedModel?.reasoningEfforts?.filter(effort => Object.hasOwn(reasoningLabels, effort)) ?? [];
  const reasoningSupported = !reasoningEffort || reasoningEfforts.includes(reasoningEffort);
  const defaultReasoning = selectedModel?.defaultReasoningEffort;
  const fallbackDirty = Boolean(settings && fallbackToApi !== settings.chatgpt.fallbackToApi);
  const fieldsLoaded = useRef(false);

  function cancelProbe() {
    const controller = probeController.current;
    if (!controller) return;
    probeController.current = undefined; controller.abort();
    if (alive.current) setProbeRunning(false);
  }
  function changeView(next: AiProvider) {
    if (next !== view) cancelProbe();
    setView(next); setNotice('');
  }

  function receiveSettings(next: AiSettings, replaceFields: boolean) {
    setSettings(next);
    if (replaceFields) { setBaseURL(next.api.baseURL); setApiModel(next.api.modelId); setChatModel(next.chatgpt.modelId); setReasoningEffort(next.chatgpt.reasoningEffort); setFallbackToApi(next.chatgpt.fallbackToApi); }
    fieldsLoaded.current = true;
  }

  function receive(next: AiStatus, publishAfterClose = false) {
    if (!alive.current) { if (publishAfterClose) publish.current(next); return; }
    const before = currentStatus.current;
    currentStatus.current = next; publish.current(next);
    if (!next.chatgpt?.loginPending) setAuthorization(undefined);
    if (before?.chatgpt?.loginPending && next.chatgpt?.connected && !next.chatgpt.needsLogin && !next.chatgpt.loginPending)
      setNotice('');
  }
  async function refresh() {
    const reloadModels = fieldsLoaded.current;
    refreshController.current?.abort();
    const controller = new AbortController(); refreshController.current = controller;
    setRefreshing(true); setError(''); setPollStopped(false);
    try {
      const next = await getAiStatus(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      receive(next); setProbeError('');
      const saved = await aiClient(next.csrfToken).settings(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      receiveSettings(saved, !fieldsLoaded.current); setConflict(false);
      // Reading settings can discover an externally changed model and invalidate
      // its availability, so publish the status after that refresh as well.
      const updated = await getAiStatus(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      receive(updated);
      if (reloadModels) setModelReload(value => value + 1);
    }
    catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法读取设置，请重试。'); }
    finally { if (alive.current && !controller.signal.aborted) setRefreshing(false); }
  }
  async function refreshStatus() {
    if (busy || refreshing || disabled || probeRunning) return;
    refreshController.current?.abort();
    const controller = new AbortController(); refreshController.current = controller;
    setRefreshing(true); setError(''); setPollStopped(false);
    try {
      const next = await getAiStatus(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      receive(next); setProbeError('');
    } catch (reason) {
      if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法读取状态，请重试。');
    } finally { if (alive.current && !controller.signal.aborted) setRefreshing(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; refreshController.current?.abort(); cancelProbe(); };
  }, []);
  useEffect(() => { if (disabled || pending || !connected) cancelProbe(); }, [disabled, pending, connected]);
  useEffect(() => {
    if (!pending || busy || refreshing || pollStopped) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false, failures = 0, attempts = 0;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (++attempts > 300) { setPollStopped(true); setError('自动确认已暂停。请刷新连接状态查看授权结果。'); return; }
      inFlight = true;
      try {
        const next = await getAiStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
        if (cancelled) return;
        failures = 0; receive(next);
        if (next.chatgpt?.loginPending) timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (!cancelled) {
          if (++failures < 3) timer = setTimeout(() => void poll(), 2000);
          else { setError('暂时无法确认登录结果。授权页面可以继续，请稍后刷新连接状态。'); setPollStopped(true); }
        }
      } finally { inFlight = false; }
    };
    const onReturn = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void poll(); } };
    window.addEventListener('focus', onReturn); document.addEventListener('visibilitychange', onReturn);
    timer = setTimeout(() => void poll(), 2000);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [pending, busy, refreshing, pollStopped]);
  useEffect(() => {
    if (view !== 'chatgpt' || !settings) return;
    if (!connected || pending || !status?.csrfToken) { setModels(undefined); return; }
    const abort = new AbortController(); let cancelled = false;
    setModelsLoading(true); setModelError('');
    const forceRefresh = refreshModels.current; refreshModels.current = false;
    void aiClient(status.csrfToken).chatGptModels(abort.signal, forceRefresh).then(result => {
      if (!cancelled) setModels(result.models);
    }).catch(async reason => {
      if (cancelled) return;
      setModels(undefined); setModelError(reason instanceof Error ? reason.message : '无法读取可用模型，请重试。');
      // A catalogue failure can establish a quota limit, but catalogue success
      // never establishes that an inference request is available.
      try {
        const next = await getAiStatus(abort.signal);
        if (!cancelled && alive.current && !abort.signal.aborted) receive(next);
      } catch { /* Retain the catalogue error and the last known status. */ }
    }).finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; abort.abort(); };
  }, [view, connected, pending, status?.csrfToken, Boolean(settings), modelReload]);

  async function checkAvailability() {
    if (locked || pending || !connected || !status || !settings || chatDirty || conflict || modelsLoading || probeController.current) return;
    const controller = new AbortController(); probeController.current = controller;
    const active = () => alive.current && probeController.current === controller && !controller.signal.aborted;
    setProbeRunning(true); setProbeError(''); setError(''); setNotice('');
    try {
      const next = await aiClient(status.csrfToken).checkChatGpt(controller.signal);
      if (active()) receive(next);
    } catch (reason) {
      if (!active()) return;
      const message = reason instanceof Error ? reason.message : '未能完成本次尝试，请重试。';
      // Read only the local result after failure; this does not retry inference.
      try {
        const next = await getAiStatus(controller.signal);
        if (!active()) return;
        receive(next);
        setProbeError(next.chatgpt.availability.lastError ? '' : message);
      } catch { if (active()) setProbeError(message); }
    } finally {
      if (probeController.current === controller) {
        probeController.current = undefined;
        if (alive.current) setProbeRunning(false);
      }
    }
  }

  async function save() {
    if (locked || pending || !status || !settings || conflict) return;
    setBusy('save'); setError(''); setNotice('');
    try {
      const client = aiClient(status.csrfToken);
      const result = view === 'api'
        ? await client.saveApiSettings({ revision: settings.revision, baseURL: baseURL.trim(), modelId: apiModel.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
        : await client.saveChatGptSettings({ revision: settings.revision, modelId: chatModel, reasoningEffort });
      receive(result.status, true);
      if (!alive.current) return;
      // Saving one provider must not discard edits in the other provider's view.
      setSettings(result.settings);
      if (view === 'api') { setBaseURL(result.settings.api.baseURL); setApiModel(result.settings.api.modelId); setApiKey(''); }
      else { setChatModel(result.settings.chatgpt.modelId); setReasoningEffort(result.settings.chatgpt.reasoningEffort); setProbeError(''); }
      setNotice(view === 'api' && activeProvider !== 'api'
        ? result.settings.chatgpt.fallbackToApi
          ? '配置已保存，可用于额度用尽时的备用回答。点击“使用此 API”可改为始终使用 API。'
          : '配置已保存。点击“使用此 API”后用于提问。'
        : '已保存，将用于后续提问。');
    } catch (reason) {
      if (alive.current) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。'); setConflict(reason instanceof AiApiError && reason.status === 409); }
    } finally { if (alive.current) setBusy(null); }
  }

  async function beginLogin() {
    if (locked || !status?.csrfToken || pending) return;
    // Create the blank window during the click, then remove its opener before
    // navigating. A blocked popup still leaves a deliberate fallback link.
    let popup: Window | null = null, navigated = false;
    try {
      popup = window.open('about:blank', '_blank');
      if (popup) {
        popup.opener = null;
        popup.document.title = '连接 ChatGPT';
        popup.document.body.textContent = '正在准备 OpenAI 官方授权页面…';
      }
    } catch { popup = null; }
    setBusy('connect'); setError(''); setNotice(''); setAuthorization(undefined);
    try {
      const result = await aiClient(status.csrfToken).connectChatGpt();
      const url = officialAuthorizationUrl(result.authorizationUrl);
      if (!url) {
        popup?.close();
        await aiClient(status.csrfToken).cancelChatGpt().catch(() => {});
        throw new Error('本机服务未返回允许的 OpenAI 官方授权地址，已停止打开。请重试连接。');
      }
      if (popup && !popup.closed) {
        try { popup.location.replace(url); navigated = true; }
        catch { popup.close(); popup = null; }
      }
      // The reader can close settings while authorization is being prepared.
      // Publish pending/completed state to the panel even after that close.
      if (alive.current) {
        setAuthorization({ ...result, authorizationUrl: url });
        setNotice(popup && !popup.closed ? '已打开官方授权页面。完成后回到这里，连接状态会自动更新。' : '浏览器未打开新窗口。请通过官方授权链接继续。');
      }
      receive(await getAiStatus(), true);
      if (!alive.current) return;
      setPollStopped(false);
    } catch (reason) {
      if (!navigated && popup && !popup.closed) popup.close();
      if (alive.current) setError(reason instanceof Error ? reason.message : '登录暂未开始，请重试。');
    } finally { if (alive.current) setBusy(null); }
  }
  async function saveFallback() {
    if (locked || pending || !status || !settings || conflict) return;
    setBusy('fallback'); setError(''); setNotice('');
    try {
      const result = await aiClient(status.csrfToken).saveFallbackSettings({ revision: settings.revision, enabled: fallbackToApi });
      receive(result.status, true);
      if (!alive.current) return;
      // This save is independent of model discovery and preserves other form drafts.
      setSettings(result.settings); setFallbackToApi(result.settings.chatgpt.fallbackToApi);
      setNotice('备用 API 设置已保存，将用于后续提问。');
    } catch (reason) {
      if (alive.current) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。'); setConflict(reason instanceof AiApiError && reason.status === 409); }
    } finally { if (alive.current) setBusy(null); }
  }
  async function mutate(action: 'cancel' | 'disconnect' | 'provider', provider?: AiProvider) {
    if (locked || !status?.csrfToken) return;
    setBusy(action); setError(''); setNotice('');
    try {
      const client = aiClient(status.csrfToken);
      if (action === 'cancel') {
        await client.cancelChatGpt(); receive(await getAiStatus(), true);
        setAuthorization(undefined); setNotice('本次登录已取消，原有连接和对话仍保留。');
      } else if (action === 'disconnect') {
        receive(await client.disconnectChatGpt(), true); setDisconnectOpen(false); setAuthorization(undefined); setProbeError('');
        setNotice('已断开 ChatGPT，对话仍保留。');
      } else if (provider) {
        receive(await client.provider(provider), true);
        setNotice(provider === 'chatgpt' ? '后续提问使用 ChatGPT。' : '后续提问使用此 API。');
      }
      setPollStopped(false);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '连接设置未能更新，请刷新后重试。'); }
    finally { if (alive.current) setBusy(null); }
  }

  const authorizationRecovery = <>
    {authorization && pending && <div className="ai-authorization-link"><a href={authorization.authorizationUrl} target="_blank" rel="noopener noreferrer">打开 OpenAI 官方授权页面 ↗</a><p>关闭设置不会取消授权。</p></div>}
    {pending && !authorization && <p className="ai-connection-note">请在官方授权页面完成登录。页面已关闭时，可取消本次登录后重新连接。</p>}
  </>;

  return <section className="ai-connection" aria-label="AI 连接设置" aria-busy={Boolean(busy) || undefined}>
    <div className="ai-settings-status"><span>当前使用：<strong>{status?.provider === 'chatgpt' ? 'ChatGPT 订阅' : status?.provider === 'api' ? 'API' : '正在确认…'}</strong></span><button type="button" className="ai-inline-action" disabled={Boolean(busy) || refreshing || disabled || probeRunning} onClick={() => void refreshStatus()}>{refreshing ? '正在读取…' : '刷新状态'}</button></div>
    <div className="ai-provider-tabs" role="group" aria-label="编辑连接方式">
      <button type="button" aria-pressed={view === 'chatgpt'} disabled={Boolean(busy)} onClick={() => changeView('chatgpt')}>ChatGPT 订阅</button>
      <button type="button" aria-pressed={view === 'api'} disabled={Boolean(busy)} onClick={() => changeView('api')}>API</button>
    </div>
    {error && <p className="ai-error" role="alert">{error}</p>}
    {!settings && !refreshing && <div className="ai-connection-actions">
      <button type="button" className="secondary-action" disabled={locked} onClick={() => void refresh()}>重新读取设置</button>
      {view === 'chatgpt' && (pending ? <button type="button" className="secondary-action" disabled={locked} onClick={() => void mutate('cancel')}>取消本次登录</button>
        : connected ? <button type="button" className="ai-inline-action ai-disconnect" disabled={locked} onClick={() => { setDisconnectOpen(true); setError(''); }}>断开连接…</button>
          : <><button type="button" className="primary-action" disabled={locked || !status} onClick={() => void beginLogin()}>{busy === 'connect' ? '正在打开…' : connection?.needsLogin ? '重新连接 ChatGPT' : '连接 ChatGPT 订阅'}</button>{connection?.needsLogin && <button type="button" className="ai-inline-action" disabled={locked} onClick={() => { setDisconnectOpen(true); setError(''); }}>移除失效连接…</button>}</>)}
    </div>}
    {!settings && view === 'chatgpt' && authorizationRecovery}
    {conflict && <div className="ai-settings-conflict"><p>输入已保留。重新载入最新配置后，核对并再次保存。</p><button type="button" className="secondary-action" disabled={locked} onClick={() => void refresh()}>重新载入配置</button></div>}
    {view === 'chatgpt' && connection?.error && !error && <p className="ai-error" role="alert">{connection.error}</p>}
    {notice && <p className="ai-notice" role="status">{notice}</p>}
    {!settings ? null : view === 'chatgpt' ? <div className="ai-provider-content">
      {connected && !pending && <section className="ai-availability" aria-labelledby={`${formId}-availability-title`}>
        <div className="ai-availability-heading"><h3 id={`${formId}-availability-title`}><span className="ai-connected-dot" aria-hidden="true" />ChatGPT 已连接</h3><button type="button" className="ai-inline-action ai-disconnect" disabled={locked} onClick={() => { setDisconnectOpen(true); setError(''); }}>断开连接…</button></div>
        <div className="ai-availability-action"><span role="status" className={availability?.state === 'quota_exhausted' ? 'is-unavailable' : availability?.state === 'available' && !probing ? 'is-available' : undefined}>{probing ? '正在尝试…' : availability?.state === 'available' ? '可用' : availability?.state === 'quota_exhausted' ? '额度已达上限' : '可用状态未确认'}</span><button type="button" className="ai-inline-action" disabled={locked || pending || !connected || !settings || chatDirty || conflict || modelsLoading} onClick={() => void checkAvailability()}>{probing ? '正在尝试…' : availability?.state === 'quota_exhausted' ? '重新尝试' : '尝试连接'}</button><a className="ai-usage-link" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">查看额度 ↗</a></div>
        {(checkedAt || availability?.model) && <p className="ai-availability-result">最近确认{checkedAt ? `：${checkedAt}` : ''}{availability?.model ? ` · ${availability.model}` : ''}</p>}
        {availabilityError && !probing && <p className={availability?.state === 'quota_exhausted' ? 'ai-warning' : 'ai-error'} role="alert">{availability?.state === 'quota_exhausted' ? '尚未确认额度恢复。' : '尚未确认当前可用状态。'}{availabilityError}</p>}
        {chatDirty && <p className="ai-availability-hint">请先保存模型，再尝试连接。</p>}
      </section>}
      {connected && !pending ? <section className="ai-model-settings" aria-label="模型与思考强度"><div className="ai-model-fields"><div className="ai-field"><div className="ai-field-heading"><label htmlFor={`${formId}-chat-model`}>模型</label><button type="button" className="ai-inline-action" disabled={locked || pending || modelsLoading} onClick={() => { refreshModels.current = true; setModelReload(value => value + 1); }}>{modelError ? '重试读取模型' : '刷新模型'}</button></div><select id={`${formId}-chat-model`} value={chatModel} disabled={locked || !settings || modelsLoading || !models} onChange={event => { setChatModel(event.target.value); setReasoningEffort(''); }}>
        <option value="">自动推荐</option>{models?.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        {chatModel && !models?.some(model => model.id === chatModel) && <option value={chatModel} disabled>{chatModel}（暂不可用）</option>}
      </select>{modelsLoading && <p className="ai-field-hint" role="status">正在读取可用模型…</p>}
      {modelError && <p className="ai-error" role="alert">{modelError}</p>}{!modelsLoading && models?.length === 0 && <p className="ai-field-hint">暂无可用模型。请刷新模型，或在 ChatGPT 检查订阅权限。</p>}</div>
      <div className="ai-field"><label htmlFor={`${formId}-reasoning`}>思考强度 <span>Thinking</span></label><select id={`${formId}-reasoning`} value={reasoningEffort} disabled={locked || !settings || modelsLoading || !models || (!reasoningEfforts.length && !reasoningEffort)} onChange={event => setReasoningEffort(event.target.value)} aria-describedby={`${formId}-reasoning-hint`}>
        <option value="">模型默认{defaultReasoning && reasoningLabels[defaultReasoning] ? `（${reasoningLabels[defaultReasoning]}）` : ''}</option>
        {reasoningEfforts.map(effort => <option key={effort} value={effort}>{reasoningLabels[effort]}</option>)}
        {!reasoningSupported && <option value={reasoningEffort} disabled>{reasoningLabels[reasoningEffort] || reasoningEffort}（暂不可用）</option>}
      </select><p id={`${formId}-reasoning-hint`} className="ai-field-hint">{modelsLoading ? '正在读取模型支持的思考强度…' : !models ? '请先重试读取模型，再调整思考强度。' : reasoningEfforts.length ? '较高强度通常需要更多等待时间。' : '当前模型未提供可选强度，将使用模型默认。'}{models && !reasoningSupported && ' 已保存的强度当前不可选，请选择模型默认或支持的强度。'}</p></div></div>
      <div className="ai-connection-actions"><button type="button" className="primary-action" disabled={locked || !settings || !models || modelsLoading || conflict || !chatDirty || !reasoningSupported || Boolean(chatModel && !models.some(model => model.id === chatModel))} onClick={() => void save()}>保存模型</button>{activeProvider !== 'chatgpt' && <button type="button" className="secondary-action" disabled={locked || chatDirty} onClick={() => void mutate('provider', 'chatgpt')}>使用 ChatGPT 订阅</button>}</div>
      </section> : <div className="ai-connect-prompt">
        {!pending && !connection?.error && <p className="ai-settings-intro">{connection?.needsLogin ? '授权已失效，请重新连接。' : '连接你的 ChatGPT 订阅。'}</p>}
        {pending && <h3>等待 ChatGPT 授权</h3>}
        {authorizationRecovery}
        <div className="ai-connection-actions">{pending ? <button type="button" className="secondary-action" disabled={locked} onClick={() => void mutate('cancel')}>取消本次登录</button> : <><button type="button" className="primary-action" disabled={locked || !status} onClick={() => void beginLogin()}>{busy === 'connect' ? '正在打开…' : connection?.needsLogin ? '重新连接 ChatGPT' : '连接 ChatGPT 订阅'}</button>{connection?.needsLogin && <button type="button" className="ai-inline-action" disabled={locked} onClick={() => { setDisconnectOpen(true); setError(''); }}>移除失效连接…</button>}</>}</div>
      </div>}
      <div className="ai-fallback-setting">
        <label className="ai-fallback-toggle" htmlFor={`${formId}-fallback`}><input id={`${formId}-fallback`} type="checkbox" checked={fallbackToApi} disabled={locked || pending || !settings} aria-describedby={`${formId}-fallback-hint`} onChange={event => setFallbackToApi(event.target.checked)} />额度用尽时使用备用 API</label>
        <p id={`${formId}-fallback-hint`} className="ai-field-hint">仅在订阅或此应用额度达到上限时，将本轮问题、近期对话、导读上下文与已取得的来源发送至备用 API，可能产生 API 费用。</p>
        {settings && <p className="ai-fallback-target">{apiConfigured ? <>备用模型：<span>{settings.api.modelId}</span></> : <>备用 API 尚未配置。<button type="button" className="ai-inline-action" disabled={locked} onClick={() => changeView('api')}>去 API 页配置</button></>}</p>}
        {(fallbackDirty || busy === 'fallback') && <button type="button" className="secondary-action" disabled={locked || pending || !settings || conflict || !fallbackDirty} onClick={() => void saveFallback()}>{busy === 'fallback' ? '正在保存…' : '保存备用设置'}</button>}
      </div>
    </div> : <form className="ai-provider-content ai-api-form" onSubmit={event => { event.preventDefault(); void save(); }} autoComplete="off">
      <div className="ai-api-heading"><h3>{apiConfigured ? 'API 已配置' : '配置 API'}</h3><span>兼容 OpenAI · 用量独立计费</span></div>
      <div className="ai-field"><label htmlFor={`${formId}-base-url`}>Base URL</label><input id={`${formId}-base-url`} type="url" inputMode="url" required value={baseURL} onChange={event => setBaseURL(event.target.value)} disabled={locked || !settings} placeholder="https://api.example.com/v1" spellCheck={false} maxLength={200} /></div>
      <div className="ai-field"><label htmlFor={`${formId}-api-model`}>Model ID</label><input id={`${formId}-api-model`} required value={apiModel} onChange={event => setApiModel(event.target.value)} disabled={locked || !settings} placeholder="服务提供的模型 ID" spellCheck={false} maxLength={200} /></div>
      <div className="ai-field"><label htmlFor={`${formId}-api-key`}>API Key <span>{settings?.api.apiKeyConfigured ? '已保存' : '未配置'}</span></label><input id={`${formId}-api-key`} type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={locked || !settings} placeholder={needsNewKey ? '输入新服务的密钥' : settings?.api.apiKeyConfigured ? '留空保留现有密钥' : '输入 API Key'} required={needsNewKey} spellCheck={false} maxLength={4096} /><p className="ai-field-hint">{needsNewKey ? '更换地址需重新填写密钥。' : '仅保存在本机服务，保存后不回显。'}</p></div>
      {pending && <p className="ai-notice">请先完成或取消 ChatGPT 登录，再修改设置。</p>}
      <div className="ai-connection-actions"><button type="submit" className="primary-action" disabled={locked || pending || !settings || conflict || !apiDirty || !baseURL.trim() || !apiModel.trim()}>{busy === 'save' ? '正在保存…' : '保存配置'}</button>{activeProvider !== 'api' && <button type="button" className="secondary-action" disabled={locked || !apiConfigured || pending || apiDirty} onClick={() => void mutate('provider', 'api')}>使用此 API</button>}</div>
    </form>}
    {settings && (settings.search.apiKeyConfigured ? <details className="ai-settings-more"><summary>联网查证 · 已配置</summary><p>在提问时勾选“联网查证”即可使用。检索问题发送至 Tavily，网页摘录会送给模型。</p></details> : <p className="ai-search-status">联网查证 · 未配置</p>)}
    {disconnectOpen && <Dialog title="断开 ChatGPT 连接" className="ai-small-dialog" busy={Boolean(busy)} onClose={() => setDisconnectOpen(false)}><p>移除本机保存的 ChatGPT 授权，对话与笔记仍保留。下次使用需要重新连接。</p><p>断开后不会自动改用 API。</p>{error && <p className="ai-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => setDisconnectOpen(false)}>保留连接</button><button type="button" className="secondary-action ai-danger" disabled={Boolean(busy)} onClick={() => void mutate('disconnect')}>确认断开连接</button></div></Dialog>}
  </section>;
}
