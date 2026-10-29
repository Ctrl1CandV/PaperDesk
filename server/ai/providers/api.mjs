import { assembleAssistantContext } from '../research.mjs';
import { LIMITS, SYSTEM_PROMPT, availableTools } from '../instructions.mjs';
import { PublicError, object, reject, isText, safeWebUrl } from '../../http/validation.mjs';
import { checkPromptBudget } from '../prompt-budget.mjs';

export async function readBoundedJson(response, maxBytes, signal) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new PublicError('外部服务请求失败，请检查后端配置或稍后重试。', 502);
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new PublicError('外部服务响应超过大小限制。', 502);
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PublicError('外部服务返回了无效数据。', 502); }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof PublicError) throw error;
    throw new PublicError('外部服务连接在返回完整数据前中断。', 502);
  } finally { await reader.cancel().catch(() => {}); }
}

async function completion(config, messages, tools, signal, emit, fetchImpl) {
  if (JSON.stringify(messages).length > LIMITS.messageChars) throw new PublicError('问答上下文已达到预算，请新建对话或缩小问题范围。', 413);
  const response = await fetchImpl(`${config.baseURL}/chat/completions`, { method: 'POST', redirect: 'error', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.modelId, messages, stream: true, max_tokens: config.maxOutputTokens,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }) });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new PublicError(response.status === 401 || response.status === 403 ? '模型服务拒绝了凭据，请检查后端配置。'
      : response.status === 429 ? '模型服务请求过于频繁或额度不足，请稍后重试。' : '模型服务未能完成请求，请检查接口与模型是否支持流式 Chat Completions。', 502);
  }
  const reader = response.body.getReader(), decoder = new TextDecoder(), calls = new Map();
  let buffer = '', size = 0, text = '', finish = null, ended = false;
  function consume(frame) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { ended = true; return; }
    let payload;
    try { payload = JSON.parse(data); } catch { throw new PublicError('模型流返回了无法解析的数据。', 502); }
    if (payload.error) throw new PublicError('模型流返回错误，请检查后端配置或稍后重试。', 502);
    const choice = payload.choices?.[0];
    if (!choice) return; // Optional usage frames have no choice.
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta ?? {};
    // reasoning_content and vendor-specific hidden reasoning are intentionally ignored.
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content;
      if (text.length > LIMITS.answerChars) throw new PublicError('回答超过长度预算，已保留收到的内容。', 502);
      emit({ type: 'delta', text: delta.content });
    }
    if (delta.tool_calls !== undefined && !Array.isArray(delta.tool_calls)) throw new PublicError('模型工具请求格式无效。', 502);
    for (const part of delta.tool_calls ?? []) {
      if (!Number.isInteger(part.index) || part.index < 0 || part.index >= LIMITS.toolCalls) throw new PublicError('模型请求了过多工具。', 502);
      const call = calls.get(part.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (part.type && part.type !== 'function') throw new PublicError('模型请求了未支持的工具类型。', 502);
      if (part.id !== undefined) { if (typeof part.id !== 'string') reject('模型工具编号无效。', 502); call.id += part.id; }
      if (part.function?.name !== undefined) { if (typeof part.function.name !== 'string') reject('模型工具名称无效。', 502); call.function.name += part.function.name; }
      if (part.function?.arguments !== undefined) { if (typeof part.function.arguments !== 'string') reject('模型工具参数无效。', 502); call.function.arguments += part.function.arguments; }
      if (call.id.length > 200 || call.function.name.length > 60 || call.function.arguments.length > 2000) reject('模型工具请求超过限制。', 502);
      calls.set(part.index, call);
    }
  }
  try {
    while (!ended) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.upstreamBytes) throw new PublicError('模型响应超过传输预算。', 502);
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer.replace(/\r\n/g, '\n'));
    if (!finish) throw new PublicError('模型连接在回答完成前中断，已保留收到的内容。', 502);
    if (finish === 'length') throw new PublicError('回答达到模型输出预算，已保留部分内容；可继续追问。', 502);
    if (finish !== 'stop' && finish !== 'tool_calls') throw new PublicError('模型未正常完成回答，已保留收到的内容。', 502);
    const toolCalls = [...calls.values()];
    if (toolCalls.some(call => !call.id || !call.function.name) || new Set(toolCalls.map(call => call.id)).size !== toolCalls.length
      || finish === 'tool_calls' && !toolCalls.length) throw new PublicError('模型工具请求不完整。', 502);
    return { text, toolCalls };
  } finally { await reader.cancel().catch(() => {}); }
}

export async function webSearch(args, config, sources, signal, fetchImpl) {
  object(args, ['query']);
  if (!isText(args.query, 300, 1) || !args.query.trim()) reject('联网搜索词无效。');
  let response;
  try {
    response = await fetchImpl('https://api.tavily.com/search', { method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.search.apiKey}` },
      body: JSON.stringify({ query: args.query, max_results: 4, search_depth: 'basic', auto_parameters: false, include_answer: false, include_raw_content: false }) });
  } catch {
    signal.throwIfAborted();
    throw new PublicError('联网搜索连接失败，本轮未获得网页资料。', 502);
  }
  const data = await readBoundedJson(response, 256 * 1024, signal);
  if (!Array.isArray(data.results)) throw new PublicError('搜索服务没有返回可用结果。', 502);
  const results = [];
  for (const item of data.results.slice(0, 4)) {
    if (!safeWebUrl(item.url) || !isText(item.title, 10000, 1) || !isText(item.content, 100000, 1)) continue;
    let source = sources.find(entry => entry.kind === 'web' && entry.url === item.url);
    if (!source) {
      if (sources.length >= 64) break;
      source = { id: `W${sources.filter(entry => entry.kind === 'web').length + 1}`, kind: 'web', title: item.title.slice(0, 1000), url: item.url, text: item.content.slice(0, 4000), version: null };
      sources.push(source);
    }
    results.push(source);
  }
  return { results, retrievedAt: new Date().toISOString(), scope: '公开网页搜索摘录，未下载网页或原论文全文；摘录可能不完整，需核对原始来源。' };
}

export async function answer({ config, content, prepared, request, turn, signal, emit, persist, fetchImpl = fetch }) {
  const messages = [{role:'system',content:SYSTEM_PROMPT}, ...assembleAssistantContext(prepared, request, turn)];
  // A subscription attempt may already have retrieved evidence. Charge those
  // calls to this same turn; conservatively reserve one prior round per call.
  let calls = turn.context.toolEvents.length, toolRounds = Math.min(calls, LIMITS.rounds);
  const remainingRounds = LIMITS.rounds - toolRounds;
  const allowedTools = config.toolsEnabled ? availableTools(request.webSearch && config.searchAvailable, Boolean(turn.context.researchSnapshot)) : [];
  for (let round = 0; round <= remainingRounds; round++) {
    signal.throwIfAborted();
    const tools = calls >= LIMITS.toolCalls || toolRounds >= LIMITS.rounds ? [] : allowedTools;
    if (!tools.length && config.toolsEnabled && round > 0) messages.push({ role: 'user', content: '本轮工具预算已结束。请仅根据已经获得的资料给出回答，明确仍然不确定的地方，不再调用工具。' });
    emit({ type: 'status', text: round === 0 ? '正在组织解答' : '正在根据资料继续解答' });
    checkPromptBudget({ messages, tools }, config, turn.context); persist();
    const result = await completion(config, messages, tools, signal, emit, fetchImpl);
    if (!result.toolCalls.length) {
      if (!result.text.trim()) throw new PublicError('模型没有返回最终可见回答，已保留此前收到的内容。请检查模型接口设置或重新提问。', 502);
      return;
    }
    if (!tools.length || calls + result.toolCalls.length > LIMITS.toolCalls) throw new PublicError('模型超出了本轮工具预算，已停止请求。', 502);
    messages.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      signal.throwIfAborted();
      const name = call.function.name;
      if (!tools.some(tool => tool.function.name === name)) throw new PublicError('模型请求了本轮未授权的工具，已停止请求。', 502);
      let args;
      try { args = JSON.parse(call.function.arguments); } catch { throw new PublicError('模型的工具参数不是有效 JSON。', 502); }
      emit({ type: 'status', text: name === 'web_search' ? '正在搜索公开网页' : name === 'read_section' ? '正在读取导读章节' : '正在检索本地书库' });
      checkPromptBudget({ messages, tools }, config, turn.context);
      let output; const started = performance.now();
      try {
        output = name === 'web_search' ? await webSearch(args, config, turn.sources, signal, fetchImpl) : ['search_topic_history','read_topic_turn','propose_research_changes'].includes(name) ? prepared.runResearchTool(name,args) : content.runLocal(name, args, turn.sources, turn.context);
      } catch (error) {
        signal.throwIfAborted();
        if (name !== 'web_search' || !(error instanceof PublicError) || error.status !== 502) throw error;
        output = { error: '联网搜索未成功，本次未取得可引用的网页来源。请根据已取得的导读回答，说明未能完成外部核对。', retrievedAt: new Date().toISOString() };
      }
      if (output.error) emit({ type: 'status', text: name === 'web_search' ? '联网搜索暂不可用，将根据已取得的导读继续回答' : '未取得该工具资料，将根据已有内容继续回答' });
      const resultJson = JSON.stringify(output);
      if (resultJson.length > 40000) throw new PublicError('工具结果超出本轮上下文预算。', 502);
      turn.context.toolEvents.push({ name, argumentsJson: call.function.arguments, resultJson, elapsedMs: performance.now() - started });
      persist();
      emit({ type: 'sources', sources: turn.sources });
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultJson });
      calls++;
    }
    toolRounds++;
    if (result.text) emit({ type: 'delta', text: '\n\n' });
  }
  throw new PublicError('达到工具轮次上限，已保留回答和来源。', 502);
}
