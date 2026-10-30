import { useState } from 'react';
import type { ProposalField, ResearchField, ResearchProposal, ResearchSnapshot } from '../../shared/research-contract.mjs';
import { validateResearchProposal, type ResearchStage } from '../../shared/research-contract.mjs';
import { STAGE_LABELS } from '../../shared/research-documents.mjs';
import type { Exploration } from '../records/types';
import { personalStore } from '../records/store';
import type { AiTurn } from './api';

export const researchLabels: Record<ResearchField, string> = { question: '研究问题', interpretation: '当前解释', unknowns: '尚未解决的问题', scope: '研究范围', constraints: '明确约束', candidates: '候选方向', deferred: '暂缓方向及原因' };
const proposalLabels: Record<ProposalField, string> = { title: '方向标题', stage: '阶段', ...researchLabels };
const actionKinds = { 'read-guide': '继续阅读', 'check-concept': '核对概念', 'compare-evidence': '比较证据', 'search-literature': '寻找文献' };
const actionText = (action: unknown) => {
  const value = action as { kind?: keyof typeof actionKinds; description?: string; target?: { guideId: string; revision: number; unitId: string } } | null;
  return value?.kind ? `${actionKinds[value.kind]}：${value.description}${value.target ? `（导读 ${value.target.guideId} r${value.target.revision} · ${value.target.unitId}）` : ''}` : '尚未选择';
};
export const decisionKinds = { interpretation: '解释', hypothesis: '假设', constraint: '约束', direction: '方向选择', 'next-step': '下一步' };
export const decisionStatuses = { adopted: '采纳', deferred: '暂缓', rejected: '否定' };
export function ResearchSnapshotView({ snapshot }: { snapshot: Omit<ResearchSnapshot, 'snapshotSha256'> }) {
  return <div className="ai-research-snapshot">{snapshot.seedDiscussion && <div><strong>起点讨论</strong><p>来自《{snapshot.seedDiscussion.guideTitle}》的 {snapshot.seedDiscussion.turns.length} 轮普通讨论节选；是旧模型回答，不是论文证据。</p></div>}{Object.entries(researchLabels).map(([field, label]) => <div key={field}><strong>{label}</strong><p>{snapshot[field as ResearchField] || '尚未填写'}</p></div>)}
    {snapshot.omitted && (snapshot.omitted.decisionIds.length > 0 || snapshot.omitted.evidenceIds.length > 0) && <details className="ai-research-omissions"><summary>本轮未纳入：{snapshot.omitted.decisionIds.length} 条决定、{snapshot.omitted.evidenceIds.length} 条证据</summary><p>{snapshot.omitted.reason}</p><p>这些条目未随本轮快照发送。快照筛选不会删除本地研究记录，可返回探索查看保留的历史。</p>{snapshot.omitted.decisionIds.length > 0 && <><strong>未纳入的决定 ID</strong><ul>{snapshot.omitted.decisionIds.map(id => <li key={id}>{id}</li>)}</ul></>}{snapshot.omitted.evidenceIds.length > 0 && <><strong>未纳入的证据 ID</strong><ul>{snapshot.omitted.evidenceIds.map(id => <li key={id}>{id}</li>)}</ul></>}</details>}
    <strong>决定与变化</strong>{snapshot.decisions.length ? snapshot.decisions.map(item => <p key={item.id}>{decisionKinds[item.kind]} · {decisionStatuses[item.status]}：{item.text}<br />理由：{item.rationale || '未填写'}{item.supersedes && <><br />替代决定：{item.supersedes}</>}</p>) : <p>尚无决定</p>}
    {snapshot.notebook && <details><summary>研究记录 · 第 {snapshot.notebook.version} 版 · {snapshot.notebook.author === 'assistant' ? 'AI 整理' : '手动写入'}</summary><p>{snapshot.notebook.body}</p></details>}
    <strong>证据与下一步（保存的原始数据）</strong><pre>{JSON.stringify({ evidence: snapshot.evidence, nextAction: snapshot.nextAction }, null, 2)}</pre>
  </div>;
}
export function ResearchProposals({ turn, exploration, disabled }: { turn: AiTurn; exploration: Exploration; disabled: boolean }) {
  if (!turn.context?.researchProposals?.length) return null;
  if (turn.status !== 'complete') return <p className="ai-fine-print">这轮回答尚未完成，其中的研究建议不能采纳。</p>;
  return <div className="ai-research-proposals">{turn.context.researchProposals.map((candidate, index) => {
    let proposal: ResearchProposal;
    try {
      proposal = validateResearchProposal(candidate);
      if (proposal.sourceTurnId !== turn.id || proposal.explorationId !== exploration.id) throw Error();
    } catch { return <p key={index} role="alert">研究修改建议不完整或不属于此探索，未提供采纳操作。</p>; }
    return <Proposal key={proposal.id} proposal={proposal} exploration={exploration} snapshot={turn.context?.researchSnapshot} disabled={disabled} />;
  })}</div>;
}
function Proposal({ proposal, exploration, snapshot, disabled }: { proposal: ResearchProposal; exploration: Exploration; snapshot?: ResearchSnapshot; disabled: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const applied = saved || exploration.research?.appliedProposalIds.includes(proposal.id);
  const stale = !applied && exploration.recordRevision !== proposal.baseRecordRevision;
  async function adopt() {
    setBusy(true); setError('');
    try { await personalStore.adoptResearchProposal(proposal); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，建议仍然保留。'); }
    finally { setBusy(false); }
  }
  return <details className="ai-research-proposal"><summary>{applied ? '已采纳的研究修改' : '查看研究修改建议'} · {proposal.changes.length} 项</summary>
    <p>{proposal.rationale}</p><p className="ai-fine-print">基于探索 r{proposal.baseRecordRevision}。采纳表示采用这项研究安排，假设仍待核查。</p>
    {proposal.changes.map((change, index) => <div key={index}>{change.kind === 'set-field' ? <><h4>{proposalLabels[change.field]}</h4><p className="ai-fine-print">原内容</p><p>{change.field === 'stage' ? (snapshot?.stage ? STAGE_LABELS[snapshot.stage].label : '未设定') : snapshot?.[change.field] || '空'}</p><p className="ai-fine-print">修改为</p><p>{change.field === 'stage' ? STAGE_LABELS[change.value as ResearchStage]?.label ?? change.value : change.value || '清空此字段'}</p></> : change.kind === 'set-next-action' ? <><h4>下一步</h4><p className="ai-fine-print">原内容</p><p>{actionText(snapshot?.nextAction ?? null)}</p><p className="ai-fine-print">修改为</p><p>{actionText(change.action)}</p></> : <><h4>{decisionKinds[change.decision.kind]} · {decisionStatuses[change.decision.status]}</h4><p>{change.decision.text}</p><p>理由：{change.decision.rationale || '未填写'}</p>{change.decision.supersedes && <p>替代决定：{change.decision.supersedes}</p>}</>}</div>)}
    {proposal.evidenceRefs.length > 0 && <details><summary>随建议保留的证据摘录</summary>{proposal.evidenceRefs.map((ref, index) => <blockquote key={index}>[{ref.citationId}] {ref.source.text}</blockquote>)}</details>}
    {stale && <p role="status">探索已修改。此建议保留供比较，请基于最新研究记录重新整理，不能覆盖新内容。</p>}
    {error && <p role="alert">{error}</p>}{applied ? <p role="status">已保存到探索，AI 来源与依据随记录保留。</p> : <button type="button" className="ai-inline-action" disabled={disabled || busy || stale} onClick={() => void adopt()}>{busy ? '正在保存…' : '采纳这些修改'}</button>}
  </details>;
}
