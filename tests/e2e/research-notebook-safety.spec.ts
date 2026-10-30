import { test, expect } from '@playwright/test';

test('synthetic notebook commands are idempotent, preserve history and refuse deleted directions', async ({ page }) => {
  await page.route('**/api/ai/**', route => route.fulfill({ status: 503, body: '{"error":"SYNTHETIC offline"}', contentType: 'application/json' }));
  await page.goto('/explore');
  const result = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { createResearchSnapshot, emptyResearchState } = await import('/shared/research-contract.mjs');
    const { saveNotebookTurn, saveResearchNotebook } = await import('/src/research/notebook-actions.ts');
    const record = await personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 安全检查', question: 'SYNTHETIC 保存规则检查', origin: 'reader', status: 'inbox', interpretation: '', unknowns: '', evidence: [], nextAction: null, research: emptyResearchState() }, null);
    const turn = { id: crypto.randomUUID(), status: 'complete' as const, question: '/记录 SYNTHETIC', answer: 'SYNTHETIC 模拟回答', sources: [], createdAt: new Date().toISOString(), context: { command: { name: 'notebook' as const }, conversationScope: { kind: 'exploration' as const, explorationId: record.id }, researchSnapshot: await createResearchSnapshot(record), notebookDraft: { body: 'SYNTHETIC AI 初稿', summary: 'SYNTHETIC 新增初稿', baseNotebookVersion: 0 } } };
    const first = await saveNotebookTurn(turn);
    const second = await saveNotebookTurn(turn);
    let historyProtected = false;
    try { await personalStore.saveExploration({ ...second.record, research: { ...second.record.research!, notebook: { versions: [{ ...second.version, body: 'SYNTHETIC 篡改旧版' }] } } }, second.record.recordRevision); } catch { historyProtected = true; }
    const later = await saveResearchNotebook(second.record, 'SYNTHETIC 手动新版本');
    const retry = await saveNotebookTurn(turn);
    const archive = await personalStore.exportArchive();
    const preview = await personalStore.previewArchive(archive);
    const goneTurn = { ...turn, id: crypto.randomUUID(), context: { ...turn.context, researchSnapshot: await createResearchSnapshot(later.record), notebookDraft: { ...turn.context.notebookDraft, body: 'SYNTHETIC 已删除后不写入', baseNotebookVersion: 2 } } };
    await personalStore.deleteExploration(record.id, later.record.recordRevision);
    let deletedProtected = false;
    try { await saveNotebookTurn(goneTurn); } catch { deletedProtected = true; }
    return { firstRevision: first.record.recordRevision, secondRevision: second.record.recordRevision, historyProtected, versionsAfterRetry: retry.record.research?.notebook?.versions.map(item => item.body), archiveDuplicates: preview.duplicates, deletedProtected, exists: !!await personalStore.get('explorations', record.id) };
  });
  expect(result.firstRevision).toBe(result.secondRevision);
  expect(result.historyProtected).toBe(true);
  expect(result.versionsAfterRetry).toEqual(['SYNTHETIC AI 初稿', 'SYNTHETIC 手动新版本']);
  expect(result.archiveDuplicates).toBe(1);
  expect(result.deletedProtected).toBe(true);
  expect(result.exists).toBe(false);
});
