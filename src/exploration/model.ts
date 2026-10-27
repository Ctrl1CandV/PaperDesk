import { useEffect, useState } from 'react';
import { personalStore } from '../records/store';
import type { Exploration, ExplorationDraft, GuideTarget } from '../records/types';
import type { EditorialLens } from '../content/types';
import { contentRepository } from '../content/repository';
import { useRecords } from '../records/hooks';

export const statusLabels: Record<Exploration['status'], string> = {
  inbox: '待梳理', exploring: '探索中', deferred: '暂缓', archived: '已归档',
};
export const actionLabels = {
  'read-guide': '继续阅读', 'check-concept': '核对概念',
  'compare-evidence': '比较证据', 'search-literature': '寻找文献',
};
export function targetPath(target: GuideTarget) {
  return `/read/${target.guideId}/${target.revision}#${target.unitId}`;
}
export function targetLabel(target: GuideTarget) {
  const guide = contentRepository.getSummary(target.guideId, target.revision);
  const unit = guide?.units.find(item => item.id === target.unitId);
  return unit ? `${guide!.metadata.title} · ${unit.heading ?? '阅读起点'}` : null;
}
export function createExploration(lens?: EditorialLens, seedRevision?: number): ExplorationDraft {
  return {
    id: crypto.randomUUID(), title: lens?.title ?? '', question: lens?.prompt ?? '',
    origin: lens ? 'adapted-editorial' : 'reader',
    ...(lens && seedRevision ? { seedRef: { revision: seedRevision, lensId: lens.id } } : {}),
    status: 'inbox', interpretation: '', unknowns: '', evidence: [],
    nextAction: lens ? { kind: lens.nextAction.kind, description: lens.nextAction.description,
      target: { guideId: lens.nextAction.target.guideId, revision: lens.nextAction.target.revision, unitId: lens.nextAction.target.unitId } } : null,
  };
}
export function useExplorations() {
  return useRecords('explorations');
}
export function useExploration(id: string) {
  const [record, setRecord] = useState<Exploration>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true, generation = 0;
    setRecord(undefined); setLoading(true); setError(false);
    const refresh = () => {
      const request = ++generation;
      return personalStore.get('explorations', id).then(item => {
        if (live && request === generation) { setRecord(item); setLoading(false); setError(false); }
      }).catch(() => { if (live && request === generation) { setError(true); setLoading(false); } });
    };
    refresh(); const unsubscribe = personalStore.subscribe(changed => { if (!changed || changed === 'explorations') void refresh(); });
    return () => { live = false; unsubscribe(); };
  }, [id]);
  return { record, loading, error };
}
