# Library brief: complete explanation and direct navigation

## Delivered structure

The brief helps a reader decide what a paper contributes, why to study it and where to enter. Fourteen current readings now have individually written, complete paragraphs: overview, research value and reading advice. HELM was implemented and visually checked first; its three paragraphs follow the supplied accepted wording. The other thirteen follow their own approved explanations and conditions, rather than inheriting HELM's evaluation labels.

The existing list/detail proportions remain unchanged. Within the card, the short title, full title, first author, publication and year form one group. The original-paper link is directly available. One reading-action group precedes the prose: Start for a new reading, or the actual saved chapter with Continue and a secondary From beginning link. A saved older revision continues that revision; it does not highlight a chapter in the current revision's outline.

Continuous white prose uses 16px text, 1.75 line height and 24–28px desktop padding. All chapters follow the explanation in two compact columns, becoming one in a narrow card. Links retain original versioned routes and unit IDs; their visible short names are also their accessible names, with full headings available through `title`. No introduction is clipped, folded or hidden behind tabs. Bibliographic identity, source edition, verified version date and guide revision are directly visible. Internal source hashes remain in the content records rather than appearing as reading guidance.

## Content and compatibility

`content/library-briefs.json` is the library's editorial presentation layer. Each entry is pinned to a guide ID and revision. It does not change immutable guide metadata, Markdown, citations, coverage declarations, AI guide material or personal records. Newly imported revisions without a matching brief fall back to their own metadata; they never reuse prose, chapter labels or dates from another revision.

The new prose is derived from the current approved bodies and the source-review records under `docs/research/`. Reading order and suggested research uses are editorial guidance, not new experimental findings. This round did not repeat a complete scientific or figure audit. Conditions retained include fixed historical versions, prompt/evaluator dependence, proxy loss versus correctness, retry versus transfer, translation versus general capabilities, fixed-corpus RAG versus live search, streaming length versus effective memory, and concept-drift teaching links versus proven Agent results.

Six version dates were checked against primary version records:

| Source used by the guide | Version date and record |
|---|---|
| HELM v2 | [2023-10-01](https://arxiv.org/abs/2211.09110v2) |
| Agent survey v7 | [2025-03-02](https://arxiv.org/abs/2308.11432v7) |
| InstructGPT v1 | [2022-03-04](https://arxiv.org/abs/2203.02155v1) |
| ReAct v3 | [2023-03-10](https://arxiv.org/abs/2210.03629v3) |
| Agent memory survey v1 | [2024-04-21](https://arxiv.org/abs/2404.13501v1) |
| StreamingLLM v4 | [2024-04-07](https://arxiv.org/abs/2309.17453v4) |

The label is **原文版本日期**: a v1 submission is not described as a later update. For Toolformer, Reflexion, the LLM survey, Transformer, GPT-3, Chain-of-Thought, RAG and the concept-drift survey, the actual source is a conference PDF, formal journal PDF or author accepted manuscript. No exact update date for those files was established, so no date is invented or borrowed from a different arXiv revision. Existing publication and original-source links remain authoritative. HELM's scope was also checked against the [authors' project explanation](https://crfm.stanford.edu/2022/11/17/helm.html).

The build validates revision targets, complete chapter mappings and matching fixed-version records. It does not certify scholarly accuracy. Editorial briefs are maintained with the application and are not silently imported by the immutable-content importer; see [content updates](../CONTENT-UPDATES.md).

## Verification and repairs

- `npm run build -- --logLevel warn` passed content checks (18 immutable guides, 153 units, 14 library briefs), TypeScript and production bundling. The pre-existing bundle-size warning remains.
- `node --test --test-reporter=dot tests/*.test.mjs` passed, including the new revision/chapter/source-date validation and existing importer checks.
- `npx playwright test tests/library-design.spec.ts tests/library-orientation.spec.ts tests/new-readings.spec.ts tests/library-brief.spec.ts tests/reading-workspace.spec.ts tests/ai-context.spec.ts` passed 44 tests. Two targeted `ai-connection.spec.ts` narrow-settings/compact-sidebar cases also passed: **46 affected browser checks in total**.
- The first focused run passed 26/27 and revealed the chapter-focus issue below; three repetitions confirmed it before repair. The final affected run passed without weakening the focus assertion. New checks cover all fourteen guide bodies, direct chapter mapping, genuine and old-revision resume, untouched read states, keyboard/history behavior, 390/320px natural flow and relevant AI close/resize/return states.
- `git diff --check` passed. Screenshot production and actual image review are separate: the images listed below were opened and examined at their saved display sizes. A capture-script zoom assertion initially multiplied an already scaled document width; after correcting that measurement, the screenshot and normal document overflow check were used. This was a diagnostic-script issue, not a layout repair.

The focused keyboard check exposed a pre-existing development-mode focus bug: the AI panel's effect replay queued a focus return after chapter navigation. The delayed return is now cancelled on setup, targets only the still-connected original reader, and respects a newly focused destination. Chapter keyboard entry and AI panel close/resize behavior are checked together.

Visual evidence is generated under `.cache/orientation-redesign/`: HELM at 1920px, its full card and real browser-generated resume state, 1440px cards, a 390px narrow page and a CSS 200% zoom simulation. The 1440px samples include ReAct, InstructGPT, the LLM survey and the ten-chapter concept-drift survey. The representative HELM card is also kept in `docs/images/orientation.png`. These are isolated browser records and public text. API and external requests were blocked during production captures; no live AI result, private reading history, phone test or native browser zoom test is claimed.

## Skill feedback

Product design helped separate the explanation, navigation, bibliographic identity and actual reading action by purpose. Frontend craft guided their typography, density, width and rendered checks. The prior card's fragmented copy and field-by-field layout mainly reflect execution and example coverage gaps: existing principles already support continuous argument and different densities for prose and navigation. The local feedback reports distinguish those failures from missing principles, retain the rejection of folds/tabs across iterations, and document that compactness must not remove explanatory relationships. Skill files and versions were not changed.
