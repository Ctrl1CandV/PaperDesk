import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateContent } from '../../server/content/validation.mjs';
import { validatePresentation, validatePresentations, PRESENTATION_LIMITS } from '../../server/content/presentations.mjs';

// Public reviewed content plus synthetic edits made in memory; nothing is written.
const { guides } = await validateContent();
const guide = guides.find(item => item.metadata.id === 'multi-agent-communication-survey' && item.metadata.revision === 2);
const published = () => JSON.parse(readFileSync(new URL('../../content/presentations/multi-agent-communication-survey.r2.json', import.meta.url), 'utf8'));
const stops = talk => talk.parts.flatMap(part => part.stops);

test('published talk outlines are bound to retained guide revisions and add up to their length', async () => {
  const talks = await validatePresentations({ guides });
  assert.ok(talks.length >= 1);
  for (const talk of talks) {
    assert.ok(guides.some(item => item.metadata.id === talk.guideId && item.metadata.revision === talk.revision));
    assert.match(talk.sha256, /^[a-f0-9]{64}$/);
    assert.ok(talk.stops <= PRESENTATION_LIMITS.stops);
  }
  const talk = published();
  assert.equal(talk.opening.minutes + talk.closing.minutes + stops(talk).reduce((sum, stop) => sum + stop.minutes, 0), talk.minutes);
});

test('a talk cannot bring in a section, figure or source its guide revision does not have', () => {
  const cases = [
    ['unknown section', talk => { stops(talk)[1].unitId = 'synthetic-missing-section'; }, /unknown guide section/],
    ['undeclared figure', talk => { stops(talk).find(stop => stop.figure).figure.asset = 'assets/synthetic/figure.webp'; }, /not a declared asset/],
    ['new source link', talk => { stops(talk).find(stop => stop.sources).sources[0].url = 'https://example.invalid/synthetic-source'; }, /not a citation of this guide revision/],
    ['closing source', talk => { talk.closing.sources[0].url = 'https://example.invalid/synthetic-closing'; }, /not a citation of this guide revision/],
    ['another guide', talk => { talk.revision = 1; }, /guide identity differs/],
  ];
  for (const [label, change, expected] of cases) {
    const talk = published(); change(talk);
    assert.throws(() => validatePresentation(talk, guide, 'synthetic'), expected, label);
  }
});

test('page discipline is enforced: time adds up, text stays short and each kind carries its content', () => {
  const cases = [
    ['minutes', talk => { stops(talk)[0].minutes += 1; }, /minutes add up/],
    ['odd minutes', talk => { stops(talk)[0].minutes = 1.1; }, /quarter minutes/],
    ['too many points', talk => { const stop = stops(talk).find(item => item.points); stop.points = Array.from({ length: PRESENTATION_LIMITS.points + 1 }, () => ({ text: 'SYNTHETIC 要点' })); }, /points/],
    ['long message', talk => { stops(talk)[1].message = 'S'.repeat(PRESENTATION_LIMITS.message + 1); }, /message/],
    ['empty stop', talk => { const stop = stops(talk).find(item => item.figure); delete stop.figure; delete stop.points; }, /no points, figure or table/],
    ['one part only', talk => { talk.parts = talk.parts.slice(0, 1); }, /parts/],
    ['ragged table', talk => { stops(talk).find(stop => stop.table).table.rows[0].pop(); }, /row width/],
    ['missing notes', talk => { stops(talk)[2].notes = []; }, /speaker notes/],
    ['duplicate id', talk => { stops(talk)[1].id = stops(talk)[0].id; }, /duplicate stop id/],
    ['reserved id', talk => { stops(talk)[1].id = 'closing'; }, /duplicate stop id/],
    ['unknown field', talk => { stops(talk)[0].html = '<b>SYNTHETIC</b>'; }, /unknown field/],
  ];
  for (const [label, change, expected] of cases) {
    const talk = published(); change(talk);
    assert.throws(() => validatePresentation(talk, guide, 'synthetic'), expected, label);
  }
  assert.doesNotThrow(() => validatePresentation(published(), guide, 'synthetic'));
});
