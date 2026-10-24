# Agent memory survey — source and authoring review

Status: mainline guide imported after separate independent source review and integration checks. Authoring coverage is recorded below; the final integration record follows it.

## Fixed source identity

- Paper: A Survey on the Memory Mechanism of Large Language Model based Agents.
- Main source: arXiv 2404.13501v1, 2024-04-21, https://arxiv.org/html/2404.13501v1.
- PDF text cross-check: https://arxiv.org/pdf/2404.13501v1; 39 physical pages.
- Author order verified against v1 HTML heading and PDF first page: Zeyu Zhang; Xiaohe Bo; Chen Ma; Rui Li; Xu Chen; Quanyu Dai; Jieming Zhu; Zhenhua Dong; Ji-Rong Wen.
- Bibliography describes the fixed 2024 preprint. Later versions and the 2025 TOIS publication are not used as full-text evidence or merged into the v1 author list.
- The v1 HTML declares CC BY 4.0. This guide is an attributed Chinese explanatory adaptation with original teaching examples, not a reproduction of article figures or tables. No source image assets are bundled.

## Actual source coverage

- Read §1 context; §3.1–3.4 task/trial/step, narrow/broad definitions, writing/management/reading; §4.1–4.3 motivations; §5.1–5.3 sources/forms/operations; §6.1–6.3 evaluation.
- Read selected explanations throughout §7.1–7.7 and §8.1–8.4 for application-dependent memory requirements and the authors' proposed directions. The guide does not reproduce every cited work or provide exhaustive application coverage.
- Table 1–3 HTML headings and selected entries used to check categories. Their many per-method checkmarks have not been independently audited against cited papers.
- Figure 3–5 captions and physical PDF page positions verified in text: pp.8, 11, 20. Screenshot and HTML-image calls did not expose inspectable image pixels through the available tool response. `figuresViewed` is therefore empty. Do not report visual inspection as completed.
- §2 survey-of-surveys, every reference and every model-specific result were not comprehensively reviewed. No experiments reproduced.

## Claim-to-source checks

| Guide claim or distinction | Fixed v1 locator | Review note |
|---|---|---|
| Task, trial and step differ; broad memory includes earlier trials and external knowledge | §3.1–3.3 | No claim that trial length directly determines short-/long-term storage duration |
| Motivation includes cognitive psychology, self-evolution and application needs | §4.1–4.3 | Cognitive analogy and the self-evolution framing attributed to authors, not universal empirical facts |
| Three sources, two primary forms, three operations | §5.1–5.3; Table 1–3 headings | Dimensions presented as cross-cutting, not mutually exclusive modules |
| Complete/recent/retrieved interactions and external knowledge under textual form | §5.2.1 | Retains context-length, recency and retrieval limitations; does not classify embedding indexes as model-parameter updates |
| Fine-tuning and editing under parametric form | §5.2.2–5.2.3 | Preserving unrelated knowledge is a goal and unresolved challenge; no guaranteed locality or unlimited capacity |
| Writing, management and reading interact | §3.4; §5.3.1–5.3.3 | Teaching examples distinguish raw observations from inferred rules; no invented experiment or optimal forgetting theorem |
| Direct/indirect and subjective/objective evaluation | §6.1–6.3 | Final answer accuracy separated from memory-reference precision/recall/F1 and whole-task utility |
| Efficiency includes adaptation and inference costs | §6.1.2 | Discusses writing/management/reading costs without numerical benchmark claims |
| Memory requirements differ by application | §7.1–7.7 | Broad branch explanations only; no claim of real-world deployment reliability |
| Parameters, multi-agent memory, lifelong learning and humanoid memory as future topics | §8.1–8.4 | Attributed to this historical version, not claimed as verified current gaps |

## Boundaries and numerical risks

- No performance numbers, rankings, reproduction claims or fabricated formulas appear in the body. Section numbers, source date and checked physical page locators are bibliographic coordinates.
- The v1 statement about absent dedicated open-source memory benchmarks is explicitly historical. It is not generalized to the present.
- Original prose sometimes gives categorical advantages to parametric memory or knowledge editing, then states unresolved challenges. The guide retains the tradeoff and challenge rather than treating advantages as guarantees.
- RAG, ReAct and Reflexion connections are editorial concept links. The package does not establish one shared algorithm or imply that opening any guide records reading/mastery.
- No personal reading history, research target, publication preference, requester identity or conversation text is included.

## Structural preparation

- Files: `guides/agent-memory-survey.md` and `guides/agent-memory-survey.json`; guide id `agent-memory-survey`, revision 1, schema version 2.
- Source coverage: mainline / sections; no assets or original figures.
- UTF-8 body hash, h2 unit order, URL inventory and JSON Schema are checked locally for these two files only. The separate import/preview/content review remains a parent-workflow responsibility.

## Independent review and integration — 2026-10-23

A separate read-only review checked the body and metadata against fixed v1 §§3–6, §8 and PDF figure-caption page positions. It found no blocking factual error or explanatory gap within the declared mainline scope. It confirmed the sources/forms/operations distinctions, answer-versus-reference evaluation, author/version identity, teaching-example attribution and absence of excessive copying. This reviewer also did not inspect original figure pixels.

The first full-package dry-run rejected the source version string because it combined `v1` with its date. Before import, the source and citation version fields were corrected to exact `v1`; the date remains in the body and coverage. Reader-facing coverage wording was simplified without changing its limitation. The package then passed dry-run and apply using `npm run import:content -- --from incoming/continuous-learning-batch` with the corresponding flags. Only the new body/metadata and active catalog were added or changed; all 26 previous non-catalog content files were checked byte-for-byte unchanged.

Actual checks:

- `npm test`: 90 passed, 4 skipped because synthetic symlink creation was unavailable on Windows, 0 failed.
- `npm run build -- --logLevel warn`: content validation, TypeScript and production build passed. The pre-existing minified-chunk warning above 500 kB remains.
- `node incoming/continuous-learning-batch/inspect-reading.mjs`: matched all 56 rendered prose/table segments and 9 reading units, checked the source-dialog URL/version and keyboard focus return, page width and narrow-table keyboard scrolling. No page/console errors or unsolicited external requests were observed. The full browser regression suite was not rerun for this content-only addition.
- The initial restricted browser attempt returned network-access denied. A subsequent browser-only permitted attempt timed out while the preview remained restricted. Restarting this project's preview and running the isolated browser with scoped local-network execution permission succeeded.
- Actually inspected six screenshots: `memory-survey-orientation-desktop.png`, `memory-survey-reader-desktop.png`, `memory-survey-classification-desktop.png`, `memory-survey-reader-narrow.png`, `memory-survey-classification-narrow.png`, and `memory-survey-classification-narrow-end.png` under `docs/evidence/`. The 1280×900 and 390×844 views showed readable text and table content, with horizontal table navigation available on the narrow view.

The browser context was isolated and contained no real reader records. Narrow viewports are simulations, not physical-phone tests. Original-source external opening/anchor positioning and complete source-figure inspection remain unverified. Compact check results are in `docs/evidence/memory-survey-checks.json`. No experiments were reproduced and no existing public guide body was revised.
