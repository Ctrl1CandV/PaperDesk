import { normalizedRelativePath } from '../../shared/package-path.mjs';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { isSafeExternalUrl, validateDiagram } from '../../shared/content-policy.mjs';
import { validateReadingAssignments } from '../../shared/reading-assignments.mjs';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const limits = Object.freeze({ json: 2 * 1024 * 1024, body: 1024 * 1024, asset: 10 * 1024 * 1024, package: 64 * 1024 * 1024 });
const parser = unified().use(remarkParse).use(remarkGfm);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reject = (label, reason) => { throw new Error(`${label}: ${reason}`); };

export { normalizedRelativePath } from '../../shared/package-path.mjs';

/** Inspect each component before reading; no linked package paths are followed. */
export async function packageFile(rootDir, relativeFile) {
  normalizedRelativePath(relativeFile);
  let current = path.resolve(rootDir);
  try {
    if ((await lstat(current)).isSymbolicLink()) reject('Package root', 'symlink is not allowed');
    const physicalRoot = await realpath(current);
    const compare = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (compare(physicalRoot) !== compare(current)) reject('Package root', 'symlink ancestor is not allowed');
    for (const part of relativeFile.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) reject(relativeFile, 'symlink is not allowed');
    }
    if (!(await lstat(current)).isFile()) reject(relativeFile, 'expected a regular file');
  } catch (error) {
    if (error.code) reject(relativeFile, `file unavailable (${error.code})`);
    throw error;
  }
  return current;
}

function fromDirectory(file, relative) {
  normalizedRelativePath(relative);
  const directory = path.posix.dirname(file);
  return directory === '.' ? relative : `${directory}/${relative}`;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) reject(label, 'duplicate value');
}
function walk(node, visit) { visit(node); for (const child of node.children ?? []) walk(child, visit); }
function nodeText(node) { return node.value ?? (node.children ?? []).map(nodeText).join(''); }
function url(value, label) { if (!isSafeExternalUrl(value)) reject(label, 'invalid HTTP(S) URL'); }
function knownVersion(value, version, label) {
  const parsed = new URL(value);
  if (parsed.hostname === 'arxiv.org') {
    const match = parsed.pathname.match(/^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?$/u);
    if (match?.[2] && match[2] !== version) reject(label, 'source version differs from URL');
  }
}

let validatorsPromise;
async function trustedValidators() {
  validatorsPromise ??= (async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const result = {};
    for (const name of ['catalog', 'guide', 'guide-v2', 'exploration']) {
      result[name] = ajv.compile(JSON.parse(await readFile(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8')));
    }
    return result;
  })();
  return validatorsPromise;
}

/** Read-only validation. Schemas always come from this application, never the input package. */
export async function validateContent({ rootDir = projectRoot, catalogFile = 'content/catalog.json' } = {}) {
  const validators = await trustedValidators();
  const bytesRead = new Map();
  async function bytes(file, bound) {
    const full = await packageFile(rootDir, file);
    let data;
    try {
      const stat = await lstat(full);
      if (stat.size > bound) reject(file, 'file exceeds size limit');
      data = await readFile(full);
    } catch (error) {
      if (error.code) reject(file, `read unavailable (${error.code})`);
      throw error;
    }
    if (data.byteLength > bound) reject(file, 'file exceeds size limit');
    bytesRead.set(file, data.byteLength);
    if ([...bytesRead.values()].reduce((sum, count) => sum + count, 0) > limits.package) reject('Package', 'total size limit exceeded');
    return data;
  }
  async function json(file, kind) {
    let value;
    try { value = JSON.parse(utf8.decode(await bytes(file, limits.json))); }
    catch (error) { if (error instanceof SyntaxError || error instanceof TypeError) reject(file, 'invalid UTF-8 JSON'); throw error; }
    const validator = validators[kind === 'guide' && value?.schemaVersion === 2 ? 'guide-v2' : kind];
    if (!validator(value)) {
      const issue = validator.errors[0];
      reject(file, `schema violation at ${issue.instancePath || '/'} (${issue.keyword})`);
    }
    return value;
  }
  const catalog = await json(catalogFile, 'catalog');
  validateReadingAssignments(catalog.readingAssignments, (id, revision) => catalog.entries.some(entry => entry.guideId === id && entry.revision === revision));
  unique(catalog.entries.map((entry) => `${entry.guideId}/${entry.revision}`), 'Catalog guide revisions');
  unique(catalog.entries.map((entry) => entry.metadataFile.toLowerCase()), 'Catalog metadata paths');
  const guides = [];
  const guideByKey = new Map();
  const guideByBody = new Map();
  const identities = new Map();
  for (const entry of catalog.entries) {
    const metadataFile = fromDirectory(catalogFile, entry.metadataFile);
    const metadata = await json(metadataFile, 'guide');
    const key = `${metadata.id}/${metadata.revision}`;
    if (entry.guideId !== metadata.id || entry.revision !== metadata.revision) reject(metadataFile, 'catalog identity mismatch');
    if (identities.has(metadata.id) && identities.get(metadata.id) !== metadata.paperId) reject(metadataFile, 'paper identity changed across revisions');
    identities.set(metadata.id, metadata.paperId);
    url(metadata.source.url, metadataFile);
    knownVersion(metadata.source.url, metadata.source.version, metadataFile);
    if (metadata.paperId.startsWith('arxiv:') && new URL(metadata.source.url).hostname === 'arxiv.org') {
      const identifier = new URL(metadata.source.url).pathname.match(/^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/u)?.[1];
      if (`arxiv:${identifier}` !== metadata.paperId) reject(metadataFile, 'main source paper identity differs from URL');
    }
    unique(metadata.units.map((unit) => unit.id), `${metadataFile} units`);
    unique(metadata.citations.map((citation) => citation.id), `${metadataFile} citation IDs`);
    unique(metadata.citations.map((citation) => citation.url), `${metadataFile} citation URLs`);
    unique(metadata.assets.map((asset) => asset.path.toLowerCase()), `${metadataFile} assets`);
    unique(metadata.related.map((item) => item.guideId), `${metadataFile} related guides`);
    if (metadata.orientation) {
      const orientation = metadata.orientation;
      url(orientation.bibliography.url, `${metadataFile} bibliography`);
      unique(orientation.topics.map(topic => topic.id), `${metadataFile} topic IDs`);
      unique(orientation.topics.map(topic => topic.label.toLocaleLowerCase()), `${metadataFile} topic labels`);
      unique(orientation.readingTargets.map(target => target.unitId), `${metadataFile} reading targets`);
      for (const topic of orientation.topics) unique(topic.aliases.map(alias => alias.toLocaleLowerCase()), `${metadataFile} topic aliases`);
      for (const target of orientation.readingTargets) {
        if (!metadata.units.some(unit => unit.id === target.unitId)) reject(metadataFile, 'orientation reading target missing');
        unique(target.concepts.map(concept => concept.toLocaleLowerCase()), `${metadataFile} reading concepts`);
      }
      const bibliography = orientation.bibliography;
      if (['conference', 'journal'].includes(bibliography.publicationKind) && (bibliography.year === null || bibliography.venue === null)) reject(metadataFile, 'published bibliography requires year and venue');
    }
    for (const citation of metadata.citations) {
      url(citation.url, metadataFile);
      knownVersion(citation.url, citation.sourceVersion, metadataFile);
      unique(citation.labels, `${metadataFile} citation labels`);
    }
    if (!metadata.citations.some((citation) => citation.url === metadata.source.url && citation.role === 'primary'
      && citation.sourceVersion === metadata.source.version)) reject(metadataFile, 'main source missing from primary citation inventory');
    if (metadata.coverage.scope !== 'full-survey' && metadata.coverage.limitations.length === 0) reject(metadataFile, 'partial coverage requires explicit limitations');
    if (metadata.coverage.scope === 'full-survey' && (metadata.coverage.basis !== 'fulltext' || metadata.coverage.figuresViewed.length === 0)) reject(metadataFile, 'full-survey requires fulltext and figure review declarations');
    const bodyFile = fromDirectory(metadataFile, metadata.bodyFile);
    const bodyBytes = await bytes(bodyFile, limits.body);
    if (hash(bodyBytes) !== metadata.bodySha256) reject(bodyFile, 'body hash mismatch');
    let body;
    try { body = utf8.decode(bodyBytes); } catch { reject(bodyFile, 'invalid UTF-8 Markdown'); }
    const tree = parser.parse(body);
    const headings = [];
    const titles = [];
    const links = [];
    const images = [];
    const definitions = new Map();
    walk(tree, (node) => {
      if (node.type === 'definition') {
        if (definitions.has(node.identifier)) reject(bodyFile, 'duplicate link definition');
        definitions.set(node.identifier, node.url);
      }
    });
    walk(tree, (node) => {
      if (node.type === 'html') reject(bodyFile, 'raw HTML is not allowed');
      if (node.type === 'heading' && node.depth === 1) titles.push(nodeText(node));
      if (node.type === 'heading' && node.depth === 2) headings.push(nodeText(node));
      if (node.type === 'code' && node.lang === 'mermaid') {
        try { validateDiagram(node.value); } catch { reject(bodyFile, 'unsafe or unsupported diagram syntax'); }
      }
      if (['link', 'image', 'linkReference', 'imageReference'].includes(node.type)) {
        const destination = node.url ?? definitions.get(node.identifier);
        if (!destination) reject(bodyFile, 'unresolved link definition');
        (node.type.startsWith('image') ? images : links).push({ url: destination, label: node.alt ?? nodeText(node) });
      }
    });
    if (titles.length !== 1 || titles[0] !== metadata.title || tree.children[0]?.type !== 'heading' || tree.children[0]?.depth !== 1) reject(bodyFile, 'exact single leading title required');
    if (metadata.units[0].heading !== null || metadata.units.slice(1).some((unit) => unit.heading === null)
      || JSON.stringify(headings) !== JSON.stringify(metadata.units.slice(1).map((unit) => unit.heading))) reject(bodyFile, 'unit heading/order mismatch');
    const guide = { metadata, metadataFile, bodyFile, body, links, images, recommendation: entry.recommendation };
    if (guideByBody.has(bodyFile.toLowerCase()) && guideByBody.get(bodyFile.toLowerCase()).metadata.id !== metadata.id) reject(bodyFile, 'body path ambiguous across guide IDs');
    guideByBody.set(bodyFile.toLowerCase(), guide);
    guideByKey.set(key, guide);
    guides.push(guide);
    for (const asset of metadata.assets) {
      url(asset.origin, metadataFile);
      const assetBytes = await bytes(fromDirectory(metadataFile, asset.path), limits.asset);
      if (hash(assetBytes) !== asset.sha256) reject(asset.path, 'asset hash mismatch');
      const actualMime = assetBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
        : assetBytes[0] === 255 && assetBytes[1] === 216 && assetBytes[2] === 255 ? 'image/jpeg'
          : assetBytes.toString('ascii', 0, 4) === 'RIFF' && assetBytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
      if (actualMime !== asset.mime) reject(asset.path, 'asset content does not match approved image MIME');
    }
  }
  const currentEntries = [];
  for (const [id, revision] of Object.entries(catalog.currentRevisions)) {
    const selected = guideByKey.get(`${id}/${revision}`);
    if (!selected) reject('Catalog', 'current revision target missing');
    currentEntries.push(selected);
  }
  if (currentEntries.length !== identities.size) reject('Catalog', 'every guide requires a current revision');
  for (const id of catalog.archivedGuideIds ?? []) {
    if (!Object.hasOwn(catalog.currentRevisions, id)) reject('Catalog', 'archived guide target missing');
  }
  unique(currentEntries.map((guide) => guide.recommendation.rank), 'Current recommendation ranks');
  for (const guide of guides) {
    const { metadata, bodyFile, metadataFile, links, images } = guide;
    const cited = new Map();
    for (const link of links) {
      if (/^https?:/u.test(link.url)) {
        url(link.url, bodyFile);
        const citation = metadata.citations.find((candidate) => candidate.url === link.url);
        if (!citation || !citation.labels.includes(link.label)) reject(bodyFile, 'external link or label absent from citation inventory');
        if (!cited.has(link.url)) cited.set(link.url, new Set());
        cited.get(link.url).add(link.label);
      } else if (link.url.startsWith('#')) {
        if (!metadata.units.some((unit) => `#${unit.id}` === link.url)) reject(bodyFile, 'unknown unit fragment');
      } else if (link.url.startsWith('/read/')) {
        const match = link.url.match(/^\/read\/([a-z0-9-]+)\/([1-9]\d*)(?:#([a-z0-9-]+))?$/u);
        const target = match && guideByKey.get(`${match[1]}/${match[2]}`);
        if (!target || match[3] && !target.metadata.units.some((unit) => unit.id === match[3])) reject(bodyFile, 'unknown pinned guide target');
      } else {
        const [file, fragment, extra] = link.url.split('#');
        const target = guideByBody.get(fromDirectory(metadataFile, file).toLowerCase());
        if (!target || extra !== undefined) reject(bodyFile, 'unknown internal guide target');
        const current = guideByKey.get(`${target.metadata.id}/${catalog.currentRevisions[target.metadata.id]}`);
        if (fragment && !current.metadata.units.some((unit) => unit.id === fragment)) reject(bodyFile, 'unknown current guide unit');
      }
    }
    for (const citation of metadata.citations) {
      if (citation.labels.some((label) => !cited.get(citation.url)?.has(label))) reject(metadataFile, 'dangling citation label');
    }
    for (const image of images) {
      normalizedRelativePath(image.url);
      if (!image.label.trim() || !metadata.assets.some((asset) => asset.path === image.url)) reject(bodyFile, 'image requires declared local asset and alternative text');
    }
    for (const asset of metadata.assets) if (!images.some((image) => image.url === asset.path)) reject(metadataFile, 'dangling asset');
    for (const related of metadata.related) if (!identities.has(related.guideId)) reject(metadataFile, 'related guide missing');
  }
  const explorations = [];
  if (!Object.hasOwn(catalog.exploration.revisions, catalog.exploration.currentRevision)) reject('Catalog', 'current exploration revision missing');
  unique(Object.values(catalog.exploration.revisions).map((file) => file.toLowerCase()), 'Exploration revision paths');
  let targetCount = 0;
  for (const [revision, file] of Object.entries(catalog.exploration.revisions)) {
    const seedFile = fromDirectory(catalogFile, file);
    const seed = await json(seedFile, 'exploration');
    if (String(seed.revision) !== revision) reject(seedFile, 'exploration revision mismatch');
    unique(seed.lenses.map((lens) => lens.id), `${seedFile} lens IDs`);
    unique(seed.lenses.map((lens) => lens.rank), `${seedFile} lens ranks`);
    for (const lens of seed.lenses) for (const target of [...lens.guideRefs, lens.nextAction.target]) {
      const guide = guideByKey.get(`${target.guideId}/${target.revision}`);
      if (!guide || !guide.metadata.units.some((unit) => unit.id === target.unitId)) reject(seedFile, 'exploration guide/revision/unit target missing');
      targetCount++;
    }
    explorations.push({ seed, seedFile });
  }
  return { catalog, guides, explorations, summary: { guides: guides.length, units: guides.reduce((sum, guide) => sum + guide.metadata.units.length, 0), citationUrls: new Set(guides.flatMap((guide) => guide.metadata.citations.map((item) => item.url))).size, lenses: explorations.reduce((sum, item) => sum + item.seed.lenses.length, 0), explorationTargets: targetCount } };
}

/** JSON identity comparison for later immutable-revision import checks. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
