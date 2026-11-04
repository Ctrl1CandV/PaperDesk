// Derives a new guide revision's metadata from its Markdown body and a small spec:
// units from the ## headings, the citation inventory from body links, assets with
// hashes from body images, plus the editorial fields given in the spec.
// Usage: node scripts/content/new-revision.mjs <spec.json>   (spec format: docs/content/workflows/GUIDE-WRITING.md)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const specFile = process.argv[2];
if (!specFile) { console.error('Usage: node scripts/content/new-revision.mjs <spec.json>'); process.exit(1); }
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const guides = resolve('content/guides');
const base = JSON.parse(readFileSync(resolve(guides, spec.base), 'utf8'));
const body = readFileSync(resolve(guides, spec.bodyFile));
const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body.toString('utf8'));
const text = node => typeof node.value === 'string' ? node.value : (node.children ?? []).map(text).join('');
const headings = tree.children.filter(node => node.type === 'heading' && node.depth === 2).map(text);
if (headings.length !== spec.unitIds.length - 1) throw new Error(`unitIds lists ${spec.unitIds.length - 1} sections after the opening, the body has ${headings.length} ## headings`);
const links = new Map(), images = [];
(function walk(node) {
  if (node.type === 'link' && /^https?:/.test(node.url)) {
    const labels = links.get(node.url) ?? []; const label = text(node);
    if (!labels.includes(label)) labels.push(label);
    links.set(node.url, labels);
  }
  if (node.type === 'image' && !images.includes(node.url)) images.push(node.url);
  (node.children ?? []).forEach(walk);
})(tree);
const citations = [...links].map(([url, labels], index) => {
  const info = (spec.citationInfo ?? []).find(item => url.startsWith(item.prefix)) ?? {};
  return { id: `c${String(index + 1).padStart(2, '0')}`, url, labels, role: info.role ?? 'primary', sourceVersion: info.sourceVersion ?? base.source.version };
});
const mimes = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const assets = images.map(path => {
  const declared = spec.assets?.[path];
  if (!declared) throw new Error(`spec.assets lacks alt/origin/rights for ${path}`);
  const bytes = readFileSync(resolve(guides, path));
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), mime: mimes[path.split('.').pop().toLowerCase()], ...declared };
});
const title = text(tree.children[0]);
const metadata = { ...base, revision: spec.revision, title, bodyFile: spec.bodyFile,
  bodySha256: createHash('sha256').update(body).digest('hex'),
  units: spec.unitIds.map((id, index) => ({ id, heading: index ? headings[index - 1] : null })),
  citations, related: spec.related ?? base.related, assets,
  coverage: spec.coverage ?? base.coverage,
  orientation: { ...base.orientation, ...(spec.orientation ?? {}) }, ...(spec.top ?? {}) };
writeFileSync(resolve(guides, spec.out), JSON.stringify(metadata, null, 2) + '\n');
console.log(`${spec.out}: ${metadata.units.length} units, ${citations.length} citations, ${assets.length} assets`);
