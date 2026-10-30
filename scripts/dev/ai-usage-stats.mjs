// Aggregate numbers about saved AI turns: how often the model needed extra
// reading tools and how large the prepared context was. It prints counts only,
// never questions, answers, titles or sources. Read-only.
//
//   node scripts/dev/ai-usage-stats.mjs [path/to/paperdesk.sqlite]
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] ?? fileURLToPath(new URL('../../private/ai/paperdesk.sqlite', import.meta.url));
if (!existsSync(file)) { console.error('没有找到 AI 对话数据库。可以把数据库路径作为参数传入。'); process.exit(1); }

function usageStats(rows) {
  const turns = rows.filter(turn => turn.status === 'complete' && !turn.summaryOnly);
  const share = count => turns.length ? `${Math.round(count / turns.length * 100)}%` : '—';
  const percentile = (values, p) => { if (!values.length) return '—'; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };
  const tools = turns.map(turn => (turn.context?.toolEvents ?? []).map(event => event.name));
  const used = name => tools.filter(names => names.includes(name)).length;
  const names = [...new Set(tools.flat())].sort();
  const ranges = turns.map(turn => { try { return JSON.parse(turn.context?.metadataJson ?? '{}').guideRanges ?? []; } catch { return []; } });
  const inputTokens = turns.map(turn => turn.context?.budget?.inputTokens).filter(Number.isFinite);
  return {
    完成的问答: turns.length,
    未调用任何工具: share(tools.filter(names => !names.length).length),
    平均工具调用次数: turns.length ? (tools.reduce((sum, names) => sum + names.length, 0) / turns.length).toFixed(2) : '—',
    当前章节被截断: share(ranges.filter(items => items.some(range => range.excerptOnly)).length),
    首轮上下文估计上限_中位: percentile(inputTokens, .5),
    首轮上下文估计上限_P90: percentile(inputTokens, .9),
    各工具使用比例: Object.fromEntries(names.map(name => [name, share(used(name))])),
  };
}

const db = new DatabaseSync(file, { readOnly: true });
const rows = db.prepare('SELECT data FROM turns').all().map(row => JSON.parse(row.data));
db.close();
console.log(JSON.stringify(usageStats(rows), null, 2));
console.log('说明：上下文估计按 UTF-8 字节保守计算，是上限而非实际 token；比例只统计已完成的问答。');
