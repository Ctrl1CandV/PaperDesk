import { spawn } from 'node:child_process';
import { Agent, ProxyAgent, EnvHttpProxyAgent } from 'undici';
import { PublicError } from './validation.mjs';

const MAX_HELPER_BYTES = 8 * 1024;
const MAX_PROXY_DISPATCHERS = 16;
const routingError = () => new PublicError('无法解析或使用本机系统代理。请检查系统网络与代理状态后重试。', 503);
const closedError = () => new PublicError('后端网络服务已关闭，请重新启动本地服务。', 503);
// Only the destination URL enters stdin. Headers, bodies and credentials never
// enter the shell or helper output. The OS resolves its own proxy/PAC rules.
const SYSTEM_PROXY_SCRIPT = `$ErrorActionPreference = 'Stop'
try {
  $destination = [Uri]([Console]::In.ReadToEnd())
  if (-not $destination.IsAbsoluteUri -or ($destination.Scheme -ne 'http' -and $destination.Scheme -ne 'https')) { throw 'invalid-destination' }
  $systemProxy = [Net.WebRequest]::GetSystemWebProxy()
  if ($null -eq $systemProxy) { throw 'unavailable-proxy' }
  $resolved = $systemProxy.GetProxy($destination)
  if ($null -eq $resolved) { throw 'unavailable-route' }
  $proxy = if ($resolved.Equals($destination)) { $null } else { $resolved.AbsoluteUri }
  [Console]::Out.Write((@{ proxy = $proxy } | ConvertTo-Json -Compress))
} catch { [Environment]::Exit(1) }`;

function proxyAddress(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_HELPER_BYTES || /[\s\\]/.test(value)) throw routingError();
  let url; try { url = new URL(value); } catch { throw routingError(); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw routingError();
  return url.href;
}
function proxyResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'proxy')) throw routingError();
  return value.proxy === null ? null : proxyAddress(value.proxy);
}

export function resolveWindowsSystemProxy(url, { signal, spawnImpl = spawn, timeoutMs = 5000 } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let child, settled = false, bytes = 0, chunks = [], timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) {
        try { child?.kill(); } catch { /* The helper can already have exited. */ }
        reject(error);
      } else resolve(result);
    };
    const fail = () => finish(routingError());
    const cancel = () => finish(signal.reason);
    try {
      child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SYSTEM_PROXY_SCRIPT], {
        windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'],
      });
      child.on('error', fail); child.stdin.on('error', fail);
      child.stdout.on('data', chunk => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > MAX_HELPER_BYTES) { fail(); return; }
        chunks.push(Buffer.from(chunk));
      });
      child.once('close', code => {
        if (settled) return;
        if (code !== 0) { fail(); return; }
        try { finish(null, { proxy: proxyResult(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }); }
        catch { fail(); }
      });
      timer = setTimeout(fail, timeoutMs);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      child.stdin.end(url);
    } catch { fail(); }
  });
}

function environmentValue(env, name) {
  // Match lowercase precedence and include mixed-case Windows names.
  const key = [name.toLowerCase(), name, ...Object.keys(env).filter(key => key.toUpperCase() === name)].find(key => typeof env[key] === 'string');
  return key ? env[key].trim() : '';
}
function loopback(url) {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host);
}
function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** One transport shared by authorization, models, inference and optional search. */
export function createBackendNetwork({ platform = process.platform, env = process.env, fetchImpl = fetch,
  resolveSystemProxy = resolveWindowsSystemProxy,
  createDirectDispatcher = () => new Agent(), createProxyDispatcher = uri => new ProxyAgent(uri),
  createEnvDispatcher = options => new EnvHttpProxyAgent(options) } = {}) {
  const inherited = { httpProxy: environmentValue(env, 'HTTP_PROXY'), httpsProxy: environmentValue(env, 'HTTPS_PROXY'), noProxy: environmentValue(env, 'NO_PROXY') };
  const hasInheritedProxy = Boolean(inherited.httpProxy || inherited.httpsProxy);
  const shutdown = new AbortController(), proxies = new Map(), dispatchers = new Set();
  let direct, environment, closed = false, closing;
  function remember(dispatcher) { dispatchers.add(dispatcher); return dispatcher; }
  function directDispatcher() { return direct ??= remember(createDirectDispatcher()); }
  function proxyDispatcher(uri) {
    let dispatcher = proxies.get(uri);
    if (dispatcher) { proxies.delete(uri); proxies.set(uri, dispatcher); return dispatcher; }
    dispatcher = remember(createProxyDispatcher(uri)); proxies.set(uri, dispatcher);
    if (proxies.size > MAX_PROXY_DISPATCHERS) {
      const [oldUri, old] = proxies.entries().next().value; proxies.delete(oldUri);
      // Graceful close lets an already-returned response body finish streaming.
      Promise.resolve().then(() => old.close()).catch(() => old.destroy()).catch(() => {}).finally(() => dispatchers.delete(old));
    }
    return dispatcher;
  }
  async function route(url, signal) {
    if (loopback(url)) return directDispatcher();
    if (hasInheritedProxy) {
      if (!environment) {
        const options = { ...inherited };
        for (const name of ['httpProxy', 'httpsProxy']) if (options[name]) options[name] = proxyAddress(options[name]);
        // Explicit empty values prevent ambient environment fallback, including
        // in synthetic tests or future embedding with a supplied environment.
        environment = remember(createEnvDispatcher(options));
      }
      return environment;
    }
    if (platform !== 'win32') return directDispatcher();
    // Resolve every complete URL: PAC can depend on path/query and change while
    // the app runs. Do not cache a stale route or silently fall back to DIRECT.
    const result = await abortable(resolveSystemProxy(url.href, { signal }), signal);
    signal.throwIfAborted();
    const uri = proxyResult(result);
    return uri === null ? directDispatcher() : proxyDispatcher(uri);
  }
  return {
    async fetch(input, init = {}) {
      if (closed) throw closedError();
      const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
      const signal = callerSignal ? AbortSignal.any([shutdown.signal, callerSignal]) : shutdown.signal;
      signal.throwIfAborted();
      let url, dispatcher;
      try {
        url = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 32768) throw routingError();
        url.hash = '';
        dispatcher = await route(url, signal);
      } catch { signal.throwIfAborted(); throw routingError(); }
      signal.throwIfAborted();
      // Custom dispatchers or redirects cannot escape destination-based routing.
      // Never replay a failed request, particularly a rotating OAuth POST.
      return fetchImpl(input, { ...init, dispatcher, redirect: 'error', signal });
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(closedError()); proxies.clear();
      closing = Promise.allSettled([...dispatchers].map(dispatcher => Promise.resolve().then(() => dispatcher.destroy()))).then(() => { dispatchers.clear(); });
      return closing;
    },
  };
}
