import { ExplorationFileStore, ExplorationSyncError, MAX_SYNC_REQUEST_BYTES } from '../storage/exploration-files.mjs';

/** The caller checks the existing loopback origin and CSRF token first. */
export function createExplorationSyncHandler({ directory, store = new ExplorationFileStore(directory) }) {
  return async (request, response, { readJson, json }) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path !== '/api/workspace/explorations') return false;
    try {
      if (request.method === 'GET') json(response, 200, await store.read());
      else if (request.method === 'POST') json(response, 200, await store.write(await readJson(request, MAX_SYNC_REQUEST_BYTES)));
      else json(response, 405, { code: 'workspace_method', message: '此探索文件接口只接受读取或保存。' });
    } catch (error) {
      if (error instanceof ExplorationSyncError) json(response, error.status, { code: error.code, message: error.message });
      else if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) json(response, error.status, { code: 'workspace_request', message: '探索保存请求格式或容量无效。' });
      else json(response, 500, { code: 'workspace_unavailable', message: '暂时无法读写项目探索文件，浏览器记录仍保留。请检查项目目录可写后重试。' });
    }
    return true;
  };
}
