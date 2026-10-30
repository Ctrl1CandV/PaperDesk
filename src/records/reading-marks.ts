import { useEffect, useState } from 'react';
import { originalKey, personalStore } from './store';
import type { GuideState, OriginalState, ReadingStatus } from './types';

export const statusLabels: Record<ReadingStatus, string> = { unread: '未读', reading: '阅读中', read: '已读', deferred: '暂缓' };
export type ReadingMarks = { guides: Map<string, GuideState>; originals: Map<string, OriginalState> };

/** The reader's explicit marks: the latest guide mark across revisions, and original marks by source version. */
export function useReadingMarks(): ReadingMarks {
  const [marks, setMarks] = useState<ReadingMarks>({ guides: new Map(), originals: new Map() });
  useEffect(() => {
    let live = true;
    const load = () => Promise.all([personalStore.list('guideStates'), personalStore.list('originalStates')]).then(([guides, originals]) => {
      if (!live) return;
      const latest = new Map<string, GuideState>();
      for (const item of guides) { const known = latest.get(item.guideId); if (!known || item.updatedAt > known.updatedAt) latest.set(item.guideId, item); }
      setMarks({ guides: latest, originals: new Map(originals.map(item => [originalKey(item.sourceId, item.sourceVersion), item])) });
    }).catch(() => {});
    load(); const unsubscribe = personalStore.subscribe(store => { if (!store || store === 'guideStates' || store === 'originalStates') load(); });
    return () => { live = false; unsubscribe(); };
  }, []);
  return marks;
}

/** A short, quiet description of explicit marks; nothing when the reader has recorded nothing beyond 未读. */
export function marksText(marks: ReadingMarks, guideId: string, source: { id: string; version: string | null }) {
  const guide = marks.guides.get(guideId)?.status, original = marks.originals.get(originalKey(source.id, source.version))?.status;
  return [guide && guide !== 'unread' ? `导读${statusLabels[guide]}` : '', original && original !== 'unread' ? `原文${statusLabels[original]}` : ''].filter(Boolean).join(' · ');
}
