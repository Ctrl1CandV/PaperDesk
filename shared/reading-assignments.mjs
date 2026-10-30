// Public content delivery instructions. They contain topic labels and pinned
// bibliography only, never private exploration IDs, questions or observations.
const slug = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const fail = message => { throw new Error(`Reading assignments: ${message}`); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const normalizeAssignmentTitle = value => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');

export function validateReadingAssignments(value, hasGuide) {
  if (value === undefined) return;
  if (!exactKeys(value, ['batches', 'activeBatchIds']) || !Array.isArray(value.batches) || value.batches.length > 512
    || !Array.isArray(value.activeBatchIds) || value.activeBatchIds.length > 512) fail('invalid manifest');
  const batchIds = new Set();
  for (const batch of value.batches) {
    if (!exactKeys(batch, ['id', 'collectionId', 'titleAliases', 'guides']) || typeof batch.id !== 'string' || typeof batch.collectionId !== 'string' || !slug.test(batch.id) || !slug.test(batch.collectionId)
      || batchIds.has(batch.id)) fail('invalid or duplicate batch identity');
    batchIds.add(batch.id);
    if (!Array.isArray(batch.titleAliases) || !batch.titleAliases.length || batch.titleAliases.length > 20
      || batch.titleAliases.some(title => typeof title !== 'string' || !title.trim() || title.length > 200 || /[\u0000-\u001f]/u.test(title))) fail('invalid public title aliases');
    if (new Set(batch.titleAliases.map(normalizeAssignmentTitle)).size !== batch.titleAliases.length) fail('duplicate title alias');
    if (!Array.isArray(batch.guides) || !batch.guides.length || batch.guides.length > 50) fail('invalid guide list');
    const guideIds = new Set();
    for (const guide of batch.guides) {
      if (!exactKeys(guide, ['guideId', 'revision']) || typeof guide.guideId !== 'string' || !slug.test(guide.guideId)
        || !Number.isSafeInteger(guide.revision) || guide.revision < 1 || guideIds.has(guide.guideId)) fail('invalid or duplicate pinned guide');
      guideIds.add(guide.guideId);
      if (hasGuide && !hasGuide(guide.guideId, guide.revision)) fail('pinned guide revision is unavailable');
    }
  }
  if (new Set(value.activeBatchIds).size !== value.activeBatchIds.length || value.activeBatchIds.some(id => !batchIds.has(id))) fail('invalid active batch selection');
}

/** Pure plan: no title substring matching, no inference from catalog arrivals. */
export function planReadingAssignments(records, manifest, hasGuide = () => true) {
  validateReadingAssignments(manifest);
  const updated = new Map(), issues = [];
  const active = new Set(manifest?.activeBatchIds ?? []);
  const current = () => records.map(record => updated.get(record.id)?.record ?? record);
  for (const batch of manifest?.batches ?? []) {
    if (!active.has(batch.id)) continue;
    const all = current();
    // A consumed collection is bound to its record, even if its title changes.
    const bound = all.filter(record => record.research?.readingAssignmentReceipts?.some(receipt => receipt.collectionId === batch.collectionId));
    const aliases = new Set(batch.titleAliases.map(normalizeAssignmentTitle));
    const targets = bound.length ? bound : all.filter(record => !record.research?.purpose && aliases.has(normalizeAssignmentTitle(record.title)));
    if (!targets.length) continue;
    if (targets.length > 1) { issues.push({ batchId: batch.id, reason: 'ambiguous' }); continue; }
    const target = targets[0];
    if (target.status === 'archived' || target.research?.purpose) continue;
    const receipts = target.research?.readingAssignmentReceipts ?? [];
    if (receipts.some(receipt => receipt.batchId === batch.id)) continue;
    if (batch.guides.some(guide => !hasGuide(guide.guideId, guide.revision))) { issues.push({ batchId: batch.id, reason: 'unavailable' }); continue; }
    const related = target.research?.relatedGuides ?? [];
    // Respect an explicit existing revision; an import never silently upgrades it.
    const additions = batch.guides.filter(guide => !related.some(existing => existing.guideId === guide.guideId));
    if (related.length + additions.length > 50 || receipts.length >= 512) { issues.push({ batchId: batch.id, reason: 'capacity' }); continue; }
    const record = { ...target, research: { scope: '', constraints: '', candidates: '', deferred: '', decisions: [], appliedProposalIds: [], ...target.research,
      relatedGuides: [...related, ...additions], readingAssignmentReceipts: [...receipts, { batchId: batch.id, collectionId: batch.collectionId }] } };
    const prior = updated.get(target.id);
    updated.set(target.id, { record, expectedRevision: prior?.expectedRevision ?? target.recordRevision, added: (prior?.added ?? 0) + additions.length });
  }
  return { updates: [...updated.values()], issues };
}

/** CAS conflicts are replanned against current records, never overwritten. */
export async function consumeReadingAssignments({ manifest, list, save, hasGuide, isConflict = error => error?.name === 'ConflictError' }) {
  let saved = 0, added = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const plan = planReadingAssignments(await list(), manifest, hasGuide);
    let conflicted = false;
    for (const update of plan.updates) {
      try { await save(update.record, update.expectedRevision); saved++; added += update.added; }
      catch (error) {
        if (isConflict(error)) { conflicted = true; break; }
        throw error;
      }
    }
    if (!conflicted) return { saved, added, issues: plan.issues };
  }
  return { saved, added, issues: [{ batchId: '', reason: 'conflict' }] };
}
