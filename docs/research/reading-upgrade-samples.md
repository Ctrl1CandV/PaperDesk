# Reading upgrade sample review — 2026-10-27

This record describes the authoring agent's source checks for three revision-2 guides. It is not an independent review or a claim of model-answer quality. The candidate package is `incoming/upgrade-reviewed/`; its dry run passed with 21 retained guide revisions, including all 18 previous revisions. After the separate reviewer confirmed the corrected candidates, `npm run import:content -- --from incoming/upgrade-reviewed --apply` applied the six new files and catalog selection. The independent conclusions are recorded in `reading-upgrade-independent-review.md`.

## Source and visual checks

Public source files were deliberately obtained for this upgrade under `.cache/upgrade/originals/`. The material registry separately retains originals and immutable parsed outputs. These review downloads and screenshots are reproducible review inputs; they do not replace that registry or its backups.

| Work | Fixed source | New checks and limits |
|---|---|---|
| StreamingLLM | arXiv 2309.17453v4 HTML and PDF | Verified HTML chapter/table/figure/equation IDs against the saved document. Viewed PDF physical page 5 at 1041 × 1347 pixels: Table 1 labels, total cache, PPL values and caption conditions; Figure 4 fixed initial KV, rolling recent KV and eviction; nearby consecutive-position explanation. Did not repeat all earlier Figure 1–10 checks. |
| Agent memory survey | arXiv 2404.13501v1 HTML and PDF | Verified section IDs and viewed PDF physical pages 8, 11, 20 at 1041 × 1347 pixels. Figure 3: task/trial/step interaction and W/P/R links, including cross-trial dashed links. Figure 4: sources/forms/operations grouping. Figure 5: direct subjective/objective and indirect task branches. No audit of every illustrated example or cited work. |
| RAG | Official NeurIPS 2020 camera-ready PDF | Viewed physical pages 2, 3, 6, 8 at 1041 × 1347 pixels. Checked Figure 1 query/retriever/generator/marginalization paths; Sequence/Token formula placement and single-token classification statement; Table 1 NQ/WQ/CT column correspondence and TriviaQA split warning; Table 6 development-set scope and FEVER/BM25 comparison. Table 4/text discrepancy remains excluded from the guide's numeric claims. |

The screenshots actually examined are `.cache/upgrade/sample-pages/streamingllm-p5.png`, `agent-memory-survey-p8.png`, `agent-memory-survey-p11.png`, `agent-memory-survey-p20.png`, and `rag-p2.png`, `rag-p3.png`, `rag-p6.png`, `rag-p8.png`. They were rendered using project-local PDF.js 6.4.299 and its installed canvas dependency. A first rendering command finished the four RAG pages but failed because `PDFDocumentProxy.destroy()` is not available in that API; the corrected command used `cleanup()` and rendered all eight pages successfully. Rendering alone was not treated as visual inspection: the named images were subsequently opened and examined by the authoring AI.

The printed page labels on these examined pages match their physical page numbers. These sources therefore do **not** demonstrate the acceptance case for differing printed and physical numbering; that case needs a separate fixture. Actual external-viewer fragment behavior remains a UI acceptance item, distinct from checking page contents and saved HTML anchors.

Exact source byte hashes used for these checks:

| Material | SHA-256 |
|---|---|
| StreamingLLM HTML | `3872f94d235da1a3903f162602e12a9759bbd35e3d4813f8816513dc04d9b0bf` |
| StreamingLLM PDF | `e8a7de67c7c57642648362651b4cf64fd852467e18865a298916a36098314819` |
| Memory survey HTML | `812d574b619eaec1f84a0fb1c5860e1d4f81dde68d5008d97e5680476f8344f4` |
| Memory survey PDF | `aae2f9537f748f30f0ca59fd66c499b7df7bdb199d24ce43cab0a6170f7dceef` |
| RAG PDF | `720f67eb41aa49995d5fcf3d24ac7efe431fbe08ce109b14b5a9fa4d4ebe2f8b` |

## Changes to the three candidates

All existing level-two units keep their IDs and order. Published revision-1 metadata and Markdown bytes remain unchanged. Each new revision uses a distinct `.r2.json` / `.r2.md` file and a fresh exact-body SHA-256; the full candidate catalog retains historical guide and exploration revisions.

- StreamingLLM replaces generic HTML targets with real fixed-version chapter/table/figure anchors. A small Mermaid diagram in `u04` explains the two cache paths, new-token processing and eviction. Its prose explicitly identifies it as a teaching diagram, omits layer/head details, and states that positional reassignment cannot recover evicted history. It adds no experimental claim and retains model/cache/hardware conditions in the existing prose.
- The memory survey replaces generic targets with verified chapter anchors. Its final coverage passage now identifies the limited new visual checks and the exact PDF page entries. It remains `mainline`; viewing three diagrams does not imply that all branches, references or experiments have been checked.
- RAG retains its existing precise PDF links and adds a short subsection inside `u03`. The two-token symbolic expansion distinguishes a shared latent document from per-position marginalization. The expansion is explicitly pedagogical and fixes the output prefix before comparing probabilities. The independent reviewer caught an initial overstrong “only one position” phrasing; it was corrected to a sufficient-condition statement that allows special multi-token parameter settings to agree. No new empirical values were introduced.

## Structural and independent checks

`npm run import:content -- --from incoming/upgrade-reviewed --dry-run` first rejected a missing main-source URL after every generic HTML citation had been replaced by a fragment. The candidates were repaired by retaining a visible complete fixed-HTML-version entry, and the dry run then passed. This preserves the exact primary-source inventory requirement instead of weakening the validator.

The separate reviewer must inspect the new prose, all changed locators and scope declarations from the fixed sources. In particular: check the StreamingLLM diagram's update/eviction interpretation, the RAG two-token algebra and shared-prefix condition, and the memory-survey visual-coverage wording. A successful package dry run proves structure and retained identity, not scholarly support.

The three existing library briefs were checked against the revision-2 changes and retain their complete overview/value/advice paragraphs: none claims broader source coverage or new experimental results. After the reviewed local import, three separate brief entries were bound to revision 2 while retaining the old entries. Original-paper dates remain unchanged. `npm run validate:content` passed with 21 guide revisions, 180 units, 166 cited URLs and 17 revision-specific briefs.

`npx playwright test tests/lazy-content.spec.ts tests/lazy-content-samples.spec.ts tests/venue-rankings.spec.ts --reporter=dot` passed all 6 checks after import. This checks the new diagrams/formulas, source-dialog fixed URLs and focus return, all three revision-1 routes, simulated narrow overflow, lazy loading and venue fixtures. The authoring AI opened and examined the generated StreamingLLM desktop/narrow section images and the RAG formula section image in `.cache/upgrade/rendered/`. Paragraphs and formulas remained legible; the cache diagram uses the existing horizontal scrolling frame with a text alternative. These screenshots were from the isolated development server, not the final production build or a physical phone.

## Final production reading check

After the final `npm run build`, a separate `npm run preview:web -- --port 4175` instance served the built assets. `npx playwright test --config .cache/upgrade/production-playwright.config.ts` passed. All `/api/ai` requests were intercepted with a synthetic 503 response before navigation, so this check did not read the regular AI service or invoke a model. Initial library selection requested **zero guide metadata/body files**; entering StreamingLLM requested exactly **one metadata JSON and one Markdown asset**. Three revision-2 routes and all three retained revision-1 routes rendered. The fixed HTML/PDF source URLs, dialog focus return, AI failure with readable prose, and absence of page errors were checked.

The authoring AI opened and examined these 13 production screenshots in `.cache/upgrade/production/`:

- `library-desktop.png`;
- `streamingllm-r2-cache-desktop.png`, `rag-r2-formulas-desktop.png`, `memory-survey-r2-coverage-desktop.png`;
- `streamingllm-source-dialog.png`, `memory-survey-source-dialog.png`, `reader-ai-unavailable.png`;
- `streamingllm-r2-cache-narrow.png`, `rag-r2-narrow.png`, `agent-memory-survey-r2-narrow.png`;
- `streamingllm-r2-cache-end-narrow-viewport.png`, `rag-r2-formula-narrow-viewport.png`, `memory-survey-r2-coverage-narrow-viewport.png`.

The desktop viewport was 1440 × 1000; the narrow viewport was 390 × 844, **a browser simulation, not physical-phone testing**. Complete paragraphs, formulas, citation buttons, the teaching-diagram label and manual source-location instructions remained legible. Long formulas and the cache diagram remain in existing horizontally scrollable regions; ArrowRight was verified to move each region, and the final cache nodes were inspected after scrolling. The pages did not overflow horizontally. Full-section screenshots include a fixed reading toolbar crossing their stitched content; the additional viewport screenshots confirm its normal bottom placement while reading. No UI source repair was needed after the final build. The concise machine check is `.cache/upgrade/production/checks.json`; none of these checks demonstrates an external PDF viewer's fragment behavior or real model-answer quality.

No experimental reproduction, blanket original-image recheck, current-literature survey, live model quality test or physical-device test is claimed here.
