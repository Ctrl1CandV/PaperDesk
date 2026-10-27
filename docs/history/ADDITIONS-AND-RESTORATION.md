> Archived milestone. Current instructions: [Operations](../development/OPERATIONS.md) and [project state](../development/PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Original style restored; three papers added

Historical batch report. The fixed split/sticky-list layout below is superseded by [LIBRARY-CARD-AND-FOUNDATIONS.md](LIBRARY-CARD-AND-FOUNDATIONS.md), which records the current dismissible right card, page-only scroll, five further readings and latest checks. The original palette and this batch's source-review/preservation records remain relevant.

The reader clarified that platform consistency means returning the new library to the original visual language. The previous expansion of the blue design was therefore reversed. This report supersedes the current-status claims in LIBRARY-DESIGN.md and STYLE-CONSISTENCY.md; their historical implementation records remain available.

## Presentation

The shared theme again uses grey-green ink, sage accents, quiet neutral surfaces and the original system font roles. Raised white reader/preview surfaces and the oversized serif library masthead are removed. The accepted compact article index and two-level orientation → substantive reading remain. Desktop columns are **40% left / 60% right**, with a 1240px maximum layout width. The right pane still includes article identity, publication facts, purpose, value, prerequisites, coverage and access to the original source.

With six current articles, the sticky desktop index now has a bounded scroll region. Keyboard focus can reach the final article without losing the index; small/short layouts use normal flow. Narrow screens retain list → orientation → reading and return to the existing selection. Long display formulas now have a block-level wrapper: this corrects scroll positioning while preserving local horizontal scrolling and a visible keyboard-focus outline. No page-wide horizontal scrolling is required.

## Content selection and source review

The additions build on the existing Agent overview, InstructGPT training discussion and HELM evaluation framing. They were chosen for explicit mechanisms and informative experimental conditions, not a novelty ranking or a profile inferred from private notes.

| Added reading | Why it belongs | Actual source |
|---|---|---|
| ReAct: Synergizing Reasoning and Acting in Language Models | Connects reasoning, actions and observations; exposes differences between prompting, environment interaction and measured success. | ICLR 2023 camera-ready source identified by the authors in [arXiv v3](https://arxiv.org/abs/2210.03629v3). |
| Toolformer: Language Models Can Teach Themselves to Use Tools | Explains how generated API calls become training data through execution and loss-based filtering; distinguishes learning tool use from merely supplying a tool. | [NeurIPS 2023 proceedings](https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstract-Conference.html), main and supplemental PDFs. |
| Reflexion: Language Agents with Verbal Reinforcement Learning | Connects feedback, memory and repeated attempts, including conditions where self-reflection fails or hurts. | [NeurIPS 2023 proceedings](https://papers.nips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html), five-author conference version. |

Each has full orientation and a substantive Chinese explanation, not just an abstract or source link: mechanism, necessary dependencies, formulas, original labeled teaching diagrams, selected result tables, conditions, gaps and specific original-reading advice. ReAct has seven units, Toolformer eight and Reflexion seven. Diagrams are explanatory constructions, not reproduced original figures. No claim is made to cover every appendix or reproduce experiments.

Source identity, exact claim/number checks and inspected PDF pages are recorded in [research/react-review.md](../research/react-review.md), [research/toolformer-review.md](../research/toolformer-review.md) and [research/reflexion-review.md](../research/reflexion-review.md). Review preserves non-universal and negative results: ReAct does not always outperform CoT; Toolformer's main evaluation restricts tool-call behavior; Reflexion's repeated attempts and feedback access are not equivalent to one model call, and its MBPP/WebShop limitations remain explicit.

OpenReview presented a browser challenge; ReAct instead uses the authors' fixed public arXiv source. One Reflexion PDF fetch timed out; the same official conference PDF was obtained from the official proceedings domain. Web screenshot results did not supply usable pixels, so public PDFs were rendered and opened locally with PyMuPDF 1.26.7 installed only under ignored .source-review/python. The source-review notes distinguish text inspected from figures actually seen. Application dependencies and the lockfile did not change.

## Import and preservation

The complete package was staged in incoming/agent-foundations and imported with the existing content importer. An initial dry-run caught a missing exact main-PDF citation inventory entry; it was corrected and the package revalidated before applying. Final dry-run/apply added three revision-1 packages (six files) while retaining all six prior guide revisions and existing exploration inputs.

The current library is **one survey plus five papers**, with nine retained guide revisions. The original ten non-catalog content/schema inputs match their previous hashes; the catalog intentionally selects the additions. [evidence/additions-content-integrity.json](evidence/additions-content-integrity.json) records the comparison and new hashes. Previously approved bodies, citations, attribution, gaps and reading advice were not rewritten. Importing or previewing creates no read/mastered state.

Search still uses titles and reviewed primary topics. Searching Agent returns the Agent survey, ReAct and Reflexion; it does not return InstructGPT merely because of a tangential mention. Local next-reading suggestions can use the added reviewed targets. No automated external discovery, online model or private-record access was added.

## Actual checks

| Command | Result |
|---|---|
| `npm run import:content -- --from incoming/agent-foundations --dry-run` | Final preflight passed: three additions; previous revisions retained. Initial citation-inventory failure corrected before import. |
| `npm run import:content -- --from incoming/agent-foundations --apply` | Applied three new readings through the validated local workflow. |
| `npm run validate:content` | Passed: 9 guide revisions, 68 units, 69 cited URLs, 3 editorial lenses, 12 pinned targets. Structural checks are separate from source/content review. |
| `npm test` | 90 passed, 4 skipped, 0 failed. Synthetic symlink creation returned EPERM; input-link, destination-link, recovery-ancestor and validation-link rejection cases were not exercised this run. |
| `npm run test:e2e` | 58/58 passed for the restored style and expanded catalog. Includes all six current readings, retained revisions, two-level selection, search, final-item keyboard access, source return and existing platform workflows. |
| `npm run test:e2e -- tests/new-readings.spec.ts tests/w1.spec.ts` | 9/9 passed after the final formula-wrapper correction and enhanced keyboard-scroll checks. The full 58-test run preceded that final CSS adjustment; it is not represented as a later full rerun. |
| `npm run build -- --logLevel warn` | Final validation, typecheck and production build passed. Existing >500 kB chunk warning remains. |
| `node tests/preview-smoke.mjs` | Passed after the final build on the existing 4173 preview: six current readings, retained readers, diagrams/tables/formulas, library, exploration save, opt-in context and backup count. No page/console errors or unsolicited external requests; isolated synthetic records only. |

The new-reading checks compare rendered non-math prose against source Markdown, verify formulas/diagrams/tables, exercise orientation → reader and keyboard TOC/source-return, and check narrow layouts. Horizontal regions are focused and scrolled with ArrowRight when they overflow. The new content and ordinary selection do not create personal records.

Actual screenshots opened and visually inspected include:

- `evidence/library-refresh-desktop.png` and `library-refresh-width-820.png`: original palette, selected rows, 40/60 proportions and readable orientation.
- `evidence/additions-react-reader-desktop.png`, `additions-toolformer-reader-desktop.png` and `additions-reflexion-reader-desktop.png`: all three new substantive readers.
- `evidence/additions-react-reader-narrow.png`: simulated narrow reader layout.
- `evidence/additions-toolformer-media-2-narrow.png`, `additions-toolformer-media-3-narrow.png` and `additions-toolformer-media-3-end-narrow.png`: formula content, final corrected positioning and keyboard scrolling to the right edge.
- `evidence/additions-toolformer-media-4-narrow.png`, `additions-toolformer-media-4-end-narrow.png`, `additions-reflexion-media-3-narrow.png` and `additions-reflexion-media-3-end-narrow.png`: result tables at both horizontal positions with visible focus.
- `evidence/v1-explore-desktop.png`: restored styling on the exploration route.

No page-wide horizontal overflow or unreadable overlap was observed in the inspected views. Tables and long formulas intentionally scroll inside their own regions. Aesthetic acceptance remains the reader's judgment. Generated screenshots not listed here are not claimed as personally inspected in this iteration.

## Preview and limits

Open [the library](http://127.0.0.1:4173/library). The existing preview process serves the final build; do not start another on the occupied port. New readers are at `/read/react/1`, `/read/toolformer/1` and `/read/reflexion/1` on the same origin. Choosing a library row first opens the orientation.

Unverified: physical phone/touch/soft keyboard, native browser zoom, other browser engines, screen-reader output, actual OS clipboard permissions, live external source navigation/anchor positioning, performance budget and physical power-loss durability. Narrow viewport checks are browser simulations, not phone tests. The four symlink rejection cases remain skipped in this environment. No paper experiments were reproduced, and no claim is made of exhaustive appendix coverage. No Git initialization/commit/push, deployment, cloud, account service or background model integration occurred.
