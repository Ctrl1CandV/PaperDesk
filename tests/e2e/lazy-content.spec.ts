import { test, expect } from '@playwright/test';

// The isolated browser origin contains synthetic personal records only.
const materialRequest = (url: string) => /\/content\/guides\/[^?]+\.(md|json)$/.test(new URL(url).pathname);

test('library orientation, saved-target labels and related links do not fetch any guide bodies', async ({ page }) => {
  const downloaded: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'fetch' && materialRequest(request.url())) downloaded.push(new URL(request.url()).pathname); });
  await page.goto('/library?article=rag');
  await expect(page.locator('#orientation-title')).toContainText('RAG');
  expect(downloaded).toEqual([]);
  await page.locator('#choose-agentbench').click();
  await expect(page.locator('#orientation-title')).toContainText('AgentBench');
  expect(downloaded).toEqual([]);
  await page.locator('#start-agentbench').click();
  await expect(page.locator('.prose')).toContainText('AgentBench');
  expect(downloaded.filter(url => url.endsWith('.md'))).toHaveLength(1);
  expect(downloaded.filter(url => url.endsWith('.json'))).toHaveLength(1);
  // Markdown relationship rendering must not indirectly load other articles.
  expect(downloaded.every(url => url.includes('agentbench'))).toBe(true);
});

test('a late body cannot replace the newly selected article and retained anchors still resolve', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/content\/guides\/rag\.md(?:\?|$)/, async route => {
    if (route.request().resourceType() !== 'fetch') return route.continue();
    await delayed;
    await route.continue().catch(() => {});
  });
  await page.goto('/read/rag/1');
  await expect(page.getByRole('status')).toContainText('正在读取这篇导读');
  await page.evaluate(async () => (await import('/src/app/navigation.tsx')).navigate('/read/helm/1#u02'));
  await expect(page.locator('.prose')).toContainText('HELM');
  release();
  await expect(page).toHaveURL(/\/read\/helm\/1#u02$/);
  await expect(page.locator('#u02')).toBeFocused();
  await expect(page.locator('.article-labels')).toContainText('导读修订 1');
  const label = await page.evaluate(async () => {
    const { contentRepository } = await import('/src/content/repository.ts');
    return contentRepository.getSummary('helm', 1)?.units.find(unit => unit.id === 'u02')?.heading;
  });
  expect(label).toBeTruthy();
});

test('failed and mismatched content fail visibly, retry works, and article cache is bounded', async ({ page }) => {
  let failures = 0;
  await page.route(/\/content\/guides\/rag\.md(?:\?|$)/, async route => {
    if (route.request().resourceType() !== 'fetch') return route.continue();
    if (!failures++) await route.fulfill({ status: 200, contentType: 'text/plain', body: 'SYNTHETIC tampered body' });
    else await route.continue();
  });
  await page.goto('/read/rag/1');
  await expect(page.getByRole('alert')).toContainText('内容版本校验不一致');
  await page.getByRole('button', { name: '重试读取' }).click();
  await expect(page.locator('.prose')).toContainText('RAG');
  await page.getByRole('link', { name: '← 阅读书架', exact: true }).click();
  const downloaded: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'fetch' && materialRequest(request.url())) downloaded.push(new URL(request.url()).pathname); });
  await page.evaluate(async () => {
    const { contentRepository } = await import('/src/content/repository.ts');
    for (const entry of contentRepository.list().filter(entry => entry.guideId !== 'rag').slice(0, 9)) await contentRepository.get(entry.guideId, entry.revision);
    await contentRepository.get('rag', 1);
  });
  expect(downloaded.filter(url => url.endsWith('/rag.md'))).toHaveLength(1);
  expect(downloaded.filter(url => url.endsWith('.md'))).toHaveLength(10);
});
