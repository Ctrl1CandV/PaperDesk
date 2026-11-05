import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { isSafeExternalUrl, validateDiagram } from '../../shared/content-policy.mjs';
import { validateGlossary } from '../../shared/glossary.mjs';
import { limits, packageFile, projectRoot } from './validation.mjs';

const parser = unified().use(remarkParse).use(remarkGfm);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cjk = /[\u3400-\u9fff]/u;
const reject = (label, reason) => { throw new Error(`${label}: ${reason}`); };
const textOf = node => node.value ?? (node.children ?? []).map(textOf).join('');

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * Validate the optional English translation manifest and glossary. The Chinese
 * guide metadata remains authoritative; an English body may not add citations,
 * images or sections. This is structural validation, not a translation review.
 */
export async function validateTranslations({ rootDir = projectRoot, guides, manifestFile = 'content/translations.json', glossaryFile = 'content/glossary-en.json' } = {}) {
  let data;
  try { data = JSON.parse(utf8.decode(await readFile(await packageFile(rootDir, manifestFile)))); }
  catch (error) { if (error.code === 'ENOENT') return { guides: 0, glossary: 0 }; throw error; }
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.guides)) reject(manifestFile, 'unsupported format');
  const byKey = new Map(guides.map(guide => [`${guide.metadata.id}/${guide.metadata.revision}`, guide]));
  const seen = new Set();
  for (const item of data.guides) {
    if (!item || typeof item !== 'object') reject(manifestFile, 'invalid entry');
    const allowed = ['guideId', 'revision', 'language', 'title', 'bodyFile', 'bodySha256', 'assets'];
    if (Object.keys(item).some(key => !allowed.includes(key))) reject(manifestFile, `unknown field for ${item.guideId}`);
    if (item.language !== 'en' || typeof item.guideId !== 'string' || !Number.isInteger(item.revision)) reject(manifestFile, 'invalid guide identity');
    const guide = byKey.get(`${item.guideId}/${item.revision}`);
    if (!guide) reject(manifestFile, `unknown guide ${item.guideId}/${item.revision}`);
    const key = `${item.guideId}/${item.revision}/${item.language}`;
    if (seen.has(key)) reject(manifestFile, `duplicate ${key}`);
    seen.add(key);
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 || cjk.test(item.title)) reject(manifestFile, `invalid title for ${key}`);
    if (typeof item.bodySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.bodySha256)) reject(manifestFile, `invalid body hash for ${key}`);
    const bodyFile = `content/${item.bodyFile}`;
    const bytes = await readFile(await packageFile(rootDir, bodyFile));
    if (bytes.byteLength > limits.body) reject(bodyFile, 'file exceeds size limit');
    if (hash(bytes) !== item.bodySha256) reject(bodyFile, 'body hash mismatch');
    let body;
    try { body = utf8.decode(bytes); } catch { reject(bodyFile, 'invalid UTF-8 Markdown'); }
    if (cjk.test(body)) reject(bodyFile, 'English body contains CJK characters');
    const tree = parser.parse(body), headings = [], titles = [], links = [], images = [], definitions = new Map();
    walk(tree, node => { if (node.type === 'definition') definitions.set(node.identifier, node.url); });
    walk(tree, node => {
      if (node.type === 'html') reject(bodyFile, 'raw HTML is not allowed');
      if (node.type === 'heading' && node.depth === 1) titles.push(textOf(node));
      if (node.type === 'heading' && node.depth === 2) headings.push(textOf(node));
      if (node.type === 'code' && node.lang === 'mermaid') { try { validateDiagram(node.value); } catch { reject(bodyFile, 'unsafe diagram'); } }
      if (['link', 'image', 'linkReference', 'imageReference'].includes(node.type)) {
        const destination = node.url ?? definitions.get(node.identifier);
        if (!destination) reject(bodyFile, 'unresolved link definition');
        (node.type.startsWith('image') ? images : links).push({ url: destination, label: node.alt ?? textOf(node) });
      }
    });
    if (titles.length !== 1 || titles[0] !== item.title || tree.children[0]?.type !== 'heading' || tree.children[0]?.depth !== 1) reject(bodyFile, 'exact single leading English title required');
    if (headings.length !== guide.metadata.units.length - 1) reject(bodyFile, 'English unit heading count differs from the revision');
    for (const link of links) {
      if (/^https?:/u.test(link.url)) {
        if (!isSafeExternalUrl(link.url)) reject(bodyFile, 'invalid external URL');
        if (!guide.metadata.citations.some(citation => citation.url === link.url)) reject(bodyFile, 'external link absent from citation inventory');
      } else if (link.url.startsWith('#')) {
        if (!guide.metadata.units.some(unit => `#${unit.id}` === link.url)) reject(bodyFile, 'unknown unit fragment');
      } else if (link.url.startsWith('/read/')) {
        const match = link.url.match(/^\/read\/([a-z0-9-]+)\/([1-9]\d*)(?:#([a-z0-9-]+))?$/u);
        const target = match && byKey.get(`${match[1]}/${match[2]}`);
        if (!target || (match[3] && !target.metadata.units.some(unit => unit.id === match[3]))) reject(bodyFile, 'unknown pinned guide target');
      } else reject(bodyFile, 'unknown internal translation target');
    }
    const assetPaths = new Set(guide.metadata.assets.map(asset => asset.path));
    const declared = item.assets ?? [];
    if (!Array.isArray(declared) || declared.length !== assetPaths.size) reject(manifestFile, `asset overrides missing for ${key}`);
    const overridePaths = new Set();
    for (const asset of declared) {
      if (!asset || typeof asset.path !== 'string' || !assetPaths.has(asset.path) || overridePaths.has(asset.path)) reject(manifestFile, `invalid asset override for ${key}`);
      if (typeof asset.alt !== 'string' || !asset.alt.trim() || typeof asset.rights !== 'string' || !asset.rights.trim() || cjk.test(asset.alt) || cjk.test(asset.rights)) reject(manifestFile, `English asset text is incomplete for ${asset.path}`);
      overridePaths.add(asset.path);
    }
    const usedAssets = new Set(images.map(image => image.url));
    for (const image of images) {
      if (!image.label.trim() || !assetPaths.has(image.url)) reject(bodyFile, 'image requires declared asset and English alt text');
    }
    if (usedAssets.size !== assetPaths.size || [...assetPaths].some(path => !usedAssets.has(path))) reject(bodyFile, 'English body must use every declared image');
    if (item.bodyFile.includes('..') || item.bodyFile.startsWith('/')) reject(manifestFile, `invalid English body path for ${key}`);
  }
  // The English glossary is a separate card layer; validate it with the same
  // shared rules, then require English-only prose and resolvable guide links.
  let glossary = 0;
  try {
    const value = JSON.parse(utf8.decode(await readFile(await packageFile(rootDir, glossaryFile))));
    glossary = validateGlossary(value, (id, revision, unitId) => guides.some(guide => guide.metadata.id === id && guide.metadata.revision === revision && (!unitId || guide.metadata.units.some(unit => unit.id === unitId))));
    for (const entry of value.entries) {
      for (const field of ['term', 'field', 'explain', 'builds', 'full', 'zh']) if (typeof entry[field] === 'string' && cjk.test(entry[field])) reject(glossaryFile, `CJK text in ${entry.id}.${field}`);
      if (entry.source && cjk.test(entry.source.label)) reject(glossaryFile, `CJK source label in ${entry.id}`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { guides: data.guides.length, glossary };
}
