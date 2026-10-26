/** The library's editorial layer is separate from immutable reading bodies. */
export function validateLibraryBriefs(data, guides) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Library briefs: unsupported format');
  const seen = new Set();
  for (const entry of data.entries) {
    const key = `${entry.guideId}/${entry.guideRevision}`;
    const metadata = guides.find(guide => guide.metadata.id === entry.guideId && guide.metadata.revision === entry.guideRevision)?.metadata;
    const fail = reason => { throw new Error(`Library brief ${key}: ${reason}`); };
    if (!metadata || seen.has(key)) fail('unknown or duplicate guide revision');
    seen.add(key);
    for (const field of ['overview', 'value', 'advice']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`${field} must contain prose`);
    }
    const chapters = metadata.units.filter(unit => unit.heading).map(unit => unit.id);
    const labels = entry.chapterLabels;
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)
      || Object.keys(labels).length !== chapters.length
      || chapters.some(id => typeof labels[id] !== 'string' || !labels[id].trim())) fail('chapter labels must match the pinned revision');
    if (entry.sourceUpdatedAt === null && entry.sourceRecordUrl === null) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.sourceUpdatedAt ?? '')
      || new Date(entry.sourceUpdatedAt).toISOString().slice(0, 10) !== entry.sourceUpdatedAt) fail('invalid source update date');
    // Current verified update dates come from fixed arXiv version records.
    const record = /^https:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5})(v\d+)$/.exec(entry.sourceRecordUrl ?? '');
    const source = /^https:\/\/arxiv\.org\/(?:pdf|abs|html)\/(\d{4}\.\d{4,5})(v\d+)(?:\.pdf)?$/.exec(metadata.source.url);
    if (!record || !source || record[1] !== source[1] || record[2] !== source[2]) fail('update date requires a matching fixed source version');
  }
  return data.entries.length;
}
