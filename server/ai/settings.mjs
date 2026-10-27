import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeConfig } from '../config.mjs';
import { object, PublicError } from '../http/validation.mjs';
import { validReasoningEffort } from './reasoning.mjs';

const keys = ['baseURL', 'apiKey', 'modelId', 'chatgptModelId', 'chatgptReasoningEffort', 'chatgptFallbackToApi', 'toolsEnabled', 'maxOutputTokens', 'contextTokenLimit', 'storageCapacityMiB', 'minimumFreeMiB', 'timeoutMs', 'search'];
const fingerprint = text => createHash('sha256').update(text).digest('hex');

// The browser can replace a credential, but can never retrieve one. Only the
// existing ignored backend file stores the submitted configuration.
export class BackendSettings {
  constructor({ file = fileURLToPath(new URL('../config.local.json', import.meta.url)), onChange = () => {} } = {}) {
    this.file = file;
    this.onChange = onChange;
    this.signature = null;
    this.revision = randomUUID();
    this.config = normalizeConfig();
    this.operations = Promise.resolve();
  }
  enqueue(operation) {
    const pending = this.operations.then(operation);
    this.operations = pending.catch(() => {});
    return pending;
  }
  refresh() { return this.enqueue(() => this.readCurrent()); }
  async readCurrent() {
    try {
      let raw;
      try { raw = await readFile(this.file, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; raw = '{}'; }
      if (Buffer.byteLength(raw) > 64 * 1024) throw Error();
      const signature = fingerprint(raw);
      if (signature !== this.signature) {
        const config = normalizeConfig(JSON.parse(raw));
        this.config = config;
        this.signature = signature;
        this.revision = randomUUID();
        this.onChange(config);
      }
      return this.view();
    } catch { throw new PublicError('本机 AI 配置无法读取，请检查配置文件格式与权限。', 503); }
  }
  view() {
    const { config } = this;
    return { revision: this.revision,
      api: { baseURL: config.baseURL, modelId: config.modelId, apiKeyConfigured: Boolean(config.apiKey.trim()) },
      chatgpt: { modelId: config.chatgptModelId, reasoningEffort: config.chatgptReasoningEffort, fallbackToApi: config.chatgptFallbackToApi },
      search: { apiKeyConfigured: Boolean(config.search.apiKey.trim()) } };
  }
  update(input, provider) { return this.enqueue(() => this.save(input, provider)); }
  async save(input, provider) {
    if (!['api', 'chatgpt', 'fallback', 'search'].includes(provider)) throw new PublicError('模型连接类型无效。');
    object(input, provider === 'api' ? ['revision', 'baseURL', 'modelId'] : provider === 'fallback' ? ['revision', 'enabled'] : provider === 'search' ? ['revision', 'apiKey'] : ['revision', 'modelId'], provider === 'api' ? ['apiKey'] : provider === 'chatgpt' ? ['reasoningEffort'] : []);
    if (typeof input.revision !== 'string' || (provider === 'fallback' ? typeof input.enabled !== 'boolean' : provider === 'search' ? typeof input.apiKey !== 'string' : typeof input.modelId !== 'string')
      || provider === 'api' && (typeof input.baseURL !== 'string' || input.apiKey !== undefined && typeof input.apiKey !== 'string'))
      throw new PublicError('请填写有效的模型配置。');
    await this.readCurrent();
    if (input.revision !== this.revision) throw new PublicError('配置已在其他页面或文件中更新。请重新载入后再保存，当前输入已保留。', 409);
    const raw = Object.fromEntries(keys.map(key => [key, this.config[key]]));
    if (provider === 'api') {
      raw.baseURL = input.baseURL.trim(); raw.modelId = input.modelId.trim();
      if (input.apiKey?.trim()) raw.apiKey = input.apiKey.trim();
    } else if (provider === 'search') {
      if (!input.apiKey.trim()) throw new PublicError('请填写 Tavily API Key。');
      raw.search = { ...raw.search, apiKey: input.apiKey.trim() };
    } else if (provider === 'fallback') raw.chatgptFallbackToApi = input.enabled;
    else {
      raw.chatgptModelId = input.modelId.trim();
      raw.chatgptReasoningEffort = input.reasoningEffort ?? (raw.chatgptModelId === this.config.chatgptModelId ? this.config.chatgptReasoningEffort : '');
      if (input.reasoningEffort !== undefined && !validReasoningEffort(input.reasoningEffort)) throw new PublicError('Thinking 参数无效，请重新选择。');
    }
    let next;
    try { next = normalizeConfig(raw); }
    catch { throw new PublicError('配置格式无效。请检查地址、模型 ID 和密钥；地址须为 HTTPS 或本机 HTTP。'); }
    if (provider === 'api' && !next.configured) throw new PublicError('请填写服务地址、模型 ID 和 API Key。');
    // A saved credential must never be forwarded to a newly entered service
    // merely because the password field was left empty.
    if (provider === 'api' && next.baseURL !== this.config.baseURL && this.config.apiKey.trim() && !input.apiKey?.trim())
      throw new PublicError('更换服务地址时，请重新填写该服务的 API Key。');
    const saved = JSON.stringify(raw, null, 2) + '\n';
    const temporary = join(dirname(this.file), `config-${randomUUID()}.local`);
    try {
      await writeFile(temporary, saved, { flag: 'wx', mode: 0o600, flush: true });
      let current;
      try { current = await readFile(this.file, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; current = '{}'; }
      if (fingerprint(current) !== this.signature)
        throw new PublicError('配置文件已被更新。请重新载入后再保存，当前输入已保留。', 409);
      await rename(temporary, this.file);
      if (await readFile(this.file, 'utf8') !== saved) throw Error();
      this.signature = fingerprint(saved); this.revision = randomUUID(); this.config = next;
      this.onChange(next);
      return this.view();
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError('配置未能确认保存，请检查本机文件权限后重新载入。', 503);
    }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
}
