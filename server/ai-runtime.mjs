import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ChatGptAuth } from './chatgpt-auth.mjs';
import { answerWithChatGpt, listChatGptModels, isChatGptQuotaError, checkChatGptAvailability } from './chatgpt-provider.mjs';
import { answer } from './provider.mjs';
import { PublicError } from './validation.mjs';
import { BackendSettings } from './settings.mjs';
import { ChatGptCatalog } from './chatgpt-catalog.mjs';
import { REASONING_EFFORTS, validReasoningEffort } from './reasoning.mjs';

const emptyAvailability = () => ({ state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null });

// Provider choice is separate from credentials and conversation backups. Once
// ChatGPT is selected, only an explicitly identified usage limit can use the
// configured API fallback. Authentication and transient failures never do.
export class AiRuntime {
  constructor({ config, directory, configFile, fetchImpl = fetch, auth, resolveModel, listModels = listChatGptModels,
    apiAnswer = answer, chatgptAnswer = answerWithChatGpt, probe = checkChatGptAvailability }) {
    this.config = config;
    this.directory = directory;
    this.fetchImpl = fetchImpl;
    this.resolveModel = resolveModel;
    this.listModels = listModels;
    this.catalog = new ChatGptCatalog(signal => this.listModels(this.auth, { signal, fetchImpl: this.fetchImpl }));
    this.availability = emptyAvailability();
    this.availabilityEpoch = 0;
    this.observationSequence = 0;
    this.latestDefinitiveObservation = 0;
    this.latestErrorObservation = 0;
    this.checkOperation = null;
    this.closed = false;
    this.probe = probe;
    this.settings = configFile ? new BackendSettings({ file: configFile, onChange: next => {
      if (next.chatgptModelId !== this.config.chatgptModelId) { this.clearAvailability(); this.model = null; }
      this.config = next;
    } }) : null;
    this.apiAnswer = apiAnswer;
    this.chatgptAnswer = chatgptAnswer;
    this.provider = 'api';
    this.model = null;
    this.writes = Promise.resolve();
    this.auth = auth ?? new ChatGptAuth({ directory: join(directory, 'chatgpt'), fetchImpl,
      onConnected: async () => { this.catalog.clear(); this.clearAvailability(); this.model = null; if (!this.closed) await this.saveProvider('chatgpt'); } });
  }

  async initialize() {
    await this.settings?.refresh();
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'provider.json'), 'utf8'));
      if (saved.version !== 1 || !['api', 'chatgpt'].includes(saved.provider)) throw Error();
      this.provider = saved.provider;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new PublicError('模型连接选择无法读取，请检查本地服务数据。', 503);
    }
    await this.auth.initialize();
  }

  status() {
    const login = this.auth.status();
    const connected = Boolean(login.connected && login.planEnabled);
    const missingPermission = login.connected && !login.planEnabled;
    const configured = this.provider === 'api' ? this.config.configured : connected;
    const canShowAvailability = connected && !login.pending && !login.needsLogin && !this.closed;
    return {
      provider: this.provider,
      configured,
      apiConfigured: this.config.configured,
      model: this.provider === 'api' ? this.config.configured ? this.config.modelId : null : connected ? this.model : null,
      searchAvailable: Boolean(configured && this.config.toolsEnabled && this.config.search.apiKey.trim()),
      chatgpt: { connected, loginPending: Boolean(login.pending), fallbackToApi: this.config.chatgptFallbackToApi,
        needsLogin: Boolean(login.needsLogin || missingPermission),
        availability: canShowAvailability ? { ...this.availability, checking: Boolean(this.checkOperation && this.checkOperation.observation.epoch === this.availabilityEpoch) } : emptyAvailability(),
        ...(missingPermission ? { error: 'ChatGPT 已登录，但未授权套餐使用。请重新连接并允许使用套餐额度。' }
          : login.error || login.message ? { error: login.error || login.message } : {}) },
    };
  }

  clearAvailability() {
    this.availabilityEpoch++;
    this.availability = emptyAvailability();
    this.checkOperation?.controller.abort();
  }

  beginObservation(config = this.config) {
    return { epoch: this.availabilityEpoch, sequence: ++this.observationSequence, preference: config.chatgptModelId };
  }

  observe(observation, { state, model = null, lastError = null }) {
    const login = this.auth.status();
    if (this.closed || observation.epoch !== this.availabilityEpoch || observation.preference !== this.config.chatgptModelId
      || !login.connected || !login.planEnabled || login.pending || login.needsLogin) return;
    if (state) {
      if (observation.sequence < this.latestDefinitiveObservation) return;
      this.latestDefinitiveObservation = observation.sequence;
      this.latestErrorObservation = Math.max(this.latestErrorObservation, observation.sequence);
      this.availability = { state, model, checkedAt: new Date().toISOString(), checking: false, lastError: null };
    } else {
      // A catalog/network failure cannot veto a real answer already in flight.
      // A newer definitive quota result can veto an older successful answer.
      if (observation.sequence < Math.max(this.latestDefinitiveObservation, this.latestErrorObservation)) return;
      this.latestErrorObservation = observation.sequence;
      this.availability = { ...this.availability, lastError };
    }
  }

  observeFailure(observation, error, { model = null, signal, timedOut = false } = {}) {
    if (error instanceof PublicError && ([401, 403].includes(error.status) || error.code === 'subscription_sharing_unsupported_capability')) this.catalog.clear();
    if (!signal?.aborted && isChatGptQuotaError(error)) this.observe(observation, { state: 'quota_exhausted', model });
    else this.observe(observation, { lastError: timedOut ? '本次检查超时，未能确认当前可用性。'
      : signal?.aborted ? '本次请求已停止，未能确认当前可用性。'
        : error instanceof PublicError ? error.message
          : '本次请求未能确认 ChatGPT 当前可用性，请稍后重试。' });
  }

  async beginLogin() { this.catalog.clear(); this.clearAvailability(); this.model = null; return this.auth.beginLogin(); }
  async cancelLogin() { this.catalog.clear(); this.clearAvailability(); this.model = null; await this.auth.cancelLogin(); }

  validateEffort(model, effort) {
    if (!validReasoningEffort(effort)) throw new PublicError('Thinking 参数无效，请在 AI 设置中重新选择。');
    if (effort && !model.reasoningEfforts?.includes(effort))
      throw new PublicError('当前模型未提供所选 Thinking 档位，请刷新模型列表后选择支持的档位或“模型默认”。', 409);
  }

  async selectModel(snapshot, signal, { probe = false } = {}) {
    // Resolver injection supports isolated runtime tests; production shares one
    // bounded catalog across the picker, checks and subsequent questions.
    let model;
    if (this.resolveModel) model = { id: await this.resolveModel(this.auth, { modelId: snapshot.chatgptModelId, signal, fetchImpl: this.fetchImpl }) };
    else {
      const models = await this.catalog.get(signal);
      model = snapshot.chatgptModelId ? models.find(item => item.id === snapshot.chatgptModelId) : models[0];
    }
    signal?.throwIfAborted();
    if (!model) throw new PublicError(snapshot.chatgptModelId ? '所选 ChatGPT 模型不在当前账号的可用目录中，请重新选择。' : '当前 ChatGPT 账号没有可用于此应用的模型。', 403);
    if (!probe) this.validateEffort(model, snapshot.chatgptReasoningEffort ?? '');
    return model;
  }

  async checkChatGpt(signal) {
    const login = this.auth.status();
    if (this.closed || !login.connected || !login.planEnabled || login.pending || login.needsLogin)
      throw new PublicError('请先完成 ChatGPT 登录并授权套餐使用，再检查可用性。', 409);
    if (this.checkOperation) throw new PublicError('ChatGPT 可用性检查正在进行，请稍后再试。', 409);
    signal?.throwIfAborted();
    const snapshot = structuredClone(this.config), controller = new AbortController();
    let observation = this.beginObservation(snapshot);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const operation = { controller, observation, promise: null };
    this.checkOperation = operation;
    let timedOut = false, model = snapshot.chatgptModelId || null;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    operation.promise = (async () => {
      try {
        const selected = await this.selectModel(snapshot, requestSignal, { probe: true });
        model = selected.id;
        requestSignal.throwIfAborted();
        const reasoningEffort = REASONING_EFFORTS.find(effort => selected.reasoningEfforts?.includes(effort)) ?? '';
        await this.probe(this.auth, { modelId: model, signal: requestSignal, fetchImpl: this.fetchImpl,
          reasoningEffort,
          onRequestStart: () => { observation = { ...observation, sequence: ++this.observationSequence }; } });
        requestSignal.throwIfAborted();
        this.observe(observation, { state: 'available', model });
      } catch (error) { this.observeFailure(observation, error, { model, signal: requestSignal, timedOut }); }
      finally {
        clearTimeout(timer); controller.abort();
        if (this.checkOperation === operation) this.checkOperation = null;
      }
    })();
    await operation.promise;
    return this.status();
  }

  async saveProvider(provider) {
    const update = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const temp = join(this.directory, `provider-${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify({ version: 1, provider }), { flag: 'wx', mode: 0o600 });
        await rename(temp, join(this.directory, 'provider.json'));
        this.provider = provider;
      } finally { await rm(temp, { force: true }); }
    });
    this.writes = update.catch(() => {});
    try { await update; } catch { throw new PublicError('模型连接选择保存失败，请检查本地可写性。', 503); }
  }

  async select(provider) {
    if (!['api', 'chatgpt'].includes(provider)) throw new PublicError('模型连接类型无效。');
    if (this.auth.status().pending) throw new PublicError('请先完成或取消当前 ChatGPT 登录。', 409);
    if (provider === 'api' && !this.config.configured) throw new PublicError('后端 API 尚未配置。', 409);
    if (provider === 'chatgpt' && !this.status().chatgpt.connected) throw new PublicError('请先连接 ChatGPT 并授权套餐使用。', 409);
    await this.saveProvider(provider);
  }

  async getSettings() {
    if (!this.settings) throw new PublicError('当前服务不支持页面配置，请更新并重启。', 503);
    return this.settings.refresh();
  }

  async getModels(signal, { refresh = false } = {}) {
    if (!this.status().chatgpt.connected || this.auth.status().pending) throw new PublicError('请先完成 ChatGPT 登录，再查看可用模型。', 409);
    const observation = this.beginObservation(), model = this.config.chatgptModelId || null;
    try {
      const models = await this.catalog.get(signal, { refresh });
      signal?.throwIfAborted();
      if (observation.epoch !== this.availabilityEpoch || !this.status().chatgpt.connected || this.auth.status().pending)
        throw new PublicError('ChatGPT 连接已改变，请重新读取模型列表。', 409);
      return { models, selectedModelId: this.config.chatgptModelId };
    } catch (error) { this.observeFailure(observation, error, { model, signal }); throw error; }
  }

  async updateSettings(input, provider, signal) {
    if (!this.settings) throw new PublicError('当前服务不支持页面配置，请更新并重启。', 503);
    if (this.auth.status().pending) throw new PublicError('请先完成或取消 ChatGPT 登录，再修改配置。', 409);
    if (provider === 'chatgpt') {
      if (typeof input.modelId !== 'string' || input.modelId.length > 200) throw new PublicError('模型选择无效。');
      const { models } = await this.getModels(signal, { refresh: true });
      if (input.modelId && !models.some(model => model.id === input.modelId)) throw new PublicError('所选模型不在当前账户的可用列表中，请刷新模型列表。', 409);
      const model = input.modelId ? models.find(model => model.id === input.modelId) : models[0];
      if (!model) throw new PublicError('当前 ChatGPT 没有可用模型，请刷新模型列表。', 409);
      this.validateEffort(model, input.reasoningEffort === undefined
        ? input.modelId === this.config.chatgptModelId ? this.config.chatgptReasoningEffort ?? '' : '' : input.reasoningEffort);
    }
    return this.settings.update(input, provider);
  }

  fallbackFor(error, { signal, config, stage, fromModel = null }) {
    signal?.throwIfAborted();
    if (!isChatGptQuotaError(error) || !config.chatgptFallbackToApi || !config.configured) return null;
    return { provider: 'api', config, run: this.apiAnswer,
      fallback: { reason: 'subscription_quota', stage, fromModel, previousAnswer: '', previousToolCount: 0 } };
  }

  async resolve(signal, snapshot = this.config) {
    const provider = this.provider;
    if (provider === 'api') {
      if (!snapshot.configured) throw new PublicError('请在 AI 设置中连接 ChatGPT，或填写 API 配置。', 503);
      return { provider, config: snapshot, run: this.apiAnswer };
    }
    if (!this.status().chatgpt.connected) throw new PublicError('ChatGPT 尚未连接或未授权套餐使用，请在模型连接中重新登录。', 503);
    let observation = this.beginObservation(snapshot);
    let modelId;
    try { modelId = (await this.selectModel(snapshot, signal)).id; }
    catch (error) {
      this.observeFailure(observation, error, { model: snapshot.chatgptModelId || null, signal });
      const fallback = this.fallbackFor(error, { signal, config: snapshot, stage: 'catalog', fromModel: snapshot.chatgptModelId || null });
      if (fallback) return fallback;
      throw error;
    }
    signal.throwIfAborted();
    if (observation.epoch === this.availabilityEpoch && observation.preference === this.config.chatgptModelId) this.model = modelId;
    const config = { ...snapshot, baseURL: '', apiKey: '', modelId, configured: true,
      searchAvailable: Boolean(snapshot.toolsEnabled && snapshot.search.apiKey.trim()) };
    return { provider, config, run: async options => {
      try {
        await this.chatgptAnswer({ ...options, auth: this.auth,
          // Each tool round makes a new Responses request. Preserve the turn's
          // captured connection/model epoch while ordering that actual request.
          onRequestStart: () => { observation = { ...observation, sequence: ++this.observationSequence }; } });
        options.signal?.throwIfAborted();
        this.observe(observation, { state: 'available', model: modelId });
      } catch (error) { this.observeFailure(observation, error, { model: modelId, signal: options.signal }); throw error; }
    } };
  }

  async disconnect() { this.catalog.clear(); this.clearAvailability(); this.model = null; await this.auth.disconnect(); }
  async close() {
    this.closed = true; this.catalog.clear(); this.clearAvailability();
    await this.auth.close(); await this.checkOperation?.promise;
    await this.writes; await this.settings?.operations;
  }
}
