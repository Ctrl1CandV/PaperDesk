# Article orientation metadata and source review

This record covers the original three articles' 2026-10-22 update to guide revision 2 with metadata schema version 2. Their accepted Markdown bodies, original revision-1 metadata, citation inventories, source versions, section identities and coverage declarations are unchanged. Revision 2 adds article orientation; it does not claim a new full-text or figure audit. Later library additions have separate records in `research/`.

## Bibliographic verification

Bibliographic sources were checked on 2026-10-22. Formal publication and the preprint version used by the reading explanation are deliberately separate.

| Article | Verified publication | Preprint history and retained reading source | Primary verification |
|---|---|---|---|
| A Survey on Large Language Model based Autonomous Agents | Frontiers of Computer Science, 2024; publisher page records 22 March 2024, volume 18, article 186345 | First submitted in 2023; reading source remains arXiv 2308.11432v7 | [Publisher article and author list](https://link.springer.com/article/10.1007/s11704-024-40231-1); [arXiv identity/version history](https://arxiv.org/abs/2308.11432) |
| Training language models to follow instructions with human feedback | NeurIPS 2022, Advances in Neural Information Processing Systems 35, main conference track | First submitted in 2022; reading source remains arXiv 2203.02155v1 | [Official proceedings and author list](https://proceedings.neurips.cc/paper_files/paper/2022/hash/b1efde53be364a73914f58805a001731-Abstract-Conference.html); [arXiv identity/version history](https://arxiv.org/abs/2203.02155) |
| Holistic Evaluation of Language Models | Transactions on Machine Learning Research, August 2023, as printed on the paper's first page | First submitted in 2022; reading source remains arXiv 2211.09110v2, revised October 2023 | [Fixed original PDF, page 1, publication header and full author list](https://arxiv.org/pdf/2211.09110v2#page=1); [arXiv identity/version history](https://arxiv.org/abs/2211.09110) |

Authors are stored in the order shown by the cited publication source. Name spelling can differ between a preprint and proceedings record; the bibliographic field uses the cited record rather than editing the original guide attribution. Institutional addresses and contact details are unnecessary and are not included.

The HELM OpenReview forum returned a browser-verification page during this check. The TMLR publication fact was verified directly in the fixed paper's first-page header; review discussion was not inspected. No browser challenge was bypassed. The stored bibliography link therefore points to that accessible PDF page rather than implying that the forum was reviewed.

## Editorial orientation

The short titles, main topics, learning value, prerequisites and boundaries are editorial navigation material derived from the accepted explanations. They are not author quotations, new experimental findings, novelty assessments or a current-literature review.

- Agent survey: system/environment/action from `u01`; role, memory, planning and action from `u02`; architecture versus capability acquisition from `u03`; applications and evaluation from `u04`. The subject is LLM-based autonomous agents. Component names are reviewed topic aliases, not evidence that every article mentioning them is an Agent article.
- InstructGPT: human requirements and annotation materials from `u02`; supervised fine-tuning, reward modeling and PPO from `u03`; human evaluation and its conditions from `u04`. Agent is deliberately absent from its primary topic tags. Its relationship to Agent reading is supporting background, as already explained in the accepted survey.
- HELM: scenarios, adaptation and scoring from `u02`; metric distinctions from `u03`; conditional interpretation of experimental comparisons from `u04`. Its results remain a historical version and cannot substitute for Agent interaction evaluation.

Reading targets are local section pointers with a stated purpose, matching concepts and a limit. A concept match is an editorial retrieval cue, not an inference that a reader has mastered a prerequisite or that the material resolves an entire free-form research problem.

The second reading level remains substantive, continuous explanation. Enhancement means adding necessary mechanisms, evidence and explanatory dependencies after source review, not shortening accepted prose into an abstract. No new substantive chapter was authored in this metadata change.

## Versioned content contract

`schemas/guide.schema.json` continues to validate schema-v1 packages unchanged. `schemas/guide-v2.schema.json` validates schema-v2 metadata with required `orientation`; both are trusted application schemas, never supplied by an imported package. The catalog format remains version 1 and retains both revisions of all three guides. Import/recovery already compares every metadata value and therefore protects the new orientation fields under the existing immutable key.

The orientation contract contains `shortTitle`, primary `topics` with reviewed aliases, `summary`, editorial `value`, `prerequisites`, `boundaries`, `bibliography`, and `readingTargets`. Unknown publication details can be null with an appropriate unknown/preprint type. A journal or conference declaration requires a publication year and venue. Safe bibliography URLs, unique topic identities and aliases, and resolvable local reading targets are validated. A bibliography link is deliberately separate from the immutable body citation inventory.

Old guide and exploration targets remain pinned to revision 1. The normal library selects revision 2; content updates do not migrate personal records or mark either version read. The catalog hash now differs from the original preparation snapshot because it selects and retains the new metadata revisions. The initial manifest remains an unchanged historical snapshot, not a current-release manifest.

## Checks for this change

- `npm run validate:content`: passed, 6 retained guide revisions / 3 current articles, 46 retained units, 39 distinct body-citation URLs, 3 editorial lenses, 12 pinned exploration targets.
- `node --test tests/integration/content-validation.test.mjs tests/integration/content-import.test.mjs`: 94 tests, 90 passed, 0 failed; 4 symlink tests skipped because the sandbox returned EPERM. No symlink rejection is newly claimed from those skipped cases.
- Subsequent permitted integration `npm test`: 94/94 passed with zero skips, including those symlink cases. Full integration evidence and limitations are recorded in REFINEMENT-CHECKS.md.
- Added checks cover v1 compatibility, required v2 orientation, unknown fields, blank/duplicate topics, unsafe bibliography URLs, invalid/duplicate section targets, publication declarations without evidence fields, v1-to-v2 immutable update and same-key orientation conflict.
- Original-content integrity: all 7 initial content files other than the deliberately changed catalog, plus all 3 original content schemas, still match the preparation SHA-256 values (10/10). The 3 Markdown bodies are byte-for-byte unchanged.
- These are content/tooling checks. Page pixels, navigation, recommendation relevance and user interaction are verified separately by the integration owner; this file does not claim those checks passed.
