import index from '../content/catalog-index.json';
import { consumeReadingAssignments, type ReadingAssignmentManifest, type ReadingAssignmentResult } from '../../shared/reading-assignments.mjs';
import { personalStore } from '../records/store';
import { contentRepository } from '../content/repository';

let pending: Promise<ReadingAssignmentResult> | undefined;
/** App startup and exploration-change entry point; no network or model calls. */
export function reconcileReadingAssignments(): Promise<ReadingAssignmentResult> {
  if (pending) return pending;
  pending = consumeReadingAssignments({
    manifest: (index as {readingAssignments?:ReadingAssignmentManifest}).readingAssignments,
    list: () => personalStore.list('explorations'),
    save: (record, revision) => personalStore.saveExploration(record, revision),
    hasGuide: (id, revision) => !!contentRepository.getSummary(id, revision),
  }).finally(() => { pending = undefined; });
  return pending;
}

export function readingAssignmentIssueText(result: ReadingAssignmentResult): string {
  if (result.issues.some(issue => issue.reason === 'ambiguous')) return '有重名或重复绑定的方向，部分入库文献尚未自动关联。可在对应方向中手动关联。';
  if (result.issues.some(issue => issue.reason === 'capacity')) return '方向的文献关联或交付记录已达上限，部分入库文献尚未关联。';
  if (result.issues.some(issue => issue.reason === 'unavailable')) return '部分入库文献的固定版本不可用，尚未关联，请重新构建内容后刷新。';
  if (result.issues.length) return '方向正在其他页面修改，入库文献尚未全部关联，请稍后刷新。';
  return '';
}
