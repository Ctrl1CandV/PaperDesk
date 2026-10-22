# Chain-of-Thought source and authoring review

## Identity and selection

Reading: **Chain-of-Thought Prompting Elicits Reasoning in Large Language Models**, Jason Wei, Xuezhi Wang, Dale Schuurmans, Maarten Bosma, Brian Ichter, Fei Xia, Ed H. Chi, Quoc V. Le and Denny Zhou, NeurIPS 2022, *Advances in Neural Information Processing Systems 35*. The [official proceedings record](https://proceedings.neurips.cc/paper/2022/hash/9d5609613524ecf4f15af0f7b31abca4-Abstract-Conference.html) and author list on the first PDF page were checked. The reading uses the conference version, not a mixture of arXiv revisions. arXiv identity is 2201.11903.

Learning purpose: connect in-context learning to generating useful intermediate steps, while separating answer accuracy, intermediate-path correctness, faithfulness and environmental interaction. This complements GPT-3 and the existing ReAct reading. It is an editorial learning sequence, not a current-model ranking or a private-interest inference.

## Sources and actual inspection

- [Official main PDF](https://proceedings.neurips.cc/paper/2022/file/9d5609613524ecf4f15af0f7b31abca4-Paper-Conference.pdf): 14 physical pages. Read main sections 1–6 and 8, with related-work positioning context.
- [Official supplemental PDF](https://proceedings.neurips.cc/paper_files/paper/2022/file/9d5609613524ecf4f15af0f7b31abca4-Supplemental-Conference.pdf): 29 physical pages, independently numbered in the PDF viewer; read A.1 and result Tables 2–3 relevant to this explanation. Supplement PDF p7 has printed page number 21.
- Downloaded the public PDFs into the ignored project-local source-review area. A sandbox network attempt failed; the authorized network retry succeeded. No private files or browser records were used.
- Rendered with existing project-local PyMuPDF and actually viewed main PDF pp1,5,6 plus supplement PDF p7. This verifies Figure 1's prompt/output distinction, Figure 4's scaling curves, Figure 5's ablations, Figure 6's prompt variation and the exact Table 2–3 cells. Rendering an unviewed page is not counted as visual review.

The product contains an original Mermaid teaching diagram, not a copied original figure. Its probability-chain expression is explicitly labeled a general explanatory decomposition, not an equation proposed by the paper.

## Claim and condition checks

| Claim in the reading | Verified location and qualification |
|---|---|
| Few-shot demonstrations contain input, intermediate steps and output; no model was fine-tuned for this study | Main §§2–3.1, pp2–4; §6, p9. Prompt adaptation is distinguished from lasting parameter updates. |
| Eight arithmetic demonstrations except AQuA's four | Main §3.1, pp3–4. The same eight are used across the other arithmetic datasets. |
| Greedy decoding; LaMDA averages five exemplar permutations, other models mostly one | Main §3.1, p4. No self-consistency/voting score is substituted. |
| PaLM GSM8K standard/CoT: 8B 4.9/4.1, 62B 9.6/29.9, 540B 17.9/56.9 | Supplement Table 2, PDF p7 / printed p21; exact cells inspected. |
| PaLM SVAMP standard/CoT: 8B 15.1/16.8, 62B 48.2/46.7, 540B 69.4/79.0 | Same table. Negative/non-improving cells remain visible. |
| Equation-only, dots and reasoning-after-answer do not reproduce full CoT's GSM8K gain | Main §3.3 and Figure 5, pp5–6. Explicitly restricted to these ablations/tasks, not all possible formal methods or extra computation. |
| Different prompt writers/styles/examples vary but retain gains over standard baseline in studied conditions | Main §3.4 and Figure 6, pp6–7. Does not claim universal prompt insensitivity. |
| Symbolic length generalization improves but remains a limited toy-task result | Main §5 and Figure 8 discussion, p8; no claim to have visually inspected Figure 8 in this pass. |
| Correct answer need not imply correct chain; chain does not prove internal causal faithfulness | Main §3.2 p5 and §6 p9. The reading does not equate fluent explanations with verified computation. |
| Scale finding is not a universal fixed parameter threshold | Supplement §A.1, pp2–3, including compute confounding; observed PaLM 62B improvements are retained. |

## Package and limits

The original Chinese body has approximately 3,064 Han characters, seven substantive sections plus the orientation unit, ten unique cited URLs, a labeled teaching diagram and a conditioned result table. Schema-v2 metadata contains complete bibliography, three primary topics, prerequisites, scope boundaries and three targeted reading entries. Source links use physical PDF page fragments with descriptive manual locators; fragment behavior depends on the PDF viewer.

Actual authoring checks: schema-v2 validation, body SHA-256, Markdown citation inventory matching, KaTeX parsing and teaching-diagram policy passed. The assembled package's `npm run import:content -- --from incoming/llm-to-agent --dry-run` passed with five additions and nine previous guide revisions retained; this check did not apply the import or mutate reader records.

This is authoring/source review, not independent experimental reproduction or final reader acceptance. No historical API model was run; no exhaustive review of every supplemental prompt, generation, reference or subsequent CoT literature is claimed. The parent integration process validates the complete catalog and checks rendered desktop/narrow reading, source return and formula/table access separately. Existing approved content is outside this writer's edit scope.
