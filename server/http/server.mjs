import { prepareAssistantContext, researchToolsForTurn } from '../ai/research.mjs';
import { sameScope } from '../storage/ai-store.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { PublicError, reject, object, isId, isHash, isRevision, isUuid, validateAsk } from './validation.mjs';
import { LIMITS } from '../ai/instructions.mjs';
import { answer } from '../ai/providers/api.mjs';
import { requestHash, validateBackup } from '../storage/ai-store.mjs';
import { exportBackupStream, importBackupStream } from '../storage/ai-backup.mjs';

const HOSTS = new Set(['127.0.0.1:4176', '127.0.0.1:4173', '127.0.0.1:4174']);
const ORIGINS = new Set(['http://127.0.0.1:4173', 'http://127.0.0.1:4174']);
const PUBLIC_ERROR = '本地 AI 服务暂时不可用。请检查后端是否可写并重新尝试。';
const publicMessage = error => error instanceof PublicError ? error.message : PUBLIC_ERROR;

export function checkBrowserRequest(request, token, requireToken = true) {
  if (!HOSTS.has(request.headers.host) || request.headers.origin && !ORIGINS.has(request.headers.origin)
    || request.headers['sec-fetch-site'] === 'cross-site') reject('该来源不能访问本地 AI 服务。', 403);
  if (requireToken) {
    const provided = request.headers['x-paperdesk-token'];
    if (typeof provided !== 'string' || Buffer.byteLength(provided) !== Buffer.byteLength(token)
      || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) reject('AI 会话令牌已失效，请刷新页面。', 403);
  }
}
async function readJson(request, limit) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) reject('请求必须使用 JSON。', 415);
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') reject('不接受压缩请求。', 415);
  if (Number(request.headers['content-length'] ?? 0) > limit) reject('请求文件超过大小限制。', 413);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) reject('请求文件超过大小限制。', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reject('请求不是有效的 JSON。'); }
}
function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  response.end(JSON.stringify(data));
}
function stream(response) {
  response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' });
  return event => { if (!response.destroyed && !response.writableEnded) response.write(JSON.stringify(event) + '\n'); };
}

export function createAiServer(dependencies) {
  const { config, content, fetchImpl = fetch } = dependencies;
  const token = randomBytes(32).toString('hex'), active = new Map();
  const activeConversations = new Set();
  let mutatingConnection = false, checkingController = null, importing = false;
  const status = () => ({ ...(dependencies.runtime?.status() ?? {
    configured: config.configured, model: config.configured ? config.modelId : null,
    searchAvailable: config.searchAvailable, provider: 'api', apiConfigured: config.configured,
    chatgpt: { connected: false, loginPending: false, needsLogin: false,
      availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } },
  }), csrfToken: token, storage: dependencies.store?.usage() });
  const server = createServer(async (request, response) => {
    try {
      const store = dependencies.store;
      if (!store) reject('本地 AI 数据库正在启动，请稍后重试。', 503);
      checkBrowserRequest(request, token, false);
      const url = new URL(request.url, 'http://127.0.0.1:4176');
      if (request.method === 'GET' && url.pathname === '/api/ai/status') {
        json(response, 200, status()); return;
      }
      checkBrowserRequest(request, token);
      const material = /^\/api\/ai\/materials\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && material) {
        const [, sourceRevisionId, parserRevision, sourceUnitId] = material;
        if (!isId(sourceRevisionId) || !isHash(parserRevision) || !isId(sourceUnitId)) reject('原文定位编号无效。');
        const view = await content.reading?.view(sourceRevisionId, parserRevision, sourceUnitId);
        if (!view) reject('此原文材料或解析修订不可用，已保存的来源快照仍可查看。', 404);
        json(response, 200, view); return;
      }
      if (request.method === 'GET' && ['/api/ai/settings', '/api/ai/chatgpt/models'].includes(url.pathname)) {
        const runtime = dependencies.runtime;
        if (!runtime) reject('请更新并重启本机 AI 服务后再配置。', 503);
        if (mutatingConnection) reject('模型连接正在更新，请稍后重试。', 409);
        if (url.pathname === '/api/ai/settings') json(response, 200, await runtime.getSettings());
        else {
          const controller = new AbortController();
          const close = () => { if (!response.writableEnded) controller.abort(); };
          response.on('close', close);
          try { json(response, 200, await runtime.getModels(controller.signal, { refresh: url.searchParams.get('refresh') === '1' })); }
          finally { response.off('close', close); controller.abort(); }
        }
        return;
      }
      if (request.method === 'POST' && ['/api/ai/settings/api', '/api/ai/settings/chatgpt', '/api/ai/settings/fallback', '/api/ai/settings/search'].includes(url.pathname)) {
        const runtime = dependencies.runtime;
        if (!runtime) reject('请更新并重启本机 AI 服务后再配置。', 503);
        const input = await readJson(request, 8 * 1024);
        const provider = url.pathname.endsWith('/api') ? 'api' : url.pathname.endsWith('/fallback') ? 'fallback' : url.pathname.endsWith('/search') ? 'search' : 'chatgpt';
        object(input, provider === 'api' ? ['revision', 'baseURL', 'modelId'] : provider === 'fallback' ? ['revision', 'enabled'] : provider === 'search' ? ['revision', 'apiKey'] : ['revision', 'modelId'], provider === 'api' ? ['apiKey'] : provider === 'chatgpt' ? ['reasoningEffort'] : []);
        if (active.size || mutatingConnection) reject('请等待当前问题或连接操作结束，再保存模型配置。', 409);
        mutatingConnection = true;
        const controller = new AbortController();
        const close = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', close);
        try {
          const settings = await runtime.updateSettings(input, provider, controller.signal);
          json(response, 200, { settings, status: status() });
        } finally { mutatingConnection = false; response.off('close', close); controller.abort(); }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/ai/chatgpt/check') {
        const runtime = dependencies.runtime;
        if (!runtime) reject('请更新并重启本机 AI 服务后再检查 ChatGPT。', 503);
        object(await readJson(request, 1024), []);
        if (active.size || mutatingConnection) reject('请等待当前问题或连接操作结束，再检查 ChatGPT。', 409);
        mutatingConnection = true;
        const controller = new AbortController();
        checkingController = controller;
        const close = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', close);
        try {
          await runtime.checkChatGpt(controller.signal);
          if (!response.destroyed) json(response, 200, status());
        } finally {
          mutatingConnection = false;
          if (checkingController === controller) checkingController = null;
          response.off('close', close); controller.abort();
        }
        return;
      }
      if (request.method === 'POST' && ['/api/ai/provider', '/api/ai/chatgpt/connect', '/api/ai/chatgpt/cancel', '/api/ai/chatgpt/disconnect'].includes(url.pathname)) {
        const runtime = dependencies.runtime;
        if (!runtime) reject('当前服务未启用 ChatGPT 连接，请更新并重启本机服务。', 503);
        const body = await readJson(request, 1024);
        object(body, url.pathname === '/api/ai/provider' ? ['provider'] : []);
        if (active.size || mutatingConnection) reject('请等待当前问题或连接操作结束，再修改模型连接。', 409);
        mutatingConnection = true;
        try {
          if (url.pathname === '/api/ai/chatgpt/connect') json(response, 200, await runtime.beginLogin());
          else {
            if (url.pathname === '/api/ai/provider') await runtime.select(body.provider);
            else if (url.pathname === '/api/ai/chatgpt/cancel') await runtime.cancelLogin();
            else await runtime.disconnect();
            json(response, 200, status());
          }
        } finally { mutatingConnection = false; }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/ai/conversations') {
        const explorationId = url.searchParams.get('explorationId');
        if (explorationId) { if (!isUuid(explorationId)) reject('研究主题编号无效。'); json(response, 200, store.topicPage(explorationId, { cursor: url.searchParams.get('cursor'), limit: Number(url.searchParams.get('limit') ?? 50) })); return; }
        const guideId = url.searchParams.get('guideId'), revision = Number(url.searchParams.get('revision'));
        if (!isId(guideId) || !isRevision(revision)) reject('请提供有效的文章与修订编号。');
        json(response, 200, store.listPage(guideId, revision, { cursor: url.searchParams.get('cursor'), limit: Number(url.searchParams.get('limit') ?? 50) })); return;
      }
      const match = /^\/api\/ai\/conversations\/([^/]+)$/.exec(url.pathname);
      if (match && ['GET', 'DELETE'].includes(request.method)) {
        const id = match[1];
        if (!isUuid(id)) reject('会话编号无效。');
        const conversation = store.conversation(id);
        if (!conversation) reject('会话不存在。', 404);
        if (request.method === 'DELETE') { if (importing) reject('备份正在恢复，请稍后再删除。', 409); store.delete(id); json(response, 200, { deleted: true }); }
        else json(response, 200, { conversation, ...(url.searchParams.get('summary') === '1' ? store.turnSummariesPage(id, { cursor: url.searchParams.get('cursor'), limit: Number(url.searchParams.get('limit') ?? 100) }) : store.turnsPage(id, { cursor: url.searchParams.get('cursor'), limit: Number(url.searchParams.get('limit') ?? 50) })) });
        return;
      }
      const turnMatch = /^\/api\/ai\/turns\/([^/]+)$/.exec(url.pathname);
      if (turnMatch && request.method === 'GET') {
        if (!isUuid(turnMatch[1])) reject('问答编号无效。');
        const turn = store.turn(turnMatch[1]); if (!turn) reject('问答不存在。', 404);
        json(response, 200, { turn }); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/ai/export/stream') {
        const controller = new AbortController();
        const close = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', close);
        try {
          const records = exportBackupStream(store, controller.signal);
          // Start the consistent snapshot before sending headers, so preparation failures remain structured errors.
          const first = await records.next();
          response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
            'content-disposition': 'attachment; filename="paperdesk-ai-backup-v3.ndjson"' });
          try {
            if (!first.done && !response.write(first.value)) await once(response, 'drain', { signal: controller.signal });
            for await (const record of records) if (!response.write(record)) await once(response, 'drain', { signal: controller.signal });
            response.end();
          } finally { await records.return(); }
        } catch (error) {
          // An incomplete backup must fail the download stream, not look like a
          // successful EOF and commit a partial native-save file.
          if (response.headersSent) response.destroy();
          throw error;
        } finally { response.off('close', close); controller.abort(); }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/ai/import/stream') {
        if (!/^application\/x-ndjson(?:\s*;|$)/i.test(request.headers['content-type'] ?? '') || request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') reject('分块备份必须使用未压缩 NDJSON。', 415);
        if (active.size || importing) reject('请等待当前问题或备份操作结束后再恢复。', 409);
        importing = true;
        const controller = new AbortController();
        const close = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', close);
        try { json(response, 200, await importBackupStream(store, request, controller.signal, { preview: url.searchParams.get('preview') === '1' })); }
        finally { importing = false; response.off('close', close); controller.abort(); }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/ai/export') { json(response, 200, store.export()); return; }
      if (request.method === 'POST' && url.pathname === '/api/ai/import') {
        const backup = await readJson(request, 16 * 1024 * 1024);
        if (active.size) reject('请等待当前问题结束后再导入 AI 备份。', 409);
        if (importing) reject('请等待备份操作结束后再导入 AI 备份。', 409);
        if (url.searchParams.get('preview') === '1') {
          validateBackup(backup);
          json(response, 200, { counts: { conversations: backup.conversations.length, turns: backup.turns.length }, schemaVersion: backup.schemaVersion, exportedAt: backup.exportedAt }); return;
        }
        const counts = store.import(backup);
        json(response, 200, { counts }); return;
      }
      if (request.method !== 'POST' || url.pathname !== '/api/ai/ask') reject('未找到该 AI 接口。', 404);
      if (importing) reject('AI 备份正在恢复，请稍后再提问。', 409);
      const input = validateAsk(await readJson(request, 256 * 1024));
      // An already committed idempotency key can be replayed without paying for another model call.
      const existing = store.byRequest(input.requestId);
      if (existing) {
        if (existing.requestHash !== requestHash(input)) reject('请求编号已用于不同的问题，请重新发送。', 409);
        if (existing.status === 'running') reject('该问题仍在回答中，请稍后加载会话。', 409);
        const send = stream(response);
        send({ type: 'accepted', conversationId: existing.conversationId, turnId: existing.id });
        send({ type: 'sources', sources: existing.sources });
        send({ type: 'done', turn: existing }); response.end(); return;
      }
      const readiness = status();
      if (readiness.chatgpt.loginPending) reject('请先完成或取消 ChatGPT 登录，再继续提问。', 409);
      if (!readiness.configured) reject(readiness.provider === 'chatgpt' ? 'ChatGPT 尚未连接或授权已失效，请在 AI 设置中重新登录。' : '请在 AI 设置中连接 ChatGPT，或填写 API 配置。', 503);
      if (input.webSearch && !readiness.searchAvailable) reject('联网搜索尚未配置或模型工具已关闭，请关闭联网搜索后重试。', 409);
      if (mutatingConnection) reject('模型连接正在更新，请稍后再提问。', 409);
      if (active.has(input.requestId)) reject('该问题仍在准备或回答中，请稍后加载会话。', 409);
      if (input.conversationId && activeConversations.has(input.conversationId)) reject('当前会话正在准备或回答，请等待或停止后再试。', 409);
      if (active.size >= 2) reject('已有两个问题在回答，请稍后再试。', 429);
      if (input.conversationId) { const conversation = store.conversation(input.conversationId); if (!conversation) reject('会话不存在。', 404); if (!sameScope(conversation, input)) reject('会话属于不同研究主题或文章版本。', 409); }
      const previous = input.conversationId ? store.recentTurns(input.conversationId) : [];
      // Validate guide identity before any model/catalog request. The actual
      // selected model replaces this placeholder before committing the turn.
      // Pin credentials, target and fallback preference for this entire request,
      // even if a settings read notices an external file edit while it runs.
      const activeConfig = structuredClone(dependencies.runtime?.config ?? config);
      const prepared = prepareAssistantContext(content, input, previous, { ...activeConfig, modelId: activeConfig.modelId || 'chatgpt' }, store);
      const controller = new AbortController();
      active.set(input.requestId, controller);
      if (input.conversationId) activeConversations.add(input.conversationId);
      let timedOut = false, persistedAt = Date.now();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, activeConfig.timeoutMs);
      response.on('close', () => { if (!response.writableEnded) controller.abort(); });
      let turn, send;
      const persist = () => { store.save(turn); persistedAt = Date.now(); };
      try {
        const selected = dependencies.runtime ? await dependencies.runtime.resolve(controller.signal, activeConfig) : { provider: 'api', config: activeConfig, run: answer };
        controller.signal.throwIfAborted();
        prepared.context.model = selected.config.modelId;
        prepared.context.provider = selected.provider ?? readiness.provider;
        if (selected.fallback) prepared.context.fallback = selected.fallback;
        const begun = store.begin(input, prepared.context, prepared.sources);
        if (begun.replay) {
          if (begun.turn.status === 'running') reject('该问题仍在回答中，请稍后加载会话。', 409);
          send = stream(response);
          send({ type: 'accepted', conversationId: begun.turn.conversationId, turnId: begun.turn.id });
          send({ type: 'sources', sources: begun.turn.sources });
          send({ type: 'done', turn: begun.turn });
          return;
        }
        turn = begun.turn;
        Object.defineProperty(prepared, 'runResearchTool', {value:researchToolsForTurn(store, turn),configurable:true});
        send = stream(response);
        const emit = event => {
          controller.signal.throwIfAborted();
          if (event.type === 'delta') {
            if (turn.answer.length + event.text.length > LIMITS.answerChars) throw new PublicError('回答达到长度预算，已保留收到的内容。', 502);
            turn.answer += event.text;
            if (Date.now() - persistedAt >= 500) persist();
          } else if (event.type === 'replace') {
            if (typeof event.text !== 'string' || event.text.length > LIMITS.answerChars) throw new PublicError('回答达到长度预算，已保留收到的内容。', 502);
            // Keep the provider's turn reference intact. A failed checkpoint
            // retains the original answer and sends no replacement to the UI.
            store.save({ ...turn, answer: event.text });
            turn.answer = event.text; persistedAt = Date.now();
          }
          send(event);
        };
        send({ type: 'accepted', conversationId: turn.conversationId, turnId: turn.id });
        send({ type: 'status', text: prepared.context.scope === 'research' ? '已载入当前研究快照；本轮未附加论文' : prepared.context.scope === 'full-guide' ? '已载入完整压缩导读、覆盖说明和出处' : '全文导读超过预算：仅载入开篇、当前章节与覆盖说明' });
        send({ type: 'sources', sources: turn.sources });
        if (selected.fallback) send({ type: 'status', text: '订阅或此应用额度已达上限，本轮改用备用 API 回答。' });
        try {
          await selected.run({ config: selected.config, content, prepared, request: input, turn, signal: controller.signal, emit, persist, fetchImpl });
        } catch (error) {
          const fallback = selected.provider === 'chatgpt'
            ? dependencies.runtime?.fallbackFor(error, { signal: controller.signal, config: activeConfig, stage: 'answer', fromModel: turn.context.model }) : null;
          if (!fallback) throw error;
          // Retain the interrupted attempt and every evidence ID. The API starts
          // a fresh answer from the original question/history and those sources.
          // Commit before the browser replaces text; failed saves keep the old turn.
          const replacement = structuredClone(turn);
          replacement.context.fallback = { ...fallback.fallback, previousAnswer: turn.answer, previousToolCount: turn.context.toolEvents.length };
          replacement.context.provider = 'api'; replacement.context.model = fallback.config.modelId;
          // A proposal from the interrupted provider must not become adoptable
          // merely because the fallback finishes a different answer.
          if (replacement.context.researchProposals) replacement.context.researchProposals = [];
          replacement.answer = '';
          store.save(replacement); turn = replacement; Object.defineProperty(prepared, 'runResearchTool', {value:researchToolsForTurn(store, turn),configurable:true}); persistedAt = Date.now();
          send({ type: 'reset', turn });
          send({ type: 'status', text: '订阅或此应用额度已达上限，备用 API 正在重新回答；已保留订阅的未完成内容。' });
          await fallback.run({ config: fallback.config, content, prepared, request: input, turn, signal: controller.signal, emit, persist, fetchImpl });
        }
        controller.signal.throwIfAborted();
        turn.status = 'complete'; persist();
        send({ type: 'done', turn });
      } catch (error) {
        if (!turn) {
          if (timedOut) throw new PublicError('模型连接准备超时，请检查连接后重试。', 504);
          throw error;
        }
        turn.status = controller.signal.aborted || turn.answer ? 'interrupted' : 'error';
        // Persist terminal status before telling the browser that it can be recovered.
        try {
          persist();
          send({ type: 'error', message: timedOut ? '回答超时，已保存收到的内容。可重新提问。' : controller.signal.aborted ? '回答已停止，已保存收到的内容。' : publicMessage(error), turn });
        } catch {
          // A snapshot that exceeds its reservation must not leave a permanent running lock.
          // Restore the last successful checkpoint, whose bytes are already reserved.
          try {
            const checkpoint = store.turn(turn.id);
            checkpoint.status = 'interrupted'; store.save(checkpoint);
            send({ type: 'error', message: '最新内容保存失败，已保留上一次成功保存的问答。请复制当前可见回答后检查本地容量。', turn: checkpoint });
          } catch { send({ type: 'error', message: 'AI 记录保存失败。请保留当前回答，检查本地磁盘后再重试。' }); }
        }
      } finally {
        clearTimeout(timer); controller.abort(); active.delete(input.requestId);
        if (input.conversationId) activeConversations.delete(input.conversationId);
        if (response.headersSent && !response.writableEnded) response.end();
      }
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof PublicError ? error.status : 500, { message: publicMessage(error) });
      else if (!response.writableEnded) response.end();
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  server.abortActive = () => { checkingController?.abort(); for (const controller of active.values()) controller.abort(); };
  return server;
}
