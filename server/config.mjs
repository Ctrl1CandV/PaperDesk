import { readFile } from 'node:fs/promises';
import { object, PublicError } from './validation.mjs';
import { validReasoningEffort } from './reasoning.mjs';

export function normalizeConfig(input = {}) {
  object(input, [], ['baseURL', 'apiKey', 'modelId', 'chatgptModelId', 'chatgptReasoningEffort', 'chatgptFallbackToApi', 'toolsEnabled', 'maxOutputTokens', 'timeoutMs', 'search']);
  const config = { baseURL: '', apiKey: '', modelId: '', chatgptModelId: '', chatgptReasoningEffort: '', chatgptFallbackToApi: true, toolsEnabled: true, maxOutputTokens: 3000, timeoutMs: 120000, search: { apiKey: '' }, ...input };
  object(config.search, [], ['apiKey']);
  config.search = { apiKey: '', ...config.search };
  for (const key of ['baseURL', 'apiKey', 'modelId', 'chatgptModelId']) if (typeof config[key] !== 'string' || config[key].length > (key === 'apiKey' ? 4096 : 200) || /[\r\n]/.test(config[key])) throw new PublicError('AI 后端配置格式无效。', 503);
  if (typeof config.search.apiKey !== 'string' || config.search.apiKey.length > 4096 || /[\r\n]/.test(config.search.apiKey)
    || !validReasoningEffort(config.chatgptReasoningEffort) || typeof config.toolsEnabled !== 'boolean' || typeof config.chatgptFallbackToApi !== 'boolean' || !Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 128 || config.maxOutputTokens > 8192
    || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 180000) throw new PublicError('AI 后端配置格式无效。', 503);
  if (config.baseURL) {
    let url;
    try { url = new URL(config.baseURL); } catch { throw new PublicError('AI 服务地址格式无效。', 503); }
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash) throw new PublicError('AI 服务地址必须为 HTTPS，或本机 HTTP。', 503);
    config.baseURL = url.href.replace(/\/$/, '');
  }
  config.configured = Boolean(config.baseURL && config.apiKey.trim() && config.modelId.trim());
  config.searchAvailable = Boolean(config.configured && config.toolsEnabled && config.search.apiKey.trim());
  return config;
}
export async function loadConfig(file = new URL('./config.local.json', import.meta.url)) {
  try { return normalizeConfig(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return normalizeConfig(); throw new PublicError('AI 配置无法读取，请检查 server/config.local.json。', 503); }
}
