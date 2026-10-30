import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// The former keyword-matching panel was deliberately removed. These synthetic
// records check its replacement does not manufacture links or mutate history.
test('a direction shows explicit related papers and never treats all library arrivals as related', async ({ page }) => {
  await page.route('**/api/ai/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SYNTHETIC offline' }) }));
  await page.goto('/explore');
  const record = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const { emptyResearchState } = await import('/shared/research-contract.mjs');
    const { createResearchArtifact } = await import('/shared/research-artifacts.mjs');
    return personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 文献关联', question: 'SYNTHETIC 研究问题', origin: 'reader', status: 'exploring', interpretation: 'SYNTHETIC 保留认识', unknowns: '', nextAction: { kind: 'read-guide', description: 'SYNTHETIC 已确定的阅读', target: { guideId: 'agent-survey', revision: 1, unitId: 'u01' } }, evidence: [], research: { ...emptyResearchState(), artifacts: [createResearchArtifact({ kind: 'reading-brief', title: 'SYNTHETIC 旧文件', body: 'SYNTHETIC 旧内容', recordRevision: 1, purpose: 'research', librarySnapshot: [] })] } }, null);
  });
  await page.goto(`/explore/questions/${record.id}`);
  await expect(page.locator('.related-papers li')).toHaveCount(1);
  await expect(page.locator('.related-papers')).toContainText('下一步要读');
  await expect(page.locator('.direction-next')).toContainText('SYNTHETIC 已确定的阅读');
  await expect(page.getByText('更多：本库匹配与文档记录', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '寻找下一步阅读', exact: true })).toHaveCount(0);
  await expect(page.getByText(/选文后新入库/)).toHaveCount(0);
  const saved = await page.evaluate(async id => (await import('/src/records/store.ts')).personalStore.get('explorations', id), record.id);
  expect(saved).toEqual(record);
});


test('explicit literature links survive reload without claiming reading or adding evidence', async ({ page }) => {
  await page.route('**/api/ai/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SYNTHETIC offline' }) }));
  await page.goto('/explore');
  const id = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    return (await personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 文献关联测试', question: 'SYNTHETIC 从问题开始', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', nextAction: null, evidence: [] }, null)).id;
  });
  await page.goto(`/explore/questions/${id}`);
  await page.getByRole('button', { name: '关联文献', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '关联本库文献' });
  await picker.getByRole('checkbox').first().check();
  await picker.getByRole('checkbox').nth(1).check();
  await mkdir('.cache/screenshots/research', { recursive: true });
  await page.screenshot({ path: '.cache/screenshots/research/link-papers-desktop.png' });
  await picker.getByRole('button', { name: '保存关联（2）', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('.related-papers li')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.related-papers li')).toHaveCount(2);
  const result = await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    return { record: await personalStore.get('explorations', id), marks: await personalStore.list('guideStates') };
  }, id);
  expect(result.record!.research!.relatedGuides).toHaveLength(2);
  expect(result.record!.evidence).toEqual([]);
  expect(result.marks).toEqual([]);
  await page.getByRole('button', { name: '关联文献', exact: true }).click();
  await picker.getByRole('checkbox').first().uncheck();
  await picker.getByRole('button', { name: '保存关联（1）', exact: true }).click();
  await expect(page.locator('.related-papers li')).toHaveCount(1);
});
