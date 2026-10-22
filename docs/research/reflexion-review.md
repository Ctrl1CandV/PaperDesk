# Reflexion source and content review

## Identity and selection

The added reading is **Reflexion: Language Agents with Verbal Reinforcement Learning**, by Noah Shinn, Federico Cassano, Ashwin Gopinath, Karthik Narasimhan and Shunyu Yao, in *Advances in Neural Information Processing Systems 36*, NeurIPS 2023. The [official proceedings record](https://papers.nips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html) and [19-page conference PDF](https://proceedings.neurips.cc/paper_files/paper/2023/file/1b44b878bb782e6954cd888628510e90-Paper-Conference.pdf) were inspected. The conference author list is used, rather than mixing authors from a different arXiv revision. `paperId` identifies arXiv:2303.11366; the actual reading source is explicitly the NeurIPS 2023 camera-ready version.

The learning purpose is to connect action, feedback and memory in a concrete Agent mechanism, then examine when repeated attempts help and when unreliable feedback makes them worse. It complements the system-level survey and HELM's evaluation framework. Selection is editorial, not a novelty claim or a statement about an individual reader's interests.

## Obtained and examined

The initial `papers.nips.cc` PDF fetch timed out. The same official PDF on `proceedings.neurips.cc` was successfully obtained. Read the main mechanism/experiment/limitation text (§1–5), concluding material, the WebShop limitation in Appendix B.1, selected programming templates in Appendix C and selected reasoning examples. Appendix examples were not treated as independent causal evidence.

The web screenshot operation returned only a reference string without visible image pixels. It therefore was not counted as figure inspection. A public PDF copy was then rendered locally, and the following actual page images were opened and examined:

| PDF physical page | Inspected content |
|---|---|
| 4 | Figure 2: architecture and algorithm; short/long-term memory flow |
| 6 | Figures 3–4: cumulative task proportions, trial axes and task conditions |
| 7 | Table 1: programming results and the Python MBPP exception |
| 8 | Tables 2–3: internal-test errors and HumanEval Rust ablation |
| 14 | Figure 6 and Appendix B.1: WebShop failure to improve |

Local public review materials are under `.source-review/reflexion/`; they are not product assets. No original figure is redistributed in the reading package. The local Mermaid diagram and conditional-action formula are original teaching abstractions, explicitly labeled as such.

## Claims and limits checked

- The model weights are not updated by the Reflexion loop. The changing inputs are trial history and stored reflective text; the explanation distinguishes this from gradient-based optimization.
- Actor, Evaluator and Self-reflection are functional roles. Evaluation may use rules or environment feedback; the text does not claim three independently trained models are required.
- Memory is bounded: the reported ALFWorld/HotpotQA configurations use the last three reflections, and programming uses one. This is not an implemented unlimited retrieval system.
- ALFWorld: §4.1 reports 130/134 tasks after 12 consecutive trials, GPT-3 and ReAct-based action generation. Figure 3 depicts cumulative solved proportions. This is not reported as first-attempt success.
- HotpotQA: the figure uses 100 questions, separates ReAct, CoT and ground-truth-context CoT, and trial feedback uses answer exact matching. Not seeing the answer text does not mean no ground-truth-derived feedback was available.
- Table 1: HumanEval Python 80.1% for the GPT-4 baseline and 91.0% for Reflexion; MBPP Python 80.1% and 77.1%. The negative result is preserved. The explanation distinguishes internal testing/revision from final hidden-test submission and does not describe pass@1 as one model call or an equal-budget comparison.
- Table 3: GPT-4 on the 50 hardest HumanEval Rust tasks reports 60% baseline, 52% without test generation, 60% without reflection and 68% complete Reflexion. The conclusion is restricted to that setting.
- Table 2's internal-test false-positive/negative distinction is explained without transplanting its rates into a different denominator or task.
- WebShop: Appendix B.1 evaluates 100 tasks with two-shot ReAct + Reflexion, stops after four trials without signs of improvement, and presents a limitation. The text does not convert this into a universal failure theorem.
- The conference algorithm's loop condition uses an `or` expression that is not safe to copy literally as a terminating implementation. The teaching text instead states the intended bounded trial/success stopping behavior without presenting executable pseudocode as a faithful implementation.
- Proposed controlled comparisons are explicitly editorial research-reading suggestions, not independently verified research gaps.

## Package review and remaining checks

Prepared `incoming/agent-foundations/guides/reflexion.md` and `reflexion.json`, new guide ID `reflexion`, immutable initial revision 1, schemaVersion 2. The body has approximately 3,066 Han characters, six substantive level-two sections, one teaching diagram, one teaching formula and one selected-evidence table. Title, orientation, authors/venue/year, source version, topics, section targets, limitations and original-reading suggestions are present. Citations remain adjacent to supported claims and all PDF locators use physical page numbering with visible section/figure/table labels.

Local checks passed: metadata JSON Schema v2 validation, exact body hash, H2/unit order, inventoried citation URLs/labels and teaching-diagram safety. The parent integration will perform collection-level validation/import, rendered prose/diagram/formula/table checks, keyboard/source return and production build. These checks are not yet claimed here.

Not performed: experiment reproduction, complete code/configuration audit, full appendix-by-appendix teaching, independent peer review, timing/token-budget measurement, cross-task transfer validation or current-model comparison. A publicly accessible PDF does not verify every browser's `#page=` behavior; visible locators remain the fallback. No personal notes, inferred progress, private context or external model service is part of this package.

Integration review independently read the complete explanation, checked actual PDF pp7–8 result/ablation pixels and pp5,14 text for the repeated-trial and WebShop conditions. No blocking discrepancy was found. Exact primary source inventory was corrected before the collection-level dry-run. This is source-supported editorial review, not external academic peer review.
