import { fork, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer, preview } from 'vite';
import { validateContent } from '../../server/content/validation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

function options(args) {
  const result = { mode: 'preview', port: 4173, open: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--open') result.open = true;
    else if (arg === '--no-open') result.open = false;
    else if (arg === '--mode') result.mode = args[++index];
    else if (arg.startsWith('--mode=')) result.mode = arg.slice(7);
    else if (arg === '--port') result.port = Number(args[++index]);
    else if (arg.startsWith('--port=')) result.port = Number(arg.slice(7));
    else throw new Error('仅支持 --mode dev|preview、--port 4173|4174、--open 和 --no-open。');
  }
  if (!['dev', 'preview'].includes(result.mode)) throw new Error('启动模式必须为 dev 或 preview。');
  if (![4173, 4174].includes(result.port)) throw new Error('统一启动仅支持端口 4173 或隔离测试端口 4174。');
  return result;
}

function openBrowser(url) {
  // Fixed executable and argument arrays: no shell interpolation or user-supplied command.
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', detached: false });
  child.once('error', () => console.log('未能自动打开浏览器，请使用上方地址。'));
  child.once('exit', code => { if (code) console.log('未能自动打开浏览器，请使用上方地址。'); });
  child.unref();
}

async function main() {
  const config = options(process.argv.slice(2));
  if (config.mode === 'preview') {
    try { await access(join(root, 'dist', 'index.html')); }
    catch { throw new Error('缺少网站构建文件。请先运行 npm run build，再运行 npm start。'); }
  } else {
    // Development keeps the existing approved-content validation gate.
    try { await validateContent(); }
    catch { throw new Error('内容校验失败，请运行 npm run validate:content 查看具体内容问题。'); }
  }

  let web = null, backend = null, stopping = false, cleanupPromise = null;
  let rejectBackendStartup;
  const webAddress = `http://127.0.0.1:${config.port}/library`;
  async function cleanup(exitCode = 0) {
    if (cleanupPromise) return cleanupPromise;
    stopping = true;
    process.exitCode = exitCode;
    if (backend?.pid && backend.exitCode === null && backend.signalCode === null) console.log('正在保存本次登录状态并关闭服务…');
    rejectBackendStartup?.(new Error('启动已取消。'));
    cleanupPromise = (async () => {
      const closeBackend = async () => {
        if (!backend?.pid || backend.exitCode !== null || backend.signalCode !== null) return;
        await new Promise(resolve => {
          const child = backend;
          let settled = false, forceTimer;
          const finish = () => {
            if (settled) return;
            settled = true; clearTimeout(timer); clearTimeout(forceTimer);
            child.off('exit', finish); child.off('close', finish); child.off('error', force);
            resolve();
          };
          const force = () => {
            if (settled || forceTimer) return;
            clearTimeout(timer);
            if (child.exitCode !== null || child.signalCode !== null) { finish(); return; }
            try { child.kill(); } catch { /* The bounded deadline below reports failure. */ }
            forceTimer = setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                console.error('本次 AI 子进程未确认退出，请检查本次启动窗口；没有终止其他服务。');
                process.exitCode = 1;
                if (child.connected) { try { child.disconnect(); } catch { /* Already disconnected. */ } }
                child.unref(); child.stdout?.destroy(); child.stderr?.destroy();
              }
              finish();
            }, 2000);
          };
          // Token rotation must finish its bounded network/verification and
          // encrypted writes before the owned process is forcefully stopped.
          const timer = setTimeout(force, 60000);
          child.once('exit', finish); child.once('close', finish); child.once('error', force);
          if (child.connected) child.send('paperdesk:shutdown', error => { if (error) force(); });
          else force();
        });
      };
      const closeWeb = async () => {
        if (!web) return;
        if (config.mode === 'dev') await web.close();
        else {
          const closing = new Promise(resolve => web.httpServer.close(() => resolve()));
          web.httpServer.closeAllConnections();
          await closing;
        }
      };
      await Promise.allSettled([closeBackend(), closeWeb()]);
    })();
    return cleanupPromise;
  }
  const stop = () => { void cleanup(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  // Helpful for isolated tests or supervising this launcher without a terminal.
  process.once('disconnect', stop);
  process.on('message', message => { if (message === 'paperdesk:shutdown') stop(); });

  try {
    const shared = { root, logLevel: 'silent', clearScreen: false };
    if (config.mode === 'dev') {
      web = await createServer({ ...shared, server: { host: '127.0.0.1', port: config.port, strictPort: true, open: false } });
      if (!stopping) await web.listen();
    } else web = await preview({ ...shared, preview: { host: '127.0.0.1', port: config.port, strictPort: true, open: false } });
    if (stopping) { if (config.mode === 'dev') await web.close(); else { web.httpServer.closeAllConnections(); await new Promise(resolve => web.httpServer.close(resolve)); } return; }
    web.httpServer.once('error', () => { if (!stopping) { console.error('网站服务发生错误，正在关闭本次启动的服务。'); void cleanup(1); } });
    web.httpServer.once('close', () => { if (!stopping) { console.error('网站服务已关闭，正在关闭本次 AI 服务。'); void cleanup(1); } });

    backend = fork(join(root, 'scripts', 'dev', 'local-ai-child.mjs'), [], { cwd: root, execArgv: [], windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    await new Promise((resolve, reject) => {
      let ready = false, stdout = '', stderr = '';
      const timer = setTimeout(() => reject(new Error('AI 后端在 30 秒内未就绪。请检查配置、内容校验或端口 4176。')), 30000);
      const fail = error => { clearTimeout(timer); reject(error); };
      rejectBackendStartup = fail;
      backend.stdout.on('data', chunk => {
        stdout = (stdout + chunk.toString('utf8')).slice(-2000);
        if (!ready && stdout.includes('PaperDesk AI: http://127.0.0.1:4176')) { ready = true; clearTimeout(timer); rejectBackendStartup = null; resolve(); }
      });
      // Never forward arbitrary backend output: it could contain configuration details.
      backend.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString('utf8')).slice(-2000);
        if (!ready && /AI (后端|数据库).*(失败|占用)/u.test(stderr)) fail(new Error('AI 后端启动失败。请检查后端配置和端口 4176；本次网站服务已关闭。'));
      });
      backend.once('error', () => fail(new Error('无法创建本机 AI 后端进程。')));
      backend.once('exit', () => {
        if (!ready) fail(new Error('AI 后端在就绪前退出。请检查后端配置和端口 4176。'));
        else if (!stopping) { console.error('AI 后端已退出，正在关闭本次网站服务。'); void cleanup(1); }
      });
    });
    if (stopping) return;
    console.log(`PaperDesk 已启动：${webAddress}`);
    console.log('网站与本机 AI 服务已就绪；Ctrl+C 一起退出。');
    if (config.open) openBrowser(webAddress);
  } catch (error) {
    const wasStopping = stopping;
    await cleanup(wasStopping ? 0 : 1);
    if (!wasStopping) {
      // Port failures from Vite may include machine paths; use a neutral message.
      const message = error instanceof Error && /^(AI 后端|无法创建|启动已取消)/u.test(error.message)
        ? error.message : `网站启动失败，请确认端口 ${config.port} 未被占用、构建已完成；已有服务不会被关闭。`;
      console.error(message);
    }
  } finally {
    // Keep signal handlers while the service is running; IPC is unreferenced so
    // an empty/failed launcher can exit naturally even under a parent process.
    process.channel?.unref();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; process.channel?.unref(); });
