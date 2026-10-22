import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';

export default defineConfig(({ command }) => {
  const nonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;
  return {
  plugins: [react(), {
    name: 'local-development-csp',
    transformIndexHtml: { order: 'pre', handler: (html) => nonce ? html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) : html },
  }],
  html: { cspNonce: nonce },
  server: { host: '127.0.0.1', port: 4173, strictPort: true, watch: { ignored: ['**/.cache/**', '**/incoming/**', '**/.content-update/**', '**/.source-review/**', '**/docs/evidence/**'] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
}; });
