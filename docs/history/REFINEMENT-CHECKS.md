> Archived milestone. Current instructions: [Operations](../development/OPERATIONS.md) and [project state](../development/PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Reading refinement — implementation and checks

This records the first two-level reading refinement of specification 1.1. The subsequent visual redesign and its current checks are in LIBRARY-DESIGN.md. The external-discovery requirement has since been clarified as assistant-led collaboration, with no automation requirement; see ASSISTED-DISCOVERY.md. DELIVERY.md records the earlier W0–W6 baseline. Reader acceptance remains separate from automated checks. Screenshot files from repeatable browser tests may reflect the later visual iteration; library-refresh-* files identify the new design's evidence.

## Implemented experience

- One library with All / Surveys / Papers views, simple title/main-topic search, compact article selection and a separate orientation before substantive reading. Search does not include body mentions, recommendation prose or inferred topic expansion. Agent therefore does not select InstructGPT through its incidental body mention.
- Orientation includes original title, public authors, verified venue/year, source version, topics, editorial learning value, prerequisites and coverage limits. Desktop and narrow layouts preserve the same two levels. A deliberate Enter in-depth reading action opens a pinned revision. Returning restores the library query, filter, selection, position and focus. Orientation selection alone saves no personal reading state.
- Reader tools separate passage note/exploration/context actions from article-level reading marks. Outside-panel press/release, Escape and Close dismiss without saving or discarding changed drafts. Pressing inside and releasing outside does not dismiss. Saving/copying prevents accidental dismissal. Note drafts preserve their exact passage, with explicit recovery of other drafts in the current chapter. Context packets retain manual edits and require a rebuild/keep decision after input changes.
- Exploration's explicit Find next reading flow uses reviewed local topic/concept relationships, shows a target section, match reason, purpose and limit, and displays only explicit reading states. Choosing a suggestion updates the existing next action with conflict checks. It neither creates a queue automatically nor marks an article read. Editable search-task previews and honest no-match states support further work.

Local retrieval is not automatic external paper discovery or a semantic interpretation of arbitrary research questions. External discovery remains an important required future capability. No external search/model service or automatic browsing pipeline is integrated. This iteration adds no personal store or backup format; deliberately selected next actions use the existing persistent exploration record and backup contract.

## Content identity and depth

Three new immutable revision-2 metadata files introduce schema-v2 orientation; revision 1 remains available. The catalog deliberately changes its current selections. All original non-catalog public content and original schemas match the preparation hashes (10/10); the three approved Markdown bodies are byte-for-byte unchanged. The current comparison is evidence/refinement-content-integrity.json; evidence/content-integrity.json retains the historical pre-refinement baseline. Source locators, conditions, citations, gaps and original-reading suggestions remain intact. Bibliographic checks and their limits are documented in ORIENTATION-SOURCES.md.

The second level is intended as substantive reading above an abstract or summary: continuous explanation of mechanisms, evidence, conditions and conceptual dependencies. Changing its visible label does not establish new explanatory depth. No substantive chapter was authored or newly audited in this iteration. Future enhancements require source review and an immutable content revision.

## Actual commands and outcomes

| Command/check | Observed result |
|---|---|
| `npm run validate:content` | Pass: 6 retained revisions / 3 current articles, 46 retained units, 39 distinct cited URLs, 3 lenses and 12 pinned targets. Structural validation is not scholarly review. |
| `npm test` | Final integration run: **94/94 pass**, zero skips. The earlier content-agent sandbox run was 90 pass / 4 symlink EPERM skips; the permitted integration run exercised all four. |
| `npm run typecheck` | Pass. Also rerun as part of the final build. |
| `npm run test:e2e` | **51 pass / 1 fail** out of 52. The failure selected a hard-coded revision-1 current target after current metadata moved to revision 2; the test now reads the catalog's actual current revision. |
| Targeted exploration rerun | The one failed case passed after that assertion correction. Its saved revision-1 evidence assertions remain unchanged. |
| `npm run test:e2e -- tests/refinement-visual.spec.ts tests/reader-tools.spec.ts` | **8/8 pass** after final narrow toolbar and chapter-label adjustments. All 52 suite cases have passed across the full and focused runs; this is not a claim of a single clean 52/52 full run. |
| `npm run build` | Final source build passes, including validation/typecheck. Existing >500 kB chunk warnings remain. |
| `node tests/preview-smoke.mjs` | Pass against production preview on 4173: title/topic-only library and two-level entry, three complete readers, diagrams/table, editorial lenses, explicit synthetic question save, opt-in packet and backup. No page/console errors or unsolicited external request; development fixture absent. |
| `node tests/content-update-browser.mjs` | Pass in an isolated source copy on 4175. Actual Agent metadata r2→r3 and seed1→2, selection rollback/reselection, same-key rejection and before-switch recovery preserve identical complete synthetic personal snapshots at six checkpoints. Old targets remain usable; r1/r2/r3 share the approved body. Main-workspace content files remain unchanged by this test. |

The update report is evidence/content-update-check.json. Its revision-3 content is clearly synthetic and exists only in the isolated test copy; the shipped current revision remains 2. Both the isolated browser and 4175 server were closed after checking. The application and tests use project-local dependencies; no dependency or lockfile change was made. The previous independent locked-install evidence remains in DELIVERY.md; a fresh install was not repeated here.

Additional failures corrected during focused checks: new JSON test imports required the ESM JSON import attribute; a context-packet question label included restored draft text and needed a stable accessible name. These failed attempts are not counted as passes. Existing browser assertions were updated for selecting orientation before reading, explicit draft discard, and deliberate rebuild after manual packet edits. No test was changed to infer a reading mark from opening a page.

## Pixels and interaction actually examined

These webpage-only screenshots in evidence/ were opened and visually inspected:

- refinement-library-desktop.png: compact classified list, original identity and visible in-depth reading action.
- refinement-library-narrow.png and refinement-orientation-narrow.png: distinct single-column stages, readable metadata, return to the same filtered results.
- refinement-reader-narrow.png: current chapter context and all three passage tools on the same action row after the final adjustment.
- refinement-note-desktop.png and refinement-note-narrow.png: exact quotation context, readable chapter label and session-draft editor controls.
- refinement-next-reading-desktop.png and refinement-next-reading-narrow.png: explicit local goal, reasons/limits and next-action/search-task controls.

The checked desktop viewport was 1280×900 and the narrow viewport was 390×844. Generated screenshots not listed above are not claimed as inspected. Chromium reported Segoe UI and Microsoft YaHei for body text. Images contain only public article information and explicitly synthetic records, with no window chrome or real reader notes.

Browser checks exercise keyboard article selection, Tab/focus containment, Escape, pointer dismissal/drag-out behavior, explicit reading-state changes, list/reader return and draft recovery. They also check no document-level overflow and no unexpected page errors/outbound requests in the exercised flows. The full suite includes existing source, backup, conflict, content safety and CSS-zoom simulations. These observations do not certify physical devices, assistive technology or arbitrary future content.

## Preview and remaining limits

Build with `npm run build`, run one `npm run preview` process, then open `http://127.0.0.1:4173/library`. A production preview was running at this origin at handoff. A final read-only HTTP probe returned 200 with the PaperDesk page; its first sandboxed attempt was denied socket access, and the narrowly permitted rerun succeeded. Do not start a second process on the same port; use the existing preview or stop the known project server before restarting. Keep the reading origin stable for browser-owned records.

Still unverified: physical phone/touch/soft keyboard, native browser 200% zoom, other browser engines, screen readers, actual OS clipboard permission, live original-source anchors and physical crash/power-loss durability. Clipboard/storage failures and transaction interruption are injected tests. No accepted startup-performance budget has been measured. Drafts are memory-only; browser unload warnings and record eviction are browser-controlled, so durable records need explicit backups.

Reader feedback is still needed on two-level orientation usefulness and local next-reading relevance. Ranking tests establish deterministic behavior, not research relevance, learning, novelty or completeness. External automatic discovery and source-reviewed substantive content enhancement remain future work. No Git initialization/commit/push, deployment, account system, cloud service or online model integration occurred.
