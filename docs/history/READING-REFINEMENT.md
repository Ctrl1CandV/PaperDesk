> Archived milestone. Current instructions: [Operations](../OPERATIONS.md) and [project state](../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Reading experience refinement — accepted design

Status: the local refinement is implemented; actual results and remaining limits are recorded in REFINEMENT-CHECKS.md. The refinements below incorporate the accepted search simplification and deeper-reading direction. Product specification 1.1 remains the baseline. Finding further papers from selected reading notes/questions is an important continuation workflow; it may be carried out by an assistant, and does not require automation in the application. Substantive content enhancement still requires source review. No personal reading history or inferred reader profile is included.

## Findings before this refinement

- Library search concatenates guide title, original paper title, editorial recommendation reason and the entire guide body, then applies case-insensitive substring matching. It does not distinguish subject identity from an incidental mention, rank relevance or explain a match (`src/library/Library.tsx`). InstructGPT mentions Agent as a later application context in its opening orientation; that explains this search result without making Agent its primary subject.
- The library already knows survey versus method/evaluation types, but only exposes a small label; every item opens the reader directly.
- Metadata contains original title, source identity/version, purpose and coverage, but lacks structured authors, publication dates/venues and topical classification (`src/content/types.ts`). Do not derive a publication year or venue from an arXiv identifier.
- Exploration supports versioned evidence, interpretation, unknowns, explicit status and a chosen next action. Editorial lenses supply pinned reading targets. A literature-search action stores a task description; no discovery is executed. Reading records support actual position restoration and independently chosen guide/original states, without a personalized recommendation engine.
- The shared dialog supports Escape, focus containment and return, but not backdrop dismissal. Note/exploration closure can preserve session drafts; explicit exploration cancellation discards drafts. Context-packet edits currently do not survive closing. Reading-state changes are saved immediately when selected. These behaviors need consistent, visible semantics before adding easy dismissal.

## Primary flow: select, orient, read, investigate

Keep one library with shared records and content identity. Provide All / Surveys / Papers views; method and evaluation are useful paper subtypes. Topic filters are independent from document type. Do not duplicate a document into separately maintained libraries.

On desktop, use a compact searchable list on the left and the selected article's orientation on the right. Choosing an item changes the preview without entering the reader or creating a reading record. A separate Start reading action enters the existing reader. A real Continue reading action may bypass orientation. On narrow screens, article selection opens a dedicated orientation view with a clear return to the same filtered list. It must not compress both columns into a narrow viewport.

The list shows a recognizable short title, article type, verified year when available, a few primary topics and one distinguishing sentence. Remove repetitive explanatory boilerplate from each row. The orientation provides:

1. Scholarly identity: original title, authors, article type, verified publication venue/year, separate preprint/version information and primary source.
2. What it studies and how: problem, high-level approach or survey organization, main scope.
3. Learning value: what this reading helps explain, what question it can inform, and relevant prerequisites. Mark this as editorial guidance rather than the authors' claims or a prestige score.
4. Reading choice: what the local explanatory text covers, important omissions, and Start reading / Open original actions. Personal queue actions remain explicit.

Do not fill missing facts with invented metadata. Unknown venue/year stays unknown until checked against primary bibliographic sources. Formal publication and the source version actually explained may differ; show both accurately.

The second level is substantive, in-depth reading: continuous explanations, technical mechanisms, evidence, diagrams/tables, conditions, citations and purposeful original-reading advice. It must exceed an abstract, summary or brief guide in explanatory depth. Concision means reducing repetition without weakening substance; strengthen necessary mechanisms, evidence interpretation and conceptual dependencies when source review supports it. Preserve every approved body, locator and gap; new substantive additions require a reviewed immutable content revision. Necessary depth follows the paper and its explanatory dependencies, not arbitrary length reduction.

Use scholarly paper identity for the orientation and guide identity/revision for the explanation. A paper may eventually have several explanations; its publication year, original source version and explanation revision are separate facts.

Preserve exact reader revision/section URLs. Back navigation restores library query, type filter, selection, list position and keyboard focus. Preview URLs need a stable article identity; the router must deliberately support query parameters if used. A content update must not silently redirect saved evidence to a newer revision.

## Search: titles and primary topics only

Search covers original/local titles and reviewed primary topic labels/aliases only. There is no full-text mode, advanced search form or automatic query broadening. Keep reviewed related concepts separate from primary topics; they are not interchangeable search synonyms.

Agent should not return InstructGPT merely because its opening paragraph mentions Agent. A later next-reading suggestion may identify a supporting-background relationship, but that must not change the article's primary search topics.

Normalize case, whitespace and reviewed aliases without broad inferred synonyms. Avoid matching an English token inside an unrelated longer word. Preserve editorial order among matching articles. No matches means no matches in the current library; offer clearing the query.

## Reader tools and dismissal

Separate passage actions from article-level state. Present Note and Add to exploration as the primary passage actions, always identifying whether they use a selection or a named current section. Move reading-state controls next to the article identity with separate explanatory-text and original-paper status labels. Keep context copying as a secondary action with its exact editable preview.

Use a compact persistent tool area; optional selection tools must have the same keyboard-accessible entry point. On sufficiently wide screens, a deliberate side editor can preserve reading context without shrinking the prose; use an accessible overlay/drawer where width is insufficient. On narrow screens, provide a compact tools entry and a single-column editor.

- Click outside the entire panel or press Escape: dismiss the panel. Clicking another field, label, quotation or blank space inside the panel does not cancel it.
- Empty or unchanged form: dismiss directly. Changed form: keep a session draft and show that it is unsaved; reopening the same context restores it. Never imply that a session draft survives refresh or browser closure.
- Explicit Discard draft: intentionally removes only that draft, with a clear label. Closing is not discarding or saving.
- Give packet question and manually edited preview the same recovery semantics. Do not allow regeneration to silently overwrite manual preview edits.
- If a reader selects a different passage in a section that already has a note draft, explicitly distinguish resuming that draft from starting a note on the new passage. Never show the new selection while silently restoring an old quotation.
- While an operation is saving/copying, prevent duplicate submission and handle dismissal deliberately; failure must preserve text. A saved reading-state change is not undone by closing its panel.
- Backdrop dismissal requires pointer press and release outside the panel, so selecting text inside and releasing outside cannot accidentally close it. Keep focus return, keyboard containment where modal, scroll position and touch targets intact.

## Derivative capability: an explainable next-reading action

The next meaningful addition is a deliberate Find next reading action on an exploration, not passive analysis of every personal note. Let the reader select the current question, uncertainty and optional notes/evidence to use, then review the goal. Use only local, deliberately selected information; do not construct an inferred reader profile.

Start with the reviewed local inventory and explicit content relationships: background needed, method to examine, evaluation to compare, and original passage to verify. Simple keyword matches can supply search candidates, but must not be presented as understanding a free-form research problem. Every suggestion should show:

- The selected question or concept it addresses and the explicit relationship supporting the match.
- Its role (main subject, prerequisite, comparison or source verification), suggested section and intended reading outcome.
- What it cannot resolve, whether a local explanation exists, and the relevant content/source version.
- An explicit action to add it to a reading queue or choose it as this exploration's next action. Showing a suggestion alone saves nothing.

Use explicit reading states to label options or avoid repeatedly proposing the same whole article. An already-read article may still have a useful passage to revisit. A scroll position cannot establish reading completion or understanding. Do not show confidence percentages or automatic research-gap conclusions.

The current three articles cannot support broad literature discovery. If no suitable local material exists, say so and prepare an editable search brief: question, desired evidence, concepts/aliases, existing coverage and inclusion criteria. The existing exact-preview context-copy workflow can support a separate authoring/search workflow. Returned candidates need source identity and verification before becoming reviewed content. A candidate is not automatically a local reading explanation.

Finding further papers and surveys from accumulated reading/questions is an important continuation workflow. The reader can select relevant notes, evidence and exploration text and give an assistant a concrete search task. The assistant can then search public academic sources, verify candidate identity and relevance, prepare and review explanatory content, and add it through the existing immutable content-update path. Automation is optional; this useful loop does not depend on an in-app network feature.

The loop is selected material → public-source search and verification → reviewed explanation → versioned library addition → further reading and revision of the original question. Existing editable context packets and literature-search briefs provide the handoff. They do not let the application silently inspect all notes, send personal text, or claim that a search has already happened. Local suggestions remain a separate, limited retrieval aid. See ASSISTED-DISCOVERY.md for the operating workflow and its current boundaries. Recommendation usefulness needs reader evaluation; ranking tests cannot certify research relevance.

## Content and data maintenance

Add reviewed bibliographic/orientation/topic information through a versioned content contract and validation/import path, not a hard-coded UI map. Decide whether it is an independent versioned paper record or new guide metadata before implementation; preserve compatibility with existing packages and retained revisions. Do not mutate a previously immutable guide revision to add fields. The existing approved Markdown bytes can remain identical while reviewed metadata evolves.

Keep new personal queues distinct from public editorial relationships and saved exploration evidence. If a new personal store is introduced, update strict backup export/import, conflict handling and migrations together. Existing records and pinned links must survive. Do not store suggested interests or auto-created progress.

## Suggested implementation order and acceptance

1. Establish the versioned orientation/topic contract and prepare reviewed metadata for the three existing articles. Implement library type views, title/topic-only search and the orientation preview together, retaining the full substantive reader.
2. Refine reader tool placement and unify dismissal/draft semantics across notes, exploration, packets and state controls. Test empty, dirty, saving and failed states with synthetic text.
3. Add explicit local next-reading suggestions and a durable user-chosen queue/next-action flow; extend backups and test revision/conflict behavior as required. Surface honest no-match states and editable search briefs. Use those briefs or deliberately selected context for assistant-led external discovery and reviewed content additions; no automated discovery service is required.

Acceptance examples:

- Agent search returns primary topic/title matches and does not match incidental body mentions in InstructGPT. No full-text search control is added.
- Survey and paper views are visually distinct; switching views never duplicates or loses records.
- Selecting an article gives enough orientation to decide whether to read; it does not mark it read. Entering and returning preserves the library state. Narrow screens remain single column.
- Outside-click/Escape dismissal works without losing unsaved text, confusing cancellation with saving, or firing while a text selection is released. Keyboard focus returns to the initiating control.
- A selected synthetic exploration receives a justified local reading target or an honest no-match result. Selecting the suggestion is explicit; later evidence remains linked to its original revision. Library size does not force unrelated recommendations.
- Exact approved body hashes remain unchanged. Content/import, relevant record/backup, browser navigation and interaction checks pass. Desktop/narrow screenshots are inspected; physical-device or native-zoom checks are claimed only if actually performed.

The initial design review inspected source and product contracts only. Implementation has since added versioned orientation metadata, the two-level library, consistent reader tools/drafts and explicit local next-reading assistance. See REFINEMENT-CHECKS.md for actual functional/visual checks and ORIENTATION-SOURCES.md for bibliographic verification. Approved body text remains unchanged and no real private browser records were used. This refinement does not execute an external literature search or add new papers; the documented assistant-led workflow can be used when a concrete search task and selected materials are supplied.
