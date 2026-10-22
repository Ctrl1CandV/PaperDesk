import catalog from '../../content/catalog.json';
import type { Guide, GuideMetadata, ExplorationSeed } from './types';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

const metadataFiles = import.meta.glob('../../content/**/*.json', { eager: true, import: 'default' });
const bodies = import.meta.glob('../../content/**/*.md', { eager: true, query: '?raw', import: 'default' });
const current = catalog.currentRevisions as Record<string, number>;
const assets = import.meta.glob('../../content/**/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' });
const cache = new Map<string, Guide>();

// All package invariants are checked before dev and production build.
function loadGuide(id: string, revision: number): Guide | undefined {
  const key = `${id}/${revision}`;
  if (cache.has(key)) return cache.get(key);
  const entry = catalog.entries.find(item => item.guideId === id && item.revision === revision);
  if (!entry) return undefined;
  const metadata = metadataFiles[`../../content/${entry.metadataFile}`] as GuideMetadata;
  const directory = entry.metadataFile.slice(0, entry.metadataFile.lastIndexOf('/') + 1);
  const bodyPath = directory + metadata.bodyFile;
  const body = bodies[`../../content/${bodyPath}`] as string;
  const tree = unified().use(remarkParse).parse(body);
  const offsets = [0, ...tree.children.filter(node => node.type === 'heading' && node.depth === 2).map(node => node.position!.start.offset!)];
  const definitions = tree.children.filter(node => node.type === 'definition').map(node => body.slice(node.position!.start.offset!, node.position!.end.offset!)).join('\n');
  const guide = { metadata, body, bodyPath, packageDirectory: directory, units: metadata.units.map((unit, index) => ({ ...unit,
    markdown: body.slice(offsets[index], offsets[index + 1]) + (definitions ? `\n\n${definitions}\n` : ''),
  })) };
  cache.set(key, guide);
  return guide;
}

export const contentRepository = {
  get: loadGuide,
  currentRevision(id: string) { return current[id]; },
  getExplorationSeed(revision = catalog.exploration.currentRevision): ExplorationSeed | undefined {
    const file = (catalog.exploration.revisions as Record<string, string>)[String(revision)];
    return file ? metadataFiles[`../../content/${file}`] as ExplorationSeed : undefined;
  },
  getLens(id: string, revision = catalog.exploration.currentRevision) {
    const file = (catalog.exploration.revisions as Record<string, string>)[String(revision)];
    const seed = file ? metadataFiles[`../../content/${file}`] as ExplorationSeed : undefined;
    return seed?.lenses.find(lens => lens.id === id);
  },
  list() {
    return catalog.entries.filter(entry => current[entry.guideId] === entry.revision)
      .sort((a, b) => a.recommendation.rank - b.recommendation.rank)
      .map(entry => ({ ...entry, guide: loadGuide(entry.guideId, entry.revision)! }));
  },
  resolveRelated(guide: Guide, link: string) {
    if (link.startsWith('#')) return guide.metadata.units.some(unit => `#${unit.id}` === link) ? link : undefined;
    const pinned = /^\/read\/([a-z0-9-]+)\/([1-9]\d*)(#[a-z0-9-]+)?$/.exec(link);
    if (pinned) {
      const target = loadGuide(pinned[1], Number(pinned[2]));
      return target && (!pinned[3] || target.units.some(unit => `#${unit.id}` === pinned[3])) ? link : undefined;
    }
    const [file, fragment] = link.split('#');
    const target = `${guide.packageDirectory}${file}`;
    const match = catalog.entries.map(entry => loadGuide(entry.guideId, entry.revision)!).find(candidate => candidate.bodyPath === target);
    return match ? `/read/${match.metadata.id}/${current[match.metadata.id]}${fragment ? '#' + fragment : ''}` : undefined;
  },
  resolveAsset(guide: Guide, link: string) {
    return guide.metadata.assets.some(asset => asset.path === link) ? assets[`../../content/${guide.packageDirectory}${link}`] as string | undefined : undefined;
  },
};
