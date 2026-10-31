import { test, expect } from '@playwright/test';

test('venue references prefer CCF A/B and use a dated CAS major category where appropriate', async ({ page }) => {
  const cases = [
    ['agent-survey', 'CCF-B', '2026目录'],
    ['llm-survey', 'CCF-B', '2026目录'],
    ['instructgpt', 'CCF-A', '2026目录'],
    ['transformer', 'CCF-A', '2026目录'],
    ['react', 'CCF-A', '2026目录'],
  ];
  for (const [id, label, edition] of cases) {
    await page.goto(`/library?article=${id}`);
    const reference = page.locator('.orientation-ranking a');
    await expect(reference).toHaveCount(1);
    await expect(reference).toContainText(label);
    await expect(reference).toContainText(edition);
    await expect(reference).toHaveAttribute('href', /^https:\/\//);
    await expect(reference).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('.orientation-prose p')).toHaveCount(3);
  }
  // Guides taken off the shelf keep their ranking for exact routes and saved references.
  const archived = await page.evaluate(async () => {
    const { venueRanking } = await import('/src/library/venueRankings.ts');
    const { contentRepository } = await import('/src/content/repository.ts');
    return ['streamingllm', 'concept-drift-survey'].map(id => { const ranking = venueRanking(contentRepository.getSummary(id, contentRepository.currentRevision(id)!)!.metadata); return [id, ranking?.label, ranking?.edition, ranking?.description]; });
  });
  expect(archived.map(item => item.slice(0, 3))).toEqual([['streamingllm', 'CCF-A', '2026目录'], ['concept-drift-survey', 'CAS-1', '2025大类']]);
  expect(archived[1][3]).toMatch(/中科院期刊分区 1 区/);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/library?article=agent-survey');
  await expect(page.locator('.orientation-ranking')).toContainText('CCF-B');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('unknown venues and preprints stay blank rather than inheriting a ranking from a title mention', async ({ page }) => {
  for (const id of ['helm', 'multi-agent-communication-survey']) {
    await page.goto(`/library?article=${id}`);
    await expect(page.locator('#orientation-title')).toBeVisible();
    await expect(page.locator('.orientation-ranking')).toHaveCount(0);
  }
  const unknown = await page.evaluate(async () => {
    const { venueRanking } = await import('/src/library/venueRankings.ts');
    const { contentRepository } = await import('/src/content/repository.ts');
    const metadata = structuredClone(contentRepository.getSummary('instructgpt', 2)!.metadata);
    const examples = ['Synthetic NeurIPS-related venue', 'NeurIPS Workshop on Synthetic Testing', 'ICLR Workshops'];
    const results = examples.map(venue => { metadata.orientation!.bibliography.venue = venue; return venueRanking(metadata); });
    metadata.orientation!.bibliography.venue = 'NeurIPS 2022 · Advances in Neural Information Processing Systems 35';
    metadata.orientation!.bibliography.publicationKind = 'preprint';
    results.push(venueRanking(metadata));
    metadata.orientation!.bibliography.venue = 'Frontiers of Computer Science and Technology';
    metadata.orientation!.bibliography.publicationKind = 'journal';
    results.push(venueRanking(metadata));
    return results;
  });
  expect(unknown).toEqual([undefined, undefined, undefined, undefined, undefined]);
});
