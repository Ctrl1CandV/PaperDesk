import { appendNotebookVersion, currentNotebook, validateNotebookDraft, type NotebookVersion } from '../../shared/research-notebook.mjs';
import { createResearchSnapshot, emptyResearchState } from '../../shared/research-contract.mjs';
import { ConflictError, personalStore } from '../records/store';
import type { Exploration } from '../records/types';
import type { AiTurn, ConversationScope } from '../assistant/api';
import { contentRepository } from '../content/repository';

export async function saveResearchNotebook(record: Exploration, body: string, options: { restoredFrom?: number } = {}): Promise<{ record: Exploration; version: NotebookVersion }> {
  const research = record.research ?? emptyResearchState();
  if (options.restoredFrom !== undefined && research.notebook?.versions.find(item => item.version === options.restoredFrom)?.body !== body) throw Error('要恢复的版本不存在或内容不一致。');
  const notebook = appendNotebookVersion(research.notebook, body, options);
  const saved = await personalStore.saveExploration({ ...record, research: { ...research, notebook } }, record.recordRevision);
  return { record: saved, version: currentNotebook(notebook)! };
}

export function restoreResearchNotebook(record: Exploration, versionNumber: number) {
  const version = record.research?.notebook?.versions.find(item => item.version === versionNumber);
  if (!version) throw Error('要恢复的研究记录版本不存在。');
  return saveResearchNotebook(record, version.body, { restoredFrom: versionNumber });
}

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
  if ((await createResearchSnapshot(record)).snapshotSha256 !== snapshot.snapshotSha256) throw Error('研究记录已改变；AI 草稿仍保留在回答中，未覆盖当前内容。');
  const research = record.research ?? emptyResearchState();
  const notebook = appendNotebookVersion(research.notebook, draft.body, { author: 'assistant', sourceTurnId: turn.id });
  const saved = await personalStore.saveExploration({ ...record, research: { ...research, notebook } }, record.recordRevision);
  return { record: saved, version: currentNotebook(notebook)! };
}

export const notebookFileName = (record: Exploration) => `${record.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || '探索'}-研究记录.md`;
export function renderResearchNotebook(record: Exploration, versionNumber?: number): string {
  const version = versionNumber === undefined ? currentNotebook(record.research?.notebook) : record.research?.notebook?.versions.find(item => item.version === versionNumber);
  if (!version) throw Error('还没有可以导出的研究记录。');
  const lines = [`# ${record.title} · 研究记录`, '', `> 第 ${version.version} 版 · ${version.author === 'reader' ? '读者写入' : 'AI 整理'} · ${version.createdAt}${version.restoredFrom ? ` · 恢复自第 ${version.restoredFrom} 版` : ''}`, '> 这是个人研究过程与阶段判断；其中的想法和假设需要各自的依据与验证。', '', version.body, '', '---', '', '## 导出时的方向与关联文献', '', `方向问题：${record.question}`, '', '以下为导出时的关联文献，不表示已读或支持正文中的每一条判断。', ''];
  for (const target of record.research?.relatedGuides ?? []) {
    const guide = contentRepository.getSummary(target.guideId, target.revision);
    lines.push(guide ? `- [${guide.metadata.paperTitle}](${guide.metadata.source.url}) · 原文 ${guide.metadata.source.version ?? '版本未记录'} · 导读 ${target.guideId} r${target.revision}` : `- ${target.guideId} r${target.revision}（当前内容不可用）`);
  }
  if (!record.research?.relatedGuides?.length) lines.push('尚未关联文献。');
  return lines.join('\n');
}
