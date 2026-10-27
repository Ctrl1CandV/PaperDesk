import index from './catalog-index.json';
import type { Guide, GuideMetadata, GuideSummary, ExplorationSeed } from './types';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

// URL-only imports emit separate immutable assets. Unlike dynamic raw imports,
// fetched strings do not remain indefinitely in the ES-module cache.
const files = import.meta.glob('../../content/**/*.{json,md}', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const assets = import.meta.glob('../../content/**/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const current = index.currentRevisions as Record<string, number>;
const entries = index.entries as (Omit<typeof index.entries[number], 'guide'> & { guide: GuideSummary })[];
const byKey = new Map(entries.map(entry => [`${entry.guideId}/${entry.revision}`, entry]));
const byBody = new Map(entries.map(entry => [entry.guide.bodyPath, entry.guideId]));
const summaries = entries.filter(entry => current[entry.guideId] === entry.revision).sort((a, b) => a.recommendation.rank - b.recommendation.rank);
const cache = new Map<string, { guide: Guide; bytes: number }>();
const pending = new Map<string, { controller: AbortController; promise: Promise<Guide>; readers: number }>();
const seedCache = new Map<number, ExplorationSeed>();
const CACHE_BYTES = 4 * 1024 * 1024;
const CACHE_GUIDES = 8;
let cacheBytes = 0;

async function checkedText(path: string, expectedHash: string, limit: number, signal?: AbortSignal) {
  const url = files[`../../content/${path}`];
  if (!url) throw new Error('该修订的内容文件不可用。');
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('读取内容失败，请重试。');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('内容文件超过读取限额。');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('内容版本校验不一致，请重新构建后刷新页面。');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function remember(key: string, guide: Guide, bytes: number) {
  // Count original and per-unit strings conservatively. An oversized article
  // remains readable but is not retained after leaving the reader.
  if (bytes > CACHE_BYTES) return;
  while (cache.size >= CACHE_GUIDES || cacheBytes + bytes > CACHE_BYTES) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest);
  }
  cache.set(key, { guide, bytes }); cacheBytes += bytes;
}
async function loadGuide(id: string, revision: number, options: { signal?: AbortSignal } = {}): Promise<Guide | undefined> {
  const key = `${id}/${revision}`, entry = byKey.get(key), signal = options.signal;
  if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
  if (!entry) return undefined;
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached.guide; }
  let task = pending.get(key);
  if (!task || task.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = (async () => {
      const [raw, body] = await Promise.all([
        checkedText(entry.metadataFile, entry.metadataSha256, 2 * 1024 * 1024, controller.signal),
        checkedText(entry.guide.bodyPath, entry.bodySha256, 1024 * 1024, controller.signal),
      ]);
      const metadata = JSON.parse(raw) as GuideMetadata;
      const tree = unified().use(remarkParse).parse(body);
      const offsets = [0, ...tree.children.filter(node => node.type === 'heading' && node.depth === 2).map(node => node.position!.start.offset!)];
      const definitions = tree.children.filter(node => node.type === 'definition').map(node => body.slice(node.position!.start.offset!, node.position!.end.offset!)).join('\n');
      const guide: Guide = { metadata, body, bodyPath: entry.guide.bodyPath, packageDirectory: entry.guide.packageDirectory,
        units: metadata.units.map((unit, at) => ({ ...unit, markdown: body.slice(offsets[at], offsets[at + 1]) + (definitions ? `\n\n${definitions}\n` : '') })) };
      if (!controller.signal.aborted) remember(key, guide, (raw.length + body.length + guide.units.reduce((sum, unit) => sum + unit.markdown.length, 0)) * 2);
      return guide;
    })();
    task = { controller, promise, readers: 0 }; pending.set(key, task);
    const retained = task;
    void promise.finally(() => { if (pending.get(key) === retained) pending.delete(key); }).catch(() => {});
  }
  task.readers++;
  const shared = task;
  return new Promise<Guide>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort); shared.readers--;
      // StrictMode releases and immediately reacquires the same route. Give
      // that subscriber a microtask to reuse the request; real navigation still
      // cancels before a later network result can update the old reader.
      if (!shared.readers) queueMicrotask(() => {
        if (!shared.readers && pending.get(key) === shared) shared.controller.abort();
      });
      callback();
    };
    const abort = () => finish(() => reject(new DOMException('已取消读取', 'AbortError')));
    signal?.addEventListener('abort', abort, { once: true });
    shared.promise.then(guide => finish(() => resolve(guide)), error => finish(() => reject(error)));
  });
}

export const contentRepository = {
  get: loadGuide,
  getSummary(id: string, revision: number) { return byKey.get(`${id}/${revision}`)?.guide; },
  currentRevision(id: string) { return current[id]; },
  revisions(id: string) { return entries.filter(entry => entry.guideId === id).map(entry => entry.revision); },
  async getExplorationSeed(revision = index.exploration.currentRevision, signal?: AbortSignal): Promise<ExplorationSeed | undefined> {
    const file = (index.exploration.revisions as Record<string, { file: string; sha256: string }>)[String(revision)];
    if (!file) return undefined;
    if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
    if (seedCache.has(revision)) return seedCache.get(revision);
    const seed = JSON.parse(await checkedText(file.file, file.sha256, 2 * 1024 * 1024, signal)) as ExplorationSeed;
    if (seedCache.size >= 4) seedCache.delete(seedCache.keys().next().value!);
    seedCache.set(revision, seed); return seed;
  },
  list() { return summaries; },
  resolveRelated(guide: Guide, link: string) {
    if (link.startsWith('#')) return guide.metadata.units.some(unit => `#${unit.id}` === link) ? link : undefined;
    const pinned = /^\/read\/([a-z0-9-]+)\/([1-9]\d*)(#[a-z0-9-]+)?$/.exec(link);
    if (pinned) {
      const target = byKey.get(`${pinned[1]}/${pinned[2]}`)?.guide;
      return target && (!pinned[3] || target.units.some(unit => `#${unit.id}` === pinned[3])) ? link : undefined;
    }
    const [file, fragment] = link.split('#');
    const id = byBody.get(`${guide.packageDirectory}${file}`);
    const target = id && byKey.get(`${id}/${current[id]}`)?.guide;
    return target && (!fragment || target.units.some(unit => unit.id === fragment)) ? `/read/${id}/${current[id!]}${fragment ? '#' + fragment : ''}` : undefined;
  },
  resolveAsset(guide: Guide, link: string) {
    return guide.metadata.assets.some(asset => asset.path === link) ? assets[`../../content/${guide.packageDirectory}${link}`] : undefined;
  },
};
