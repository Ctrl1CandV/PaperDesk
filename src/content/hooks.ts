import { useEffect, useState } from 'react';
import { contentRepository } from './repository';
import type { ExplorationSeed } from './types';

export function useExplorationSeed(revision?: number, enabled = true) {
  const [state, setState] = useState<{ revision?: number; seed?: ExplorationSeed; loading: boolean; error: boolean }>({ revision, loading: enabled, error: false });
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) { setState({ revision, loading: false, error: false }); return; }
    setState({ revision, loading: true, error: false });
    contentRepository.getExplorationSeed(revision, controller.signal).then(seed => {
      if (!controller.signal.aborted) setState({ revision, seed, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setState({ revision, loading: false, error: true }); });
    return () => controller.abort();
  }, [revision, enabled]);
  return state.revision === revision ? state : { revision, loading: enabled, error: false, seed: undefined };
}
