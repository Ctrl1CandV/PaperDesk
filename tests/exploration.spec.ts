import { test, expect, type Page } from '@playwright/test';
import catalog from '../content/catalog.json' with { type: 'json' };
import { mkdir } from 'node:fs/promises';

// All personal questions, observations and failure injections in this file are synthetic fixtures.
const title = '合成测试：目标、证据与适用条件';
const question = '合成测试问题：不同材料各自允许我作出什么判断？';

async function records(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/records/store.ts';
    const { personalStore } = await import(modulePath);
    return personalStore.list('explorations');
  });
}
async function capture(page: Page, name: string) {
  await mkdir('docs/evidence', { recursive: true });
  await page.screenshot({ path: `docs/evidence/${name}.png`, animations: 'disabled' });
}
async function selectGuideText(page: Page, route: string) {
  await page.goto(route);
  const quote = await page.locator('#u01 p').first().evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && (text.textContent?.trim().length ?? 0) < 20) text = walker.nextNode();
    if (!text) throw new Error('Synthetic test could not find guide prose');
    const range = document.createRange(); range.selectNodeContents(text);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return text.textContent!.trim();
  });
  await expect(page.locator('.reading-tool-context')).toContainText('选中文本');
  await page.getByRole('button', { name: '加入探索', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '加入探索', exact: true }).locator('blockquote')).toHaveText(quote);
  return quote;
}
async function createSynthetic(page: Page) {
  await page.goto('/explore');
  await page.getByRole('button', { name: '创建自己的问题' }).click();
  const dialog = page.getByRole('dialog', { name: '创建一个探索问题' });
  await dialog.getByLabel('探索标题', { exact: true }).fill(title);
  await dialog.getByLabel('我想继续追问的问题', { exact: true }).fill(question);
  await dialog.getByRole('button', { name: '保存探索', exact: true }).click();
  await expect(page).toHaveURL(/\/explore\/questions\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
}

test('editorial lenses are separate from personal records; adoption requires explicit save', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.locator('.exploration-lens-card')).toHaveCount(3);
  await expect(page.getByText('还没有个人探索记录', { exact: true })).toBeVisible();
  await expect(page.locator('.exploration-boundary')).toContainText('不是完整领域分类');
  await capture(page, 'w4-explore-desktop');
  await page.locator('.exploration-lens-card').first().getByRole('link', { name: '了解这个角度 →' }).click();
  await expect(page.getByRole('heading', { name: '带着这些目的回到阅读' })).toBeVisible();
  expect(await records(page)).toHaveLength(0);
  await page.getByRole('button', { name: '改写成我的问题' }).click();
  let dialog = page.getByRole('dialog', { name: '创建一个探索问题' });
  await dialog.getByLabel('探索标题', { exact: true }).fill('合成测试：取消的改写');
  await dialog.getByRole('button', { name: '丢弃草稿' }).click();
  expect(await records(page)).toHaveLength(0);
  await page.getByRole('button', { name: '改写成我的问题' }).click();
  dialog = page.getByRole('dialog', { name: '创建一个探索问题' });
  await dialog.getByLabel('探索标题', { exact: true }).fill('合成测试：编辑起点的改写');
  await dialog.getByLabel('我想继续追问的问题', { exact: true }).fill(question);
  await dialog.getByRole('button', { name: '保存探索', exact: true }).click();
  await expect(page).toHaveURL(/\/explore\/questions\//);
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].origin).toBe('adapted-editorial');
  expect(saved[0].seedRef).toEqual({ revision: 1, lensId: 'application-construction' });
  expect(saved[0].evidence).toEqual([]);
  expect(saved[0].interpretation).toBe('');
});

test('two exact guide excerpts accumulate with question, interpretation, deferral and next-reading return', async ({ page }) => {
  const first = await selectGuideText(page, '/read/agent-survey/1#u01');
  let dialog = page.getByRole('dialog', { name: '加入探索', exact: true });
  await dialog.getByLabel('探索标题', { exact: true }).fill(title);
  await dialog.getByLabel('我想继续追问的问题', { exact: true }).fill(question);
  await dialog.getByRole('button', { name: '保存探索', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '加入探索', exact: true })).toBeFocused();
  const initial = (await records(page))[0];
  const second = await selectGuideText(page, '/read/instructgpt/1#u01');
  dialog = page.getByRole('dialog', { name: '加入探索', exact: true });
  await dialog.getByLabel('保存到哪个探索').selectOption(initial.id);
  await expect(dialog).toContainText('现有 1 条材料会完整保留');
  await dialog.getByLabel('这条材料的批注（可选）').fill('合成测试批注：保存两处材料的区别。');
  await dialog.getByRole('button', { name: '保存材料到此探索' }).click();
  await expect(dialog).not.toBeVisible();
  const appended = (await records(page))[0];
  expect(appended.question).toBe(question);
  expect(appended.evidence.map((item: any) => item.text)).toEqual([first, second]);
  expect(appended.evidence.map((item: any) => item.provenance)).toEqual(['guide-excerpt', 'guide-excerpt']);
  expect(appended.evidence.map((item: any) => item.target.guideId)).toEqual(['agent-survey', 'instructgpt']);
  await page.goto(`/explore/questions/${initial.id}`);
  await page.getByRole('button', { name: '修改问题与下一步' }).click();
  await page.getByLabel('我的解释', { exact: true }).fill('合成测试解释：这里只记录当前理解，不作有效性判断。');
  await page.getByLabel('尚不确定的地方', { exact: true }).fill('合成测试未知：仍需核对实验条件。');
  await page.getByLabel('当前状态', { exact: true }).selectOption('deferred');
  await page.getByLabel('行动类型', { exact: true }).selectOption('read-guide');
  await page.getByLabel('具体准备做什么', { exact: true }).fill('合成测试行动：回到 HELM 的指标解释。');
  await page.getByLabel('下一步的阅读位置', { exact: true }).selectOption(`helm/${catalog.currentRevisions.helm}/u03`);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  await page.reload();
  await expect(page.locator('.exploration-status')).toHaveText('暂缓');
  await expect(page.locator('.exploration-thinking')).toContainText('合成测试未知');
  await expect(page.locator('.exploration-evidence')).toHaveCount(2);
  await capture(page, 'w4-question-desktop');
  const target = page.locator('.exploration-next-reading a');
  await target.click();
  await expect(page).toHaveURL(new RegExp(`/read/helm/${catalog.currentRevisions.helm}#u03$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/explore/questions/${initial.id}$`));
  await expect(target).toBeFocused();
  await expect(page.locator('.exploration-evidence')).toHaveCount(2);
  expect((await records(page))[0].recordRevision).toBe(3);
});

test('independent manual original excerpt and reader observation need no unrelated guide', async ({ page }) => {
  await createSynthetic(page);
  await page.getByRole('button', { name: '添加原文摘录或观察' }).click();
  let dialog = page.getByRole('dialog', { name: '添加材料', exact: true });
  await dialog.getByLabel('原文来源 URL 或学术标识').fill('synthetic:source-for-ui-test');
  await dialog.getByLabel('原文位置', { exact: true }).fill('合成测试材料 第 2 页');
  await dialog.getByLabel('原文摘录', { exact: true }).fill('合成原文摘录，仅用于测试，不是学术事实。');
  await dialog.getByRole('button', { name: '保存这条材料' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '添加原文摘录或观察' }).click();
  dialog = page.getByRole('dialog', { name: '添加材料', exact: true });
  await dialog.getByLabel('材料类型', { exact: true }).selectOption('reader-observation');
  await expect(dialog.getByLabel('原文来源 URL 或学术标识')).toHaveCount(0);
  await dialog.getByLabel('我的观察', { exact: true }).fill('合成个人观察：我还没有决定如何解释。');
  await dialog.getByRole('button', { name: '保存这条材料' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const saved = (await records(page))[0];
  expect(saved.evidence.map((item: any) => item.provenance)).toEqual(['original-excerpt', 'reader-observation']);
  expect(saved.evidence.every((item: any) => !item.target)).toBe(true);
  expect(saved.evidence[0].source).toEqual({ identity: 'synthetic:source-for-ui-test', locator: '合成测试材料 第 2 页', version: null });
  expect(saved.evidence[1].source).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'w4-question-narrow');
  await page.locator('.exploration-evidence').first().scrollIntoViewIfNeeded();
  await capture(page, 'w4-evidence-narrow');
});

test('editing draft survives internal navigation and browser Back; cancellation discards it', async ({ page }) => {
  await createSynthetic(page);
  await page.getByRole('button', { name: '修改问题与下一步' }).click();
  await page.getByLabel('尚不确定的地方', { exact: true }).fill('合成未保存草稿：从书架返回后还在。');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '书架', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goBack();
  await expect(page.getByLabel('尚不确定的地方', { exact: true })).toHaveValue('合成未保存草稿：从书架返回后还在。');
  expect((await records(page))[0].unknowns).toBe('');
  await page.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  await page.getByRole('button', { name: '修改问题与下一步' }).click();
  await expect(page.getByLabel('尚不确定的地方', { exact: true })).toHaveValue('');
});

test('two-tab conflict preserves both alternatives and saves the losing draft separately', async ({ page, context }) => {
  await createSynthetic(page);
  const second = await context.newPage();
  await second.goto(page.url());
  await page.getByRole('button', { name: '修改问题与下一步' }).click();
  await second.getByRole('button', { name: '修改问题与下一步' }).click();
  await page.getByLabel('我的解释', { exact: true }).fill('合成测试：第一个页面已保存的解释。');
  await second.getByLabel('我的解释', { exact: true }).fill('合成测试：第二个页面仍保留的解释。');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  await second.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('另一处已更新');
  await second.getByText('查看另一处保存的版本', { exact: true }).click();
  await expect(second.getByLabel('另一处保存的探索')).toHaveValue(/第一个页面已保存/);
  await expect(second.getByLabel('我的解释', { exact: true })).toHaveValue('合成测试：第二个页面仍保留的解释。');
  await second.getByLabel('我的解释', { exact: true }).fill('合成测试：第二个页面冲突后继续改写的解释。');
  await expect(second.getByRole('alert')).toHaveCount(0);
  await second.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('另一处已更新');
  await second.getByRole('button', { name: '将我的草稿另存为新探索' }).click();
  await expect(second.getByRole('heading', { level: 1 })).toHaveText(title);
  const saved = await records(second);
  expect(saved).toHaveLength(2);
  expect(saved.map((item: any) => item.interpretation).sort()).toEqual(['合成测试：第一个页面已保存的解释。', '合成测试：第二个页面冲突后继续改写的解释。'].sort());
});

test('missing anchors and notes preserve snapshots; failed save offers selectable draft recovery', async ({ page }) => {
  await createSynthetic(page);
  const id = (await records(page))[0].id;
  await page.evaluate(async id => {
    const modulePath = '/src/records/store.ts';
    const { personalStore } = await import(modulePath);
    const record = await personalStore.get('explorations', id);
    await personalStore.saveExploration({ ...record, evidence: [{
      id: crypto.randomUUID(), provenance: 'guide-excerpt', text: '合成孤立摘录：链接缺失也保留这段快照。',
      target: { guideId: 'synthetic-unavailable', revision: 9, unitId: 'u01' }, sources: [], relatedNoteId: crypto.randomUUID(),
    }] }, record.recordRevision);
  }, id);
  await expect(page.getByText('对应导读版本或章节暂不可用；已保存的文字仍保留。')).toBeVisible();
  await expect(page.getByText('关联笔记已不可用；此处的摘录和批注仍完整保留。')).toBeVisible();
  await page.getByRole('button', { name: '修改问题与下一步' }).click();
  await page.getByLabel('我的解释', { exact: true }).fill('合成失败恢复草稿，不能丢失。');
  await page.evaluate(async () => {
    const modulePath = '/src/records/store.ts';
    const { personalStore } = await import(modulePath);
    personalStore.saveExploration = async () => { throw new DOMException('Synthetic quota test', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('未能保存');
  await expect(page.getByLabel('我的解释', { exact: true })).toHaveValue('合成失败恢复草稿，不能丢失。');
  await page.getByText('复制草稿以便恢复', { exact: true }).click();
  await expect(page.getByLabel('可恢复的探索草稿')).toHaveValue(/合成失败恢复草稿/);
  await page.getByLabel('可恢复的探索草稿').focus();
  expect(await page.getByLabel('可恢复的探索草稿').evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart > 0)).toBe(true);
  expect((await records(page))[0].interpretation).toBe('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'w4-save-error-narrow');
});
