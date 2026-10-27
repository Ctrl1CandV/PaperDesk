import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { ContentIndex } from './content/index.mjs';
import { AiStore } from './storage/ai-store.mjs';
import { createAiServer } from './http/server.mjs';
import { AiRuntime } from './ai/runtime.mjs';
import { createBackendNetwork } from './http/network.mjs';

let network;
try {
  const config = await loadConfig();
  const content = await ContentIndex.load();
  network = createBackendNetwork();
  const dependencies = { config, content, fetchImpl: network.fetch, store: null, runtime: null };
  let closing = false, providersClosing;
  const closeProviders = () => providersClosing ??= (async () => {
    // Allow an in-flight token rotation to finish saving before closing sockets.
    try { await dependencies.runtime?.close(); }
    finally { await network.close(); }
  })();
  const server = createAiServer(dependencies);
  server.once('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'AI 后端端口 4176 已被占用，请勿启动重复服务。' : 'AI 后端启动失败。');
    dependencies.store?.close(); process.exitCode = 1;
    void closeProviders().catch(() => {});
  });
  // Bind first. A duplicate process must not open the database and "recover" a live turn.
  // Requests remain unavailable until private provider state and the DB are ready.
  server.listen(4176, '127.0.0.1', async () => {
    if (closing) return;
    try {
      dependencies.runtime = new AiRuntime({ config, fetchImpl: network.fetch, configFile: fileURLToPath(new URL('./config.local.json', import.meta.url)), directory: fileURLToPath(new URL('../private/ai/', import.meta.url)) });
      await dependencies.runtime.initialize();
      if (closing) { await closeProviders(); return; }
      dependencies.store = new AiStore(fileURLToPath(new URL('../private/ai/paperdesk.sqlite', import.meta.url)), { capacityBytes: config.storageCapacityMiB * 1024 * 1024, minimumFreeBytes: config.minimumFreeMiB * 1024 * 1024 });
      console.log(`PaperDesk AI: http://127.0.0.1:4176 · ${dependencies.runtime.status().configured ? '模型已配置' : '等待模型连接'}`);
    } catch {
      console.error('AI 后端启动失败，请检查数据库版本、模型连接记录与本地可写性。');
      await closeProviders().catch(() => {});
      server.close(); process.exitCode = 1;
      if (process.connected) process.disconnect();
    }
  });
  const close = () => {
    if (closing) return;
    closing = true; server.abortActive();
    void closeProviders().catch(() => {});
    server.close(() => { dependencies.store?.close(); content.close(); });
  };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch {
  await network?.close().catch(() => {});
  // Configuration, filesystem and provider errors must never reveal paths or secrets.
  console.error('AI 后端启动失败，请检查本地配置、Node 版本、内容校验与数据库可写性。');
  process.exitCode = 1;
}
