import { useEffect } from 'react';

// Unsaved editor buffers survive local navigation only; they are never saved records.
const drafts = new Map<string, unknown>();
const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
export function getDraft<T>(key: string): T | undefined { return drafts.get(key) as T | undefined; }
export function listDrafts<T>(prefix: string): { key: string; value: T }[] {
  return [...drafts].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: value as T }));
}
export function keepDraft<T>(key: string, value: T) {
  if (!drafts.size) window.addEventListener('beforeunload', warn);
  drafts.set(key, value);
}
export function clearDraft(key: string) {
  drafts.delete(key);
  if (!drafts.size) window.removeEventListener('beforeunload', warn);
}
export function useUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
