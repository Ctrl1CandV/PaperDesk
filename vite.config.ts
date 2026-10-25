import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Vite's filesystem deny list also covers transformed imports. Reject private
// paths before any static middleware, including encoded /@fs/ requests.
function protectBackendFiles(request: IncomingMessage, response: ServerResponse, next: () => void) {
  let path = (request.url ?? '').split('?')[0];
  try {
    for (let index = 0; index < 3; index++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch { response.writeHead(400); response.end(); return; }
  path = path.replaceAll('\\', '/');
  // Browser acceptance uses this origin with synthetic IndexedDB records.
  // Never let that isolated frontend read the normal AI service's conversations.
  if (request.headers.host === '127.0.0.1:4174' && /^\/api\/ai(?:\/|$)/.test(path)) {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ message: '隔离测试来源未连接 AI 服务。' })); return;
  }
  if (/(^|\/)(server|private|personal-data|backups|\.git|\.cache|\.content-update|\.source-review|incoming)(\/|$)/i.test(path)) {
    response.writeHead(403, { 'Cache-Control': 'no-store' }); response.end('Forbidden'); return;
  }
  next();
}

export default defineConfig(({ command }) => {
  const nonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;
  return {
  plugins: [react(), {
    name: 'backend-files-stay-private',
    configureServer(server) { server.middlewares.use(protectBackendFiles); },
    configurePreviewServer(server) { server.middlewares.use(protectBackendFiles); },
  }, {
    name: 'local-development-csp',
    transformIndexHtml: { order: 'pre', handler: (html) => nonce ? html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) : html },
  }],
  html: { cspNonce: nonce },
  server: { host: '127.0.0.1', port: 4173, strictPort: true,
    fs: { deny: ['**/.env', '**/.env.*', '**/*.{crt,pem,key}', '**/.git/**', '**/.cache/**', '**/server/**', '**/private/**', '**/personal-data/**', '**/backups/**', '**/.content-update/**', '**/.source-review/**', '**/incoming/**'] },
    proxy: { '/api/ai': { target: 'http://127.0.0.1:4176', changeOrigin: false } },
    watch: { ignored: ['**/.cache/**', '**/private/**', '**/server/**', '**/incoming/**', '**/.content-update/**', '**/.source-review/**', '**/docs/evidence/**'] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true,
    proxy: { '/api/ai': { target: 'http://127.0.0.1:4176', changeOrigin: false } } },
}; });
