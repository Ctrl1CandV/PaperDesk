import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { explorationRevisionData, explorationRevisionHash, type ExplorationRevision } from '../../shared/exploration-sync.mjs';

// Isolated synthetic browser profiles share only this in-memory project-file service.
// These tests never access the normal service or an existing browser profile.
function project() {
  const revisions = new Map<string, Map<string, ExplorationRevision>>();
  const offline = new WeakSet<BrowserContext>();
  let afterWrite: (() => Promise<void>) | undefined;
  const entry = (id: string) => {
    const rows = revisions.get(id) ?? new Map<string, ExplorationRevision>();
    const parents = new Set([...rows.values()].flatMap(row => row.parents));
    return { explorationId: id, revisionHashes: [...rows.keys()].sort(), heads: [...rows].filter(([hash]) => !parents.has(hash)).map(([hash, row]) => ({ hash, parents: row.parents, record: row.record })).sort((a, b) => a.hash.localeCompare(b.hash)) };
  };
  async function add(input: { explorationId: string; parents: string[]; record: any }) {
    const revision = explorationRevisionData(input), hash = await explorationRevisionHash(revision);
    const rows = revisions.get(input.explorationId) ?? new Map<string, ExplorationRevision>();
    rows.set(hash, revision); revisions.set(input.explorationId, rows); return hash;
  }
  async function connect(context: BrowserContext) {
    await context.route('**/api/ai/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"SYNTHETIC offline model"}' }));
    await context.route('**/api/workspace/**', async route => {
      const url = new URL(route.request().url()), json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (offline.has(context)) return json({ message: 'SYNTHETIC file service offline' }, 503);
      if (url.pathname.endsWith('/status')) return json({ csrfToken: 'synthetic-workspace-token' });
      if (route.request().method() === 'GET') return json({ format: 'paperdesk-exploration-workspace', schemaVersion: 1, explorations: [...revisions.keys()].sort().map(entry) });
      const input = route.request().postDataJSON();
      const revision = explorationRevisionData(input), hash = await explorationRevisionHash(revision), existing = revisions.get(input.explorationId)?.has(hash);
      if (!existing && JSON.stringify(entry(input.explorationId).heads.map(head => head.hash).sort()) !== JSON.stringify([...input.parents].sort())) return json({ code: 'workspace_conflict', message: 'SYNTHETIC changed' }, 409);
      await add(input); if (afterWrite) { const work = afterWrite; afterWrite = undefined; await work(); }
      return json(entry(input.explorationId));
    });
  }
  return { revisions, offline, entry, add, connect, onNextWrite: (work: () => Promise<void>) => { afterWrite = work; } };
}
async function force(page: Page) { await page.evaluate(async () => (await import('/src/records/exploration-sync.ts')).syncExplorations()); }
async function records(page: Page) { return page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.list('explorations')); }
async function seed(page: Page) {
  await page.goto('/explore');
  return page.evaluate(async () => {
    const { personalStore } = await import('/src/records/store.ts'); const { emptyResearchState } = await import('/shared/research-contract.mjs');
    return personalStore.saveExploration({ id: crypto.randomUUID(), title: 'SYNTHETIC 跨电脑方向', question: 'SYNTHETIC 问题与过程要完整保留。', origin: 'reader', status: 'exploring', interpretation: '', unknowns: '', nextAction: null, evidence: [], research: { ...emptyResearchState(), relatedGuides: [{ guideId: 'agentbench', revision: 1 }], notebook: { versions: [{ version: 1, author: 'reader', body: '# SYNTHETIC 工作稿\n\nSYNTHETIC 尚未验证的想法。', note: 'SYNTHETIC 第一版', createdAt: new Date().toISOString() }] } } }, null);
  });
}
async function edit(page: Page, id: string, question: string) {
  await page.evaluate(async ({ id, question }) => {
    const { personalStore } = await import('/src/records/store.ts'); const record = (await personalStore.get('explorations', id))!;
    await personalStore.saveExploration({ ...record, question }, record.recordRevision);
  }, { id, question });
}

test('existing browser exploration migrates to files and a second computer loads its full working paper and links', async ({ page, context, browser }) => {
  const files = project(); await files.connect(context); const original = await seed(page); await force(page);
  expect(files.entry(original.id).heads).toHaveLength(1);
  await expect(page.getByText('1 个探索已保存到项目文件，可随 Git 提交；另一台电脑拉取后会载入。')).toBeVisible();
  const clone = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  try {
    await files.connect(clone); const other = await clone.newPage(); await other.goto('/explore'); await force(other);
    const imported = (await records(other))[0]; expect(imported.id).toBe(original.id); expect(imported.research?.notebook).toEqual(original.research?.notebook); expect(imported.research?.relatedGuides).toEqual(original.research?.relatedGuides);
    await edit(other, original.id, 'SYNTHETIC 第二台电脑的修改'); await force(other);
    await page.getByRole('button', { name: '检查项目更新', exact: true }).click();
    await expect.poll(async () => (await records(page))[0].question).toBe('SYNTHETIC 第二台电脑的修改');
    const size = files.revisions.get(original.id)!.size; await force(page); await force(other); expect(files.revisions.get(original.id)!.size).toBe(size);
    await mkdir('.cache/screenshots/exploration-sync', { recursive: true }); await page.screenshot({ path: '.cache/screenshots/exploration-sync/saved-desktop.png' });
  } finally { await clone.close(); }
});

test('concurrent edits are compared and the unchosen browser alternative remains in immutable project history', async ({ page, context, browser }) => {
  const files = project(); await files.connect(context); const original = await seed(page); await force(page);
  const clone = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  try {
    await files.connect(clone); const other = await clone.newPage(); await other.goto('/explore'); await force(other);
    files.offline.add(clone); await edit(other, original.id, 'SYNTHETIC 浏览器中的独立发现'); await force(other);
    await expect(other.getByRole('button', { name: '重试项目保存' })).toBeVisible();
    await edit(page, original.id, 'SYNTHETIC 项目中的另一条发现'); await force(page);
    files.offline.delete(clone); await force(other);
    await other.getByRole('button', { name: /比较「SYNTHETIC 跨电脑方向」/ }).click();
    await expect(other.getByRole('dialog')).toContainText('SYNTHETIC 浏览器中的独立发现'); await expect(other.getByRole('dialog')).toContainText('SYNTHETIC 项目中的另一条发现');
    await mkdir('.cache/screenshots/exploration-sync', { recursive: true }); await other.screenshot({ path: '.cache/screenshots/exploration-sync/conflict-desktop.png' });
    await other.setViewportSize({ width: 390, height: 844 }); await other.screenshot({ path: '.cache/screenshots/exploration-sync/conflict-narrow.png' }); expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.getByRole('button', { name: '采用此项目版本', exact: true }).click();
    await expect(other.getByRole('dialog')).toHaveCount(0); expect((await records(other))[0].question).toBe('SYNTHETIC 项目中的另一条发现');
    expect([...files.revisions.get(original.id)!.values()].some(value => value.record?.question === 'SYNTHETIC 浏览器中的独立发现')).toBe(true);
    const size = files.revisions.get(original.id)!.size; await force(other); expect(files.revisions.get(original.id)!.size).toBe(size);
  } finally { await clone.close(); }
});

test('deletion propagates as a tombstone and clearing browser storage pauses instead of deleting project data', async ({ page, context, browser }) => {
  const files = project(); await files.connect(context); const original = await seed(page); await force(page);
  const clone = await browser.newContext({ baseURL: 'http://127.0.0.1:4174' });
  try {
    await files.connect(clone); const other = await clone.newPage(); await other.goto('/explore'); await force(other);
    await page.evaluate(async id => { const { personalStore } = await import('/src/records/store.ts'); const record = (await personalStore.get('explorations', id))!; await personalStore.deleteExploration(id, record.recordRevision); }, original.id); await force(page);
    expect(files.entry(original.id).heads[0].record).toBeNull(); await force(other); expect(await records(other)).toEqual([]);
    await force(page); expect(files.entry(original.id).heads[0].record).toBeNull();
    // A separate synthetic direction demonstrates that clearAll is local-only.
    const fresh = await seed(other); await force(other); await force(page);
    await page.evaluate(async () => (await import('/src/records/store.ts')).personalStore.clearAll()); await force(page);
    await expect(page.getByRole('button', { name: '恢复项目同步' })).toBeVisible(); expect(await records(page)).toEqual([]); expect(files.entry(fresh.id).heads[0].record).not.toBeNull();
    await page.getByRole('button', { name: '恢复项目同步' }).click(); await expect.poll(async () => (await records(page)).length).toBe(1);
  } finally { await clone.close(); }
});

test('a new Git branch arriving during conflict resolution is not silently included in the choice', async ({ page, context }) => {
  const files = project(); await files.connect(context); const original = await seed(page); await force(page);
  const base = files.entry(original.id).heads[0];
  files.offline.add(context); await edit(page, original.id, 'SYNTHETIC 本机未上传的变化'); await force(page);
  await files.add({ explorationId: original.id, parents: [base.hash], record: { ...original, question: 'SYNTHETIC 项目分支甲' } }); files.offline.delete(context); await force(page);
  await page.getByRole('button', { name: /比较「SYNTHETIC 跨电脑方向」/ }).click();
  files.onNextWrite(async () => { await files.add({ explorationId: original.id, parents: [base.hash], record: { ...original, question: 'SYNTHETIC 写入中到达的分支乙' } }); });
  await page.getByRole('button', { name: '采用此项目版本', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('新的分支'); expect((await records(page))[0].question).toBe('SYNTHETIC 本机未上传的变化'); expect(files.entry(original.id).heads).toHaveLength(2);
});

test('checking out an older nonempty project branch never silently rolls back a newer browser baseline', async ({ page, context }) => {
  const files = project(); await files.connect(context); const original = await seed(page); await force(page);
  const ancestor = files.entry(original.id).heads[0].hash;
  await edit(page, original.id, 'SYNTHETIC 浏览器已经同步过的新结果'); await force(page);
  const tip = files.entry(original.id).heads[0].hash; expect(tip).not.toBe(ancestor);
  files.revisions.get(original.id)!.delete(tip); await force(page);
  await expect(page.getByLabel('探索项目保存')).toContainText('较旧的 Git 分支');
  expect((await records(page))[0].question).toBe('SYNTHETIC 浏览器已经同步过的新结果'); expect(files.entry(original.id).heads[0].hash).toBe(ancestor);
});
