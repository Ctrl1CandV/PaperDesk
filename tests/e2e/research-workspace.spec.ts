import { test, expect } from '@playwright/test';

// Existing documents remain readable when the optional execution workspace is removed.
test('saved research documents remain in the research process without execution controls', async ({ page }) => {
  await page.route('**/api/ai/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SYNTHETIC offline' }) }));
  await page.goto('/explore');
  const record = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    const { createResearchArtifact } = await import('/shared/research-artifacts.mjs');
    return personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 旧研究记录', question: 'SYNTHETIC 核查条件', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', nextAction: null, evidence: [], research: { ...emptyResearchState(), artifacts: [createResearchArtifact({ title: 'SYNTHETIC 保存的研究结论', body: 'SYNTHETIC 旧结论及材料应保持完整。', recordRevision: 1 })] } }, null);
  });
  await page.goto(`/explore/questions/${record.id}`);
  await page.getByText('SYNTHETIC 保存的研究结论', { exact: true }).click();
  await expect(page.locator('.direction-saved-document')).toContainText('SYNTHETIC 旧结论及材料应保持完整。');
  await expect(page.getByRole('button', { name: '新建研究文档', exact: true })).toHaveCount(0);
  await expect(page.getByText('可选：固定任务版本与执行回执', { exact: true })).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(async id => (await import('/src/records/store.ts')).personalStore.get('explorations', id), record.id);
  expect(saved).toEqual(record);
});
