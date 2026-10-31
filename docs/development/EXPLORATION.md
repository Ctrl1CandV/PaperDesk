# Research-direction exploration in v1

The current direction page centers a Markdown working paper (研究工作稿), editable by the reader and by the explicit `/记录` command. It is shaped from the start like the opening file of a paper project (motivation, what is known, judgements and hypotheses, open questions, experiment ideas, stage log) and can be exported as that file. Saved versions preserve the process and stage results without automatically declaring completion; history restore appends a version; the current saved version accompanies deliberate direction-context requests. See [working paper](RESEARCH-NOTEBOOK.md).

Explicit content-delivery batches can also associate pinned guides with a direction on browser startup. Public collection aliases establish an unambiguous initial binding; local receipts keep repeated delivery idempotent and preserve manual removal. This is a declared relationship, not keyword matching or inference from arrival time. See [reading assignments](../content/READING-ASSOCIATIONS.md).

The subsequent [research assistant extension](RESEARCH-ASSISTANT.md) adds optional scope, constraints, candidates, deferred directions, source-backed decision history and embedded research documents to the same Exploration. Existing evidence and status meanings remain unchanged. Linking a direction permits its snapshot to accompany the reader's requests. Ordinary model proposals require revision-checked adoption; an explicit `/方向` command authorizes applying a valid completed proposal through the same audited path. Research artifacts, frozen tasks and receipts remain compatible with personal archive v3. See [contracts](RESEARCH-CONTRACTS.md).

In the current version a research direction is normally created or updated in the reading conversation with `/方向`, and reading files are produced with `/选文` (see [对话指令](RESEARCH-ASSISTANT.md)). Manual creation needs only the reader's question (the title defaults to its opening; a reading excerpt, when present, is kept as guide evidence). Directions may carry a stage; reading-accumulation entries (`research.purpose = accumulation`) hold files for a learning goal. Record fields and their meanings below are unchanged; the full editor remains for manual maintenance.

The direction page now groups current understanding/questions, research process/materials, related papers/surveys, and reading-selection files. The separate stage track and the “more” area for local matching, manual documents, frozen tasks and receipts are no longer page controls. Existing records are retained; non-selection documents remain readable within the research process. Both accumulation and problem-focused selection use the same AI conversation. The one-click accumulation action sends its explicit command after the reader clicks; discussion prompts only prefill the composer. Connection or request failure requires an explicit retry, while an existing composer draft and its selected materials remain intact.

## Purpose and public starting material

Exploration is a first-release capability, not a future label. It connects concrete reading questions over time without pretending to select a thesis automatically. The platform can be useful before the reader has a settled direction.

`content/exploration.json`, validated by `schemas/exploration.schema.json`, contains an immutable editorial seed revision. Its lenses give an order, rationale, what to understand, pinned guide sections, one starting prompt, a self-check and a next action. These are editorial suggestions built from the supplied guides, not a new survey or private research agenda. Links provide background only. Keep the explicit evidence limits next to the prompts.

The original seed's first two lenses establish applications and evaluation; collaboration is optional in that editorial revision. Priorities express a suggested learning order, not value scores or the reader's current direction. Show the first reading action even with no personal records. Do not manufacture recent papers, source-backed novelty, experimental results or personal interest levels to fill a screen.

Opening a lens never creates a personal record. The reader may adapt a prompt, start their own question, or leave without saving. A created record remembers its editorial origin when relevant, but becomes personal text only through a deliberate save. Editorial seeds and personal records live in separate stores.

## Personal exploration record

The minimal record is `id` (UUID), `title`, `question`, `origin` (reader or adapted-editorial), optional `seedRef` (seed revision and lens ID), `status` (inbox/exploring/deferred/archived), `interpretation`, `unknowns`, optional `nextAction`, an ordered `evidence` array, optimistic `recordRevision`, and UTC timestamps. Empty interpretation/unknowns/evidence are allowed; never invent contents. Status is chosen by the reader, not inferred from reading or generated material. No resolved/validated-novelty state is offered.

Optional `research.relatedGuides` stores explicit `{guideId, revision}` links, at most 50 with one entry per guide ID. The related-literature picker saves these links with the expected exploration revision. Linking does not change guide/original reading marks, add quotations, or establish evidence support. Related literature also displays existing excerpt, discussion and next-action links; a new catalog arrival alone does not establish a relationship. Fixed links remain removable and readable when the guide is later taken off the default shelf.

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

The initial release demonstrated this flow with three guides; that historical collection size is not the current library contract. The flow cannot demonstrate a current research gap. No specific thesis, technique, budget, private hypothesis, venue or research outcome is prefilled.

## Persistence and privacy

Explorations, their evidence and next actions are included in the same transactional personal-backup boundary as notes. Updates use expected record revisions; conflicting tabs/imports preserve both alternatives. A failed write keeps the draft and offers recovery. A missing guide/note preserves the question and saved quotation with an unavailable-link indicator. Deleting a note does not delete an exploration's quote; removing an evidence item is a separate explicit edit. Archive preserves data; permanent deletion follows the existing confirmation/backup rule.

Do not rewrite old anchors when new content arrives. Keep old content revisions; if unavailable, show the saved quote and missing locator. Content rollback never rolls back personal thinking. No personal record is shipped in a content update or projected into public editorial seeds.

Reading-selection files are produced only through a reader-triggered command or the explicit one-click accumulation action. Their local download preserves the saved body, source versions and the separately labelled export-time research state and associated bibliography. It does not send anything to an external Harness or expand execution permission. Notes and saved documents enter model context only through deliberate selection; the quick accumulation request leaves the composer's selected materials out. Legacy fixed-task and receipt records remain compatible with backup/restore, without being required for the current page workflow.
