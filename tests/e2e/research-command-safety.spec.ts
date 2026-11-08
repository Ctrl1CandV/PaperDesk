import { test, expect, type Page } from '@playwright/test';
import type { AiTurn } from '../../src/assistant/api';

// All records, failures and completed model replies in this file are synthetic.
async function isolated(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"SYNTHETIC offline"}' }));
  await page.goto('/explore');
}

test('overlapping replays of one completed direction command create one direction and working paper', async ({ page }) => {
  await isolated(page);
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { applyCommandTurn, commandOutcome } = await import('/src/research/commands.ts');
    const turn: AiTurn = { id: crypto.randomUUID(), question: '/方向 SYNTHETIC', answer: 'SYNTHETIC 方向草稿', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'direction' }, directionDraft: { title: 'SYNTHETIC 方向', question: 'SYNTHETIC 并行完成检查', interpretation: '', unknowns: '', scope: '', constraints: '', candidates: '', deferred: '', stage: 'broaden', nextAction: null, rationale: 'SYNTHETIC' } } };
    const outcomes = await Promise.all([applyCommandTurn(turn, { conversation: [] }), applyCommandTurn(turn, { conversation: [] })]);
    const records = await personalStore.list('explorations');
    return { kinds: outcomes.map(item => item.kind), records: records.map(item => ({ id: item.id, versions: item.research?.notebook?.versions.length, sourceTurnId: item.research?.createdFromTurnId })), turnId: turn.id, history: (await commandOutcome(turn)).kind };
  });
  expect(result.kinds).toEqual(['direction-created', 'direction-created']);
  expect(result.records).toEqual([{ id: result.turnId, versions: 1, sourceTurnId: result.turnId }]);
  expect(result.history).toBe('direction-created');
});

test('a failed accumulation save leaves no empty entry and retries the same completed answer', async ({ page }) => {
  await isolated(page);
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { applyCommandTurn } = await import('/src/research/commands.ts');
    const turn: AiTurn = { id: crypto.randomUUID(), question: '/选文 积累 SYNTHETIC', answer: '# 选文实施文件：SYNTHETIC 原子保存\n\nSYNTHETIC 正文', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'reading-brief', purpose: 'accumulation' } } };
    const save = personalStore.saveExploration.bind(personalStore);
    let fail = true, message = '';
    personalStore.saveExploration = async (draft, revision) => {
      if (fail && draft.research?.artifacts?.length) { fail = false; throw Error('SYNTHETIC 容量不足'); }
      return save(draft, revision);
    };
    try { await applyCommandTurn(turn, { conversation: [] }); }
    catch (error) { message = error instanceof Error ? error.message : String(error); }
    finally { personalStore.saveExploration = save; }
    const afterFailure = (await personalStore.list('explorations')).length;
    const outcome = await applyCommandTurn(turn, { conversation: [] });
    const retry = await applyCommandTurn(turn, { conversation: [] });
    const records = await personalStore.list('explorations');
    return { message, afterFailure, kinds: [outcome.kind, retry.kind], count: records.length, files: records[0].research?.artifacts?.map(item => ({ body: item.body, sourceTurnId: item.sourceTurnId })), answer: turn.answer, turnId: turn.id };
  });
  expect(result.message).toContain('SYNTHETIC 容量不足');
  expect(result.afterFailure).toBe(0);
  expect(result.kinds).toEqual(['brief-saved', 'brief-saved']);
  expect(result.count).toBe(1);
  expect(result.files).toEqual([{ body: result.answer, sourceTurnId: result.turnId }]);
});

test('unlinked file replays keep their original accumulation destination after a later direction is linked', async ({ page }) => {
  await isolated(page);
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { createExploration } = await import('/src/exploration/model.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    const { applyCommandTurn, commandOutcome } = await import('/src/research/commands.ts');
    const linked = await personalStore.saveExploration({ ...createExploration(), title: 'SYNTHETIC 后来关联的方向', question: 'SYNTHETIC 另一个问题', research: emptyResearchState() }, null);
    const turn: AiTurn = { id: crypto.randomUUID(), question: '/选文 积累 SYNTHETIC', answer: '# 选文实施文件：SYNTHETIC 未关联选文\n\nSYNTHETIC 正文', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'reading-brief', purpose: 'accumulation' } } };
    const outcomes = await Promise.all([applyCommandTurn(turn, { linked, conversation: [] }), applyCommandTurn(turn, { linked, conversation: [] })]);
    const records = await personalStore.list('explorations');
    const saved = records.find(item => item.id !== linked.id)!;
    const history = await commandOutcome(turn, linked);
    let changedAnswerRejected = false;
    try { await applyCommandTurn({ ...turn, answer: turn.answer + '\nSYNTHETIC 异内容重放' }, { linked, conversation: [] }); }
    catch { changedAnswerRejected = true; }
    return { kinds: outcomes.map(item => item.kind), count: records.length, unrelatedFiles: records.find(item => item.id === linked.id)?.research?.artifacts?.length ?? 0, savedId: saved.id, turnId: turn.id, files: saved.research?.artifacts?.length, history: history.kind, changedAnswerRejected };
  });
  expect(result.kinds).toEqual(['brief-saved', 'brief-saved']);
  expect(result.count).toBe(2);
  expect(result.unrelatedFiles).toBe(0);
  expect(result.savedId).toBe(result.turnId);
  expect(result.files).toBe(1);
  expect(result.history).toBe('brief-saved');
  expect(result.changedAnswerRejected).toBe(true);
});

test('direction updates use the original snapshot and reject stale or deleted targets while remaining retryable', async ({ page }) => {
  await isolated(page);
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { createExploration } = await import('/src/exploration/model.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const { applyCommandTurn, commandOutcome } = await import('/src/research/commands.ts');
    const first = await personalStore.saveExploration({ ...createExploration(), title: 'SYNTHETIC 方向版本', question: 'SYNTHETIC 原问题', research: emptyResearchState() }, null);
    const makeTurn = async (record: typeof first): Promise<AiTurn> => {
      const snapshot = await createResearchSnapshot(record), id = crypto.randomUUID();
      return { id, question: '/方向 SYNTHETIC 更新', answer: 'SYNTHETIC 更新完成', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'direction' }, conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: snapshot, researchProposals: [{ id: crypto.randomUUID(), explorationId: record.id, baseRecordRevision: record.recordRevision, baseSnapshotSha256: snapshot.snapshotSha256, sourceTurnId: id, changes: [{ kind: 'set-field', field: 'unknowns', value: 'SYNTHETIC AI 新认识' }], rationale: 'SYNTHETIC', evidenceRefs: [] }] } };
    };
    const stale = await makeTurn(first);
    const edited = await personalStore.saveExploration({ ...first, unknowns: 'SYNTHETIC 读者新认识' }, first.recordRevision);
    let staleRejected = false, deletedRejected = false;
    try { await applyCommandTurn(stale, { conversation: [] }); } catch { staleRejected = true; }
    const afterStale = (await personalStore.get('explorations', first.id))?.unknowns;
    const current = await makeTurn(edited);
    const applied = await applyCommandTurn(current, { conversation: [] });
    const retry = await applyCommandTurn(current, { conversation: [] });
    const saved = (await personalStore.get('explorations', first.id))!;
    const history = await commandOutcome(current);
    await personalStore.deleteExploration(saved.id, saved.recordRevision);
    try { await applyCommandTurn(current, { conversation: [] }); } catch { deletedRejected = true; }
    return { staleRejected, afterStale, kinds: [applied.kind, retry.kind], audits: saved.research?.appliedProposalIds.length, history: history.kind, deletedRejected, count: (await personalStore.list('explorations')).length };
  });
  expect(result.staleRejected).toBe(true);
  expect(result.afterStale).toBe('SYNTHETIC 读者新认识');
  expect(result.kinds).toEqual(['direction-updated', 'direction-updated']);
  expect(result.audits).toBe(1);
  expect(result.history).toBe('direction-updated');
  expect(result.deletedRejected).toBe(true);
  expect(result.count).toBe(0);
});

test('failed notebook persistence can retry without overwriting a later reader edit or accepting incomplete replies', async ({ page }) => {
  await isolated(page);
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { createExploration } = await import('/src/exploration/model.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const { applyCommandTurn } = await import('/src/research/commands.ts');
    const { saveResearchNotebook } = await import('/src/research/notebook-actions.ts');
    const record = await personalStore.saveExploration({ ...createExploration(), title: 'SYNTHETIC 工作稿重试', question: 'SYNTHETIC 问题', research: emptyResearchState() }, null);
    const turn: AiTurn = { id: crypto.randomUUID(), question: '/记录 SYNTHETIC', answer: 'SYNTHETIC 整理完成', status: 'complete', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'notebook' }, conversationScope: { kind: 'exploration', explorationId: record.id }, researchSnapshot: await createResearchSnapshot(record), notebookDraft: { body: 'SYNTHETIC AI 第一版', summary: 'SYNTHETIC 初稿', baseNotebookVersion: 0 } } };
    const incomplete = [];
    for (const status of ['running', 'error', 'interrupted'] as const) incomplete.push((await applyCommandTurn({ ...turn, status }, { conversation: [] })).kind);
    incomplete.push((await applyCommandTurn({ ...turn, summaryOnly: true }, { conversation: [] })).kind);
    const save = personalStore.saveExploration.bind(personalStore);
    personalStore.saveExploration = async () => { throw Error('SYNTHETIC 保存失败'); };
    let failed = false;
    try { await applyCommandTurn(turn, { conversation: [] }); } catch { failed = true; }
    finally { personalStore.saveExploration = save; }
    const afterFailure = (await personalStore.get('explorations', record.id))?.research?.notebook?.versions.length ?? 0;
    const applied = await applyCommandTurn(turn, { conversation: [] });
    const aiSaved = (await personalStore.get('explorations', record.id))!;
    const stale = { ...turn, id: crypto.randomUUID(), context: { ...turn.context!, researchSnapshot: await createResearchSnapshot(aiSaved), notebookDraft: { body: 'SYNTHETIC 过时整理', summary: 'SYNTHETIC 过时', baseNotebookVersion: 1 } } };
    await saveResearchNotebook(aiSaved, 'SYNTHETIC 读者第二版');
    let staleRejected = false;
    try { await applyCommandTurn(stale, { conversation: [] }); } catch { staleRejected = true; }
    const retry = await applyCommandTurn(turn, { conversation: [] });
    const current = (await personalStore.get('explorations', record.id))!;
    return { incomplete, failed, afterFailure, kinds: [applied.kind, retry.kind], staleRejected, bodies: current.research?.notebook?.versions.map(item => item.body) };
  });
  expect(result.incomplete).toEqual(['declined', 'declined', 'declined', 'declined']);
  expect(result.failed).toBe(true);
  expect(result.afterFailure).toBe(0);
  expect(result.kinds).toEqual(['notebook-saved', 'notebook-saved']);
  expect(result.staleRejected).toBe(true);
  expect(result.bodies).toEqual(['SYNTHETIC AI 第一版', 'SYNTHETIC 读者第二版']);
});
