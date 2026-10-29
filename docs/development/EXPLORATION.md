# Research-direction exploration in v1

The subsequent [research assistant extension](RESEARCH-ASSISTANT.md) adds optional scope, constraints, candidates, deferred directions, source-backed decision history and embedded research documents to the same Exploration. Existing evidence and status meanings remain unchanged. Explicit topic-context permission enables research conversations; complete model proposals require revision-checked adoption. Research artifacts, frozen tasks and receipts use personal archive v3. See [contracts](RESEARCH-CONTRACTS.md).

## Purpose and public starting material

Exploration is a first-release capability, not a future label. It connects concrete reading questions over time without pretending to select a thesis automatically. The platform can be useful before the reader has a settled direction.

`content/exploration.json`, validated by `schemas/exploration.schema.json`, contains an immutable editorial seed revision. Its lenses give an order, rationale, what to understand, pinned guide sections, one starting prompt, a self-check and a next action. These are editorial suggestions built from the supplied guides, not a new survey or private research agenda. Links provide background only. Keep the explicit evidence limits next to the prompts.

The first two lenses establish applications and evaluation; collaboration is optional. Priorities express a suggested learning order, not value scores. Show the first reading action even with no personal records. Do not manufacture recent papers, source-backed novelty, experimental results or personal interest levels to fill a screen.

Opening a lens never creates a personal record. The reader may adapt a prompt, start their own question, or leave without saving. A created record remembers its editorial origin when relevant, but becomes personal text only through a deliberate save. Editorial seeds and personal records live in separate stores.

## Personal exploration record

The minimal record is `id` (UUID), `title`, `question`, `origin` (reader or adapted-editorial), optional `seedRef` (seed revision and lens ID), `status` (inbox/exploring/deferred/archived), `interpretation`, `unknowns`, optional `nextAction`, an ordered `evidence` array, optimistic `recordRevision`, and UTC timestamps. Empty interpretation/unknowns/evidence are allowed; never invent contents. Status is chosen by the reader, not inferred from reading or generated material. No resolved/validated-novelty state is offered.

`nextAction` is null or a small record: kind read-guide/check-concept/compare-evidence/search-literature, user-readable description and optional pinned guide target. A missing action is shown as not yet chosen. A literature-search action stores a question to investigate, not an invented recommendation or an automatic network task.

Each evidence item has an ID, a provenance category (guide-excerpt, original-excerpt or reader-observation), saved text, optional block fingerprint, optional related note ID and reader comment, plus category-specific links. A guide-excerpt requires a pinned `guideId/revision/unitId` and exact quote, with zero or more relevant source snapshots (URL, locator label, known version or null). An original-excerpt requires reader-provided original source identity (URL or scholarly identifier), locator and excerpt; guide association is optional. A reader-observation may have no guide or external source and remains explicitly reader-authored. Do not force an unrelated guide target or fabricate a citation to satisfy a form.

Text selected from a guide is always a guide excerpt, even when it cites a paper. An original excerpt requires explicit entry/identification by the reader; the app cannot infer that the original was read. Manual attribution is a reader statement, not an independently verified source check. A source link alone is not a statement that the linked paper supports the reader's interpretation.

Expose quote, attribution, interpretation and unknowns as distinct concepts, without making every field mandatory. New exploration from a reading selection defaults to an editable title/question and a guide-excerpt preview. Save only after the reader confirms; cancellation changes nothing. Joining an existing exploration retains its other evidence and question.

## Small end-to-end flow

1. Open an editorial lens and read its orientation and useful next section, or enter from a real article selection.
2. Create a question with one versioned guide excerpt; later attach a second excerpt from another article or section.
3. Write what seems plausible and what still needs checking; leave either blank when undecided.
4. Choose a next reading or investigation action and an explicit status.
5. Follow the reading target and return; revise the same exploration instead of manufacturing a new topic each visit.

The three initial guides support this flow, but cannot demonstrate a current research gap. The UI must say so. No specific thesis, technique, budget, private hypothesis, venue or research outcome is prefilled.

## Persistence and privacy

Explorations, their evidence and next actions are included in the same transactional personal-backup boundary as notes. Updates use expected record revisions; conflicting tabs/imports preserve both alternatives. A failed write keeps the draft and offers recovery. A missing guide/note preserves the question and saved quotation with an unavailable-link indicator. Deleting a note does not delete an exploration's quote; removing an evidence item is a separate explicit edit. Archive preserves data; permanent deletion follows the existing confirmation/backup rule.

Do not rewrite old anchors when new content arrives. Keep old content revisions; if unavailable, show the saved quote and missing locator. Content rollback never rolls back personal thinking. No personal record is shipped in a content update or projected into public editorial seeds.

For a harness packet, allow selection of a question, relevant evidence, interpretation, unknowns and next action in an editable preview. Personal text requires explicit inclusion; mark it as reader-authored, preserve source/guide versions and apply the same size limit/manual-copy fallback as reading packets. Nothing is sent automatically.
