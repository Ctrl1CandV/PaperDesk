import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { AiSettings, AiStatus, AiTurn } from '../../src/assistant/api';

// All connection states, URLs and records are synthetic. Every AI request is
// intercepted before Vite's proxy; any other origin is blocked, including 4176.
test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });

const AUTHORIZATION_URL = 'https://auth.openai.com/api/accounts/authorize?synthetic=paperdesk-fixture';
const initialStatus = (): AiStatus => ({
  configured: true, model: 'synthetic-api-model', searchAvailable: false,
  csrfToken: 'synthetic-csrf-fixture', provider: 'api', apiConfigured: true,
  chatgpt: { connected: false, loginPending: false, needsLogin: false, fallbackToApi: true,
    availability: { state: 'unknown', checkedAt: null, model: null, checking: false, lastError: null } },
});

async function syntheticService(context: BrowserContext, options: {
  connected?: boolean; authorizationUrl?: string; connectError?: string; settingsConflict?: boolean; settingsError?: boolean; modelsError?: boolean; completedHistory?: boolean;
  fallbackToApi?: boolean; legacyFallback?: boolean; apiConfigured?: boolean; fallbackAnswer?: boolean; replacementAnswer?: boolean;
  connectGate?: Promise<void>; settingsGate?: Promise<void>;
} = {}) {
  let revision = 1;
  let settings: AiSettings = { revision: 'synthetic-1', api: { baseURL: 'https://api.example.invalid/v1', modelId: 'synthetic-api-model', apiKeyConfigured: options.apiConfigured ?? true }, chatgpt: { modelId: '', reasoningEffort: '', fallbackToApi: options.fallbackToApi ?? true }, search: { apiKeyConfigured: false } };
  const conversation = { id: '11111111-1111-4111-8111-111111111111', title: '合成示例：理解持续行动', guideId: 'agent-survey', revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' };
  const completedTurn: AiTurn = {
    id: '22222222-2222-4222-8222-222222222222', question: '合成问题：为什么把 Agent 理解为持续行动的系统？',
    answer: '这是用于界面检查的**合成回答**。可以把重点放在“观察 → 选择 → 行动”的连续过程：一次输出之后，系统还需要根据环境变化决定下一步。[L1]\n\n读这一节时，可以继续追问：\n\n- 系统能观察到什么？\n- 哪些行动被允许？\n- 结果如何影响下一次选择？\n\n这些问题帮助区分系统的行为方式与具体采用的模型。',
    status: 'complete', context: { synthetic: true, provider: 'chatgpt', model: 'synthetic-reading' }, createdAt: '2026-01-01T00:00:00.000Z',
    sources: [{ id: 'L1', kind: 'guide', title: 'Agent 的基本视角：主体、环境与行动', guideId: 'agent-survey', revision: 2, unitId: 'u01', text: '合成引用摘录：这一条仅用于验证来源展开与章节定位，不代表真实模型生成的阅读结论。' }],
  };
  let savedTurns: AiTurn[] = options.completedHistory ? [completedTurn] : [];
  const state = {
    status: initialStatus(), statusRequests: 0, connectRequests: 0, cancelRequests: 0, modelRequests: 0,
    modelRefreshes: [] as boolean[], settingsRequests: 0, statusFailures: 0,
    disconnectRequests: 0, providers: [] as string[], unexpected: [] as string[], external: [] as string[],
    apiSaves: [] as Record<string, unknown>[], searchSaves: [] as Record<string, unknown>[], modelSaves: [] as Record<string, unknown>[], fallbackSaves: [] as Record<string, unknown>[], askRequests: [] as Record<string, unknown>[], settingsConflict: options.settingsConflict ?? false,
  };
  state.status.apiConfigured = options.apiConfigured ?? true;
  state.status.chatgpt.fallbackToApi = options.fallbackToApi ?? true;
  if (options.connected) state.status = {
    ...state.status, provider: 'chatgpt', model: null,
    chatgpt: { ...state.status.chatgpt, connected: true, loginPending: false, needsLogin: false },
  };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4174') {
      state.external.push(url.origin); await route.abort(); return;
    }
    if (!url.pathname.startsWith('/api/ai')) { await route.continue(); return; }
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data, (key, value) => options.legacyFallback && !state.fallbackSaves.length && key === 'fallbackToApi' ? undefined : value) });
    const path = url.pathname.slice('/api/ai'.length);
    if (path === '/status' && request.method() === 'GET') {
      state.statusRequests++;
      if (state.statusFailures > 0) { state.statusFailures--; await json({ error: '合成测试：状态读取暂时失败。' }, 503); return; }
      await json(state.status); return;
    }
    expect(request.headers()['x-paperdesk-token']).toBe('synthetic-csrf-fixture');
    if (path === '/settings' && request.method() === 'GET') { state.settingsRequests++; await options.settingsGate; await json(options.settingsError ? { error: '合成测试：设置服务暂不可用，请重试。' } : settings, options.settingsError ? 503 : 200); return; }
    if (path === '/chatgpt/models' && request.method() === 'GET') {
      state.modelRequests++;
      state.modelRefreshes.push(url.searchParams.get('refresh') === '1');
      if (options.modelsError) { await json({ error: '合成测试：模型目录暂不可用。' }, 503); return; }
      await json({ models: [{ id: 'synthetic-reading', name: '阅读模型（合成）' }, { id: 'synthetic-reasoning', name: '推理模型（合成）', reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultReasoningEffort: 'medium' }], selectedModelId: settings.chatgpt.modelId }); return;
    }
    if (path === '/settings/api' && request.method() === 'POST') {
      const input = request.postDataJSON(); state.apiSaves.push(input);
      if (state.settingsConflict) { await json({ error: '合成测试：配置已变，请重新载入。' }, 409); return; }
      settings = { ...settings, revision: `synthetic-${++revision}`, api: { baseURL: input.baseURL, modelId: input.modelId, apiKeyConfigured: settings.api.apiKeyConfigured || Boolean(input.apiKey) } };
      state.status = { ...state.status, apiConfigured: true, ...(state.status.provider === 'api' ? { configured: true, model: input.modelId } : {}) };
      await json({ settings, status: state.status }); return;
    }
    if (path === '/settings/search' && request.method() === 'POST') {
      const input = request.postDataJSON(); state.searchSaves.push(input);
      if (state.settingsConflict) { await json({ error: '合成测试：配置已变，请重新载入。' }, 409); return; }
      settings = { ...settings, revision: `synthetic-${++revision}`, search: { apiKeyConfigured: true } };
      state.status = { ...state.status, searchAvailable: true };
      await json({ settings, status: state.status }); return;
    }
    if (path === '/settings/chatgpt' && request.method() === 'POST') {
      const input = request.postDataJSON(); state.modelSaves.push(input);
      if (state.settingsConflict) { await json({ error: '合成测试：配置已变，请重新载入。' }, 409); return; }
      settings = { ...settings, revision: `synthetic-${++revision}`, chatgpt: { ...settings.chatgpt, modelId: input.modelId, reasoningEffort: input.reasoningEffort ?? '' } };
      await json({ settings, status: state.status }); return;
    }
    if (path === '/settings/fallback' && request.method() === 'POST') {
      const input = request.postDataJSON(); state.fallbackSaves.push(input);
      if (state.settingsConflict) { await json({ error: '合成测试：配置已变，请重新载入。' }, 409); return; }
      settings = { ...settings, revision: `synthetic-${++revision}`, chatgpt: { ...settings.chatgpt, fallbackToApi: input.enabled } };
      state.status = { ...state.status, chatgpt: { ...state.status.chatgpt, fallbackToApi: input.enabled } };
      await json({ settings, status: state.status }); return;
    }
    if (path === '/conversations' && request.method() === 'GET') { await json({ conversations: savedTurns.length ? [conversation] : [] }); return; }
    if (path === `/conversations/${conversation.id}` && request.method() === 'GET') { await json({ conversation, turns: savedTurns }); return; }
    if (path === '/ask' && request.method() === 'POST' && options.replacementAnswer) {
      const input = request.postDataJSON(); state.askRequests.push(input);
      const prefix = '合成前轮内容：先明确研究对象。\n\n';
      const answer = prefix + '合成校正结论：行动之后继续观察环境。[L1]';
      const finalTurn: AiTurn = { ...completedTurn, question: input.question, answer };
      savedTurns = [finalTurn];
      const events = [
        { type: 'accepted', conversationId: conversation.id, turnId: finalTurn.id },
        { type: 'sources', sources: finalTurn.sources },
        { type: 'delta', text: prefix }, { type: 'delta', text: '合成临时片段：尚待完成快照校正。[L1]' },
        { type: 'replace', text: answer }, { type: 'done', turn: finalTurn },
      ];
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' }); return;
    }
    if (path === '/ask' && request.method() === 'POST' && options.fallbackAnswer) {
      const input = request.postDataJSON(); state.askRequests.push(input);
      const previousAnswer = '合成订阅片段：这不是最终结论。[L3]\n<img src="https://example.invalid/synthetic-image">';
      const resetTurn: AiTurn = {
        id: completedTurn.id, question: input.question, answer: '', status: 'running', createdAt: completedTurn.createdAt,
        context: { synthetic: true, provider: 'api', model: 'synthetic-api-model', fallback: { reason: 'subscription_quota', stage: 'answer', fromModel: 'synthetic-reading', previousAnswer, previousToolCount: 1 } },
        sources: [{ ...completedTurn.sources[0], id: 'L3' }, { id: 'W8', kind: 'web', title: '合成网页来源', url: 'https://example.invalid/synthetic-source', text: '合成网页摘录，仅验证编号保留。' }],
      };
      const answer = '合成 API 最终回答：请结合导读中的行动循环理解。[L3]';
      const finalTurn: AiTurn = { ...resetTurn, answer, status: 'complete' }; savedTurns = [finalTurn];
      const events = [
        { type: 'accepted', conversationId: conversation.id, turnId: resetTurn.id },
        { type: 'delta', text: previousAnswer }, { type: 'reset', turn: resetTurn },
        { type: 'delta', text: answer }, { type: 'done', turn: finalTurn },
      ];
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' }); return;
    }
    if (path === '/chatgpt/connect' && request.method() === 'POST') {
      state.connectRequests++;
      expect(request.postDataJSON()).toEqual({});
      if (options.connectError) { await json({ error: options.connectError }, 503); return; }
      state.status.chatgpt.loginPending = true;
      await options.connectGate;
      await json({ authorizationUrl: options.authorizationUrl ?? AUTHORIZATION_URL, expiresAt: '2099-01-01T00:00:00.000Z' }); return;
    }
    if (path === '/chatgpt/cancel' && request.method() === 'POST') {
      state.cancelRequests++; state.status.chatgpt.loginPending = false; await json(state.status); return;
    }
    if (path === '/chatgpt/disconnect' && request.method() === 'POST') {
      state.disconnectRequests++;
      state.status = { ...state.status, configured: false, model: null,
        chatgpt: { ...state.status.chatgpt, connected: false, loginPending: false, needsLogin: false } };
      await json(state.status); return;
    }
    if (path === '/provider' && request.method() === 'POST') {
      const { provider } = request.postDataJSON(); state.providers.push(provider);
      state.status = { ...state.status, provider, configured: provider === 'api' ? state.status.apiConfigured : state.status.chatgpt.connected,
        model: provider === 'api' ? 'synthetic-api-model' : null };
      await json(state.status); return;
    }
    state.unexpected.push(`${request.method()} ${path}`);
    await json({ error: 'Synthetic fixture rejects unexpected AI endpoint.' }, 500);
  });
  return {
    state,
    completeLogin() {
      state.status = { ...state.status, provider: 'chatgpt', configured: true, model: null,
        chatgpt: { ...state.status.chatgpt, connected: true, loginPending: false, needsLogin: false } };
    },
    assertIsolated() { expect(state.external).toEqual([]); expect(state.unexpected).toEqual([]); },
  };
}

async function blockPopups(page: Page) {
  await page.addInitScript(() => {
    (window as any).syntheticPopupAttempts = 0;
    window.open = () => { (window as any).syntheticPopupAttempts++; return null; };
  });
}
async function openSettings(page: Page) {
  await page.locator('.ai-provider-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'AI 设置', exact: true });
  await expect(dialog.getByRole('button', { name: '刷新状态', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'ChatGPT 订阅', exact: true }).click();
  return dialog;
}
async function openReader(page: Page) {
  await page.goto('/read/agent-survey/2#u01');
  if ((page.viewportSize()?.width ?? 1440) < 1100) await page.locator('#reader-ai-action').click();
  await expect(page.locator('.ai-provider-trigger')).toContainText('已');
}

test('synthetic official login handles blocked popup, polls to connected and renders desktop connection state', async ({ page, context }) => {
  const service = await syntheticService(context); await blockPopups(page); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
  const fallback = dialog.getByRole('link', { name: '打开 OpenAI 官方授权页面', exact: false });
  await expect(fallback).toHaveAttribute('href', AUTHORIZATION_URL);
  await expect(fallback).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(dialog.getByText('浏览器未打开新窗口。请通过官方授权链接继续。')).toBeVisible();
  expect(await page.evaluate(() => (window as any).syntheticPopupAttempts)).toBe(1);
  expect(service.state.connectRequests).toBe(1);
  const requestsBefore = service.state.statusRequests;
  service.completeLogin();
  await expect(dialog.getByRole('button', { name: '断开连接…', exact: true })).toBeVisible();
  expect(service.state.statusRequests).toBeGreaterThan(requestsBefore);
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 已连接');
  await expect(fallback).toHaveCount(0);
  expect(service.state.providers).toEqual([]);
  // No authorization URL, token or identity is rendered in this completed state.
  await mkdir('.cache/ai-settings-ui', { recursive: true });
  await page.screenshot({ path: '.cache/ai-settings-ui/desktop-connected.png', fullPage: false });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI 设置：ChatGPT · 已连接，联网关闭', exact: true })).toBeFocused();
  service.assertIsolated();
});

test('closing synthetic login settings keeps local status polling and recovers completed authorization', async ({ page, context }) => {
  const service = await syntheticService(context); await blockPopups(page); await openReader(page);
  await page.locator('.ai-composer textarea').fill('合成问题：授权后继续阅读。');
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '取消本次登录', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.ai-send')).toBeDisabled();
  await expect(page.getByText('正在等待 ChatGPT 授权。完成或取消这次登录后即可发送，问题草稿仍保留。')).toBeVisible();
  const requestsAfterClose = service.state.statusRequests;
  service.state.statusFailures = 1;
  service.completeLogin();
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 已连接');
  await expect(page.locator('.ai-send')).toBeEnabled();
  expect(service.state.statusRequests).toBeGreaterThan(requestsAfterClose);
  expect(service.state.cancelRequests).toBe(0);
  expect(service.state.connectRequests).toBe(1);
  expect(service.state.askRequests).toEqual([]);
  service.assertIsolated();
});

test('closing while authorization is being prepared still publishes pending status and recovers', async ({ page, context }) => {
  let release!: () => void;
  const connectGate = new Promise<void>(resolve => { release = resolve; });
  const service = await syntheticService(context, { connectGate }); await blockPopups(page); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
  await expect.poll(() => service.state.connectRequests).toBe(1);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(page.getByText('正在等待 ChatGPT 授权。完成或取消这次登录后即可发送，问题草稿仍保留。')).toBeVisible();
  service.completeLogin();
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 已连接');
  expect(service.state.cancelRequests).toBe(0);
  service.assertIsolated();
});

test('returning to the reader refreshes local authorization status without inference or a new login', async ({ page, context }) => {
  const service = await syntheticService(context); await openReader(page);
  service.completeLogin();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 已连接');
  expect(service.state.connectRequests).toBe(0);
  expect(service.state.modelRequests).toBe(0);
  expect(service.state.askRequests).toEqual([]);
  service.assertIsolated();
});

test('disconnect requires confirmation, keeps ChatGPT selected and changes to API only after explicit selection', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '断开连接…', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '断开 ChatGPT 连接', exact: true });
  expect(service.state.disconnectRequests).toBe(0);
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(dialog).toBeVisible();
  expect(service.state.disconnectRequests).toBe(0);
  await dialog.getByRole('button', { name: '断开连接…', exact: true }).click();
  await confirmation.getByRole('button', { name: '保留连接', exact: true }).click();
  expect(service.state.disconnectRequests).toBe(0);
  await dialog.getByRole('button', { name: '断开连接…', exact: true }).click();
  await confirmation.getByRole('button', { name: '确认断开连接', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(dialog.getByText('已断开 ChatGPT，对话仍保留。')).toBeVisible();
  expect(service.state.disconnectRequests).toBe(1);
  expect(service.state.status.provider).toBe('chatgpt');
  expect(service.state.providers).toEqual([]);
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 未连接');
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  expect(service.state.providers).toEqual([]);
  await dialog.getByRole('button', { name: '使用此 API', exact: true }).click();
  await expect(page.locator('.ai-provider-trigger')).toContainText('API · 已配置');
  expect(service.state.providers).toEqual(['api']);
  service.assertIsolated();
});

test('synthetic connect failure keeps question draft and never switches provider', async ({ page, context }) => {
  const service = await syntheticService(context, { connectError: '合成测试：授权暂不可用，请稍后重试。' });
  await blockPopups(page); await openReader(page);
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成测试：仍需保留的阅读问题。');
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('合成测试：授权暂不可用');
  await expect(dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('link', { name: '打开 OpenAI 官方授权页面', exact: false })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '向 AI 提问', exact: true })).toHaveValue('合成测试：仍需保留的阅读问题。');
  expect(service.state.providers).toEqual([]);
  service.assertIsolated();
});

test('synthetic connected settings remain reachable in the narrow reader dialog', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  const dialog = await openSettings(page);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  await expect(dialog.getByRole('button', { name: '断开连接…', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: '模型', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: '模型', exact: true }).selectOption('synthetic-reasoning');
  await dialog.getByRole('combobox', { name: '思考强度', exact: true }).selectOption('low');
  await dialog.getByRole('combobox', { name: '思考强度', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel('Base URL', { exact: true })).toHaveCount(0);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await mkdir('.cache/ai-settings-ui', { recursive: true });
  await page.screenshot({ path: '.cache/ai-settings-ui/narrow-connected.png', fullPage: false });
  await mkdir('.cache/chatgpt-reliability-ui', { recursive: true });
  await dialog.screenshot({ path: '.cache/chatgpt-reliability-ui/narrow-thinking.png' });
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await expect(dialog.getByLabel('Base URL', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeInViewport();
  await page.screenshot({ path: '.cache/ai-settings-ui/narrow-api.png', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#reader-assistant')).toBeVisible();
  await expect(page.locator('.ai-provider-trigger')).toBeFocused();
  await page.screenshot({ path: '.cache/ai-settings-ui/narrow-panel.png', fullPage: false });
  service.assertIsolated();
});

test('API settings save without switching provider, clear the key and retain it when omitted', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  expect(service.state.providers).toEqual([]);
  const key = dialog.getByLabel(/^API Key/);
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('type', 'password');
  await mkdir('.cache/ai-settings-ui', { recursive: true });
  await page.screenshot({ path: '.cache/ai-settings-ui/desktop-api.png', fullPage: false });
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://new-service.example.invalid/v1');
  await dialog.getByLabel('Model ID', { exact: true }).fill('synthetic-new-model');
  await expect(dialog.getByText('更换地址需重新填写密钥。')).toBeVisible();
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  expect(service.state.apiSaves).toEqual([]);
  await key.fill('synthetic-key-fixture');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('配置已保存');
  await expect(dialog.getByRole('status')).toContainText('可用于额度用尽时的备用回答');
  await expect(key).toHaveValue('');
  expect(service.state.status.provider).toBe('chatgpt');
  expect(service.state.providers).toEqual([]);
  expect(service.state.apiSaves).toEqual([{ revision: 'synthetic-1', baseURL: 'https://new-service.example.invalid/v1', modelId: 'synthetic-new-model', apiKey: 'synthetic-key-fixture' }]);
  await dialog.getByLabel('Model ID', { exact: true }).fill('synthetic-next-model');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '使用此 API', exact: true })).toBeEnabled();
  expect(service.state.apiSaves[1]).toEqual({ revision: 'synthetic-2', baseURL: 'https://new-service.example.invalid/v1', modelId: 'synthetic-next-model' });
  await dialog.getByRole('button', { name: '使用此 API', exact: true }).click();
  await expect(page.locator('.ai-provider-trigger')).toContainText('API · 已配置');
  expect(service.state.providers).toEqual(['api']);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const reopened = await openSettings(page);
  await reopened.getByRole('button', { name: 'API', exact: true }).click();
  await expect(reopened.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-next-model');
  await expect(reopened.getByLabel(/^API Key/)).toHaveValue('');
  service.assertIsolated();
});

test('search configuration and permission stay in settings and keep secrets out of browser storage', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, replacementAnswer: true }); await openReader(page);
  await expect(page.locator('.ai-composer input[type="checkbox"]')).toHaveCount(0);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '联网查证', exact: true }).click();
  const toggle = dialog.getByRole('switch', { name: /允许联网查证/ });
  await expect(toggle).toBeDisabled();
  await dialog.getByLabel('Tavily API Key', { exact: true }).fill('synthetic-search-draft');
  service.state.settingsConflict = true;
  await dialog.getByRole('button', { name: '保存检索配置', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('配置已变');
  await expect(dialog.getByLabel('Tavily API Key', { exact: true })).toHaveValue('synthetic-search-draft');
  service.state.settingsConflict = false;
  await dialog.getByRole('button', { name: '重新载入配置', exact: true }).click();
  await dialog.getByRole('button', { name: '保存检索配置', exact: true }).click();
  await expect(dialog.getByLabel('Tavily API Key', { exact: true })).toHaveValue('');
  await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(dialog.getByText('开启后，AI 可将包含提问内容的检索词发给 Tavily；取得的网页摘录会送给模型。')).toBeVisible();
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await dialog.getByRole('button', { name: '联网查证', exact: true }).click();
  await expect(toggle).toBeChecked();
  await mkdir('.cache/feedback-round/after', { recursive: true });
  await page.screenshot({ path: '.cache/feedback-round/after/ai-settings-search.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-provider-trigger')).toContainText('联网');
  expect(service.state.askRequests).toEqual([]);
  expect(service.state.providers).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('synthetic-search-draft');
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成联网问题，仅验证明确请求参数。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toContainText('合成校正结论');
  expect(service.state.askRequests).toHaveLength(1);
  expect(service.state.askRequests[0].webSearch).toBe(true);
  service.assertIsolated();
});

test('settings actions have deliberate width and quota state stays in a coherent connection group', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true });
  service.state.status.chatgpt.availability = { state: 'quota_exhausted', checkedAt: '2026-01-01T00:00:00.000Z', model: 'synthetic-reading', checking: false, lastError: null };
  await openReader(page);
  await expect(page.locator('.ai-context details')).toHaveCount(0);
  await page.getByRole('button', { name: '查看本次提问资料', exact: true }).click();
  const material = page.getByRole('dialog', { name: '本次提问资料', exact: true });
  await expect(material).toContainText('按本轮预算可能仅发送开篇与提问章节');
  await expect(material).toContainText('不会自动下载原论文');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '查看本次提问资料', exact: true })).toBeFocused();
  const dialog = await openSettings(page);
  await expect(dialog.locator('.ai-availability')).toContainText('额度已达上限');
  const ratio = await dialog.locator('.ai-model-settings .primary-action').evaluate(element => element.clientWidth / element.parentElement!.clientWidth);
  expect(ratio).toBeGreaterThanOrEqual(.7); expect(ratio).toBeLessThanOrEqual(.85);
  await mkdir('.cache/feedback-round/after', { recursive: true });
  await page.screenshot({ path: '.cache/feedback-round/after/ai-settings-quota.png' });
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await page.screenshot({ path: '.cache/feedback-round/after/ai-settings-api.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeInViewport();
  await expect.poll(() => dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('dialog') === element;
  })).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '.cache/feedback-round/after/ai-settings-api-narrow.png' });
  service.assertIsolated();
});

test('configuration conflicts retain fields and require explicit reload before retry', async ({ page, context }) => {
  const service = await syntheticService(context, { settingsConflict: true }); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await dialog.getByLabel('Model ID', { exact: true }).fill('synthetic-draft-model');
  await dialog.getByLabel(/^API Key/).fill('synthetic-key-fixture');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('配置已变');
  await expect(dialog.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-draft-model');
  await expect(dialog.getByLabel(/^API Key/)).toHaveValue('synthetic-key-fixture');
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeDisabled();
  service.state.settingsConflict = false;
  await dialog.getByRole('button', { name: '重新载入配置', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-draft-model');
  await expect(dialog.getByLabel(/^API Key/)).toHaveValue('synthetic-key-fixture');
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(dialog.getByLabel(/^API Key/)).toHaveValue('');
  service.assertIsolated();
});

test('offline settings show a retry without presenting unread configuration as defaults', async ({ page, context }) => {
  const fixtureOptions = { settingsError: true, settingsGate: Promise.resolve() };
  const service = await syntheticService(context, fixtureOptions); await openReader(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('alert')).toContainText('设置服务暂不可用');
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('设置服务暂不可用');
  await expect(dialog.getByLabel('Base URL', { exact: true })).toHaveCount(0);
  const requestsBefore = service.state.settingsRequests;
  let finishRetry = () => {};
  fixtureOptions.settingsGate = new Promise<void>(resolve => { finishRetry = resolve; });
  await dialog.getByRole('button', { name: '重新读取设置', exact: true }).click();
  await expect.poll(() => service.state.settingsRequests).toBeGreaterThan(requestsBefore);
  await expect(dialog.getByLabel('Base URL', { exact: true })).toHaveCount(0);
  finishRetry();
  await expect(dialog.getByRole('alert')).toContainText('设置服务暂不可用');
  await expect(dialog.getByRole('button', { name: '刷新状态', exact: true })).toBeEnabled();
  service.assertIsolated();
});

test('unread settings still allow cancelling and restarting ChatGPT authorization with a blocked popup', async ({ page, context }) => {
  const service = await syntheticService(context, { settingsError: true });
  service.state.status.chatgpt.loginPending = true;
  await blockPopups(page);
  await openReader(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('alert')).toContainText('设置服务暂不可用');
  await dialog.getByRole('button', { name: '取消本次登录', exact: true }).click();
  await expect.poll(() => service.state.cancelRequests).toBe(1);
  await expect(dialog.getByRole('button', { name: '取消本次登录', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
  await expect(dialog.getByRole('link', { name: '打开 OpenAI 官方授权页面', exact: false })).toHaveAttribute('href', AUTHORIZATION_URL);
  expect(service.state.connectRequests).toBe(1);
  await dialog.getByRole('button', { name: '取消本次登录', exact: true }).click();
  await expect.poll(() => service.state.cancelRequests).toBe(2);
  expect(service.state.providers).toEqual([]);
  expect(service.state.askRequests).toEqual([]);
  service.assertIsolated();
});

test('unread settings still allow deliberate removal of a known ChatGPT connection', async ({ page, context }) => {
  const service = await syntheticService(context, { settingsError: true, connected: true });
  await openReader(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('alert')).toContainText('设置服务暂不可用');
  await expect(dialog.getByRole('combobox', { name: '模型', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '断开连接…', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '断开 ChatGPT 连接', exact: true });
  await confirmation.getByRole('button', { name: '确认断开连接', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  expect(service.state.disconnectRequests).toBe(1);
  expect(service.state.providers).toEqual([]);
  expect(service.state.askRequests).toEqual([]);
  service.assertIsolated();
});

test('ChatGPT uses the dynamic catalogue and saves automatic recommendation explicitly', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  const dialog = await openSettings(page), model = dialog.getByRole('combobox', { name: '模型', exact: true });
  await expect(model).toBeEnabled();
  await expect(model.locator('option')).toHaveText(['自动推荐', '阅读模型（合成）', '推理模型（合成）']);
  await model.selectOption('synthetic-reasoning');
  expect(service.state.modelSaves).toEqual([]);
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.locator('.ai-notice[role="status"]')).toContainText('已保存');
  expect(service.state.modelSaves).toEqual([{ revision: 'synthetic-1', modelId: 'synthetic-reasoning', reasoningEffort: '' }]);
  await model.selectOption('');
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeDisabled();
  expect(service.state.modelSaves[1]).toEqual({ revision: 'synthetic-2', modelId: '', reasoningEffort: '' });
  expect(service.state.providers).toEqual([]);
  service.assertIsolated();
});

test('model catalogue waits for settings and initial opening sends one request; refresh is deliberate', async ({ page, context }) => {
  let release!: () => void;
  const settingsGate = new Promise<void>(resolve => { release = resolve; });
  const service = await syntheticService(context, { connected: true, settingsGate }); await openReader(page);
  await page.locator('.ai-provider-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'AI 设置', exact: true });
  await expect.poll(() => service.state.settingsRequests).toBe(1);
  expect(service.state.modelRequests).toBe(0);
  release();
  await expect(dialog.getByRole('button', { name: '刷新模型', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '刷新状态', exact: true })).toBeEnabled();
  expect(service.state.modelRequests).toBe(1);
  expect(service.state.modelRefreshes).toEqual([false]);
  await dialog.getByRole('button', { name: '刷新模型', exact: true }).click();
  await expect.poll(() => service.state.modelRequests).toBe(2);
  expect(service.state.modelRefreshes).toEqual([false, true]);
  service.assertIsolated();
});

test('thinking choices follow model capabilities, persist and reset to default on model change', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  const dialog = await openSettings(page), model = dialog.getByRole('combobox', { name: '模型', exact: true });
  const thinking = dialog.getByRole('combobox', { name: '思考强度', exact: true });
  await expect(model).toBeEnabled();
  await expect(thinking).toBeDisabled();
  await expect(thinking.locator('option')).toHaveText(['模型默认']);
  await model.selectOption('synthetic-reasoning');
  await expect(thinking.locator('option')).toHaveText(['模型默认（中）', '低', '中', '高', '更高', '最高']);
  await thinking.selectOption('high');
  await mkdir('.cache/chatgpt-reliability-ui', { recursive: true });
  await dialog.screenshot({ path: '.cache/chatgpt-reliability-ui/desktop-thinking.png' });
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeDisabled();
  expect(service.state.modelSaves).toEqual([{ revision: 'synthetic-1', modelId: 'synthetic-reasoning', reasoningEffort: 'high' }]);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const reopened = await openSettings(page);
  await expect(reopened.getByRole('combobox', { name: '思考强度', exact: true })).toHaveValue('high');
  await reopened.getByRole('combobox', { name: '模型', exact: true }).selectOption('synthetic-reading');
  await expect(reopened.getByRole('combobox', { name: '思考强度', exact: true })).toHaveValue('');
  await expect(reopened.getByRole('combobox', { name: '思考强度', exact: true })).toBeDisabled();
  service.assertIsolated();
});

test('thinking conflict preserves its draft and unrelated API edits until explicit retry', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, settingsConflict: true }); await openReader(page);
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await dialog.getByLabel('Model ID', { exact: true }).fill('synthetic-api-draft');
  await dialog.getByRole('button', { name: 'ChatGPT 订阅', exact: true }).click();
  await dialog.getByRole('combobox', { name: '模型', exact: true }).selectOption('synthetic-reasoning');
  await dialog.getByRole('combobox', { name: '思考强度', exact: true }).selectOption('max');
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '重新载入配置', exact: true })).toBeVisible();
  service.state.settingsConflict = false;
  await dialog.getByRole('button', { name: '重新载入配置', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: '思考强度', exact: true })).toHaveValue('max');
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await expect(dialog.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-api-draft');
  expect(service.state.apiSaves).toEqual([]);
  service.assertIsolated();
});

test('unavailable model catalogue keeps saved choice and offers retry without invented models', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, modelsError: true }); await openReader(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('alert')).toContainText('模型目录暂不可用');
  await expect(dialog.getByRole('combobox', { name: '模型', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '重试读取模型', exact: true })).toBeVisible();
  expect(service.state.modelSaves).toEqual([]);
  service.assertIsolated();
});

test('legacy fallback defaults on and can be disabled independently when the catalogue fails', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, modelsError: true, legacyFallback: true }); await openReader(page);
  const disclosure = page.getByText('订阅或此应用额度用尽时，同一问题与资料会转交已配置的备用 API，可能产生 API 费用。', { exact: true });
  await page.getByRole('button', { name: '查看本次提问资料', exact: true }).click();
  await expect(disclosure).toBeVisible();
  await page.getByRole('dialog', { name: '本次提问资料', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
  const dialog = await openSettings(page), toggle = dialog.getByRole('checkbox', { name: '额度用尽时使用备用 API', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('模型目录暂不可用');
  await expect(toggle).toBeChecked();
  await expect(dialog.getByText('仅在订阅或此应用额度用尽时，将问题、近期对话、导读与来源转交备用 API，独立计费。')).toBeVisible();
  await expect(dialog.locator('.ai-fallback-target')).toContainText('synthetic-api-model');
  await expect(dialog.getByRole('button', { name: '保存备用设置', exact: true })).toHaveCount(0);
  const requestsBefore = service.state.modelRequests;
  await toggle.uncheck();
  await dialog.getByRole('button', { name: '保存备用设置', exact: true }).click();
  await expect(dialog.locator('.ai-notice[role="status"]')).toContainText('备用 API 设置已保存');
  expect(service.state.fallbackSaves).toEqual([{ revision: 'synthetic-1', enabled: false }]);
  expect(service.state.modelRequests).toBe(requestsBefore);
  expect(service.state.modelSaves).toEqual([]); expect(service.state.apiSaves).toEqual([]); expect(service.state.providers).toEqual([]);
  await expect(toggle).not.toBeChecked();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(disclosure).toHaveCount(0);
  const reopened = await openSettings(page);
  await expect(reopened.getByRole('checkbox', { name: '额度用尽时使用备用 API', exact: true })).not.toBeChecked();
  await mkdir('.cache/ai-fallback-ui', { recursive: true });
  await reopened.screenshot({ path: '.cache/ai-fallback-ui/desktop-disabled.png' });
  service.assertIsolated();
});

test('fallback save preserves model and API drafts and uses the latest settings revision', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, fallbackToApi: false }); await openReader(page);
  const dialog = await openSettings(page), model = dialog.getByRole('combobox', { name: '模型', exact: true });
  await expect(model).toBeEnabled(); await model.selectOption('synthetic-reasoning');
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await dialog.getByLabel('Model ID', { exact: true }).fill('synthetic-unsaved-api-model');
  await dialog.getByLabel(/^API Key/).fill('synthetic-unsaved-key');
  await dialog.getByRole('button', { name: 'ChatGPT 订阅', exact: true }).click();
  await dialog.getByRole('checkbox', { name: '额度用尽时使用备用 API', exact: true }).check();
  await dialog.getByRole('button', { name: '保存备用设置', exact: true }).click();
  await expect(dialog.locator('.ai-notice[role="status"]')).toContainText('备用 API 设置已保存');
  expect(service.state.fallbackSaves).toEqual([{ revision: 'synthetic-1', enabled: true }]);
  await expect(model).toHaveValue('synthetic-reasoning');
  await expect(dialog.locator('.ai-fallback-target')).toContainText('synthetic-api-model');
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存模型', exact: true })).toBeDisabled();
  expect(service.state.modelSaves).toEqual([{ revision: 'synthetic-2', modelId: 'synthetic-reasoning', reasoningEffort: '' }]);
  await dialog.getByRole('button', { name: 'API', exact: true }).click();
  await expect(dialog.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-unsaved-api-model');
  await expect(dialog.getByLabel(/^API Key/)).toHaveValue('synthetic-unsaved-key');
  expect(service.state.apiSaves).toEqual([]); expect(service.state.providers).toEqual([]);
  service.assertIsolated();
});

test('fallback revision conflict preserves the checkbox draft until explicit reload and retry', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, modelsError: true, settingsConflict: true }); await openReader(page);
  const dialog = await openSettings(page), toggle = dialog.getByRole('checkbox', { name: '额度用尽时使用备用 API', exact: true });
  await toggle.uncheck(); await dialog.getByRole('button', { name: '保存备用设置', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: '配置已变' })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: '保存备用设置', exact: true })).toBeDisabled();
  service.state.settingsConflict = false;
  await dialog.getByRole('button', { name: '重新载入配置', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存备用设置', exact: true })).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await dialog.getByRole('button', { name: '保存备用设置', exact: true }).click();
  await expect(dialog.locator('.ai-notice[role="status"]')).toContainText('备用 API 设置已保存');
  expect(service.state.fallbackSaves).toEqual([{ revision: 'synthetic-1', enabled: false }, { revision: 'synthetic-1', enabled: false }]);
  service.assertIsolated();
});

test('unconfigured fallback links to the API pane without switching the selected provider', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await syntheticService(context, { connected: true, apiConfigured: false }); await openReader(page);
  const dialog = await openSettings(page);
  await expect(dialog.locator('.ai-fallback-target')).toContainText('备用 API 尚未配置');
  await dialog.getByLabel('额度用尽时使用备用 API', { exact: true }).scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await mkdir('.cache/ai-fallback-ui', { recursive: true });
  await dialog.screenshot({ path: '.cache/ai-fallback-ui/narrow-unconfigured.png' });
  await dialog.getByRole('button', { name: '去 API 页配置', exact: true }).click();
  await expect(dialog.getByLabel('Base URL', { exact: true })).toBeVisible();
  expect(service.state.status.provider).toBe('chatgpt'); expect(service.state.providers).toEqual([]);
  service.assertIsolated();
});

test('quota fallback reset replaces the streamed answer and labels its actual provider without mixing the archived partial', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, fallbackAnswer: true });
  // Gate only the intercepted synthetic stream. This observes reset before done
  // or the final history reload can replace the turn and conceal a reset bug.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
      if (path !== '/api/ai/ask') return response;
      const lines = (await response.text()).trimEnd().split('\n');
      const reset = lines.findIndex(line => JSON.parse(line).type === 'reset');
      const done = lines.findIndex(line => JSON.parse(line).type === 'done');
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        const enqueue = (part: string[]) => controller.enqueue(encoder.encode(part.join('\n') + '\n'));
        enqueue(lines.slice(0, reset));
        (window as any).syntheticApplyFallback = () => enqueue(lines.slice(reset, done));
        (window as any).syntheticFinishAnswer = () => { enqueue(lines.slice(done)); controller.close(); };
      } }), { status: response.status, headers: response.headers });
    };
  });
  await openReader(page);
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成问题：请解释行动循环。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toContainText('合成订阅片段');
  await page.evaluate(() => (window as any).syntheticApplyFallback());
  await expect(page.locator('.ai-answer')).toHaveText('合成 API 最终回答：请结合导读中的行动循环理解。[L3]');
  await expect(page.locator('.ai-answer')).not.toContainText('合成订阅片段');
  await expect(page.locator('.ai-answer-model')).toHaveText('API · synthetic-api-model');
  await expect(page.locator('.ai-fallback-notice')).toHaveText('订阅或应用额度已达上限 · 本轮由 API 回答');
  const previous = page.locator('.ai-previous-answer');
  await expect(previous).not.toHaveAttribute('open', '');
  await previous.getByText('订阅未完成的回答', { exact: true }).click();
  await expect(previous).toContainText('不是最终回答');
  await expect(previous).toContainText('ChatGPT · synthetic-reading');
  await expect(previous.locator('.ai-previous-text')).toContainText('<img src="https://example.invalid/synthetic-image">');
  await expect(previous.locator('img')).toHaveCount(0);
  await expect(page.locator('.ai-sources .ai-source-id')).toHaveText(['[L3]', '[W8]']);
  await page.evaluate(() => (window as any).syntheticFinishAnswer());
  await expect(page.locator('.ai-progress')).toHaveCount(0);
  await expect(page.locator('.ai-answer-model')).toHaveText('API · synthetic-api-model');
  await expect(page.locator('.ai-provider-trigger')).toContainText('ChatGPT · 已连接');
  expect(service.state.status.provider).toBe('chatgpt'); expect(service.state.providers).toEqual([]); expect(service.state.askRequests).toHaveLength(1);
  await mkdir('.cache/ai-fallback-ui', { recursive: true });
  await page.locator('.ai-panel').screenshot({ path: '.cache/ai-fallback-ui/desktop-answer.png' });
  service.assertIsolated();
});

test('completion replacement updates the active answer before done while retaining sources and turn identity', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, replacementAnswer: true });
  // Pause before replacement and before done so neither history reload nor the
  // terminal turn can conceal a missing or misclassified replacement event.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
      if (path !== '/api/ai/ask') return response;
      const lines = (await response.text()).trimEnd().split('\n');
      const replacement = lines.findIndex(line => JSON.parse(line).type === 'replace');
      const done = lines.findIndex(line => JSON.parse(line).type === 'done');
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        const enqueue = (part: string[]) => controller.enqueue(encoder.encode(part.join('\n') + '\n'));
        enqueue(lines.slice(0, replacement));
        (window as any).syntheticApplyReplacement = () => enqueue(lines.slice(replacement, done));
        (window as any).syntheticFinishReplacement = () => { enqueue(lines.slice(done)); controller.close(); };
      } }), { status: response.status, headers: response.headers });
    };
  });
  await openReader(page);
  await page.getByRole('textbox', { name: '向 AI 提问', exact: true }).fill('合成问题：请解释行动后的观察。');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-answer')).toContainText('合成临时片段');
  const citation = page.locator('.ai-answer .ai-citation');
  const sourceHref = await citation.getAttribute('href');
  expect(sourceHref).toBe('#ai-source-22222222-2222-4222-8222-222222222222-L1');
  await page.evaluate(() => (window as any).syntheticApplyReplacement());
  await expect(page.locator('.ai-answer > p')).toHaveText(['合成前轮内容：先明确研究对象。', '合成校正结论：行动之后继续观察环境。[L1]']);
  await expect(page.locator('.ai-answer')).not.toContainText('合成临时片段');
  await expect(page.locator('.ai-progress')).toHaveText('正在组织回答');
  await expect(page.locator('.ai-turn-state')).toHaveText('生成中');
  await expect(page.getByRole('button', { name: '停止', exact: true })).toBeEnabled();
  await expect(citation).toHaveAttribute('href', sourceHref!);
  await expect(page.locator('.ai-sources .ai-source-id')).toHaveText(['[L1]']);
  await expect(page.locator('.ai-fallback-notice, .ai-previous-answer, .ai-error')).toHaveCount(0);
  await citation.click();
  await expect(page.locator(sourceHref!)).toBeFocused();
  await expect(page.locator(sourceHref!)).toContainText('合成引用摘录');
  await page.evaluate(() => (window as any).syntheticFinishReplacement());
  await expect(page.locator('.ai-progress')).toHaveCount(0);
  await expect(page.locator('.ai-answer-model')).toHaveText('ChatGPT · synthetic-reading');
  await expect(page.locator('.ai-answer')).not.toContainText('合成临时片段');
  await expect(citation).toHaveAttribute('href', sourceHref!);
  await expect(page.locator('.ai-fallback-notice, .ai-previous-answer, .ai-error')).toHaveCount(0);
  expect(service.state.askRequests).toHaveLength(1); expect(service.state.providers).toEqual([]);
  service.assertIsolated();
});

test('compact sidebar keeps the composer visible and separates settings, history and backup', async ({ page, context }) => {
  await page.setViewportSize({ width: 1265, height: 718 });
  const service = await syntheticService(context, { connected: true }); await openReader(page);
  await expect(page.getByRole('heading', { name: 'AI解读', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '向 AI 提问', exact: true })).toBeInViewport();
  const geometry = await page.locator('.ai-panel').evaluate(panel => ({
    topHeight: panel.querySelector('.ai-context')!.getBoundingClientRect().bottom - panel.getBoundingClientRect().top,
    messagesHeight: panel.querySelector('.ai-messages')!.clientHeight,
  }));
  expect(geometry.topHeight).toBeLessThan(150);
  expect(geometry.messagesHeight).toBeGreaterThan(200);
  await mkdir('.cache/ai-settings-ui', { recursive: true });
  await page.screenshot({ path: '.cache/ai-settings-ui/desktop-panel.png', fullPage: false });
  await page.getByRole('button', { name: '查看历史对话', exact: true }).click();
  const history = page.getByRole('dialog', { name: '历史对话', exact: true });
  await expect(history.getByText('还没有保存的对话。')).toBeVisible();
  await expect(history.getByLabel('Base URL', { exact: true })).toHaveCount(0);
  await history.getByRole('button', { name: '备份与恢复', exact: true }).click();
  const backup = page.getByRole('dialog', { name: 'AI 对话备份', exact: true });
  await expect(backup.getByRole('button', { name: '导出全部 AI 对话', exact: true })).toBeVisible();
  await expect(backup.getByRole('button', { name: '选择备份文件…', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(backup).not.toBeVisible();
  await expect(history).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '查看历史对话', exact: true })).toBeFocused();
  service.assertIsolated();
});

test('completed synthetic answer remains readable and citations reveal their exact source', async ({ page, context }) => {
  const service = await syntheticService(context, { connected: true, completedHistory: true }); await openReader(page);
  await page.getByRole('button', { name: '查看历史对话', exact: true }).click();
  await page.getByRole('dialog', { name: '历史对话', exact: true }).getByRole('button', { name: /合成示例：理解持续行动/ }).click();
  await expect(page.getByRole('dialog', { name: '历史对话', exact: true })).not.toBeVisible();
  await expect(page.locator('.ai-question')).toContainText('合成问题');
  await expect(page.locator('.ai-answer')).toContainText('合成回答');
  await expect(page.locator('.ai-answer-model')).toHaveText('ChatGPT · synthetic-reading');
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible();
  await mkdir('.cache/ai-settings-ui', { recursive: true });
  await page.screenshot({ path: '.cache/ai-settings-ui/desktop-answer.png', fullPage: false });
  await page.locator('.ai-citation').click();
  await expect(page.locator('.ai-sources')).toHaveAttribute('open', '');
  await expect(page.locator('.ai-sources li')).toBeFocused();
  await expect(page.locator('.ai-sources a')).toHaveAttribute('href', '/read/agent-survey/2#u01');
  await page.screenshot({ path: '.cache/ai-settings-ui/desktop-source.png', fullPage: false });
  service.assertIsolated();
});

for (const [label, url] of [
  ['lookalike host', 'https://auth.openai.com.example.invalid/authorize'],
  ['insecure HTTP', 'http://auth.openai.com/authorize'],
  ['userinfo', 'https://synthetic-user@auth.openai.com/authorize'],
  ['nonstandard port', 'https://auth.openai.com:444/authorize'],
  ['script URL', 'javascript:alert(1)'],
]) {
  test(`synthetic authorization rejects ${label} without exposing a navigable link`, async ({ page, context }) => {
    const service = await syntheticService(context, { authorizationUrl: url }); await blockPopups(page); await openReader(page);
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: '连接 ChatGPT 订阅', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('未返回允许的 OpenAI 官方授权地址');
    await expect(dialog.getByRole('link', { name: '打开 OpenAI 官方授权页面', exact: false })).toHaveCount(0);
    expect(service.state.cancelRequests).toBe(1);
    expect(service.state.providers).toEqual([]);
    service.assertIsolated();
  });
}
