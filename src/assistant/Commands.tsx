import { AppLink } from '../app/navigation';
import type { Exploration } from '../records/types';
import { BRIEF_PURPOSES, READING_BRIEF, STAGE_LABELS, parseCommand } from '../../shared/research-documents.mjs';
import type { CommandOutcome } from '../research/commands';
import { documentFileName, renderResearchDocument } from '../research/artifact-actions';
import type { AiTurn } from './api';

export interface CommandOption { token: string; title: string; detail: string; disabled?: string }
/** What each command will do in the current conversation, shown before it is sent. */
export function commandOptions(exploration?: Exploration): CommandOption[] {
  return [
    exploration
      ? { token: '/方向', title: '更新这个方向', detail: '按最近的讨论更新问题、认识、候选方向、阶段和下一步，保留版本。' }
      : { token: '/方向', title: '建立研究方向', detail: '根据目前的讨论建立一个方向，之后的讨论归入它。' },
    { token: '/选文 积累', title: '选文实施文件 · 积累', detail: '想弄清一个主题：让 Harness 找综述和经典论文。' },
    { token: '/选文 推进', title: '选文实施文件 · 推进', detail: '为这个方向的下一个子问题找论文。', ...(exploration ? {} : { disabled: '需要先关联或建立方向' }) },
  ];
}
/** The consequence of the command currently in the composer, stated before sending. */
export function commandHint(question: string, exploration?: Exploration) {
  const parsed = parseCommand(question);
  if (!parsed) return '';
  if (parsed.command.name === 'direction') return exploration
    ? '指令 · 方向：AI 先判断最近的讨论有没有实质变化，有就直接更新这个方向并保留版本。'
    : '指令 · 方向：AI 先判断讨论是否足以形成方向，足够就直接建立，并把之后的讨论归入它。';
  const purpose = parsed.command.purpose ?? (exploration ? 'research' : 'accumulation');
  if (purpose === 'research' && !exploration) return '推进类选文需要先关联方向：在上方选择方向，或先用 /方向 建立。';
  return `指令 · 选文（${BRIEF_PURPOSES[purpose].label}）：AI 先判断信息是否足够，足够就直接生成并保存文件；会带上本库目录和你的阅读标记。`;
}
export function matchingOptions(question: string, exploration?: Exploration) {
  const typed = question.trimEnd();
  if (!question.startsWith('/') || question.includes('\n') || typed.length > 8) return [];
  return commandOptions(exploration).filter(option => option.token.startsWith(typed));
}

export function CommandMenu({ options, active, onPick, onHover }: { options: CommandOption[]; active: number; onPick: (option: CommandOption) => void; onHover: (index: number) => void }) {
  return <div className="ai-command-menu" role="listbox" aria-label="可用指令">{options.map((option, index) => <button key={option.token} type="button" role="option"
    aria-selected={index === active} aria-disabled={option.disabled ? true : undefined} disabled={Boolean(option.disabled)}
    onMouseDown={event => event.preventDefault()} onMouseEnter={() => onHover(index)} onClick={() => onPick(option)}>
    <span className="ai-command-token">{option.token}</span><span className="ai-command-text"><strong>{option.title}</strong><span>{option.disabled ?? option.detail}</span></span>
  </button>)}</div>;
}

function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/markdown;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The result of a command turn, read from saved records. */
export function CommandResult({ turn, outcome, disabled, onRetry }: { turn: AiTurn; outcome?: CommandOutcome; disabled: boolean; onRetry: () => void }) {
  if (turn.status !== 'complete' || turn.summaryOnly) return null;
  if (!outcome) return <p className="ai-command-result is-quiet" role="status">正在核对指令结果…</p>;
  if (outcome.kind === 'declined') return <p className="ai-command-result is-quiet">这次没有生成：AI 判断信息还不够，原因见上文。补充讨论后可以再次输入指令。</p>;
  if (outcome.kind === 'pending') return <div className="ai-command-result is-pending" role="status"><p>结果还没有保存到浏览器记录。</p><button type="button" className="ai-inline-action" disabled={disabled} onClick={onRetry}>保存结果</button></div>;
  const link = `/explore/questions/${outcome.record.id}`;
  if (outcome.kind === 'direction-created') return <div className="ai-command-result"><span className="ai-command-label">已建立研究方向</span>
    <AppLink className="ai-command-title" to={link}>{outcome.record.title}</AppLink>
    <p>{outcome.record.research?.stage ? `阶段：${STAGE_LABELS[outcome.record.research.stage].label}。` : ''}{outcome.record.question}</p>
    <AppLink className="ai-inline-action" to={link}>在探索中查看 →</AppLink></div>;
  if (outcome.kind === 'direction-updated') return <div className="ai-command-result"><span className="ai-command-label">已更新方向 · 保留旧版本</span>
    <AppLink className="ai-command-title" to={link}>{outcome.record.title}</AppLink>
    <p>{outcome.proposal.changes.map(change => change.kind === 'add-decision' ? '新增决定' : change.kind === 'set-next-action' ? '下一步' : ({ title: '标题', stage: '阶段', question: '问题', interpretation: '认识', unknowns: '尚不确定', scope: '范围', constraints: '约束', candidates: '候选方向', deferred: '暂缓方向' } as Record<string, string>)[change.field]).join('、')}</p>
    <AppLink className="ai-inline-action" to={link}>在探索中查看 →</AppLink></div>;
  const { record, artifact, missing } = outcome;
  return <div className="ai-command-result"><span className="ai-command-label">已生成{READING_BRIEF.label} · {artifact.purpose ? BRIEF_PURPOSES[artifact.purpose].label : ''}</span>
    <AppLink className="ai-command-title" to={link}>{artifact.title}</AppLink>
    <p>保存在《{record.title}》{record.research?.purpose === 'accumulation' ? '（阅读积累）' : ''}。{missing.length ? `缺少：${missing.join('、')}，可以补充后再次输入 /选文。` : `已包含全部 ${READING_BRIEF.sections.length} 节。`}</p>
    <div className="ai-command-actions"><button type="button" className="ai-inline-action" onClick={() => void renderResearchDocument(record, artifact).then(text => download(documentFileName(artifact), text))}>下载 {READING_BRIEF.fileName}</button><AppLink className="ai-inline-action" to={link}>在探索中查看 →</AppLink></div></div>;
}
