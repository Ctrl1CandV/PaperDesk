import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { limits, packageFile, projectRoot } from './validation.mjs';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = (label, reason) => { throw new Error(`${label}: ${reason}`); };
// A stop is said aloud in about a minute and read from a projector; these caps keep it that way.
export const PRESENTATION_LIMITS = Object.freeze({ parts: 6, stops: 20, stopsPerPart: 6, points: 6, title: 40, label: 14, message: 120, summary: 60, key: 18, text: 130, notes: 4, note: 260, columns: 6, rows: 8, cell: 60, sources: 6 });
const ID = /^[a-z][a-z0-9-]{0,23}$/;

function text(value, max, label, { optional = false } = {}) {
  if (value === undefined && optional) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max || value !== value.trim()) reject(label, `expected trimmed text of at most ${max} characters`);
}
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(label, 'expected an object');
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) reject(label, `unknown field ${unknown}`);
}
function minutes(value, label) { if (!Number.isFinite(value) || value < .25 || value > 10 || Math.round(value * 4) !== value * 4) reject(label, 'minutes must be 0.25–10 in quarter minutes'); }

/**
 * Validate one talk outline against the guide revision it was prepared from.
 * Sections, figures and source links must already belong to that revision, so a
 * talk cannot introduce a locator or figure the reviewed guide does not have.
 * Structural validation only; it does not review what the talk says.
 */
export function validatePresentation(data, guide, label = 'presentation') {
  const L = PRESENTATION_LIMITS;
  keys(data, ['schemaVersion', 'guideId', 'revision', 'title', 'minutes', 'thesis', 'review', 'opening', 'parts', 'closing'], label);
  if (data.schemaVersion !== 1) reject(label, 'unsupported format');
  if (data.guideId !== guide.metadata.id || data.revision !== guide.metadata.revision) reject(label, 'guide identity differs from file name');
  text(data.title, 60, `${label} title`); text(data.thesis, 160, `${label} thesis`); text(data.review, 200, `${label} review`);
  if (!Number.isFinite(data.minutes) || data.minutes < 3 || data.minutes > 60) reject(label, 'minutes must be 3–60');
  const units = new Set(guide.metadata.units.map(unit => unit.id));
  const assets = new Set((guide.metadata.assets ?? []).map(asset => asset.path));
  const citations = new Set(guide.metadata.citations.map(citation => citation.url));
  const ids = new Set(['opening', 'closing']);
  const common = (item, at) => {
    if (item.unitId !== undefined && !units.has(item.unitId)) reject(at, `unknown guide section ${item.unitId}`);
    if (!Array.isArray(item.notes) || !item.notes.length || item.notes.length > L.notes) reject(at, `expected 1–${L.notes} speaker notes`);
    for (const note of item.notes) text(note, L.note, `${at} note`);
    if (item.points !== undefined) {
      if (!Array.isArray(item.points) || !item.points.length || item.points.length > L.points) reject(at, `expected 1–${L.points} points`);
      for (const point of item.points) { keys(point, ['key', 'text'], `${at} point`); text(point.key, L.key, `${at} point key`, { optional: true }); text(point.text, L.text, `${at} point text`); }
    }
    if (item.sources !== undefined) {
      if (!Array.isArray(item.sources) || item.sources.length > L.sources) reject(at, 'too many sources');
      for (const source of item.sources) {
        keys(source, ['label', 'url'], `${at} source`); text(source.label, 40, `${at} source label`);
        if (!citations.has(source.url)) reject(at, `source is not a citation of this guide revision: ${source.url}`);
      }
    }
  };
  // Opening and closing are shown with the whole map; parts and their stops are what the map is made of.
  keys(data.opening, ['minutes', 'message', 'unitId', 'notes', 'sources'], `${label} opening`);
  minutes(data.opening.minutes, `${label} opening`); text(data.opening.message, L.message, `${label} opening message`);
  common(data.opening, `${label} opening`);
  keys(data.closing, ['title', 'minutes', 'message', 'unitId', 'points', 'notes', 'sources'], `${label} closing`);
  text(data.closing.title, L.title, `${label} closing title`); minutes(data.closing.minutes, `${label} closing`); text(data.closing.message, L.message, `${label} closing message`);
  if (!data.closing.points) reject(`${label} closing`, 'closing has no points');
  common(data.closing, `${label} closing`);
  if (!Array.isArray(data.parts) || data.parts.length < 2 || data.parts.length > L.parts) reject(label, `expected 2–${L.parts} parts`);
  let stops = 0, total = data.opening.minutes + data.closing.minutes;
  for (const part of data.parts) {
    keys(part, ['id', 'title', 'summary', 'stops'], `${label} part`);
    if (typeof part.id !== 'string' || !ID.test(part.id) || ids.has(part.id)) reject(label, `invalid or duplicate part id ${part.id}`);
    ids.add(part.id); text(part.title, L.label, `${label} part ${part.id} title`); text(part.summary, L.summary, `${label} part ${part.id} summary`);
    if (!Array.isArray(part.stops) || !part.stops.length || part.stops.length > L.stopsPerPart) reject(label, `part ${part.id} needs 1–${L.stopsPerPart} stops`);
    for (const stop of part.stops) {
      const at = `${label} stop ${stop?.id}`;
      keys(stop, ['id', 'title', 'label', 'minutes', 'unitId', 'message', 'points', 'figure', 'table', 'notes', 'sources'], at);
      if (typeof stop.id !== 'string' || !ID.test(stop.id) || ids.has(stop.id)) reject(label, `invalid or duplicate stop id ${stop.id}`);
      ids.add(stop.id); stops++;
      text(stop.title, L.title, `${at} title`); text(stop.label, L.label, `${at} label`); text(stop.message, L.message, `${at} message`);
      minutes(stop.minutes, at); total += stop.minutes;
      if (!stop.points && !stop.figure && !stop.table) reject(at, 'stop has no points, figure or table');
      if (stop.figure !== undefined) {
        keys(stop.figure, ['asset', 'caption'], `${at} figure`);
        if (!assets.has(stop.figure.asset)) reject(at, 'figure is not a declared asset of this guide revision');
        text(stop.figure.caption, 80, `${at} figure caption`);
      }
      if (stop.table !== undefined) {
        keys(stop.table, ['columns', 'rows', 'note'], `${at} table`);
        const { columns, rows } = stop.table;
        if (!Array.isArray(columns) || columns.length < 2 || columns.length > L.columns) reject(at, `expected 2–${L.columns} table columns`);
        if (!Array.isArray(rows) || !rows.length || rows.length > L.rows) reject(at, `expected 1–${L.rows} table rows`);
        for (const cell of columns) text(cell, 20, `${at} table heading`);
        for (const row of rows) {
          if (!Array.isArray(row) || row.length !== columns.length) reject(at, 'table row width differs from its headings');
          for (const cell of row) text(cell, L.cell, `${at} table cell`);
        }
        text(stop.table.note, 120, `${at} table note`, { optional: true });
      }
      common(stop, at);
    }
  }
  if (stops > L.stops) reject(label, `expected at most ${L.stops} stops`);
  if (Math.abs(total - data.minutes) > 0.01) reject(label, `planned minutes add up to ${total}, not ${data.minutes}`);
  return { stops, parts: data.parts.length };
}

/** All talk outlines under content/presentations, each bound to a retained guide revision. */
export async function validatePresentations({ rootDir = projectRoot, guides, directory = 'content/presentations' } = {}) {
  let names;
  try { names = (await readdir(path.join(rootDir, directory))).filter(name => name.endsWith('.json')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const byKey = new Map(guides.map(guide => [`${guide.metadata.id}.r${guide.metadata.revision}`, guide]));
  const result = [];
  for (const name of names) {
    const file = `${directory}/${name}`, guide = byKey.get(name.slice(0, -5));
    if (!guide) reject(file, 'file name does not match a retained guide revision (<guideId>.r<revision>.json)');
    const bytes = await readFile(await packageFile(rootDir, file));
    if (bytes.byteLength > limits.json) reject(file, 'file exceeds size limit');
    let data;
    try { data = JSON.parse(utf8.decode(bytes)); } catch { reject(file, 'invalid UTF-8 JSON'); }
    const counts = validatePresentation(data, guide, file);
    result.push({ guideId: guide.metadata.id, revision: guide.metadata.revision, file: file.slice('content/'.length), sha256: hash(bytes), title: data.title, minutes: data.minutes, ...counts });
  }
  return result;
}
