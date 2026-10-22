import { useCallback, useEffect, useState } from 'react';
import { personalStore } from './store';
import type { RecordMap, StoreName } from './types';

export function useRecords<K extends StoreName>(name: K) {
  const [records, setRecords] = useState<RecordMap[K][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { setRecords(await personalStore.list(name)); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '本地记录暂时不可用。'); }
    finally { setLoading(false); }
  }, [name]);
  useEffect(() => { void reload(); return personalStore.subscribe(() => void reload()); }, [reload]);
  return { records, loading, error, reload };
}
