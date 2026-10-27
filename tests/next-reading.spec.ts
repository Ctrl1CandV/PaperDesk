import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Every personal record and clipboard substitute below is a synthetic fixture.
async function setup(page: Page, question = '合成测试：Agent 的规划怎样组织？') {
  await page.goto('/explore');
  const initial = await page.evaluate(async questionText => {
    const { personalStore } = await import('/src/records/store.ts');
    const { contentRepository } = await import('/src/content/repository.ts');
    const guide = contentRepository.getSummary('agent-survey', contentRepository.currentRevision('agent-survey'))!;
    const record = await personalStore.saveExploration({
      id: crypto.randomUUID(), title: '合成测试：选择下一步阅读', question: questionText,
      origin: 'reader', status: 'deferred', interpretation: '合成测试：既有解释必须保留。', unknowns: '合成测试：未选入的未知文本。',
      nextAction: null, evidence: [{ id: crypto.randomUUID(), provenance: 'reader-observation', text: '合成测试：既有材料必须保留。' }],
    }, null);
    await personalStore.setGuideState({ guideId: guide.metadata.id, revision: guide.metadata.revision, status: 'read', updatedAt: new Date().toISOString() });
    await personalStore.setOriginalState({ sourceId: guide.metadata.source.id, sourceVersion: guide.metadata.source.version, status: 'reading', updatedAt: new Date().toISOString() });
    return record;
  }, question);
  await page.goto(`/explore/questions/${initial.id}`);
  return initial;
}
async function savedRecord(page: Page, id: string) {
  return page.evaluate(async recordId => (await import('/src/records/store.ts')).personalStore.get('explorations', recordId), id);
}
async function findFromQuestion(page: Page) {
  await page.getByRole('button', { name: '寻找下一步阅读', exact: true }).click();
  const panel = page.getByRole('region', { name: '寻找下一步阅读' });
  await expect(panel.getByRole('button', { name: '查找本库阅读', exact: true })).toBeDisabled();
  await panel.getByRole('checkbox', { name: /^使用当前问题/ }).check();
  await panel.getByRole('button', { name: '查找本库阅读', exact: true }).click();
  return panel;
}

test('local next-reading selection explains matches and saves only an explicit next action', async ({ page }) => {
  const initial = await setup(page);
  const panel = await findFromQuestion(page);
  const candidates = panel.locator('.next-reading-candidate');
  await expect(candidates).toHaveCount(3);
  const survey = candidates.filter({ has: page.locator('#next-reading-preview-agent-survey') });
  await expect(survey).toHaveCount(1);
  await expect(survey).toContainText('Agent');
  await expect(survey).toContainText('匹配依据');
  await expect(survey).toContainText('阅读目的');
  await expect(survey).toContainText('仍有边界');
  await expect(survey).toContainText('已读 · 由你标记');
  await expect(survey).toContainText('原论文：阅读中 · 由你标记');
  expect(await savedRecord(page, initial.id)).toEqual(initial);
  await mkdir('docs/evidence', { recursive: true });
  await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'docs/evidence/refinement-next-reading-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await survey.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'docs/evidence/refinement-next-reading-narrow.png' });
  await survey.getByRole('button', { name: '设为下一步', exact: true }).click();
  await expect(page.getByRole('button', { name: '寻找下一步阅读', exact: true })).toBeFocused();
  const result = await savedRecord(page, initial.id);
  expect(result?.nextAction?.kind).toBe('read-guide');
  expect(result?.nextAction?.target?.guideId).toBe('agent-survey');
  expect(result?.nextAction?.target?.unitId).toBe('u02');
  expect(result?.recordRevision).toBe(initial.recordRevision + 1);
  for (const key of ['question', 'interpretation', 'unknowns', 'status', 'evidence'] as const) expect(result?.[key]).toEqual(initial[key]);
  const backup = await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.exportBackup());
  expect(backup.explorations[0]).toEqual(result);
});

test('no local match stays honest; editable search brief copies exactly and needs explicit save', async ({ page, context }) => {
  const outbound: string[] = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url()); });
  const initial = await setup(page, '合成测试：zzq-unmatched-literature-term');
  const panel = await findFromQuestion(page);
  await expect(panel.locator('.next-reading-candidate')).toHaveCount(0);
  await expect(panel).toContainText('本库暂时没有合适的阅读目标');
  const brief = panel.getByLabel('完整检索任务预览');
  expect(await brief.inputValue()).toContain('zzq-unmatched-literature-term');
  expect(await brief.inputValue()).not.toContain(initial.unknowns);
  const exact = '合成测试：仅复制这份主动编辑的检索任务。';
  await brief.fill(exact);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).syntheticNextReadingCopy = text; } } }); });
  await panel.getByRole('button', { name: '复制检索任务', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已复制');
  expect(await page.evaluate(() => (window as any).syntheticNextReadingCopy)).toBe(exact);
  expect(await savedRecord(page, initial.id)).toEqual(initial);
  await panel.getByRole('button', { name: '收起', exact: true }).click();
  await panel.getByRole('button', { name: '寻找下一步阅读', exact: true }).click();
  await expect(brief).toHaveValue(exact);
  await panel.getByLabel('补充主题词或阅读目标').fill('合成测试：another-unknown-concept');
  await panel.getByRole('button', { name: '按当前选择重新查找', exact: true }).click();
  await expect(brief).toHaveValue(exact);
  await panel.getByRole('button', { name: '设为文献检索下一步', exact: true }).click();
  expect((await savedRecord(page, initial.id))?.nextAction).toEqual({ kind: 'search-literature', description: exact });
  expect(outbound).toEqual([]);
});

test('concurrent exploration changes are not overwritten when choosing a reading target', async ({ page }) => {
  const initial = await setup(page);
  const panel = await findFromQuestion(page);
  const survey = panel.locator('.next-reading-candidate').filter({ has: page.locator('#next-reading-preview-agent-survey') });
  const current = await page.evaluate(async id => {
    const { personalStore } = await import('/src/records/store.ts');
    const value = (await personalStore.get('explorations', id))!;
    return personalStore.saveExploration({ ...value, interpretation: '合成测试：另一处刚保存的新解释。', evidence: [...value.evidence, { id: crypto.randomUUID(), provenance: 'reader-observation', text: '合成测试：另一处追加的材料。' }] }, value.recordRevision);
  }, initial.id);
  await survey.getByRole('button', { name: '设为下一步', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('另一处已更新或删除');
  expect(await savedRecord(page, initial.id)).toEqual(current);
  await panel.getByRole('button', { name: '放弃此草稿，采用已保存版本', exact: true }).click();
  await survey.getByRole('button', { name: '设为下一步', exact: true }).click();
  const result = await savedRecord(page, initial.id);
  expect(result?.interpretation).toBe(current.interpretation);
  expect(result?.evidence).toEqual(current.evidence);
  expect(result?.nextAction?.kind).toBe('read-guide');
  expect(result?.recordRevision).toBe(current.recordRevision + 1);
});

test('matching respects explicit topic relationships and English token boundaries', async ({ page }) => {
  await page.goto('/explore');
  const matches = await page.evaluate(async () => {
    const { containsConcept, findNextReadings } = await import('/src/exploration/next-reading.ts');
    const { contentRepository } = await import('/src/content/repository.ts');
    const guides = contentRepository.list().map(entry => entry.guide);
    return { partial: containsConcept('agency agentic', 'Agent'), exact: containsConcept('讨论 Agent 的规划', 'agent'),
      agent: findNextReadings(guides, { text: 'Agent', topicIds: [] }).map(item => item.guide.metadata.id),
      rlhf: findNextReadings(guides, { text: 'RLHF', topicIds: [] }).map(item => item.guide.metadata.id),
      react: findNextReadings(guides, { text: 'ReAct', topicIds: [] }).map(item => item.guide.metadata.id),
      tool: findNextReadings(guides, { text: '工具学习', topicIds: [] }).map(item => item.guide.metadata.id),
      reflection: findNextReadings(guides, { text: 'Reflexion', topicIds: [] }).map(item => item.guide.metadata.id),
      empty: findNextReadings(guides, { text: '', topicIds: [] }).length,
    };
  });
  expect(matches.partial).toBe(false); expect(matches.exact).toBe(true);
  expect(matches.agent).toEqual(['agent-survey', 'react', 'reflexion']);
  expect(matches.rlhf).toContain('instructgpt');
  expect(matches.react).toEqual(['react']);
  expect(matches.tool).toEqual(['toolformer']);
  expect(matches.reflection).toEqual(['reflexion']);
  expect(matches.empty).toBe(0);
});
