import { type NotebookVersion } from '../../shared/research-notebook.mjs';
import { saveNotebookTurn } from './notebook-actions';
import { createSeedDiscussion, emptyResearchState, validateResearchProposal, type ResearchProposal } from '../../shared/research-contract.mjs';
import { checkDocumentSections, readingBriefTitle, READING_BRIEF, STAGE_LABELS } from '../../shared/research-documents.mjs';
import type { ResearchArtifact } from '../../shared/research-artifacts.mjs';
import { contentRepository } from '../content/repository';
import { guideKey, originalKey, personalStore } from '../records/store';
import type { Exploration } from '../records/types';
import type { AiTurn, ReadingProgress } from '../assistant/api';
import { createExploration, titleFromQuestion } from '../exploration/model';
import { saveReadingBrief } from './artifact-actions';

/** What a finished command turn produced, read from saved records. */
export type CommandOutcome =
  | { kind: 'direction-created'; record: Exploration }
  | { kind: 'direction-updated'; record: Exploration; proposal: ResearchProposal }
  | { kind: 'brief-saved'; record: Exploration; artifact: ResearchArtifact; missing: string[] }
  | { kind: 'notebook-saved'; record: Exploration; version: NotebookVersion }
  | { kind: 'declined' }
  | { kind: 'pending' };

/** Reading marks for current guides, sent only with /选文 as the command menu states. */
export async function readingProgress(): Promise<ReadingProgress[]> {
  const guides = contentRepository.list().map(entry => entry.guide.metadata);
  return Promise.all(guides.map(async meta => {
    const [guide, original] = await Promise.all([personalStore.get('guideStates', guideKey(meta.id, meta.revision)), personalStore.get('originalStates', originalKey(meta.source.id, meta.source.version))]);
    return { guideId: meta.id, revision: meta.revision, guide: guide?.status ?? null, original: original?.status ?? null };
  }));
}

async function createdFrom(turnId: string) {
  return (await personalStore.list('explorations')).find(item => item.research?.createdFromTurnId === turnId);
}
const briefTopic = (turn: AiTurn) => readingBriefTitle(turn.answer);

/** Derives the outcome shown in history without changing anything. */
export async function commandOutcome(turn: AiTurn, linked?: Exploration): Promise<CommandOutcome> {
  const command = turn.context?.command;
  if (!command || turn.status !== 'complete') return { kind: 'declined' };
  if (command.name === 'notebook') {
    if (!turn.context?.notebookDraft) return { kind: 'declined' };
    const topic = turn.context?.researchSnapshot?.explorationId;
    const owner = topic ? await personalStore.get('explorations', topic) : undefined;
    const version = owner?.research?.notebook?.versions.find(item => item.sourceTurnId === turn.id);
    return owner && version ? { kind: 'notebook-saved', record: owner, version } : { kind: 'pending' };
  }
  if (command.name === 'direction') {
    if (turn.context?.directionDraft) { const record = await createdFrom(turn.id); return record ? { kind: 'direction-created', record } : { kind: 'pending' }; }
    const proposal = turn.context?.researchProposals?.[0];
    if (!proposal || !linked) return { kind: 'declined' };
    return linked.research?.appliedProposalIds.includes(proposal.id) ? { kind: 'direction-updated', record: linked, proposal } : { kind: 'pending' };
  }
  if (!briefTopic(turn)) return { kind: 'declined' };
  const owner = linked ?? (await personalStore.list('explorations')).find(item => item.research?.artifacts?.some(artifact => artifact.sourceTurnId === turn.id));
  const artifact = owner?.research?.artifacts?.find(item => item.sourceTurnId === turn.id);
  return owner && artifact ? { kind: 'brief-saved', record: owner, artifact, missing: checkDocumentSections(artifact.body).missing } : { kind: 'pending' };
}

/**
 * Applies a completed command turn. The reader typed the command, which is the
 * explicit instruction to write; every write keeps versions and is idempotent.
 */
export async function applyCommandTurn(turn: AiTurn, { linked, conversation, conversationId }: { linked?: Exploration; conversation: AiTurn[]; conversationId?: string }): Promise<CommandOutcome> {
  const command = turn.context?.command;
  if (!command || turn.status !== 'complete' || turn.summaryOnly) return { kind: 'declined' };
  if (command.name === 'notebook') {
    if (!turn.context?.notebookDraft) return { kind: 'declined' };
    if (linked && linked.id !== turn.context.researchSnapshot?.explorationId) throw Error('这份研究记录属于另一个方向，未保存。');
    return { kind: 'notebook-saved', ...await saveNotebookTurn(turn) };
  }
  if (command.name === 'direction') {
    const draft = turn.context?.directionDraft;
    if (draft) {
      const existing = await createdFrom(turn.id);
      if (existing) return { kind: 'direction-created', record: existing };
      const guideId = turn.context?.guideId as string | undefined, revision = turn.context?.revision as number | undefined;
      const guide = guideId && revision ? contentRepository.getSummary(guideId, revision) : undefined;
      // The discussion that led here travels with the new direction as a short, labeled excerpt.
      const earlier = conversation.filter(item => item.id !== turn.id && item.status === 'complete' && item.answer && !item.context?.command);
      const seedDiscussion = guide && conversationId && earlier.length ? createSeedDiscussion({ conversationId, guideId: guide.metadata.id, revision: guide.metadata.revision, guideTitle: guide.metadata.title, turns: earlier }) : undefined;
      const base = createExploration();
      const record = await personalStore.saveExploration({ ...base, title: draft.title.trim(), question: draft.question.trim(), status: 'exploring', interpretation: draft.interpretation, unknowns: draft.unknowns, nextAction: draft.nextAction,
        research: { ...emptyResearchState(), scope: draft.scope, constraints: draft.constraints, candidates: draft.candidates, deferred: draft.deferred, stage: draft.stage, createdFromTurnId: turn.id, ...(seedDiscussion ? { seedDiscussion } : {}) } }, null);
      return { kind: 'direction-created', record };
    }
    const candidate = turn.context?.researchProposals?.[0];
    if (!candidate || !linked) return { kind: 'declined' };
    const proposal = validateResearchProposal(candidate);
    if (proposal.explorationId !== linked.id || proposal.sourceTurnId !== turn.id) return { kind: 'declined' };
    const record = await personalStore.adoptResearchProposal(proposal);
    return { kind: 'direction-updated', record, proposal };
  }
  const topic = briefTopic(turn);
  if (!topic) return { kind: 'declined' };
  const snapshotTopic = (turn.context?.researchSnapshot as { explorationId?: string } | undefined)?.explorationId;
  const scope = turn.context?.conversationScope as { kind?: string; explorationId?: string } | undefined;
  const scopeTopic = scope?.kind === 'exploration' ? scope.explorationId : undefined;
  if (snapshotTopic && scopeTopic && snapshotTopic !== scopeTopic) throw new Error('这份选文回答的方向身份不一致，未保存。');
  const originalTopic = snapshotTopic ?? scopeTopic;
  if (originalTopic && linked && linked.id !== originalTopic) throw new Error('这份选文回答属于另一个方向，未保存。');
  let owner = originalTopic ? await personalStore.get('explorations', originalTopic)
    : linked ?? (await personalStore.list('explorations')).find(item => item.research?.artifacts?.some(artifact => artifact.sourceTurnId === turn.id));
  if (originalTopic && !owner) throw new Error('原来关联的研究方向已不存在；回答仍保留在 AI 历史中，未建立新的阅读积累。');
  if (!owner) {
    // A learning goal without a direction gets its own entry under 阅读积累.
    const base = createExploration();
    const goal = turn.question.replace(/^\s*\/(选文|brief)(\s+(积累|推进))?/u, '').trim();
    owner = await personalStore.saveExploration({ ...base, title: titleFromQuestion(topic), question: goal || topic, research: { ...emptyResearchState(), purpose: 'accumulation' } }, null);
  }
  const current = await personalStore.get('explorations', owner.id) ?? owner;
  const { record, artifact } = await saveReadingBrief(current, turn, command.purpose, topic);
  return { kind: 'brief-saved', record, artifact, missing: checkDocumentSections(artifact.body).missing };
}

export function outcomeSummary(outcome: CommandOutcome) {
  if (outcome.kind === 'notebook-saved') return `已更新《${outcome.record.title}》的研究记录 · 第 ${outcome.version.version} 版`;
  if (outcome.kind === 'direction-created') return `已建立研究方向《${outcome.record.title}》${outcome.record.research?.stage ? ` · ${STAGE_LABELS[outcome.record.research.stage].label}` : ''}`;
  if (outcome.kind === 'direction-updated') return `已更新《${outcome.record.title}》：${outcome.proposal.changes.length} 项变化`;
  if (outcome.kind === 'brief-saved') return `已生成《${READING_BRIEF.label}》，保存在《${outcome.record.title}》`;
  return '';
}
