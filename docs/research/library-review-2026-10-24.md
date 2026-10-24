# Library and repository review — 2026-10-24

The fourteen current guides satisfy the project's stated **mainline** reading contract. No blocking factual or explanatory issue was found in the reviewed scope. This means coherent explanation with source conditions and explicit gaps; it does not mean exhaustive coverage of every original paper, appendix or cited study. All four surveys remain mainline guides, not full-survey replacements.

The two new readings are *Efficient Streaming Language Models with Attention Sinks* and *A Survey on Concept Drift Adaptation*. They develop complementary foundations: bounded computation for a continuing token stream, and adaptation/evaluation when predictive distributions change. Selection and fixed-source evidence are in [StreamingLLM review](streamingllm-review.md), [concept-drift review](concept-drift-survey-review.md) and the [public learning route](../LEARNING-ROUTE.md). The previously prepared [Agent memory survey](agent-memory-survey-review.md) is also included in this source update.

## Scholarly review

The twelve existing current guide bodies and metadata were read in full, together with nine existing source-review records. The three initial guides retain their recorded historical review basis. The following original-source checks were repeated selectively; this is not a new full-text audit of all twelve original papers. Their original figure pixels were not rechecked in this pass. New-guide authors and separate reviewers checked the two additions as recorded below.

| Current guide | Review conclusion and selected original-source checks |
|---|---|
| Agent Survey r2 | Acceptable. Fixed arXiv 2308.11432v7 §2.1–2.2 and knowledge-boundary passages support the role/memory/planning/action framework and distinctions between capabilities and organization. |
| InstructGPT r2 | Acceptable. Fixed arXiv 2203.02155v1 preference result 85±3% and hallucination results 21%/41% retain the actual comparison conditions; SFT, reward modeling and PPO are distinguished. |
| HELM r2 | Acceptable. Fixed arXiv 2211.09110v2 evaluation framework and HellaSwag 79.1/30.2 example retain differences in evaluation setup; the gap is not attributed to one isolated factor. |
| ReAct r1 | Acceptable. Fixed arXiv 2210.03629v3 Tables 1, 3, 4 and settings support the mechanism, negative comparison, additional CoT-SC budget, and ALFWorld average/best distinction. |
| Toolformer r1 | Acceptable. NeurIPS 2023 §2, formulas, inference and Table 3 support candidate generation/execution/filtering; the paper itself labels the base model 6.7B. Tool training, zero-shot evaluation and call limits remain distinct. |
| Reflexion r1 | Acceptable. NeurIPS 2023 coding settings, Tables 1–2 and ablations preserve frozen parameters, repeated attempts, feedback availability and final pass@1 conditions; negative MBPP/WebShop evidence is retained. |
| LLM Survey r1 | Acceptable. Formal FCS version DOI 10.1007/s11704-026-60308-3, first-page identity, §4.3 and Table 3 checked. The 40-page source is not confused with longer arXiv versions. |
| Transformer r1 | Acceptable. NeurIPS 2017 Table 3 and ablation settings checked; Q/K/V, scaling, masking, multi-head attention and positions are explained with conditions rather than a vocabulary list. |
| GPT-3 r1 | Acceptable. NeurIPS 2020 Figure 1.1 dataset description, §3.3 and Table 3.2 checked; pretraining, fixed-parameter in-context use, development/test distinctions and contamination limits are preserved. |
| Chain of Thought r1 | Acceptable. NeurIPS 2022 §3.1 and supplementary Tables 1, 2, 6 checked, including PaLM/SVAMP's nonmonotonic results. Intermediate text is not equated with faithful internal thought. |
| RAG r1 | Acceptable. NeurIPS 2020 §2.1–2.5, Tables 1 and 6, knowledge replacement and retrieval-count experiments checked. Query-encoder updates, fixed document/index representations, and sequence/token marginalization are accurately distinguished. |
| Agent Memory Survey r1 | Acceptable within its disclosed limits. Fixed arXiv 2404.13501v1 §§3, 5 and 6.1.2 checked. Sources/forms/operations and direct/indirect evaluation are clear. Its empty figuresViewed list is intentional: original figure pixels were not inspected. |
| StreamingLLM r1 | Acceptable. Fixed arXiv 2309.17453v4 §§1–5 and Appendices A/C/D independently checked; reviewer inspected PDF pp3, 9 and 16. Author checked additional figures as separately recorded. Four-million-token processing, 22.2× versus window recomputation, cache distance and 160M sink pretraining retain their conditions. |
| Concept Drift Survey r2 | Acceptable. Complete guide and metadata independently reviewed against the accepted manuscript's selected definitions, memory, detection, adaptation and evaluation passages; pp5, 7 and 44 pixels independently inspected. Author checked the additional figures listed in its review. Published 2014 identity is separate from the 44-page accepted manuscript and its placeholder footer. |

No experiment was reproduced. Historical open questions are not claims of current novelty. Independent review of a guide does not certify every paper it cites or imply that a reader has mastered the material.

## Findings resolved

- README still described an older collection; README, START-HERE, PROJECT-STATE and Operations now agree on **14 current readings, 4 surveys, 10 papers and 18 retained guide revisions**. Historical milestone counts remain historical.
- Rendered-prose browser checks covered a hard-coded subset. They now iterate every current guide and allow a prose-led article without a display formula, table or diagram.
- The first complete browser run passed 71/73. One test wrongly assumed the first citation always used the main source version; it now checks the selected citation's own version and exact URL. The product already displayed the correct publication-record version.
- The other failure exposed a real editorial matching problem: concept-drift's generic target keyword “学习” matched “工具学习”. Metadata revision 2 narrows it to “在线适应”; revision 1 and the exact body remain intact. The existing recommendation assertion was not weakened, and no product matching code changed.

All 28 pre-update non-catalog content files are byte-identical. The final catalog retains all previous revisions. The extra concept-drift revision changes only the revision number and one reading-target concept. Runtime source, schemas, maintenance scripts, dependency declarations and lockfile are unchanged in this update.

## Repository hygiene

`tests/`, `scripts/`, `schemas/`, `src/`, the lockfile and operating documentation belong in the maintainable source checkout. Tests protect content integrity, notes, backups and recovery. The browser loads the built website, not the source checkout's tests or maintenance reports. README now explains this distinction.

Git's tracked and non-ignored candidate inventory contains no dependency/build/cache directories, authoring packages, downloaded paper PDFs, recovery receipts, private-data directories or backup exports. The relevant ignore rules were checked. Targeted text checks found no absolute machine paths or credential-like tokens in the candidate text files; this is not a comprehensive security certification. Full paper PDFs and source screenshots remain ignored review inputs. Reproducible dependencies and caches are retained for local operation. `.content-update/` is deliberately retained for recovery, not deleted as clutter.

The source repository follows its own single-main policy and existing date-prefixed commit convention. No application deployment, release publication, global configuration or unrelated repository change is part of this update.

## Validation and visual review

| Actual command/check | Result |
|---|---|
| Import dry-run and apply for the two additions, then the metadata-only correction | Passed; complete retained catalog supplied each time. |
| `npm test` | 90 passed, 4 skipped, 0 failed. The skipped synthetic symlink cases could not create Windows links (EPERM); their rejection paths were not exercised. |
| `npm run build -- --logLevel warn` | Content validation, TypeScript and production build passed: 18 retained revisions, 153 retained units, 133 unique cited URLs, 3 lenses, 12 pinned targets. Existing >500 kB chunk warning remains. |
| `npm run test:e2e` | Final 73/73 passed after the two corrections. |
| `node tests/preview-smoke.mjs` | Final production build passed all 14 current guides, retained original readers and synthetic save/packet/backup flows; no page/console errors or unsolicited outbound requests; development fixture absent. |
| `node tests/content-update-browser.mjs` | Six final update/rollback/rejection/recovery checkpoints passed; complete synthetic records and all 34 main content files unchanged. See [latest integration evidence](../evidence/content-update-check.json). |
| `npm audit --json` | Zero reported known vulnerabilities in the current lockfile audit. Dependencies were not changed. |
| Final production reader-end probe | All 14 current guide endings scroll above the fixed action bar at 390×844, with no horizontal page overflow. |
| Independent Git-index source export | Installed 258 locked packages and passed validation, typecheck and build; all 34 content files match the working tree, index and export. Offline installation first failed because a tarball was absent from cache and reported Windows cleanup EPERM; `npm ci --no-audit --cache ../../npm` then succeeded with scoped registry access. No source/dependency workaround was needed. |

Actual screenshots examined include both desktop and narrow starting viewports for every current article, the two additions' orientation/details, selected existing formula/diagram/table scroll endpoints, and desktop/narrow library views. Exact filenames are listed in [review evidence](../evidence/library-review-2026-10-24.json). The automated prose check establishes presence of every parsed non-math text segment, not strict paragraph ordering or absence of duplication. Formula counts and error checks do not replace pixel inspection.

The two curated library/orientation images were refreshed from inspected current screenshots so the documentation images show the same 14/4/10 counts as the catalog.

Screenshots establish only their visible regions; this is not full-page-by-page visual review, physical phone testing, screen-reader testing or live external PDF anchor verification. Browser records in these checks are empty or explicitly synthetic. The large rendering bundle remains a known performance limitation, not a new regression or a measured performance-budget pass.
