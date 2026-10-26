# Frontend refactor — 2026-10-26

Specification remains 1.1. This record covers the initial redesign of the library, reader, AI discussion, notes, exploration and backup. The [subsequent feedback record](FRONTEND-FEEDBACK-2026-10-26.md) supersedes its layout details and records later checks. Earlier acceptance records and W1 gates describe previous releases; this initial stage did not claim new reader acceptance. Comparisons use captured local baseline and updated pages.

## Facts retained

The body is reviewed guide content, with its own revision distinct from the original paper version. Original papers remain deliberate external links; PDF anchors may require manual lookup. Guide and original reading marks remain separate explicit actions. Resume saves a section and relative offset without setting either mark.

Notes retain guide/revision/section and an optional exact quotation; return is section-level, not a claimed exact paragraph. Exploration evidence independently retains provenance and quotations. Browser backups cover notes, exploration, reading marks, resume and preferences; backend AI conversations have their own backup boundary. No content bytes, persistence schemas, backend API or credential handling changed.

Drafts persist in memory across internal navigation with existing unload warnings. Saved records survive refresh. Unsaved drafts and temporary note filters are not promised to survive it.

## Decisions implemented

| Evidence and task | Interface decision | Validation |
| --- | --- | --- |
| List selection and reading orientation have different jobs | Variable-height rows show titles, research-question subtitles, roles and topics. Details prioritize reading value, visible prerequisites, actual chapter entry targets and real resume. The approved overview remains expandable. | Search, keyboard selection, late rows, return/reload and public-content screenshots. |
| Continuous reading needs proportionate support | White article surface, ink headings, slate tool areas, limited indigo emphasis. Three columns where space supports them; closing AI retains article width. Compact TOC and modal discussion at smaller widths. | First screen, middle/later sections, diagrams/tables, long answers, maximum font size and narrow views. |
| Navigation scans differently from argument | Short presentation aliases for Agent survey navigation; approved headings, accessible names and stable IDs remain. | Full approved-prose and keyboard navigation tests. |
| Identity differs from operations | Guide revision and original version explicitly separated; font, AI and record actions grouped. Desktop accumulation controls occupy a reserved side area: left at wide widths, right below AI at intermediate widths. | Source return/focus, independent reading marks, end-of-article controls. |
| Question material must remain stable while reading moves | Draft material pins when typing begins; explicit replacement uses the current section. Each past turn exposes its saved section/selection, guide scope, history count and web-search permission. | Synthetic A-to-B drafting/answering, history, failed request, delayed finalization and long-answer scrolling. |
| Saved reading results must remain traceable | Notes distinguish article/section, personal text and exact excerpt. Temporary filters aid retrieval. Existing explorations precede editorial suggestions and expose their next action; retained version targets stay readable. | Synthetic save/edit/filter/return/reload, evidence and next-reading flows. |
| Data management has explicit consequences | Record counts and export/import take priority; AI backup scope is separate; confirmation and conflict handling remain. | Strict backups, conflicts, preview, cancellation and deletion-confirmation tests. |

## References and visual review

Actually opened the frontend-craft reference package's Tufte CSS sidenotes and Wikipedia Attention Is All You Need body/citation images. Borrowed continuous prose with subordinate adjacent material, current-section emphasis and discoverable sources. Their English text and short annotations do not establish Chinese typography or long-answer behavior here. No reference assets were copied into the website.

Baseline public-content captures: `.cache/redesign/before/`. Updated page/state captures: `.cache/redesign/after/`. Synthetic AI captures: `.cache/ai-context/`. Generated screenshots are ignored and are not shipped as example private records. Reviewed desktop library, orientation, reader, middle/later prose, AI idle/long-answer/material states, notes empty/saved/edit, exploration empty/saved/lens/detail/editor and backup. Narrow captures are simulated browser viewports, not phone tests. Actual paragraph fonts reported by Chromium: Segoe UI and Microsoft YaHei.

The before/after differences are the continuous white article against lighter tool areas, stronger current TOC item and shorter navigation labels, unobscured desktop prose, and library rows that no longer duplicate the detail's full overview. Details spend more area on prerequisites and chapter entries. Closing desktop AI deliberately leaves its column available; it does not widen and rewrap the article.

## Checks and corrections

- `npm run build -- --logLevel warn`: content validation, TypeScript and production bundling passed. The pre-existing greater-than-500-kB bundle warning remains.
- `node --test --test-reporter=dot tests/*.test.mjs`: passed with isolated loopback HTTP permitted; earlier blocked execution is not counted as passing service checks.
- `npx playwright test`: 110 passed in the integration run. Then `npx playwright test tests/ai-context.spec.ts tests/reading-workspace.spec.ts tests/accumulation-redesign.spec.ts`: 16 passed, covering final confirmation and workspace scenarios.
- Final targeted checks: `npx playwright test tests/reading-workspace.spec.ts --grep '1150px'` and `npx playwright test tests/reading-workspace.spec.ts --grep 'actual reader typography'` each passed. The first checks that tools clear the article and AI; the second recaptures the actual HELM table after closing the narrow-screen AI modal. Both resulting article/table screenshots were opened and inspected.
- Initial full browser run: 87 passed, 19 failed. Fourteen assertions expected overview/value in their previous containers; others assumed the old detail width, prerequisite placement, start-action label or status-trigger text. Updated these assertions to retain information/behavior checks under the new design.
- Real failures corrected: asynchronous resume layout moved the library return by 99px; native same-document fragment navigation could restore the old location; intermediate-width AI closing hid both TOCs; duplicate font controls appeared at that width; pending final answer confirmation could momentarily relabel materials; unavailable note sections had an inaccurate fallback label.

## Skills and limits

product-design 0.2.0-rc.1 informed complementary page responsibilities, stable question materials and saved-result return. frontend-craft 0.5.0-rc.1 informed the joint composition/type/surface changes and full-viewport plus actual-size inspection. Problems found were execution/state issues or project capability limits; this work does not reopen skill upgrades.

All AI checks use marked synthetic responses and block real outbound requests. Real subscription/API inference, web search, provider recovery, quota exhaustion and answer correctness remain unverified. External scholarly anchors, physical phones/touch, native browser zoom, other engines and screen readers remain unverified. Deployment and publication are outside this redesign's scope.
