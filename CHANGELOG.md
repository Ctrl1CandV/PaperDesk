# Changelog

## Taller shelf rows, formal venues and a display-only talk page — 2026-11-20

- Shelf rows are taller when no brief is open, and the source column no longer wraps.
- Papers without a ranking badge show where they were published in full; papers the guide read as preprints show their checked formal venue (FCS, ICLR 2025, COLM 2024, ACM TIST) next to the version the guide uses. CAMEL and AgentBench now show their CCF-A badge.
- The talk page no longer shows speaker notes or their toggle; it is material for a shared screen.

## Roomier shelf rows and a calmer talk map — 2026-11-19 (third pass)

- With a brief open, the shelf list is wider and each row taller, showing the title, subtitle and source; search has its own line so the type tabs no longer wrap.
- The talk page no longer prints a time on each section, branch or route step; the header keeps the total length.
- The talk map draws itself in, lights the branch under the pointer and the path to the current stop; in the following map new nodes grow out of their parent and edges draw in.

## Wider shelf rows and the following talk map — 2026-11-19 (second pass)

- Shelf rows use more of a wide window (94% of the content width, up to 1800 px).
- The talk page shows the whole mind map at the top again, then a map on the left that follows the talk as it scrolls: it opens the current branch, folds the others and lights the current stop. The full-screen stage and side card from the first pass are removed.

## One-list shelf and the talk as a map stage — 2026-11-19

- The shelf is one list again: no collection groups, group counts or Explore link beside the title. Typing a category word such as “通信”, “评价” or “基础” finds that reading collection.
- The talk page is a mind map that fills the screen and opens branch by branch; choosing a stop unfolds its key terms and shows a card with its sentence, figure or table and sources beside the map. Arrow keys walk the talk; fullscreen applies to the map only. The slide-style telling mode, its rail and its timer are removed; a script for the speaker sits below the map.
- The communication survey talk is now 12 minutes: 3 branches, 7 stops and a closing on the survey's value and limits.
- Build passes; 585 Node tests pass; all 233 browser tests pass after two shelf tests were updated. Talk content is author-checked only and not rehearsed.

## Collections, reader bar, map talks and quick questions — 2026-11-14

- The shelf is grouped into the three public reading collections, each one surface with its route, count, explicit-mark progress and aligned rows in reading order; one type scale (ten sizes, 12 px minimum) across the app.
- The reader's tool row is a sticky bar naming the current section with a reading-progress line; the contents count the current section and mark passed ones.
- Talk pages at `/present/:guideId/:revision` tell one mind map instead of showing slides: the full map and per-stop web content (message, original figure, key terms or table, sources, notes, the full guide section on request), a map pane that follows the reader, and a telling mode that frames each branch and unfolds it stop by stop. Talk outlines (opening, parts of stops, closing) are a validated content layer bound to one guide revision; the first covers the 2025 multi-agent communication survey (4 parts, 13 stops, 15 minutes).
- Asking from the article: actions beside a mouse selection, one-click questions above the composer and “问 AI” in the reading tools. The first model round receives the whole section in question when the budget allows; new configurations default to a 65536 context budget; the shared instructions ask for the conclusion first and direct feedback on the reader's ideas.
- Build passes; 585 Node tests and all 231 browser tests pass (browser run through an installed Chrome). Talk content is author-checked only, and the assistant changes were not verified against a real model.

## Complete English versions and reading fixes — 2026-11-09

- English versions now cover all 24 current guides. Fifteen drafts that had summarized away explanatory sentences were retranslated paragraph by paragraph from the Chinese revisions; nine were kept after section-by-section comparison.
- Table cells no longer break numbers and words; tables wider than the column scroll inside their container.
- Under each original figure, the full rights text now sits behind a folded “来源与许可 / Source and permission” control next to the source link; the enlarged view still shows it in full.
- The translation check now compares prose only (link targets, figures, code and display math removed), with thresholds recalibrated to complete translations; the writing workflow adds guidance on rendering Chinese negations without adding claims.
- Build passes; 581 Node tests pass (1 skipped). Rendered-build screenshots at 1440 px and a simulated 390 px viewport were reviewed; no live-server browser tests or physical-device tests. See [the batch note](docs/research/english-retranslation-2026-11-09.md).

## Assistant reliability and adaptive reading — 2026-11-08

- Fixed passage validation across formulas, tables and paragraph boundaries, and official ChatGPT streams whose terminal output array is empty after completed output items.
- Budgeted real guide/research context and pending structured writes; added range-based guide reads and compact, complete reading-selection files without raising saved model limits.
- Preserved drafts and request identity across panel reopening, made research saves atomic and idempotent, and retained the original direction when saving historical results.
- Expanded prose when the AI panel closes; fixed library return visibility and duplicate navigation restoration.
- Recorded the 2026-11-06 checks: 582 Node tests, 224 browser tests, 75 related browser rechecks and real-provider checks. See [verification and limitations](docs/research/assistant-reliability-2026-11-06.md).
- Updated the project overview and added AI contribution credit.

## Workflow completion and cleanup — 2026-11-05

- Completed the missed `agent-evaluation-survey` at r2 with the guide-writing workflow; all 18 shelf guides now carry this round's revision.
- Added an English-version section to the guide-writing workflow, plus rules for figure alt text, metric gaming and batch integration; added `scripts/content/translation-work.mjs` for parallel-safe English checks and merges.
- Replaced the Transformer English teaching example with the paper's own English–German pair (*Ufer* / *Bank*).
- Build and 530 Node tests pass (1 skipped); browser tests were not run in this pass.

## English reading pilot — 2026-11-05

- Added a Chinese/English toggle to deep reading for Transformer r5 and RAG survey r5; the header control is labeled `English`/`中文`, and only the article prose and its term cards switch, while figures, formulas, navigation and page chrome stay unchanged.
- Older retained revisions now show a neutral notice with a link to the current revision; translation buttons appear only where a complete English body exists.
- Added reviewed English guide bodies, English figure text and a 40-entry English glossary as a separate content layer; the Chinese revisions and catalog hashes are untouched.
- Build and 530 Node tests pass (1 skipped). A headless rendered-build check covered both toggles, English prose, all figures, term cards and a 390 px simulated viewport; the live Playwright server remains unavailable in this environment.

## Guide depth batch — 2026-11-04

- Applied the new guide-writing workflow to 17 current revisions, with `react` and `helm` completing at r3; kept all previous revisions and merged the brief/glossary/catalog updates.
- Build, content validation and 529 Node tests pass (1 skipped); added the batch summary and separate independent spot-check reports for `react` and `helm`.
- Browser E2E and visual review remain unverified because the local loopback server was unreachable in this environment; no Git commit, push or deployment. See `docs/research/guide-depth-batch-2026-11-04.md` for exact evidence and remaining content limits.

## Project organization and learning entry — 2026-10-27

- Grouped backend HTTP, AI, content and storage modules; separated reusable rules from command entry points and organized checks by type.
- Kept the existing npm commands, reader routes, runtime data locations and reviewed content identities while splitting the AI presentation and reading styles by responsibility.
- Added a Chinese source-learning route, separated current contracts and long-term content workflows from completed task materials, and concentrated generated outputs under `.cache/`.
- Preserved original-material reviews, evidence JSON, prior content revisions, backups and content-recovery boundaries. Verification of this structural change is recorded by its finishing commit and current project state.

## Reading and AI data upgrade — 2026-10-27

- Added incremental storage accounting, paginated reads, compatible backups and on-demand guide bodies while preserving existing records and versions.
- Added fixed original materials, source-unit retrieval and saved evidence through both AI provider paths; published reviewed r2 samples for StreamingLLM, RAG and the memory survey.
- Centered display formulas, refined teaching-diagram styling, and matched AI response depth to the question. The completed functional baseline is `a8d97f9`; real-model answer quality remains an observation for deliberate use.

## Library briefs and venue references — 2026-10-26

- Replaced fragmented reading briefs with complete paper-specific explanations for all fourteen current readings, a single reading-action group and directly available chapter navigation.
- Kept publication identity, source edition and verified source-version dates visible; retained approved guide bodies and personal reading records.
- Added sourced CCF A/B or CAS major-category 1/2 reference labels, with CCF precedence and explicit editions. Unknown venues remain blank.
- Repaired delayed AI-panel focus return interfering with chapter entry; checked desktop/narrow rendering, old-revision resume, keyboard navigation and affected assistant states.

## AI reading and interface — 2026-10-25

- Added a reader-triggered AI panel, bounded guide/library tools, optional web search, source snapshots, local conversations and separate AI backups.
- Added official ChatGPT authorization, OpenAI-compatible API settings, capability-based Thinking and explicit quota-only API fallback. Credentials remain backend-only.
- Repaired connection recovery, catalog loading/caching and streamed/final answer reconciliation while retaining recoverable partial answers.
- Refined article orientation, AI settings/composer, palette contrast and reading controls; preserved approved academic content and existing personal-record behavior.
- Unified local startup with `npm start`, updated operating contracts, archived stage reports and refreshed curated interface images.

## Streaming foundations and library review — 2026-10-24

- Added mainline guides for *Efficient Streaming Language Models with Attention Sinks* and *A Survey on Concept Drift Adaptation*, with fixed source versions, mechanisms, evidence conditions and original-reading locators.
- Connected both additions to the public learning route; the library contains fourteen current readings and eighteen retained revisions. A metadata-only concept-drift revision narrows a broad learning keyword to prevent an unrelated tool-learning recommendation.
- Expanded rendered-prose browser checks to every current guide and reviewed the complete current library against its stated coverage.
- Corrected stale inventory documentation and refreshed the two curated library images; explained why tests, maintenance scripts and schemas belong in the source repository. Generated dependencies, builds and caches remain ignored.

## Content update — 2026-10-23

- Added a reviewed Agent memory survey guide based on arXiv 2404.13501v1, with definitions, sources/forms/operations, evaluation, explicit coverage and original-reading locators.
- Added an editorial learning route connecting memory, bounded context, partial observability, belief revision, metareasoning and online evaluation; further candidates remain separate from delivered guides.
- The library now has twelve current readings and fifteen retained revisions; previous immutable content remains unchanged.

## 0.1.0 — 2026-10-22

First accepted integrated local version.

- Survey and paper reading with bibliographic orientation, substantive explanations, navigation, diagrams, formulas, source locators and return navigation.
- Eleven current readings (two surveys, nine papers) linking LLM foundations to Agent tools, action, reflection and evaluation; fourteen retained revisions.
- Research questions, attributed evidence, next-reading assistance, notes, explicit reading states, genuine resume positions, context packets and transactional backup/restore.
- Immutable content updates with dry-run, atomic catalog switching, recovery and rollback.
- Centered library browsing, wider adjacent orientation, narrow-screen navigation and keyboard access.
- Portable tooling, dependency lockfile, synthetic checks, separated generated artifacts and archived implementation records.
