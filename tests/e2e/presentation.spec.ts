import { test, expect, type Locator } from '@playwright/test';

// Public reviewed content only: the talk outline prepared from one guide revision.
// No personal records, AI service or external network is involved.
const talk = '/present/multi-agent-communication-survey/2';
const screenSize = (locator: Locator) => locator.evaluate(node => parseFloat(getComputedStyle(node).fontSize) * ((node as SVGGraphicsElement).getScreenCTM()?.a ?? 0));

test('the talk page opens with the whole mind map, then a map that follows the talk as it scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/library?article=multi-agent-communication-survey');
  await page.locator('#present-multi-agent-communication-survey').click();
  await expect(page).toHaveURL(new RegExp(`${talk}$`));
  await expect(page.locator('.talk-meta')).toContainText('12 分钟');
  // No slide mode.
  await expect(page.getByRole('button', { name: /开始讲述/ })).toHaveCount(0);
  // The overview shows every branch, stop and key term at reading size, and the order and time of the talk.
  const overview = page.locator('.talk-overview svg.is-overview');
  await expect(overview.locator('.node-root text')).toHaveText('通信综述');
  await expect(overview.locator('.node-part')).toHaveCount(3);
  await expect(overview.locator('.node-stop')).toHaveCount(7);
  expect(await overview.locator('.node-point').count()).toBeGreaterThan(20);
  expect(await screenSize(overview.locator('.node-point text').first())).toBeGreaterThanOrEqual(13);
  await expect(page.locator('.talk-route li')).toHaveCount(5);
  // Times stay in the header total only: no per-section times on the route, the map or the section headings.
  for (const text of [await page.locator('.talk-route').innerText(), ...await page.locator('.stop-kicker').allInnerTexts(), ...await overview.locator('text').allTextContents()]) expect(text).not.toMatch(/[′″]|分钟|约 \d/);

  // At the opening the following map shows the trunk only.
  const follow = page.locator('.talk-story-map svg.is-stage');
  await page.locator('#opening').scrollIntoViewIfNeeded();
  await expect(follow.locator('.node-part')).toHaveCount(3);
  await expect(follow.locator('.node-stop')).toHaveCount(0);

  // Choosing a stop on the overview scrolls the story there; the following map opens that branch only and lights the stop.
  await overview.getByRole('link', { name: '架构：谁能连' }).click();
  await expect(page).toHaveURL(/#architecture$/);
  await expect(page.locator('#architecture')).toBeInViewport();
  await expect(follow.locator('.node-stop')).toHaveCount(3);
  await expect(follow.locator('.node-stop.is-current text')).toHaveText('架构：谁能连');
  await expect(follow.locator('.node-point')).toHaveCount(5);
  await expect(follow.locator('.node-part.is-dim')).toHaveCount(2);
  await page.waitForTimeout(700);
  expect(await screenSize(follow.locator('.node-stop text').first())).toBeGreaterThanOrEqual(15);

  // Scrolling on to the next branch changes the branch the map shows.
  await page.locator('#internal').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('strategy')!.scrollIntoView({ block: 'start' }));
  await expect(follow.locator('.node-stop.is-current text')).toHaveText('策略：何时说');
  await expect(follow.locator('.node-stop')).toHaveCount(2);
  // At the closing every branch is open.
  await page.evaluate(() => document.getElementById('closing')!.scrollIntoView({ block: 'start' }));
  await expect(follow.locator('.node-stop')).toHaveCount(7);
  await expect(page).toHaveURL(/#closing$/);
});

test('each stop carries its figure, sources and the guide section, and no speaker notes', async ({ page }) => {
  await page.goto(`${talk}#architecture`);
  const architecture = page.locator('#architecture');
  await expect(architecture).toBeInViewport();
  await expect(architecture.locator('.stop-figure img')).toHaveJSProperty('complete', true);
  await expect(architecture.locator('.stop-points dt')).toHaveText(['扁平', '层级', '团队', '社会', '混合']);
  await expect(architecture.locator('.stop-sources a').first()).toHaveAttribute('href', /^https:\/\/arxiv\.org\//);
  // The screen is shared with the audience: it shows display material only, no speaker notes.
  await expect(page.getByText('讲稿提示')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await architecture.getByRole('button', { name: '导读原文' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.talk-guide-prose')).toContainText('扁平架构');
  await dialog.getByRole('link', { name: '在阅读页打开 →' }).click();
  await expect(page).toHaveURL(/\/read\/multi-agent-communication-survey\/2#architecture$/);
});

test('a phone reads the talk as an outline and flowing stops without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(talk);
  await expect(page.locator('.talk-outline-tree')).toBeVisible();
  await expect(page.locator('.talk-overview svg.is-overview')).toHaveCount(0);
  await expect(page.locator('.talk-story-map')).toBeHidden();
  await page.locator('.talk-outline-tree button', { hasText: '两层七个维度' }).click();
  await expect(page.locator('#seven')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.locator('#seven .stop-table td').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
});

test('a guide without a talk outline says so and offers the guide instead', async ({ page }) => {
  await page.goto('/present/transformer/5');
  await expect(page.getByRole('heading', { name: '这篇导读还没有汇报稿' })).toBeVisible();
  await page.getByRole('link', { name: '先读导读 →' }).click();
  await expect(page).toHaveURL(/\/read\/transformer\/5$/);
  await page.goto('/library?article=transformer');
  await expect(page.locator('#present-transformer')).toHaveCount(0);
});
