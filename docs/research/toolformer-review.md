# Toolformer source and authoring review

## Selection and source identity

Learning purpose: explain how tool-use behavior can be learned from generated, executed and filtered training examples. This complements the existing Agent system overview, InstructGPT's training-signal discussion and HELM's evaluation framing. It is selected for a concrete mechanism and instructive experimental controls, not as a current frontier ranking or a reader-specific recommendation.

- Title: Toolformer: Language Models Can Teach Themselves to Use Tools.
- Authors: Timo Schick, Jane Dwivedi-Yu, Roberto Dessì, Roberta Raileanu, Maria Lomeli, Eric Hambro, Luke Zettlemoyer, Nicola Cancedda and Thomas Scialom.
- Official publication: NeurIPS 2023, Advances in Neural Information Processing Systems 36; arXiv identity 2302.04761.
- [Official bibliographic page](https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstract-Conference.html).
- [Fixed main conference PDF](https://proceedings.neurips.cc/paper_files/paper/2023/file/d842425e4bf79ba039352da0f658a906-Paper-Conference.pdf), 13 physical PDF pages.
- [Official supplemental PDF](https://proceedings.neurips.cc/paper_files/paper/2023/file/d842425e4bf79ba039352da0f658a906-Supplemental-Conference.pdf), 10 physical PDF pages. Its page numbering starts separately at 1.

The package version is `NeurIPS 2023 camera-ready`. This avoids substituting an unfixed later arXiv PDF for the conference evidence. Public author attribution is retained; personal/operator information is absent.

## Material actually examined

Read the main text of §§1–7, with attention to method, tools, evaluation restrictions, language modeling, scaling and limitations. Relevant supplemental reading covered §A.1, §B, §C, §E, §F and §G.2–G.4, plus selected result tables. The guide deliberately does not provide a complete treatment of every prompt, every cited work or every scaling/failed-investigation result.

The web PDF text extractor was usable. Web screenshot calls returned empty image references or an error, so those calls are not treated as visual evidence. The two public PDFs were subsequently downloaded into the local source-review directory and rendered using the project-local temporary PDF runtime. Actual page pixels were opened and examined:

- Main PDF p2: Figures 1 and 2, including the sample → execute → filter relationship.
- Main PDF p3: Figure 3 and filtering formulas/footnote 2.
- Main PDF p6: Table 3 and zero-shot decoding/metric restrictions.
- Main PDF p7: Tables 4 and 5, including results that do not support universal improvement.
- Main PDF p8: Figure 4 and the disabled-API perplexity conditions.
- Supplement p1: API/data-generation details.
- Supplement p5: Table 3 and decoding/calibration analysis.
- Supplement p9: Tables 7 and 8, plus failed-calculator-investigation context.

These PDF/PNG files are source-review material only, not bundled product assets. The guide contains an independently authored teaching diagram and a small attributed subset of numerical facts, not screenshots or reproduced original figures.

## Claim checks

| Guide claim | Source locator and checked condition |
|---|---|
| Calls are generated, actually executed, then filtered before LM fine-tuning | Main §2, Figure 2, pp2–4. Inference pauses at the result delimiter and resumes after execution. |
| The criterion compares response-conditioned loss against the better of no-call and call-without-response | Main §2, p3. Both the `min` and the threshold inequality were checked against page pixels. |
| Scoring prefixes the call, while fine-tuning inserts it at the selected location | Main §2, footnote 2 on p3 and fine-tuning description on p4. |
| The criterion is a proxy and can retain semantically unhelpful calls | Supplemental §E, p5. Explicitly kept distinct from correctness certification. |
| Human design remains in demonstrations, API choices and heuristic data selection | Main §4.1 p5, supplemental §A.1 p1. |
| GPT-J parameter label and external-tool boundary | Main introduction p2 and conclusion p10 label GPT-J as 6.7B. The guide explicitly attributes this label to the paper and does not treat external Atlas components as free or included in that size. Supplemental §A.1 distinguishes Atlas-large for data generation from Atlas-xxl at inference. |
| Zero-shot does not mean no tool-use fine-tuning | Main §4.1–4.2, pp5–6. Test prompts supply instructions without downstream demonstrations; training already used API-augmented examples. |
| Main results use top-10 API triggering and at most one call per input | Main §4.2, p6; supplemental §E/Table 3 p5. |
| ASDiv/SVAMP selected cells | Main Table 3 p6: GPT-J 7.5/5.2; GPT-J+CC 9.6/5.0; disabled 14.8/6.3; enabled 40.4/29.4. Metric uses first generated number or first number after an equals sign in an equation, not step-by-step proof scoring. |
| QA results remain below the paper's GPT-3 comparison | Main Table 4 p7. QA tool disabled; Wikipedia search used; answer containment in first 20 generated words, not standard exact match. |
| No universal preservation of all capabilities | Main §4.3 p8 uses disabled APIs and two perplexity datasets. MLQA caveat appears in Table 5 and §4.2 p7. |
| Tool utility depends on model/tool strength | Supplemental §G.2–G.4 pp7–8 and Tables 7–8 p9. No claim that every tool helps a stronger model. |
| Chaining, interactive query refinement, sensitivity, sample efficiency and tool costs are limitations | Main §6 p9. The editorial research question is labeled as an implication, not an established research gap. |

## Package and review boundaries

`incoming/agent-foundations/guides/toolformer.md` contains original Chinese explanation, near-claim citations, an explained loss formula, a labeled teaching diagram, conditioned result comparison, limitations and purposeful original-reading advice. Metadata supplies accurate bibliography, primary topics, the same source inventory, stable section IDs, SHA-256 and explicit reading targets. Relative recommendations point only to existing articles. No personal state is created.

Authoring review checks source support and explanation continuity; structural validation and independent integration review are separate. No experiment was reproduced, artifact code executed or external tool service tested. Native PDF fragment navigation is not certified by obtaining the PDF; the visible physical page and section labels supply a manual fallback. Current-model superiority, complete appendix coverage and full-survey coverage are not claimed.

Integration review independently read the complete guide, checked actual PDF p3 formula/footnote and p6 result/decoding pixels, and read pp4,8–9 for inference, language modeling and limitations. No blocking discrepancy was found. The first collection dry-run caught the main source URL missing from the exact citation inventory; the first citation and hash were corrected before the successful dry-run and apply.
