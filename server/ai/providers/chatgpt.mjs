import { assembleAssistantContext } from '../research.mjs';
import { LIMITS, SYSTEM_PROMPT, availableTools } from '../instructions.mjs';
import { checkPromptBudget } from '../prompt-budget.mjs';
import { PublicError, isText } from '../../http/validation.mjs';
import { webSearch } from './api.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { validReasoningEffort } from '../reasoning.mjs';
import { ChatGptStreamText } from './chatgpt/stream-text.mjs';

const API = 'https://api.openai.com/v1';
const NAMESPACE = 'paperdesk';
// The account catalog includes large client templates and capability metadata.
// Its bounded JSON budget is independent of streamed answers and error bodies.
export const CHATGPT_CATALOG_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, entries: 2048, choices: 256 });
const transportFailures = new WeakSet();
const QUOTA_CODE = 'subscription_sharing_usage_limit_exceeded';
const ERROR_CODES = new Map([
  [QUOTA_CODE, ['ChatGPT 套餐或此应用的使用额度已达到限制。可在 ChatGPT 设置的 Usage 页面查看额度与应用限制。', 429]],
  ['subscription_sharing_usage_unavailable', ['暂时无法确认 ChatGPT 套餐的可用额度，请稍后重试。登录信息已保留。', 503]],
  ['subscription_sharing_user_not_eligible', ['当前 ChatGPT 账号、工作区或策略暂不允许共享套餐额度。请查看 ChatGPT 中该应用的授权。', 403]],
  ['subscription_sharing_user_unavailable', ['ChatGPT 账号或工作区信息暂时不可用，请稍后重试。', 503]],
  ['subscription_sharing_unsupported_capability', ['ChatGPT 套餐接口不支持本次模型或请求能力，请检查后端的模型设置。', 400]],
  ['subscription_sharing_route_not_supported', ['当前 ChatGPT 授权不支持此推理接口，请检查应用授权。', 403]],
  ['subscription_sharing_invalid_user', ['ChatGPT 登录身份未被接受，请重新连接 ChatGPT。', 401]],
  ['chatpass_v2_scope_not_authorized', ['当前 ChatGPT 授权未允许使用套餐额度，请重新连接并检查授权范围。', 403]],
  ['chatpass_v2_invalid_authorization_context', ['当前 ChatGPT 授权上下文无效，请重新连接并检查授权范围。', 403]],
]);

// HTTP 429 alone can mean rate or concurrency limits. Only the documented,
// structured usage-limit code authorizes the caller's explicit fallback policy.
export function isChatGptQuotaError(error) {
  return error instanceof PublicError && error.code === QUOTA_CODE;
}

function serviceError(status, payload, requestId) {
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  let detail = isObject(payload) ? payload : {};
  // Match the official SIWC DevKit's bounded error/detail envelope handling.
  // Admission text and arrays are not machine codes, nor are provider messages.
  for (let depth = 0; depth < 4; depth++) {
    if (isObject(detail.error)) detail = detail.error;
    else if (isObject(detail.detail)) detail = detail.detail;
    else break;
  }
  const code = typeof detail.error === 'string' ? detail.error : typeof detail.code === 'string' ? detail.code : undefined;
  const known = ERROR_CODES.get(code);
  const fallback = status === 401 ? ['ChatGPT 登录或套餐使用权限未被接受，请重新连接 ChatGPT。', 401]
    : status === 403 ? ['ChatGPT 的权限或服务策略阻止了此次请求，请查看应用授权与账号可用性。', 403]
      : status === 429 ? ['ChatGPT 请求受到速率或并发限制，请稍后重试。未确认订阅额度耗尽。', 429]
        : status === 503 ? ['ChatGPT 套餐推理服务暂不可用，请稍后重试。登录信息已保留。', 503]
          : ['ChatGPT 未能完成请求，请稍后重试。', 502];
  const error = new PublicError(...(known ?? fallback));
  // Keep only bounded diagnostic identifiers. Provider messages and detail text can contain private data.
  if (known) error.code = code;
  if (Number.isInteger(status) && status >= 400 && status <= 599) error.upstreamStatus = status;
  if (isText(requestId, 200, 1) && /^[a-zA-Z0-9_-]+$/.test(requestId)) error.requestId = requestId;
  error.upstreamShape = payload?.error ? 'error' : payload?.detail ? 'detail' : 'unknown';
  return error;
}

async function accessToken(auth, signal) {
  signal?.throwIfAborted();
  let onAbort;
  try {
    const pending = auth.getAccessToken({ signal });
    // A rotating refresh must finish saving its new token even when this reader
    // cancels. Stop waiting for it without cancelling the shared refresh itself.
    const token = await (signal ? Promise.race([pending, new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]) : pending);
    signal?.throwIfAborted();
    if (!isText(token, 65536, 1) || /[\r\n]/.test(token)) throw new PublicError('ChatGPT 登录信息不可用，请重新连接。', 401);
    return token;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof PublicError) throw error;
    throw new PublicError('无法取得 ChatGPT 登录凭据，请重新连接或稍后重试。', 502);
  } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}

async function requestApi(path, token, signal, fetchImpl, body) {
  signal?.throwIfAborted();
  try {
    const response = await fetchImpl(`${API}/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { authorization: `Bearer ${token}`, accept: body ? 'text/event-stream' : 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
    });
    signal?.throwIfAborted();
    return response;
  } catch {
    signal?.throwIfAborted();
    const error = new PublicError('无法连接 ChatGPT 服务，请稍后重试。', 502);
    transportFailures.add(error); throw error;
  }
}

async function readJson(response, maxBytes, signal, limitError = () => new PublicError('ChatGPT 响应超过传输预算。', 502)) {
  if (!response.body) throw new PublicError('ChatGPT 服务返回了空数据。', 502);
  const reader = response.body.getReader();
  // Bound memory even if an upstream emits millions of tiny chunks. A growing
  // byte buffer avoids retaining one Buffer object per chunk.
  let bytes = Buffer.allocUnsafe(Math.min(maxBytes, 64 * 1024));
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let size = 0;
  try {
    const declared = response.headers.get('content-length');
    if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw limitError();
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      const nextSize = size + value.byteLength;
      if (nextSize > maxBytes) throw limitError();
      if (nextSize > bytes.length) {
        const grown = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(nextSize, bytes.length * 2)));
        bytes.copy(grown, 0, 0, size); bytes = grown;
      }
      bytes.set(value, size); size = nextSize;
    }
    try { return JSON.parse(bytes.subarray(0, size).toString('utf8')); }
    catch { throw new PublicError('ChatGPT 服务返回了无效数据。', 502); }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof PublicError) throw error;
    const interrupted = new PublicError('ChatGPT 连接在返回完整数据前中断。', 502);
    transportFailures.add(interrupted); throw interrupted;
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}

function catalogLimit(message) {
  const error = new PublicError(message, 502); error.code = 'chatgpt_catalog_limit'; return error;
}

async function readCatalog(response, signal) {
  const data = await readJson(response, CHATGPT_CATALOG_LIMITS.bytes, signal,
    () => catalogLimit('ChatGPT 模型目录超过 8 MiB 读取限制，暂时无法加载。请稍后重试。'));
  if (!Array.isArray(data?.models)) throw new PublicError('ChatGPT 没有返回可用模型目录，请稍后重试。', 502);
  if (data.models.length > CHATGPT_CATALOG_LIMITS.entries) throw catalogLimit('ChatGPT 模型目录条目超过读取限制，暂时无法加载。');
  // Drop instruction templates, tools, capability hints and other large fields
  // before returning to the picker. Visibility and ordering follow SIWC docs;
  // supported_in_api is not part of the documented display filter.
  return data.models.map(model => model && typeof model === 'object' && !Array.isArray(model)
    ? { slug: model.slug, display_name: model.display_name, name: model.name, visibility: model.visibility,
      ...(Array.isArray(model.supported_reasoning_levels) ? {
        reasoningEfforts: [...new Set(model.supported_reasoning_levels.map(level => level?.effort).filter(effort => effort && validReasoningEffort(effort)))],
      } : {}),
      ...(model.default_reasoning_level && validReasoningEffort(model.default_reasoning_level) ? { defaultReasoningEffort: model.default_reasoning_level } : {}),
    } : null);
}

async function checkResponse(response, signal) {
  if (response.ok && response.body) return;
  let payload;
  try { payload = await readJson(response, 64 * 1024, signal); }
  catch { signal?.throwIfAborted(); }
  throw serviceError(response.status, payload, response.headers.get('x-request-id'));
}

// Read on demand so a changed account never inherits a cached account's catalog.
export async function listChatGptModels(auth, { signal, fetchImpl = fetch } = {}) {
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const token = await accessToken(auth, requestSignal);
    let catalog;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await requestApi('models', token, requestSignal, fetchImpl);
        await checkResponse(response, requestSignal);
        catalog = await readCatalog(response, requestSignal);
        break;
      } catch (error) {
        requestSignal.throwIfAborted();
        // Only this read-only GET can retry. A malformed/budget-limited catalog,
        // permission rejection or quota response is not a transient transport error.
        const transient = transportFailures.has(error) || [502, 503, 504].includes(error.upstreamStatus)
          && (!error.code || ['subscription_sharing_usage_unavailable', 'subscription_sharing_user_unavailable'].includes(error.code));
        if (attempt || !transient) throw error;
        await delay(250, undefined, { signal: requestSignal });
      }
    }
    const seen = new Set(), models = [];
    for (const model of catalog) {
      if (model?.visibility !== 'list' || !isText(model.slug, 200, 1)
        || /[\s\u0000-\u001f\u007f]/u.test(model.slug) || seen.has(model.slug)) continue;
      seen.add(model.slug);
      const name = [model.display_name, model.name].find(value => isText(value, 200, 1)
        && value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
      models.push({ id: model.slug, name: name?.trim() || model.slug,
        ...(model.reasoningEfforts ? { reasoningEfforts: model.reasoningEfforts } : {}),
        ...(model.defaultReasoningEffort && (!model.reasoningEfforts || model.reasoningEfforts.includes(model.defaultReasoningEffort))
          ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
      });
      if (models.length > CHATGPT_CATALOG_LIMITS.choices) throw catalogLimit('ChatGPT 可选模型数量超过显示限制，暂时无法加载。');
    }
    return models;
  } catch (error) {
    signal?.throwIfAborted();
    if (timeout.aborted) throw new PublicError('读取 ChatGPT 可用模型超时，请稍后重试。', 504);
    throw error;
  }
}

export async function resolveChatGptModel(auth, { modelId, signal, fetchImpl = fetch } = {}) {
  const models = await listChatGptModels(auth, { signal, fetchImpl });
  const model = modelId ? models.find(item => item.id === modelId) : models[0];
  if (!model) throw new PublicError(modelId ? '所选 ChatGPT 模型不在当前账号的可用目录中，请重新选择。' : '当前 ChatGPT 账号没有可用于此应用的模型。', 403);
  return model.id;
}

function namespaceTools(tools) {
  return tools.length ? [{ type: 'namespace', name: NAMESPACE, description: '只读检索已审核的论文导读与明确启用的公开网页摘录。',
    tools: tools.map(({ function: fn }) => ({ type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters, strict: true })) }] : [];
}

function inspectOutput(output) {
  if (!Array.isArray(output)) throw new PublicError('ChatGPT 未返回完整的响应记录。', 502);
  const calls = [], texts = [];
  for (const item of output) {
    if (item?.type === 'reasoning') continue; // Opaque reasoning is replayed only in memory, never displayed or persisted.
    if (item?.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)) {
      if (item.status && item.status !== 'completed') throw new PublicError('ChatGPT 回答未完整结束，已保留收到的内容。', 502);
      for (const part of item.content) {
        if (part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
        else if (part.type === 'refusal' && typeof part.refusal === 'string') texts.push(part.refusal);
        else throw new PublicError('ChatGPT 返回了未支持的回答格式。', 502);
      }
    } else if (item?.type === 'function_call') {
      if (item.namespace !== NAMESPACE || !isText(item.call_id, 200, 1) || !isText(item.name, 60, 1)
        || !isText(item.arguments, 2000, 1) || item.status && item.status !== 'completed'
        || item.async || item.caller && item.caller.type !== 'direct') throw new PublicError('ChatGPT 工具调用格式无效或超出允许范围。', 502);
      calls.push(item);
    } else throw new PublicError('ChatGPT 请求了本轮未支持的输出或工具类型。', 502);
  }
  if (calls.length > LIMITS.toolCalls || new Set(calls.map(call => call.call_id)).size !== calls.length) throw new PublicError('ChatGPT 工具请求重复或超过单轮限制。', 502);
  return { calls, text: texts.join('') };
}

async function completion(model, input, tools, auth, signal, emit, fetchImpl, {
  instructions = SYSTEM_PROMPT, upstreamBytes = LIMITS.upstreamBytes, answerChars = LIMITS.answerChars, onRequestStart, reasoningEffort,
} = {}) {
  if (reasoningEffort && !validReasoningEffort(reasoningEffort)) throw new PublicError('ChatGPT 思考强度无效，请重新选择。', 400);
  const body = JSON.stringify({ model, instructions, input, store: false, stream: true, tools: namespaceTools(tools),
    include: ['reasoning.encrypted_content'], ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
  });
  if (body.length > LIMITS.messageChars) throw new PublicError('问答上下文已达到预算，请新建对话或缩小问题范围。', 413);
  const token = await accessToken(auth, signal);
  signal?.throwIfAborted();
  onRequestStart?.();
  const response = await requestApi('responses', token, signal, fetchImpl, body);
  await checkResponse(response, signal);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let buffer = '', size = 0, completed = null, thinkingReported = false, trailingCarriageReturn = false, responseId;
  const visible = new ChatGptStreamText(answerChars, emit);
  function appendChunk(chunk) {
    if (!chunk) return;
    // SSE permits LF, CRLF and bare CR. Preserve a CRLF pair split between
    // transport chunks as one newline without holding a bare CR indefinitely.
    if (trailingCarriageReturn && chunk.startsWith('\n')) chunk = chunk.slice(1);
    trailingCarriageReturn = chunk.endsWith('\r');
    buffer += chunk.replace(/\r\n|\r/g, '\n');
  }
  function consume(frame) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data.trim() === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { throw new PublicError('ChatGPT 响应流包含无效数据。', 502); }
    if (event.response?.id !== undefined) {
      if (!isText(event.response.id, 200, 1) || responseId && responseId !== event.response.id)
        throw new PublicError('ChatGPT 响应记录标识不一致，已保留收到的内容。', 502);
      responseId = event.response.id;
    }
    if (event.type === 'response.failed' || event.type === 'error' || event.error) {
      throw serviceError(undefined, event.response ?? event, response.headers.get('x-request-id'));
    }
    if (event.type === 'response.incomplete') throw new PublicError('ChatGPT 回答未完整结束，已保留部分内容；可缩小问题后重试。', 502);
    if (!thinkingReported && (event.type === 'response.output_item.added' && event.item?.type === 'reasoning'
      || ['response.reasoning_text.delta', 'response.reasoning_summary_text.delta', 'response.reasoning_summary_part.added'].includes(event.type))) {
      thinkingReported = true; emit({ type: 'status', text: '正在思考' });
    }
    if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') visible.part(event, event.delta, true);
    if (event.type === 'response.output_text.done') visible.part(event, event.text);
    if (event.type === 'response.refusal.done') visible.part(event, event.refusal);
    if (event.type === 'response.output_item.done' && event.item?.type === 'message') {
      inspectOutput([event.item]); visible.item(event);
    }
    if (event.type === 'response.completed') {
      if (!event.response || event.response.status && event.response.status !== 'completed') throw new PublicError('ChatGPT 的完成状态无效。', 502);
      const result = inspectOutput(event.response.output);
      if (!result.calls.length && !result.text.trim()) throw new PublicError('ChatGPT 没有返回最终可见回答，已保留此前内容。请重新提问。', 502);
      // A validated terminal response is authoritative, including corrections
      // and ordering across multiple output items. Do not replay paid inference.
      visible.complete(event.response.output, result.text);
      completed = { ...result, output: event.response.output };
    }
    // Only a generic progress state is exposed; reasoning text, summaries and
    // argument deltas are never shown or persisted.
    // Tool execution uses only the validated output of response.completed.
  }
  try {
    while (!completed) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > upstreamBytes) throw new PublicError('ChatGPT 响应超过传输预算。', 502);
      appendChunk(decoder.decode(value, { stream: true }));
      let boundary;
      while (!completed && (boundary = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
      }
    }
    if (!completed) {
      appendChunk(decoder.decode());
      if (buffer.trim()) consume(buffer);
    }
    if (!completed) throw new PublicError('ChatGPT 连接在回答完成前中断，已保留收到的内容。', 502);
    return completed;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof PublicError) throw error;
    throw new PublicError('ChatGPT 连接在回答完成前中断，已保留收到的内容。', 502);
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}

// A deliberate user action, never a status/model-list side effect. This makes
// one real, tool-free inference with no reader content. The runtime owns the
// overall 60-second deadline, including model resolution and token acquisition.
export async function checkChatGptAvailability(auth, { modelId, signal, fetchImpl = fetch, onRequestStart, reasoningEffort } = {}) {
  if (!isText(modelId, 200, 1) || /[\s\u0000-\u001f\u007f]/u.test(modelId)) throw new PublicError('检查所用的 ChatGPT 模型无效。', 400);
  const result = await completion(modelId, [{ role: 'user', content: 'Reply with OK.' }], [], auth, signal, () => {}, fetchImpl,
    { instructions: 'This is a connectivity check. Reply with exactly OK.', upstreamBytes: 256 * 1024, answerChars: 256, onRequestStart, reasoningEffort });
  signal?.throwIfAborted();
  if (result.calls.length || !result.text.trim()) throw new PublicError('ChatGPT 检查没有获得完整的可见回答。', 502);
  return { model: modelId };
}

export async function answerWithChatGpt({ config, content, prepared, request, turn, signal, emit, persist, auth, fetchImpl = fetch, onRequestStart }) {
  const model = config.modelId || await resolveChatGptModel(auth, { modelId: config.chatgptModelId, signal, fetchImpl });
  turn.context.model = model;
  const input = assembleAssistantContext(prepared, request, turn);
  let calls = 0;
  const seenCalls = new Set();
  const allowedTools = config.toolsEnabled ? availableTools(request.webSearch && config.searchAvailable, Boolean(turn.context.researchSnapshot), turn.context.command) : [];
  for (let round = 0; round <= LIMITS.rounds; round++) {
    signal?.throwIfAborted();
    const tools = calls >= LIMITS.toolCalls || round >= LIMITS.rounds ? [] : allowedTools;
    if (!tools.length && config.toolsEnabled && round > 0) input.push({ role: 'user', content: '本轮工具预算已结束。请仅根据已经获得的资料给出回答，明确仍然不确定的地方，不再调用工具。' });
    emit({ type: 'status', text: round === 0 ? '正在组织解答' : '正在根据资料继续解答' });
    const previousText = turn.answer;
    checkPromptBudget({ instructions: SYSTEM_PROMPT, input, tools: namespaceTools(tools) }, config, turn.context); persist();
    const roundEmit = event => emit(event.type === 'replace' ? { ...event, text: previousText + event.text } : event);
    const result = await completion(model, input, tools, auth, signal, roundEmit, fetchImpl,
      { onRequestStart, reasoningEffort: config.chatgptReasoningEffort });
    signal?.throwIfAborted();
    if (!result.calls.length) {
      if (!result.text.trim()) throw new PublicError('ChatGPT 没有返回最终可见回答，已保留此前内容。请重新提问。', 502);
      return;
    }
    if (!tools.length) throw new PublicError('ChatGPT 超出了本轮工具预算，已停止请求。', 502);
    // Preserve every returned item (including encrypted reasoning and assistant phase) for stateless continuation.
    input.push(...result.output);
    for (const call of result.calls) {
      signal?.throwIfAborted();
      if (!tools.some(tool => tool.function.name === call.name) || seenCalls.has(call.call_id)) throw new PublicError('ChatGPT 请求了未授权或重复的工具调用，已停止请求。', 502);
      seenCalls.add(call.call_id);
      let args;
      try { args = JSON.parse(call.arguments); } catch { throw new PublicError('ChatGPT 的工具参数不是有效 JSON。', 502); }
      checkPromptBudget({ instructions: SYSTEM_PROMPT, input, tools: namespaceTools(tools) }, config, turn.context);
      let output; const started = performance.now();
      if (calls >= LIMITS.toolCalls) output = { error: '本轮工具执行预算已结束。请根据已取得的资料直接回答，不再调用工具。' };
      else {
        emit({ type: 'status', text: call.name === 'web_search' ? '正在搜索公开网页' : call.name === 'read_section' ? '正在读取导读章节' : '正在检索本地书库' });
        try {
          output = call.name === 'web_search' ? await webSearch(args, config, turn.sources, signal, fetchImpl) : ['search_topic_history','read_topic_turn','propose_research_changes','create_research_direction','update_research_notebook'].includes(call.name) ? prepared.runResearchTool(call.name,args) : content.runLocal(call.name, args, turn.sources, turn.context);
        } catch (error) {
          signal?.throwIfAborted();
          if (call.name !== 'web_search' || !(error instanceof PublicError) || error.status !== 502) throw error;
          output = { error: '联网搜索未成功，本次未取得可引用的网页来源。请根据已取得的导读回答，说明未能完成外部核对。', retrievedAt: new Date().toISOString() };
        }
        const resultJson = JSON.stringify(output);
        if (resultJson.length > 40000) throw new PublicError('工具结果超出本轮上下文预算。', 502);
        turn.context.toolEvents.push({ name: call.name, argumentsJson: call.arguments, resultJson, elapsedMs: performance.now() - started });
        persist();
        emit({ type: 'sources', sources: turn.sources });
        calls++;
      }
      if (output.error) emit({ type: 'status', text: call.name === 'web_search' ? '联网搜索暂不可用，将根据已取得的导读继续回答' : '未取得更多工具资料，将根据已有内容继续回答' });
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) });
    }
    if (result.text) emit({ type: 'delta', text: '\n\n' });
  }
  throw new PublicError('达到工具轮次上限，已保留回答和来源。', 502);
}
