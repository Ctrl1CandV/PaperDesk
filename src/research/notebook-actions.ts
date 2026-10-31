import { appendNotebookVersion, appendStageEntry, currentNotebook, stageEntries, validateNotebookDraft, withoutPlaceholders, workingPaperTemplate, type NotebookVersion } from '../../shared/research-notebook.mjs';
import { STAGE_LABELS } from '../../shared/research-documents.mjs';
import { createResearchSnapshot, emptyResearchState } from '../../shared/research-contract.mjs';
import { ConflictError, personalStore } from '../records/store';
import type { Exploration } from '../records/types';
import type { AiTurn, ConversationScope } from '../assistant/api';
import { contentRepository } from '../content/repository';

export async function saveResearchNotebook(record: Exploration, body: string, options: { restoredFrom?: number; note?: string } = {}): Promise<{ record: Exploration; version: NotebookVersion }> {
  const research = record.research ?? emptyResearchState();
  if (options.restoredFrom !== undefined && research.notebook?.versions.find(item => item.version === options.restoredFrom)?.body !== body) throw Error('要恢复的版本不存在或内容不一致。');
  const notebook = appendNotebookVersion(research.notebook, body, options);
  const saved = await personalStore.saveExploration({ ...record, research: { ...research, notebook } }, record.recordRevision);
  return { record: saved, version: currentNotebook(notebook)! };
}

export function restoreResearchNotebook(record: Exploration, versionNumber: number) {
  const version = record.research?.notebook?.versions.find(item => item.version === versionNumber);
  if (!version) throw Error('要恢复的工作稿版本不存在。');
  return saveResearchNotebook(record, version.body, { restoredFrom: versionNumber, note: `恢复第 ${versionNumber} 版` });
}

const today = () => new Date().toLocaleDateString('sv-SE');
/** A first working paper built only from what the reader already recorded for this direction. */
export function templateFromRecord(record: Pick<Exploration, 'interpretation' | 'unknowns' | 'research'>) {
  const research = record.research;
  const superseded = new Set(research?.decisions.flatMap(item => item.supersedes ? [item.supersedes] : []) ?? []);
  const decisions = research?.decisions.filter(item => !superseded.has(item.id)) ?? [];
  const judgement = [record.interpretation, research?.candidates && `候选方向：${research.candidates}`, research?.deferred && `暂缓：${research.deferred}`].filter(Boolean).join('\n\n');
  const motivation = [research?.scope && `范围：${research.scope}`, research?.constraints && `约束：${research.constraints}`].filter(Boolean).join('\n\n');
  const log = decisions.map(item => `- ${item.createdAt.slice(0, 10)} · ${item.status === 'rejected' ? '放弃' : '确定'}：${item.text}`).join('\n');
  return workingPaperTemplate({ motivation, judgement, unknowns: record.unknowns, log });
}

/** “记一笔”: one dated line in the stage log, saved as its own version. */
export function addStageEntry(record: Exploration, text: string) {
  const body = currentNotebook(record.research?.notebook)?.body ?? templateFromRecord(record);
  return saveResearchNotebook(record, appendStageEntry(body, today(), text), { note: `记一笔：${text}` });
}
export const latestStageEntry = (record: Exploration) => stageEntries(currentNotebook(record.research?.notebook)?.body).at(-1);

/** The source snapshot is authoritative: never rebase a finished AI draft silently. */
export async function saveNotebookTurn(turn: AiTurn): Promise<{ record: Exploration; version: NotebookVersion }> {
  if (turn.status !== 'complete' || turn.summaryOnly || turn.context?.command?.name !== 'notebook') throw Error('研究记录只能由完整完成的 /记录 回答保存。');
  const draft = validateNotebookDraft(turn.context.notebookDraft);
  const snapshot = turn.context.researchSnapshot;
  const scope = turn.context.conversationScope as ConversationScope | undefined;
  if (!snapshot || scope?.kind !== 'exploration' || scope.explorationId !== snapshot.explorationId) throw Error('研究记录没有一致的原方向快照，未保存。');
  const record = await personalStore.get('explorations', snapshot.explorationId);
  if (!record) throw new ConflictError(null);
  const existing = record.research?.notebook?.versions.find(item => item.sourceTurnId === turn.id);
  if (existing) {
    if (existing.body !== draft.body) throw Error('同一 AI 更新对应不同正文，未重复保存。');
    return { record, version: existing };
  }
  if (record.recordRevision !== snapshot.recordRevision || (currentNotebook(record.research?.notebook)?.version ?? 0) !== draft.baseNotebookVersion) throw new ConflictError(record);
  if ((await createResearchSnapshot(record)).snapshotSha256 !== snapshot.snapshotSha256) throw Error('工作稿已改变；AI 草稿仍保留在回答中，未覆盖当前内容。');
  const research = record.research ?? emptyResearchState();
  const notebook = appendNotebookVersion(research.notebook, draft.body, { author: 'assistant', sourceTurnId: turn.id, note: draft.summary });
  const saved = await personalStore.saveExploration({ ...record, research: { ...research, notebook } }, record.recordRevision);
  return { record: saved, version: currentNotebook(notebook)! };
}

const safeName = (record: Exploration) => record.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || '探索';
export const notebookFileName = (record: Exploration) => `${safeName(record)}-研究工作稿.md`;
export const projectFileName = (record: Exploration) => `${safeName(record)}-项目起始文件.md`;
export function renderResearchNotebook(record: Exploration, versionNumber?: number): string {
  const version = versionNumber === undefined ? currentNotebook(record.research?.notebook) : record.research?.notebook?.versions.find(item => item.version === versionNumber);
  if (!version) throw Error('还没有可以导出的工作稿。');
  const lines = [`# ${record.title} · 研究工作稿`, '', `> 第 ${version.version} 版 · ${version.author === 'reader' ? '读者写入' : 'AI 整理'} · ${version.createdAt}${version.restoredFrom ? ` · 恢复自第 ${version.restoredFrom} 版` : ''}`, '> 这是个人研究过程与阶段判断；其中的想法和假设需要各自的依据与验证。', '', withoutPlaceholders(version.body).trim(), '', '---', '', '## 导出时的方向与关联文献', '', `方向问题：${record.question}`, '', '以下为导出时的关联文献，不表示已读或支持正文中的每一条判断。', ''];
  for (const target of record.research?.relatedGuides ?? []) {
    const guide = contentRepository.getSummary(target.guideId, target.revision);
    lines.push(guide ? `- [${guide.metadata.paperTitle}](${guide.metadata.source.url}) · 原文 ${guide.metadata.source.version ?? '版本未记录'} · 导读 ${target.guideId} r${target.revision}` : `- ${target.guideId} r${target.revision}（当前内容不可用）`);
  }
  if (!record.research?.relatedGuides?.length) lines.push('尚未关联文献。');
  return lines.join('\n');
}

/** Library guides this direction points to: explicit links, excerpts and the next step. */
function referencedGuides(record: Exploration) {
  const targets = new Map<string, number>();
  for (const target of record.research?.relatedGuides ?? []) targets.set(target.guideId, target.revision);
  for (const evidence of record.evidence) if (evidence.target && !targets.has(evidence.target.guideId)) targets.set(evidence.target.guideId, evidence.target.revision);
  if (record.nextAction?.target && !targets.has(record.nextAction.target.guideId)) targets.set(record.nextAction.target.guideId, record.nextAction.target.revision);
  return [...targets].map(([guideId, revision]) => ({ guideId, revision, guide: contentRepository.getSummary(guideId, revision) }));
}

/**
 * The working paper as the opening file of a paper project: what it is, the
 * reader's current text, then the literature and excerpts it rests on.
 */
export function renderProjectStartFile(record: Exploration, exportedAt = new Date()) {
  const version = currentNotebook(record.research?.notebook);
  if (!version) throw Error('还没有研究工作稿，无法导出项目起始文件。');
  const stage = record.research?.stage ? STAGE_LABELS[record.research.stage].label : '未标注';
  const lines = [
    `# ${record.title}`, '',
    `> 核心问题：${record.question}`,
    `> 研究阶段：${stage} · 研究工作稿第 ${version.version} 版 · 导出于 ${exportedAt.toISOString().slice(0, 10)}`, '',
    '## 关于这份文件', '',
    '这是一个论文项目的起始文件，由 PaperDesk 的研究工作稿导出，可以直接作为项目仓库的 README 或研究计划继续编写。',
    '',
    '- 「问题与动机」「已知」「判断与假设」「未解决的问题」「实验设想」「阶段记录」依次对应论文的引言、相关工作、方法动机、研究问题、实验计划和项目日志。',
    '- 「已知」中的内容应能回到文末文献；「判断与假设」「实验设想」尚未验证，文中没有执行过任何实验。',
    '- 数据、算力、代码仓库、投稿目标和合作方式尚未确定；未在正文中明确授权的行动（运行实验、联网检索、提交或发布）一律视为待确认。',
    '', '---', '',
    withoutPlaceholders(version.body).trim(), '', '---', '',
    '## 参考文献', '',
  ];
  const guides = referencedGuides(record);
  for (const { guideId, revision, guide } of guides) lines.push(guide ? `- ${guide.metadata.paperTitle}. ${guide.metadata.source.url}（原文 ${guide.metadata.source.version ?? '版本未记录'}；PaperDesk 导读 ${guideId} r${revision}）` : `- ${guideId} r${revision}（导读当前不可用）`);
  if (!guides.length) lines.push('尚未关联文献。');
  if (record.evidence.length) {
    lines.push('', '## 摘录', '', '读者保存的原文或导读片段，写作时可回查。', '');
    for (const evidence of record.evidence) {
      const where = evidence.provenance === 'original-excerpt' ? `${evidence.source.identity} · ${evidence.source.locator}` : evidence.target ? `${contentRepository.getSummary(evidence.target.guideId, evidence.target.revision)?.metadata.title ?? evidence.target.guideId} · ${evidence.target.unitId}` : '读者观察';
      lines.push(`> ${evidence.text.replace(/\n+/g, ' ')}`, `> —— ${where}${evidence.comment ? `；批注：${evidence.comment}` : ''}`, '');
    }
  }
  const files = (record.research?.artifacts ?? []).filter(item => item.kind === 'reading-brief');
  if (files.length) lines.push('', '## 已生成的选文实施文件', '', ...files.map(item => `- ${item.title} · ${item.updatedAt.slice(0, 10)}`));
  return lines.join('\n') + '\n';
}
