import { PublicError } from '../http/validation.mjs';

export function utf8Prefix(text, byteLimit) {
  let low = 0, high = text.length;
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (Buffer.byteLength(text.slice(0, middle)) <= byteLimit) low = middle; else high = middle - 1; }
  if (low && /[\uD800-\uDBFF]/u.test(text[low - 1])) low--;
  return text.slice(0, low);
}
export function localResultBudget(context, search = false) {
  const budget = context?.budget;
  if (!budget) return search ? 7000 : 14000;
  const remaining = Math.max(0, budget.limit - budget.outputTokens - budget.inputTokens - 1200);
  return Math.floor(Math.min(search ? 7000 : 14000, remaining * (search ? .45 : 1)));
}

// UTF-8 byte count is a conservative upper bound for byte-level tokenizers,
// not a tokenizer measurement. Reserve framing separately; never silently prune evidence.
export function checkPromptBudget(payload, config, context) {
  const inputTokens = Buffer.byteLength(JSON.stringify(payload), 'utf8') + 512;
  const outputTokens = config.maxOutputTokens ?? 3000, limit = config.contextTokenLimit ?? 32768;
  if (inputTokens + outputTokens > limit) throw new PublicError('本轮资料达到保守 token 预算；已保存来源，请减少所选研究材料或缩小问题、章节范围。未发送超预算请求。', 413);
  const budget = { method: 'utf8-bytes-upper-bound', inputTokens, outputTokens, limit };
  if (context) context.budget = budget;
  return budget;
}
