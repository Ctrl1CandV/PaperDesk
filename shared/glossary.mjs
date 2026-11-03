// A shared, reviewed glossary of abbreviations and named methods. It is a reading
// aid layered over immutable guide bodies: matching never rewrites guide text.
export const GLOSSARY_LIMITS = Object.freeze({ entries: 800, aliases: 12, text: 120, explain: 900, builds: 400 });

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const GUIDE_LINK = /^\/read\/([a-z0-9-]+)\/([1-9]\d*)(?:#([a-z0-9-]+))?$/;
const assert = (condition, message) => { if (!condition) throw new Error(`Glossary: ${message}`); };
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && value === value.trim();
const optionalText = (value, max) => value === undefined || text(value, max);
// ASCII aliases match whole words, so "RAG" does not fire inside "Self-RAG" or "RAGAS".
const wordLike = alias => /^[\x20-\x7e]+$/.test(alias);

/**
 * Validates glossary data. `guideTarget(id, revision, unitId?)` reports whether a
 * pinned library link exists; the content validator supplies it.
 */
export function validateGlossary(data, guideTarget = () => true) {
  assert(data && typeof data === 'object' && data.schemaVersion === 1 && Array.isArray(data.entries), 'unsupported format');
  assert(data.entries.length <= GLOSSARY_LIMITS.entries, 'too many entries');
  const ids = new Set(), aliases = new Map();
  for (const entry of data.entries) {
    const allowed = ['id', 'term', 'aliases', 'full', 'zh', 'field', 'explain', 'builds', 'guide', 'source'];
    assert(entry && typeof entry === 'object' && Object.keys(entry).every(key => allowed.includes(key)), `unknown field in ${entry?.id}`);
    assert(typeof entry.id === 'string' && ID.test(entry.id) && !ids.has(entry.id), `invalid or duplicate id ${entry.id}`);
    ids.add(entry.id);
    for (const [field, max] of [['term', GLOSSARY_LIMITS.text], ['field', GLOSSARY_LIMITS.text], ['explain', GLOSSARY_LIMITS.explain]]) assert(text(entry[field], max), `${entry.id}.${field} must be prose`);
    for (const [field, max] of [['full', 200], ['zh', GLOSSARY_LIMITS.text], ['builds', GLOSSARY_LIMITS.builds]]) assert(optionalText(entry[field], max), `${entry.id}.${field} is invalid`);
    assert(Array.isArray(entry.aliases) && entry.aliases.length > 0 && entry.aliases.length <= GLOSSARY_LIMITS.aliases, `${entry.id} needs aliases`);
    for (const alias of entry.aliases) {
      assert(text(alias, 80) && alias.length >= 2, `${entry.id} alias is invalid`);
      assert(!aliases.has(alias), `alias "${alias}" is used by ${aliases.get(alias)} and ${entry.id}`);
      aliases.set(alias, entry.id);
    }
    if (entry.guide !== undefined) {
      const match = typeof entry.guide === 'string' && GUIDE_LINK.exec(entry.guide);
      assert(match && guideTarget(match[1], Number(match[2]), match[3]), `${entry.id}.guide does not resolve`);
    }
    if (entry.source !== undefined) {
      const source = entry.source;
      assert(source && typeof source === 'object' && Object.keys(source).every(key => ['label', 'url'].includes(key)) && text(source.label, 200), `${entry.id}.source is invalid`);
      let url; try { url = new URL(source.url); } catch { url = null; }
      assert(url && (url.protocol === 'https:' || url.protocol === 'http:') && source.url.length <= 2048, `${entry.id}.source.url is invalid`);
    }
  }
  return data.entries.length;
}

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds a matcher over all aliases; longer aliases win where they overlap. */
export function termMatcher(entries) {
  const pairs = entries.flatMap(entry => entry.aliases.map(alias => [alias, entry.id])).sort((a, b) => b[0].length - a[0].length);
  if (!pairs.length) return { find: () => [] };
  const byAlias = new Map(pairs);
  const pattern = new RegExp(pairs.map(([alias]) => wordLike(alias) ? `(?<![A-Za-z0-9_\\-])${escape(alias)}(?![A-Za-z0-9_])` : escape(alias)).join('|'), 'gu');
  return {
    /** Non-overlapping matches in reading order: { start, end, id }. */
    find(value) {
      const found = [];
      for (const match of value.matchAll(pattern)) found.push({ start: match.index, end: match.index + match[0].length, id: byAlias.get(match[0]) });
      return found;
    },
  };
}

/**
 * Splits text into plain and term segments, marking only terms not yet in `seen`
 * (one mark per term per section keeps the page quiet). Mutates `seen`.
 */
export function splitTerms(value, matcher, seen) {
  const segments = [];
  let at = 0;
  for (const match of matcher.find(value)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    if (match.start > at) segments.push({ text: value.slice(at, match.start) });
    segments.push({ text: value.slice(match.start, match.end), id: match.id });
    at = match.end;
  }
  if (at < value.length) segments.push({ text: value.slice(at) });
  return segments;
}

/** Terms that occur in a text, in order of first appearance. */
export function termsIn(value, matcher) {
  return [...new Set(matcher.find(value).map(match => match.id))];
}
