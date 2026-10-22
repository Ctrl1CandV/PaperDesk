> Archived milestone. Current instructions: [Operations](../OPERATIONS.md) and [project state](../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Library browsing and the LLM-to-Agent reading batch

## Current refinement: compact rows and article-aligned orientation

The grid described in the earlier sections is superseded. The library shows one article per row with separate browsing and selected states. Browsing uses a centered column up to 900px wide for the heading, search, article rows and footer; it reserves no empty right column. Selecting expands the desktop workspace to 1360px, with a 340–540px orientation card and 32px gap, placing its right edge farther right. Closing restores the wider centered rows. The card and selected article retain vertical center alignment, bounded by the library layout's top for early selections. The connector line remains removed. Resize, text reflow and disclosure expansion recompute the offset. Both remain in ordinary page flow. Compact title/subtitle grouping, 16px row padding, 8px row gaps and consistent green focus indicators preserve the approved style and text. The complete orientation still supplies details behind the brief list excerpt. This is a scoped refinement using the supplied screenshot as the problem reference; no external visual benchmark comparison is claimed.

Selection reveals the card heading and reading entry when needed. Close/Escape returns to the same row. Fresh deep links and reload reveal the selected card; history/reader return preserve saved positions. Focused disclosure controls remain visible after recentering. The preceding row-layout iteration corrected fresh-link positioning and a 2px selected-only width shift.

Current verification: `npm run test:e2e -- tests/library-design.spec.ts tests/library-orientation.spec.ts` passed **8/8**, checking closed-state centering/wider rows, open-state expansion, close restoration, width stability between selections, centered/clamped cards, disclosures, keyboard focus and existing navigation. `npm run build -- --logLevel warn` and `node tests/preview-smoke.mjs` passed; the existing >500 kB chunk warning remains. Restricted browser execution initially blocked localhost access; the identical project-local commands passed with limited execution escalation. Actual current pixels examined include `evidence/library-dual-browse-1920.png`, `library-dual-selected-1920.png`, `library-dual-anchored-middle.png`, `library-dual-narrow-list.png` and `library-dual-narrow-orientation.png`, plus selection/Escape in the running in-app preview. Tests cover 2560/1920/1440/1280/1024/820/390/320 CSS-pixel widths and 200% CSS zoom. Screenshots are simulations, not physical-phone tests or reader acceptance. No source texts, dependency versions or personal records were changed.

Prior row-layout verification remains historical: targeted checks **7/7**, full browser suite **66/66**, all 26 non-catalog content hashes unchanged, and examined `library-row-*` desktop/narrow/zoom screenshots. The full browser and unit suites were not rerun for the current scoped refinement.

The following sections retain the prior five-reading batch and its earlier layout/check history.


## Library interaction

The library is now the main browsing surface. It no longer shows an automatically chosen article in a permanent split pane. Select a real article to open its orientation in a smaller right-hand card; close the card or use Escape inside it to return focus to that article. Search/type filters clear the card, and direct article URLs, browser history and reader return retain their established behavior.

The overall library can use up to 1680px. A selected orientation takes 320–440px; the main list receives the remaining space. It shows real article identity, year, type, a short excerpt of the approved orientation summary and primary topics. The full summary remains in orientation. Wide browsing uses a grid, while constrained widths use fewer columns. Small screens still use list → orientation → substantive reader.

Neither the list nor the orientation has a fixed height, sticky position or independent vertical scrollbar. Both follow the window's page scroll. The orientation is a non-modal card with a visible close control; the original grey-green theme is unchanged. Research purpose and reading value remain visible; prerequisites/coverage, complete source identity and chapters are available through keyboard-operable disclosures. The approved orientation text is preserved.

Selecting focuses the article heading; when opening from lower in the list, the new card is brought into view. Re-selecting the current article reveals it without adding a history entry or jumping arbitrarily to the page top. Closing restores the corresponding article's focus and visibility. Selection does not save reading progress or status.

## Layout verification before content expansion

`npm run typecheck` passed. The five targeted library cases passed after correcting a real offscreen-focus issue: a hidden preview returned a zero top coordinate, preventing the first selection from a scrolled list from being revealed. The final implementation measures the visible list when the card is hidden.

`npm run test:e2e -- tests/library-design.spec.ts tests/library-orientation.spec.ts` passed **5/5** after the final card-spacing adjustment. Tests cover page-only vertical scrolling, explicit selection, keyboard access to the last article, close/Escape/focus return, re-selection, source/chapters, filters/history/reader return, and no personal reading-state writes. Width checks include 2560, 1920, 1280, 1024, 820, 390 and 320 CSS pixels plus CSS 200% zoom. These checks initially used the six-article catalog; the integrated results after additions will be recorded below.

Actual pixels examined: `evidence/library-card-selected-1280.png`, `library-card-selected-1920.png`, `library-card-selected-2560.png`, `library-card-browse-1280.png` and `library-card-narrow-orientation.png`. The final 1280/2560 views show the compacted article spacing, right card, single-page flow and original palette. These are simulated browser viewports, not physical phone tests.

## Content batch

Five public-source readings are now imported: one LLM survey and four foundational papers. They supply the technical dependencies beneath the existing instruction-learning, tool-use and Agent readings. No private notes or personal history were inputs.

| Reading | Version used | Main learning purpose |
|---|---|---|
| A Survey of Large Language Models | Frontiers of Computer Science 2026 formal journal PDF, 40 pages, DOI 10.1007/s11704-026-60308-3 | Connect pretraining, post-training, usage and evaluation; distinguish parameter changes, context changes and external action. |
| Attention Is All You Need | NIPS 2017 official conference PDF, 11 pages | Query/key/value, multi-head attention, masking, positional information and conditioned translation evidence. |
| Language Models are Few-Shot Learners | NeurIPS 2020 main paper and separate supplement | Autoregressive pretraining, in-context learning, zero/one/few-shot comparisons and their limitations. |
| Chain-of-Thought Prompting Elicits Reasoning in Large Language Models | NeurIPS 2022 main paper and separate supplement | Intermediate reasoning demonstrations, model-scale/task conditions and the difference between plausible explanations and faithful computation. |
| Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks | NeurIPS 2020 main paper | Retriever–generator interaction, RAG-Sequence/Token, frozen versus trained components, evidence and retrieval limitations. |

These are complete original Chinese teaching texts for their declared mainline coverage, with separate orientation, chapter navigation, formulas, original teaching diagrams, selected tables, evidence conditions, exact source locators, coverage gaps and original-reading advice. They are not full translations or exhaustive paper replacements. The LLM survey explicitly distinguishes its 40-page formal version/23-author list from the 144-page arXiv v19. Its final section connects all ten other current readings through working links; readers can follow understanding dependencies or skip to an existing question. No order or opened page is saved as completion.

Source-review records are `research/llm-survey-review.md`, `transformer-review.md`, `gpt3-review.md`, `chain-of-thought-review.md` and `rag-review.md`. Authors inspected the named public versions and selected actual PDF tables/figures. Integration review read all five complete texts and independently inspected Transformer pages 4/8, GPT-3 pages 2/6 and table text on pages 5/7, CoT page 3 plus supplementary Table 2, RAG pages 2/6 plus relevant training/index-swap text, and survey pages 3/18. A separate read-only reviewer checked the survey's source identity, post-training comparison and selected RAG/Agent/evaluation sections. No experiment reproduction or exhaustive reference audit is claimed.

The baseline in `evidence/library-card-content-baseline.json` and result in `evidence/llm-foundations-integrity.json` confirm **16/16 existing non-catalog content files unchanged**. The importer added ten new files and changed the catalog intentionally, retaining all nine previous guide revisions. The library now has **11 current readings: 2 surveys and 9 papers**, with **14 retained guide revisions**. Approved earlier claims, citations, coverage gaps and reading advice were not rewritten.

## Integrated results

Actual commands and results:

- `npm run import:content -- --from incoming/llm-to-agent --dry-run` and `--apply`: five additions; nine earlier revisions retained; ten files added. Content validation reports **14 revisions, 112 units, 126 cited URLs, 3 editorial lenses, 12 pinned targets**.
- `npm test`: **90 passed, 4 skipped, 0 failed**. The four synthetic symlink cases could not create links on Windows (EPERM), so those rejection paths remain unexercised.
- `npm run test:e2e`: **64/64 passed** against isolated synthetic browser records on the test origin. Includes current/retained readers, title/topic filtering, all eleven article selections, window-only library scrolling, dismiss/reselect/focus/history, cross-reading return, notes/exploration/backup/conflicts and keyboard media scrolling.
- Actual pixel review then found that the old shared SVG `min-width` and `max-height` combination compressed tall diagrams into tiny labels and empty space. Removing those constraints preserves the natural diagram dimensions. Tall diagrams now extend in page flow; wide diagrams retain keyboard horizontal scrolling. New assertions check effective node-label font size, including SVG viewBox scale, rather than just SVG presence.
- After that correction, `npm run test:e2e -- tests/new-readings.spec.ts tests/w1.spec.ts tests/visual.spec.ts`: **20/20 passed**, covering all original/current readers affected by the shared diagram styling. Obsolete horizontal-end evidence for the now-fitting survey diagram was removed; tests also remove such stale end screenshots when overflow disappears.
- Final `npm run build -- --logLevel warn`: validation, TypeScript and production build passed. Existing minified chunk >500 kB warning remains; no startup-performance budget was measured.
- Final `node tests/preview-smoke.mjs`: passed for **all 11 current readings**, retained original readers, library/exploration/context/backup surfaces. No page/console errors or unsolicited external requests; development fixture absent. Checks used isolated synthetic records.

Final expanded library pixels actually examined include `evidence/library-card-browse-2560.png`, `library-card-selected-1920.png` and `library-card-narrow-orientation.png`, in addition to the earlier layout images above. The list occupies the main surface, the selected card sits toward the right, and the original palette remains consistent.

New reading visual scope: for each of `llm-survey`, `transformer`, `gpt3`, `chain-of-thought` and `rag`, the `evidence/additions-{id}-reader-desktop.png` and `-reader-narrow.png` starts were examined, together with all generated narrow media starts (survey 1–3, Transformer 1–6, GPT-3 1–4, CoT 1–3, RAG 1–5) and existing horizontal-end views. After fixing SVG sizing, survey media 1 and Transformer media 4 were re-viewed, along with the refreshed GPT-3/CoT/RAG diagrams and their end views. Labels, Chinese text and formulas are readable; the tall-diagram letterboxing/overlap is resolved. The survey diagram now fits horizontally, so its prior `media-1-end-narrow.png` is not final evidence and has been deleted. Screenshots do not themselves prove full interaction or article-bottom reachability; the executed browser checks cover the listed behavior.

The built preview is running at **http://127.0.0.1:4173/library**. Reuse that server; do not launch a duplicate `npm run preview` on its occupied port. The LLM starting page is **http://127.0.0.1:4173/read/llm-survey/1**. For a later fresh session, use `npm run build` then one `npm run preview`, keeping the same origin for browser-owned records.

Unverified: reader acceptance of the new card/teaching texts, physical phone/touch, native browser zoom, non-Chromium engines, screen readers, real OS clipboard permissions, live PDF anchor positioning, exhaustive appendices/references, experiment reproduction, startup performance and physical power-loss behavior. Narrow-width and 200% CSS-zoom checks are browser simulations. No private records were inspected or used as fixtures; application dependencies and lockfile remain unchanged. No Git initialization/commit/push, deployment or cloud work occurred.
