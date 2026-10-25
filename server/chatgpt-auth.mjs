import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { ChatGptStorage } from './chatgpt-storage.mjs';
import { PublicError } from './validation.mjs';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const PERMISSION = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PERMISSION}`;
const TERMINAL = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);
const safeError = error => error instanceof PublicError ? error : new PublicError('ChatGPT 连接暂时不可用，请稍后重试。', 503);
const fail = (message, code = 400) => { throw new PublicError(message, code); };
const secret = () => randomBytes(32).toString('base64url');
const same = (left, right) => typeof left === 'string' && typeof right === 'string' && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const text = (value, max = 32768) => typeof value === 'string' && value.length > 0 && value.length <= max;
const validClient = value => text(value, 200) && /^[a-zA-Z0-9_-]+$/.test(value) && value !== 'dynamic_agent_client';
const tokenless = registration => ({ ...registration, tokens: null, pendingRotation: null });
const problem = (message, status, code, upstreamStatus) => {
  const error = new PublicError(message, status); error.code = code;
  if (Number.isInteger(upstreamStatus)) error.upstreamStatus = upstreamStatus;
  return error;
};
function responseProblem(response, stage, html = false, challenge = false) {
  const detail = challenge ? '，返回浏览器验证页面' : html ? '，返回 HTML 页面' : '';
  const message = response.status === 403 || challenge || html
    ? `读取 ChatGPT ${stage}时收到 HTTP ${response.status}${detail}。本机服务未获得所需的授权数据，请检查当前网络对 auth.openai.com 的访问或联系网络管理员；也可继续使用已配置的 API。`
    : response.status === 429 ? `ChatGPT ${stage}请求过于频繁（HTTP 429），请稍后重试。`
      : `ChatGPT ${stage}请求失败（HTTP ${response.status}），请稍后重试。`;
  // Unexpected HTTP 401/HTML is not proof that a saved refresh token is invalid.
  const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 502;
  return problem(message, status, challenge ? 'oauth_html_challenge' : html ? 'oauth_html_response' : 'oauth_http_error', response.status);
}

function validateSaved(value) {
  if (!value || value.version !== 1 || !/^urn:uuid:[a-f0-9-]{36}$/i.test(value.hostId) || !Array.isArray(value.registrations) || value.registrations.length > 20) throw Error();
  const ids = new Set();
  for (const record of value.registrations) {
    if (!text(record.id, 100) || ids.has(record.id) || !validClient(record.clientId) || record.subject !== null && !text(record.subject, 500)) throw Error();
    ids.add(record.id);
    for (const token of [record.tokens, record.pendingRotation?.tokens]) if (token && (typeof token.accessToken !== 'string' || token.accessToken.length > 32768 || !Number.isFinite(token.expiresAt) || !Array.isArray(token.scopes) || !token.scopes.every(scope => text(scope, 100))
      || token.refreshToken !== null && !text(token.refreshToken) || !text(token.idToken) || !Number.isFinite(token.receivedAt))) throw Error();
    if (record.pendingRotation && (!record.pendingRotation.tokens || !Number.isFinite(record.pendingRotation.receivedAt))) throw Error();
  }
  if (value.activeId !== null && !ids.has(value.activeId)) throw Error();
  return value;
}

export class ChatGptAuth {
  constructor({ directory = fileURLToPath(new URL('../private/ai/chatgpt/', import.meta.url)), fetchImpl = fetch,
    onConnected = async () => {}, storage, now = Date.now, loginTimeoutMs = 600000 } = {}) {
    this.storage = storage ?? new ChatGptStorage(directory); this.fetchImpl = fetchImpl; this.onConnected = onConnected;
    this.now = now; this.loginTimeoutMs = loginTimeoutMs; this.state = null; this.pending = null;
    this.error = null; this.storageError = null; this.writeQueue = Promise.resolve(); this.refreshing = null; this.closed = false; this.changing = false;
    this.responseMeta = new WeakMap();
  }
  async initialize() {
    if (!this.initializing) this.initializing = (async () => {
      try {
        await this.storage.initialize();
        this.state = validateSaved(await this.storage.read() ?? { version: 1, hostId: `urn:uuid:${randomUUID()}`, activeId: null, registrations: [] });
        await this.storage.write(this.state); this.storageError = null;
      } catch { this.storageError = 'ChatGPT 凭据存储不可用。请检查本机加密与目录权限；原有 API 接入仍可使用。'; }
    })();
    await this.initializing;
  }
  requireReady() {
    if (this.closed) fail('ChatGPT 登录服务已关闭。', 503);
    if (this.storageError || !this.state) fail(this.storageError ?? 'ChatGPT 凭据存储尚未就绪。', 503);
  }
  async commit(change) {
    const next = this.writeQueue.then(async () => {
      const updated = structuredClone(this.state); change(updated);
      await this.storage.write(updated); this.state = updated;
    });
    this.writeQueue = next.catch(() => {});
    return next;
  }
  current() { return this.state?.registrations.find(record => record.id === this.state.activeId); }
  status() {
    const record = this.current();
    return { connected: Boolean(record?.subject && (record.tokens || record.pendingRotation)), pending: Boolean(this.pending || this.starting || this.changing),
      planEnabled: Boolean(record?.tokens?.scopes.includes(PERMISSION)), needsLogin: Boolean(this.storageError || record && !record.tokens && !record.pendingRotation),
      ...(this.storageError || this.error ? { error: this.storageError ?? this.error } : {}) };
  }
  async remote(url, { signal, stage = '授权服务', ...options } = {}) {
    const timeout = AbortSignal.timeout(15000), requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const headers = new Headers(options.headers); if (!headers.has('accept')) headers.set('accept', 'application/json');
    try {
      const response = await this.fetchImpl(url, { ...options, headers, redirect: 'error', signal: requestSignal });
      this.responseMeta.set(response, { signal, timeout, requestSignal, stage }); return response;
    } catch {
      if (signal?.aborted) throw problem('ChatGPT 操作已取消。', 409, 'oauth_cancelled');
      if (timeout.aborted) throw problem(`连接 ChatGPT ${stage}超时，请检查本机网络后重试。`, 504, 'oauth_timeout');
      throw problem(`无法连接 ChatGPT ${stage}。请检查本机服务的网络、DNS 与 TLS 连接后重试。`, 503, 'oauth_network_error');
    }
  }
  async json(response, { stage = '授权服务', allowErrorJson = false } = {}) {
    const meta = this.responseMeta.get(response);
    const checkAbort = () => {
      if (meta?.signal?.aborted) throw problem('ChatGPT 操作已取消。', 409, 'oauth_cancelled');
      if (meta?.timeout.aborted) throw problem(`读取 ChatGPT ${stage}超时，请检查本机网络后重试。`, 504, 'oauth_timeout');
    };
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const html = ['text/html', 'application/xhtml+xml'].includes(contentType), challenge = response.headers.get('cf-mitigated') === 'challenge';
    if (html || challenge || !response.ok && !allowErrorJson) {
      await response.body?.cancel().catch(() => {}); checkAbort(); throw responseProblem(response, stage, html, challenge);
    }
    if (!response.body) throw problem(`ChatGPT ${stage}返回了空响应，无法继续。`, 502, 'oauth_empty_response');
    if (!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(contentType)) {
      await response.body.cancel().catch(() => {}); checkAbort();
      if (!response.ok) throw responseProblem(response, stage);
      throw problem(`ChatGPT ${stage}返回了非 JSON 类型的数据（HTTP ${response.status}），无法继续。请检查网络响应后重试。`, 502, 'oauth_content_type', response.status);
    }
    const reader = response.body.getReader(); let bytes = 0; const chunks = [];
    const abort = () => { void reader.cancel().catch(() => {}); };
    meta?.requestSignal.addEventListener('abort', abort, { once: true });
    try {
      while (true) {
        checkAbort(); const part = await reader.read(); checkAbort(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 512 * 1024) throw problem(`ChatGPT ${stage}响应超过安全大小限制。`, 502, 'oauth_response_size');
        chunks.push(Buffer.from(part.value));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) throw problem(`ChatGPT ${stage}返回了空响应，无法继续。`, 502, 'oauth_empty_response');
      if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body)) throw responseProblem(response, stage, true);
      let value;
      try { value = JSON.parse(body); } catch {
        if (!response.ok) throw responseProblem(response, stage);
        throw problem(`ChatGPT ${stage}响应不是有效 JSON（HTTP ${response.status}），请稍后重试。`, 502, 'oauth_invalid_json', response.status);
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem(`ChatGPT ${stage}的 JSON 结构不符合协议，无法继续。`, 502, 'oauth_json_schema');
      return value;
    } catch (error) {
      checkAbort(); if (error instanceof PublicError) throw error;
      throw problem(`读取 ChatGPT ${stage}时连接中断，请检查网络后重试。`, 502, 'oauth_response_interrupted');
    } finally { meta?.requestSignal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); }
  }
  async discovery() {
    if (!this.discoveryPromise) this.discoveryPromise = (async () => {
      const response = await this.remote(`${ISSUER}/.well-known/openid-configuration`, { stage: '授权配置' }), data = await this.json(response, { stage: '授权配置' });
      if (data.issuer !== ISSUER || !Array.isArray(data.id_token_signing_alg_values_supported) || !data.id_token_signing_alg_values_supported.includes('RS256')) throw problem('ChatGPT 授权配置的 JSON 字段不符合 OIDC 协议，无法开始登录。', 502, 'oauth_discovery_schema');
      for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint']) {
        let parsed; try { parsed = new URL(data[field]); } catch { throw problem('ChatGPT 授权配置缺少有效的官方服务地址，无法开始登录。', 502, 'oauth_discovery_schema'); }
        if (parsed.origin !== ISSUER || parsed.username || parsed.password || parsed.search || parsed.hash) throw problem('ChatGPT 授权配置包含不允许的服务地址，已停止登录。', 502, 'oauth_discovery_schema');
      }
      return data;
    })().catch(error => { this.discoveryPromise = null; throw safeError(error); });
    return this.discoveryPromise;
  }
  async identity(idToken, clientId, { nonce, receivedAt = this.now() } = {}) {
    if (!text(idToken)) fail('ChatGPT 未提供可验证的身份凭据，请重新登录。', 401);
    const discovery = await this.discovery();
    const loadKeys = async () => {
      const response = await this.remote(discovery.jwks_uri, { stage: '签名密钥' }), data = await this.json(response, { stage: '签名密钥' });
      if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > 50) throw problem('ChatGPT 签名密钥的 JSON 结构不符合协议，已保留连接。', 503, 'oauth_jwks_schema');
      this.keys = createLocalJWKSet(data); this.keysLoadedAt = this.now();
    };
    if (!this.keys || this.now() - this.keysLoadedAt > 1800000) await loadKeys();
    const verify = () => jwtVerify(idToken, this.keys, { issuer: ISSUER, audience: clientId, algorithms: ['RS256'], clockTolerance: 5,
      requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub'], currentDate: new Date(receivedAt) });
    let payload;
    try { ({ payload } = await verify()); }
    catch (error) {
      if (error.code === 'ERR_JWKS_NO_MATCHING_KEY') { await loadKeys(); try { ({ payload } = await verify()); } catch { fail('ChatGPT 身份凭据校验失败，请重新登录。', 401); } }
      else fail('ChatGPT 身份凭据校验失败，请重新登录。', 401);
    }
    if (!text(payload.sub, 500) || payload.iat > receivedAt / 1000 + 5 || nonce !== undefined && !same(payload.nonce, nonce)
      || payload.azp !== undefined && payload.azp !== clientId || Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) fail('ChatGPT 身份与本次登录不匹配，请重新登录。', 401);
    return payload.sub;
  }
  async tokenRequest(fields, signal) {
    const discovery = await this.discovery();
    const stage = fields.grant_type === 'refresh_token' ? '登录续期' : '令牌交换';
    const response = await this.remote(discovery.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields), signal, stage });
    const data = await this.json(response, { stage, allowErrorJson: true });
    if (!response.ok) {
      const code = typeof data.error === 'string' ? data.error : data.error?.code;
      if (!TERMINAL.has(code) && code !== 'invalid_client') throw responseProblem(response, stage);
      const error = new PublicError(TERMINAL.has(code) ? 'ChatGPT 登录已过期或被撤销，请重新登录。' : 'ChatGPT 注册不可用，请检查接入状态。', TERMINAL.has(code) ? 401 : 503);
      error.terminal = TERMINAL.has(code); throw error;
    }
    return data;
  }
  tokenFields(data, previous, requireRefresh = false) {
    const scope = data.scope ?? previous?.scopes?.join(' ');
    if (typeof scope !== 'string' || scope.length > 4000 || !text(data.id_token ?? previous?.idToken)) fail('ChatGPT 未确认完整授权范围，请重新登录。', 401);
    const scopes = scope.split(/\s+/).filter(Boolean);
    if (!data.access_token && !scopes.includes(PERMISSION) && !scopes.includes('offline_access')) return { accessToken: '', refreshToken: null, idToken: data.id_token, scopes, expiresAt: 0, receivedAt: this.now(), earliestRefreshAt: null };
    if (!text(data.access_token) || data.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 86400
      || (requireRefresh || scopes.includes('offline_access')) && !text(data.refresh_token)) fail('ChatGPT 返回的凭据不完整，请重新登录。', 401);
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, idToken: data.id_token ?? previous.idToken, scopes,
      expiresAt: this.now() + data.expires_in * 1000, receivedAt: this.now(), earliestRefreshAt: typeof data.earliest_refresh_at === 'number' || typeof data.earliest_refresh_at === 'string' ? data.earliest_refresh_at : null };
  }
  async beginLogin(options = {}) {
    await this.initialize(); this.requireReady();
    if (this.starting || this.pending || this.changing || this.refreshing) fail('请先完成当前连接操作。', 409);
    this.starting = true; const epoch = this.loginEpoch ?? 0;
    try { return await this.prepareLogin(options, epoch); }
    catch (error) { this.error = safeError(error).message; throw safeError(error); }
    finally { this.starting = false; }
  }
  async prepareLogin({ registrationId, newAccount = false } = {}, epoch) {
    await this.initialize(); this.requireReady();
    if (this.pending || this.changing || this.refreshing) fail('请先完成当前连接操作。', 409);
    const discovery = await this.discovery();
    this.requireReady();
    if ((this.loginEpoch ?? 0) !== epoch) fail('登录已取消。', 409);
    const selected = !newAccount ? this.state.registrations.find(record => record.id === (registrationId ?? this.state.activeId)) ?? this.state.registrations.at(-1) : undefined;
    if (registrationId && selected?.id !== registrationId) fail('指定的 ChatGPT 注册不存在。', 404);
    if (!selected && this.state.registrations.length >= 20) fail('本地 ChatGPT 注册已达到上限。', 409);
    const pending = { id: selected?.id ?? randomUUID(), previousActiveId: this.state.activeId, selected: selected ? structuredClone(selected) : null, state: secret(), nonce: secret(), verifier: secret(), controller: new AbortController(), expiresAt: this.now() + this.loginTimeoutMs, consumed: false };
    this.pending = pending; this.error = null;
    try {
      const server = createServer((request, response) => { void this.callback(pending, request, response); }); pending.server = server;
      server.headersTimeout = 10000; server.requestTimeout = 15000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      if (this.pending !== pending) fail('登录已取消。', 409);
      pending.redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
      server.on('error', () => { this.error = '本机登录回调服务中断，请重新登录。'; void this.cancelLogin(); });
      pending.timer = setTimeout(() => { this.error = 'ChatGPT 登录等待已超时，请重新登录。'; void this.cancelLogin(); }, this.loginTimeoutMs);
      pending.timer.unref();
      const url = new URL(discovery.authorization_endpoint);
      url.search = new URLSearchParams({ client_id: selected?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: this.state.hostId,
        ...(!selected ? { agent_name_hint: 'PaperDesk' } : {}),
        ...(selected?.tokens && !selected.tokens.scopes.includes(PERMISSION) ? { prompt: 'consent' } : {}),
        response_type: 'code', redirect_uri: pending.redirectUri, scope: SCOPES, resource: RESOURCE,
        state: pending.state, nonce: pending.nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(pending.verifier).digest('base64url') }).toString();
      // No saved ID/access/refresh token or personal hint is exposed in this browser URL.
      return { authorizationUrl: url.href, expiresAt: new Date(pending.expiresAt).toISOString() };
    } catch (error) { await this.cancelLogin(); throw safeError(error); }
  }
  async callback(pending, request, response) {
    let ownsCallback = false, completeCallback;
    const reply = (status, message) => { if (!response.headersSent) response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }); response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>PaperDesk</title><h1>PaperDesk</h1><p>${message}</p></html>`); };
    try {
      const url = new URL(request.url ?? '/', pending.redirectUri);
      if (this.pending !== pending || pending.consumed || request.method !== 'GET' || request.headers.host !== new URL(pending.redirectUri).host || url.origin !== new URL(pending.redirectUri).origin || url.pathname !== '/auth/callback') { reply(404, '无效的登录回调。'); return; }
      if (url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), pending.state)) { reply(400, '登录校验不匹配，请返回最初的登录页面。'); return; }
      pending.consumed = true; ownsCallback = true;
      pending.completion = new Promise(resolve => { completeCallback = resolve; });
      if (pending.expiresAt <= this.now()) fail('登录已超时，请重新登录。');
      if (url.searchParams.has('error')) fail('ChatGPT 登录未获授权。可以返回 PaperDesk 重试。');
      if (url.searchParams.has('iss') && url.searchParams.get('iss') !== ISSUER) fail('登录签发方不匹配。');
      const code = url.searchParams.get('code'), clientId = url.searchParams.get('client_id') ?? pending.selected?.clientId;
      if (url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('client_id').length > 1 || !text(code, 8192) || !validClient(clientId)
        || pending.selected && clientId !== pending.selected.clientId) fail('ChatGPT 注册未完成或注册不匹配，请重试。');
      await this.commit(state => {
        if (this.pending !== pending) fail('登录已取消。', 409);
        if (!state.registrations.some(record => record.id === pending.id)) state.registrations.push({ id: pending.id, clientId, subject: null, tokens: null, pendingRotation: null });
      });
      const data = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }, pending.controller.signal);
      const subject = await this.identity(data.id_token, clientId, { nonce: pending.nonce });
      if (pending.selected?.subject && subject !== pending.selected.subject) fail('此次登录属于不同账户。原连接已保留，请使用原账户登录。', 401);
      const tokens = this.tokenFields(data);
      await this.commit(state => {
        if (this.pending !== pending || pending.controller.signal.aborted) fail('登录已取消。', 409);
        state.registrations = state.registrations.map(record => record.id === pending.id ? { ...record, subject, tokens, pendingRotation: null } : record); state.activeId = pending.id;
      });
      if (this.pending !== pending || pending.controller.signal.aborted) {
        await this.commit(state => {
          state.registrations = state.registrations.map(record => record.id === pending.id ? pending.selected ?? tokenless(record) : record);
          state.activeId = pending.previousActiveId;
        });
        fail('登录已取消。', 409);
      }
      this.error = null;
      try { await this.onConnected(); } catch { this.error = '登录已保存，但自动切换提供方失败，请手动选择 ChatGPT。'; }
      reply(200, tokens.scopes.includes(PERMISSION) ? 'ChatGPT 已连接。可以关闭此页并返回 PaperDesk。' : '已完成登录，但未允许使用 ChatGPT 订阅。请返回 PaperDesk 检查授权。');
    } catch (error) { this.error = safeError(error).message; reply(400, '登录未完成。请返回 PaperDesk 查看状态并重试。'); }
    finally {
      if (ownsCallback && this.pending === pending) { this.pending = null; clearTimeout(pending.timer); pending.server.close(); }
      completeCallback?.();
    }
  }
  async cancelLogin() {
    this.loginEpoch = (this.loginEpoch ?? 0) + 1;
    const pending = this.pending; this.pending = null;
    if (!pending) return;
    clearTimeout(pending.timer); pending.controller.abort(); pending.server?.close(); pending.server?.closeAllConnections();
    await pending.completion;
  }
  async getAccessToken({ signal } = {}) {
    await this.initialize(); this.requireReady();
    if (this.pending || this.changing) fail('ChatGPT 连接正在变更，请完成后再提问。', 409);
    signal?.throwIfAborted();
    const record = this.current();
    if (!record?.subject || !record.tokens && !record.pendingRotation) fail('请先登录 ChatGPT。', 401);
    if (!record.pendingRotation && !record.tokens.scopes.includes(PERMISSION)) fail('此连接未允许使用 ChatGPT 订阅，请重新确认授权。', 403);
    if (record.pendingRotation || record.tokens.expiresAt <= this.now() + 60000) {
      if (!record.pendingRotation) {
        const earliest = typeof record.tokens.earliestRefreshAt === 'number' ? record.tokens.earliestRefreshAt * 1000 : typeof record.tokens.earliestRefreshAt === 'string' ? Date.parse(record.tokens.earliestRefreshAt) : 0;
        if (Number.isFinite(earliest) && earliest > this.now()) {
          if (record.tokens.expiresAt <= this.now()) fail('ChatGPT 暂未允许刷新，请稍后重试。', 503);
          return record.tokens.accessToken;
        }
      }
      if (!this.refreshing) this.refreshing = this.refresh(record.id).finally(() => { this.refreshing = null; });
      // Once a rotating refresh starts, finish persisting it even if its caller cancels.
      await this.refreshing;
    }
    signal?.throwIfAborted();
    if (this.changing || this.closed) fail('ChatGPT 连接已改变，请重新提问。', 409);
    const refreshed = this.current();
    if (refreshed?.id !== record.id || !refreshed.tokens?.scopes.includes(PERMISSION)) fail('ChatGPT 连接权限已改变，请重新登录。', 403);
    if (refreshed.pendingRotation || refreshed.tokens.expiresAt <= this.now()) fail('ChatGPT 凭据暂未就绪，请稍后重试。', 503);
    return refreshed.tokens.accessToken;
  }
  async refresh(id) {
    let record = this.state.registrations.find(item => item.id === id);
    try {
      if (!record.pendingRotation) {
        if (!record.tokens?.refreshToken) fail('ChatGPT 连接需要重新登录。', 401);
        const data = await this.tokenRequest({ grant_type: 'refresh_token', client_id: record.clientId, refresh_token: record.tokens.refreshToken, resource: RESOURCE });
        const tokens = this.tokenFields(data, record.tokens, true);
        // Keep the replacement quarantined in memory even if its first encrypted
        // write fails. Retrying must save this token, never reuse the old refresh.
        record.pendingRotation = { tokens, receivedAt: this.now(), hasNewIdToken: data.id_token !== undefined };
      }
      const rotation = record.pendingRotation;
      // Confirm durable quarantine before JWKS retrieval or exposing the token.
      // An interrupted previous attempt may need to retry this same write.
      await this.commit(state => { state.registrations.find(item => item.id === id).pendingRotation = rotation; });
      if (rotation.hasNewIdToken) {
        const subject = await this.identity(rotation.tokens.idToken, record.clientId, { receivedAt: rotation.receivedAt });
        if (subject !== record.subject) fail('刷新返回的账户不匹配，请重新登录原账户。', 401);
      }
      await this.commit(state => { const current = state.registrations.find(item => item.id === id); current.tokens = rotation.tokens; current.pendingRotation = null; });
      this.error = null;
    } catch (error) {
      const safe = safeError(error); this.error = safe.message;
      if (error.terminal || safe.status === 401) await this.commit(state => { state.registrations = state.registrations.map(item => item.id === id ? tokenless(item) : item); });
      throw safe;
    }
  }
  async disconnect() {
    await this.initialize(); this.requireReady();
    if (this.changing) fail('连接正在断开，请稍候。', 409);
    this.changing = true; await this.cancelLogin();
    try {
      await this.refreshing?.catch(() => {});
      const record = this.current(); const token = record?.pendingRotation?.tokens.refreshToken ?? record?.tokens?.refreshToken;
      let revoked = !token;
      if (token) {
        for (let attempt = 0; attempt < 2; attempt++) {
          let retry = true;
          try {
            const discovery = await this.discovery();
            const response = await this.remote(discovery.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: 'refresh_token', client_id: record.clientId }) });
            await response.body?.cancel().catch(() => {}); revoked = response.status === 200; retry = response.status >= 500;
          } catch { /* Retry a network failure once; never reveal the token or response. */ }
          if (revoked || !retry) break;
          if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      if (record) await this.commit(state => { state.registrations = state.registrations.map(item => item.id === record.id ? tokenless(item) : item); });
      this.error = revoked ? null : '本地凭据已清除，未确认远端撤销。可到 ChatGPT 设置中断开此应用。';
      return { disconnected: true, revocationConfirmed: revoked, ...(this.error ? { message: this.error } : {}) };
    } finally { this.changing = false; }
  }
  async close() { this.closed = true; await this.cancelLogin(); await this.refreshing?.catch(() => {}); await this.writeQueue; }
}
