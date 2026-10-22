import schema from '../../schemas/personal-backup.schema.json';
import { isSafeExternalUrl } from '../../scripts/content-policy.mjs';
import type { PersonalBackup, StoreName } from './types';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
type Rule = { $ref?: string; anyOf?: Rule[]; const?: unknown; enum?: unknown[]; type?: string; required?: string[]; properties?: Record<string, Rule>; additionalProperties?: boolean; items?: Rule; maxItems?: number; minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number };
const definitions = schema.$defs as Record<string, Rule>;
const ruleNames: Record<StoreName | 'preferences', string> = { notes: 'note', explorations: 'exploration', resume: 'resume', guideStates: 'guideState', originalStates: 'originalState', preferences: 'preferences' };
export class ValidationError extends Error { constructor(message: string) { super(message); this.name = 'ValidationError'; } }
const fail = (path: string, reason: string): never => { throw new ValidationError(`${path}：${reason}`); };

// Interpret the fixed application-owned schema; no dynamic code generation or unsafe-eval.
function check(rule: Rule, value: unknown, path: string): void {
  if (rule.$ref) { check(definitions[rule.$ref.replace('#/$defs/', '')], value, path); return; }
  if (rule.anyOf) {
    for (const option of rule.anyOf) { try { check(option, value, path); return; } catch (error) { if (!(error instanceof ValidationError)) throw error; } }
    fail(path, '数据类型或来源字段不符合要求');
  }
  if (Object.hasOwn(rule, 'const') && value !== rule.const) fail(path, '格式或版本不受支持');
  if (rule.enum && !rule.enum.includes(value)) fail(path, '值不在允许范围内');
  if (rule.type === 'null' && value !== null) fail(path, '应为空值');
  if (rule.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, '应为对象');
    const record = value as Record<string, unknown>;
    for (const field of rule.required ?? []) if (!Object.hasOwn(record, field)) fail(`${path}.${field}`, '缺少字段');
    for (const field of Object.keys(record)) {
      const property = rule.properties && Object.hasOwn(rule.properties, field) ? rule.properties[field] : undefined;
      if (!property && rule.additionalProperties === false) fail(path, '包含未支持的字段');
      if (property) check(property, record[field], `${path}.${field}`);
    }
  }
  if (rule.type === 'array') {
    if (!Array.isArray(value)) fail(path, '应为数组');
    const values = value as unknown[];
    if (rule.maxItems !== undefined && values.length > rule.maxItems) fail(path, '记录数量超出限制');
    if (rule.items) values.forEach((item, index) => check(rule.items!, item, `${path}[${index}]`));
  }
  if (rule.type === 'string') {
    if (typeof value !== 'string') fail(path, '应为文本');
    const text = value as string;
    if (rule.minLength !== undefined && text.length < rule.minLength || rule.maxLength !== undefined && text.length > rule.maxLength) fail(path, '文本长度不符合要求');
    if (rule.pattern && !new RegExp(rule.pattern, 'u').test(text)) fail(path, '格式不符合要求');
  }
  if (rule.type === 'integer' || rule.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || rule.type === 'integer' && !Number.isInteger(value)) fail(path, '应为有效数字');
    if (rule.minimum !== undefined && (value as number) < rule.minimum || rule.maximum !== undefined && (value as number) > rule.maximum) fail(path, '数字超出允许范围');
  }
}

function semantic(value: unknown, path: string): void {
  if (Array.isArray(value)) { value.forEach((item, index) => semantic(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, any>;
  for (const [key, item] of Object.entries(record)) {
    if (['createdAt', 'updatedAt', 'exportedAt'].includes(key)) {
      const canonical = typeof item === 'string' && Number.isFinite(Date.parse(item)) ? new Date(item).toISOString() : '';
      if (canonical !== item && canonical.replace('.000Z', 'Z') !== item) fail(`${path}.${key}`, '需要有效的 UTC 时间');
    }
    if (key === 'url' && !isSafeExternalUrl(item)) fail(`${path}.${key}`, '需要安全的 HTTP(S) 地址');
    if (key === 'identity' && (typeof item !== 'string' || !item.trim() || /^(?:javascript|data|file):/iu.test(item)
      || /^https?:/iu.test(item) && !isSafeExternalUrl(item))) fail(`${path}.${key}`, '需要原文地址或学术标识');
    semantic(item, `${path}.${key}`);
  }
  if (record.createdAt && record.updatedAt && Date.parse(record.updatedAt) < Date.parse(record.createdAt)) fail(path, '更新时间早于创建时间');
  if (record.origin === 'adapted-editorial' && !record.seedRef) fail(path, '编辑建议改写需要保留来源视角');
  if (record.origin === 'reader' && record.seedRef) fail(path, '自行提出的问题不能带有编辑来源');
  if (record.kind === 'read-guide' && !record.target) fail(path, '阅读下一步需要固定导读位置');
  if (Array.isArray(record.evidence)) {
    if (new Set(record.evidence.map((item: any) => item.id)).size !== record.evidence.length) fail(path, '同一探索中出现重复证据 ID');
  }
}

export function validateRecord(store: StoreName | 'preferences', value: unknown): void {
  check(definitions[ruleNames[store]], value, store); semantic(value, store);
}
export function guideKey(guideId: string, revision: number) { return `${guideId}/${revision}`; }
export function originalKey(sourceId: string, version: string | null) { return JSON.stringify([sourceId, version]); }
export function recordKey(store: StoreName, value: any): string {
  if (store === 'notes' || store === 'explorations') return value.id;
  if (store === 'originalStates') return originalKey(value.sourceId, value.sourceVersion);
  return guideKey(value.guideId, value.revision);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateBackup(input: unknown): PersonalBackup {
  let value = input;
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > MAX_BACKUP_BYTES) fail('备份', '超过 5 MiB 限制');
    try { value = JSON.parse(value); } catch { fail('备份', '不是有效 JSON'); }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BACKUP_BYTES) fail('备份', '超过 5 MiB 限制');
  check(schema as Rule, value, '备份'); semantic(value, '备份');
  const backup = value as PersonalBackup;
  for (const name of ['notes', 'explorations', 'resume', 'guideStates', 'originalStates'] as StoreName[]) {
    const keys = backup[name].map(item => recordKey(name, item));
    if (new Set(keys).size !== keys.length) fail(name, '同一备份中有重复记录标识');
  }
  return structuredClone(backup);
}
