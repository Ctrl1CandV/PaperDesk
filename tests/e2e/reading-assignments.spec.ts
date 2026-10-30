import { test, expect } from '@playwright/test';

// Synthetic personal records using only the shipped public topic labels.
// Never connect the normal reading origin or a model provider.
test('content delivery associates both directions and respects later manual removal across refresh', async ({ page }) => {
  await page.route(/\/api\/ai(?:\/|$)/, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"SYNTHETIC isolated test"}' }));
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: '探索', exact: true })).toBeVisible();
  const ids = await page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    const ids = [];
    for (const title of ['Muti-Agent Communication', 'Agent/Modle Evaluation']) {
      const id = crypto.randomUUID(); ids.push(id);
      await personalStore.saveExploration({ id, title, question: 'SYNTHETIC question retained verbatim', origin: 'reader', status: 'inbox', interpretation: 'SYNTHETIC interpretation retained', unknowns: '', evidence: [], nextAction: null }, null);
    }
    return ids;
  });
  await expect.poll(() => page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts');
    return (await personalStore.list('explorations')).map(record => record.research?.relatedGuides?.length ?? 0).sort();
  })).toEqual([5, 5]);
  await page.reload();
  const before = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('explorations'));
  expect(before.every(record => record.question === 'SYNTHETIC question retained verbatim' && record.interpretation === 'SYNTHETIC interpretation retained')).toBe(true);
  expect(before.every(record => record.research?.readingAssignmentReceipts?.length === 1)).toBe(true);
  await page.goto(`/explore/questions/${ids[0]}`);
  await expect(page.getByRole('heading', { name: 'Muti-Agent Communication', exact: true })).toBeVisible();
  await expect(page.locator('a[href="/read/autogen/1"]')).toBeVisible();
  await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const record = await personalStore.get('explorations', id);
    await personalStore.saveExploration({ ...record!, research: { ...record!.research!, relatedGuides: record!.research!.relatedGuides!.filter(guide => guide.guideId !== 'autogen') } }, record!.recordRevision);
  }, ids[0]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Muti-Agent Communication', exact: true })).toBeVisible();
  await expect(page.locator('a[href="/read/autogen/1"]')).toHaveCount(0);
  const after = await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const record = await personalStore.get('explorations', id);
    let error = '';
    try { await personalStore.saveExploration({ ...record!, research: { ...record!.research!, readingAssignmentReceipts: [] } }, record!.recordRevision); }
    catch (caught) { error = (caught as Error).name; }
    return { record, error, marks: await personalStore.list('guideStates') };
  }, ids[0]);
  expect(after.record!.research!.relatedGuides).toHaveLength(4);
  expect(after.record!.research!.readingAssignmentReceipts).toHaveLength(1);
  expect(after.error).toBe('ValidationError');
  expect(after.marks).toEqual([]);
});
