import { useCallback, useEffect, useRef, useState } from 'react';
import { personalStore } from './store';
import { recordKey } from './validation';
import type { RecordMap, StoreName } from './types';

export function useRecords<K extends StoreName>(name: K) {
  const [records, setRecords] = useState<RecordMap[K][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string>();
  const generation = useRef(0);
  const pageCount = useRef(1);
  const rows = useRef<RecordMap[K][]>([]);
  const busy = useRef(false);
  const currentName = useRef(name);
  const unique = useCallback((items: RecordMap[K][]) => {
    const byKey = new Map<string, RecordMap[K]>();
    for (const item of items) {
      const key = recordKey(name, item), previous = byKey.get(key);
      // Overlapping pages can contain an older copy after an intervening edit.
      // Preserve the newest record, not merely the last returned copy.
      if (previous && ('recordRevision' in previous && 'recordRevision' in item
        ? previous.recordRevision >= item.recordRevision
        : previous.updatedAt >= item.updatedAt)) continue;
      byKey.set(key, item);
    }
    return [...byKey.values()];
  }, [name]);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    busy.current = true;
    if (!rows.current.length) setLoading(true);
    try {
      const gathered: RecordMap[K][] = [];
      let nextCursor: string | undefined;
      // A save refreshes the number of pages already opened, rather than
      // silently taking the reader back to the first page.
      for (let index = 0; index < pageCount.current; index++) {
        const page = await personalStore.listPage(name, { cursor: nextCursor });
        if (generation.current !== request) return;
        gathered.push(...page.records); nextCursor = page.nextCursor;
        if (!nextCursor) break;
      }
      const next = unique(gathered);
      rows.current = next; setRecords(next); setCursor(nextCursor); setError('');
    } catch (failure) {
      if (generation.current === request) setError(failure instanceof Error ? failure.message : '本地记录暂时不可用。');
    } finally {
      if (generation.current === request) { busy.current = false; setLoading(false); }
    }
  }, [name, unique]);
  const loadMore = useCallback(async () => {
    if (!cursor || busy.current) return;
    const request = ++generation.current;
    busy.current = true; setLoading(true);
    try {
      const page = await personalStore.listPage(name, { cursor });
      if (generation.current !== request) return;
      const next = unique([...rows.current, ...page.records]);
      pageCount.current++; rows.current = next;
      setRecords(next); setCursor(page.nextCursor); setError('');
    } catch (failure) {
      if (generation.current === request) setError(failure instanceof Error ? failure.message : '本地记录暂时不可用。');
    } finally {
      if (generation.current === request) { busy.current = false; setLoading(false); }
    }
  }, [cursor, name, unique]);
  useEffect(() => {
    if (currentName.current !== name) {
      currentName.current = name; pageCount.current = 1; rows.current = [];
      setRecords([]); setCursor(undefined); setError('');
    }
    void reload();
    const unsubscribe = personalStore.subscribe(changed => { if (!changed || changed === name) void reload(); });
    return () => { generation.current++; busy.current = false; unsubscribe(); };
  }, [reload, name]);
  return { records, loading, error, reload, hasMore: Boolean(cursor), loadMore };
}
