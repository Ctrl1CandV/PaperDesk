import { useState } from 'react';
import { ConflictError, personalStore } from '../records/store';
import type { Exploration, ExplorationDraft } from '../records/types';

export function useExplorationSave(onSaved: (record: Exploration) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Exploration | null | undefined>();
  const [attempt, setAttempt] = useState<ExplorationDraft>();
  async function save(draft: ExplorationDraft, expectedRevision: number | null) {
    setBusy(true); setError(''); setConflict(undefined); setAttempt(draft);
    try { const saved = await personalStore.saveExploration(draft, expectedRevision); onSaved(saved); }
    catch (failure) {
      if (failure instanceof ConflictError) { setConflict(failure.current as Exploration | null); setError('另一处已更新或删除这条探索。你的草稿仍保留，请先比较两个版本。'); }
      else setError('未能保存。你的草稿仍保留，可以重试，或复制下方草稿自行保存。');
    } finally { setBusy(false); }
  }
  function saveCopy() { if (attempt) void save({ ...attempt, id: crypto.randomUUID() }, null); }
  return { busy, error, conflict, attempt, save, saveCopy, clearError: () => { setError(''); setConflict(undefined); } };
}

export function SaveFeedback({ state, onUseCurrent }: { state: ReturnType<typeof useExplorationSave>; onUseCurrent?: (record: Exploration) => void }) {
  if (!state.error) return null;
  return <div className="exploration-save-error" role="alert">
    <p>{state.error}</p>
    {state.conflict !== undefined && <>
      <details><summary>查看另一处保存的版本</summary>{state.conflict ? <textarea aria-label="另一处保存的探索" readOnly value={JSON.stringify(state.conflict, null, 2)} rows={8} /> : <p>这条记录已被删除。</p>}</details>
      <button type="button" disabled={state.busy} onClick={state.saveCopy}>将我的草稿另存为新探索</button>
      {state.conflict && onUseCurrent && <button type="button" onClick={() => { onUseCurrent(state.conflict!); state.clearError(); }}>放弃此草稿，采用已保存版本</button>}
    </>}
    <details><summary>复制草稿以便恢复</summary><textarea aria-label="可恢复的探索草稿" readOnly value={JSON.stringify(state.attempt, null, 2)} rows={8} onFocus={event => event.currentTarget.select()} /></details>
  </div>;
}
