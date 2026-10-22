# LLM survey: source and authoring review

## Selected source and identity

This reading uses **A Survey of Large Language Models**, the formal 2026 article in *Frontiers of Computer Science*, volume 20, issue 12, article 2012627, DOI **10.1007/s11704-026-60308-3**. The [publisher record](https://link.springer.com/article/10.1007/s11704-026-60308-3) lists online publication on **9 May 2026**. The [formal PDF](https://link.springer.com/content/pdf/10.1007/s11704-026-60308-3.pdf) is **40 physical pages**, with a 23-author first-page list matching this package's bibliography. Its issue is dated December 2026; that issue date is not substituted for the verified online publication date.

The [arXiv v19 record](https://arxiv.org/abs/2303.18223v19), revised 18 March 2026, describes a 144-page version and has a different author list/order. The formal PDF explicitly identifies itself as an updated, refined journal review, distinct from the earlier long article. This guide therefore uses the formal DOI as its paper identity, the formal author list and only formal-PDF page locators. It does not claim to explain all 144 pages or comprehensively compare the two versions. The first-preprint year 2023 is retained as bibliography context.

The formal source is suitable for a learning map from LLM development to Agent systems: its four organizing dimensions are pre-training, post-training, utilization and evaluation. Selection and the linked platform reading order are editorial decisions, not a profile inferred from private reading records or claims of research novelty.

## Obtained and inspected

Public publisher and arXiv metadata were opened with the web tool. The direct local PDF download initially failed due to the network sandbox; the permitted download then succeeded. The PDF was saved under project-local .source-review/llm-survey and rendered with the already available project-local PyMuPDF 1.26.7. No dependency, global setting or application asset was added.

Read the formal introduction/version framing and §2; §§3.1–3.2 and 3.4; the training-system discussion in §3.3 for its conceptual role; §4 SFT, rewards, online/offline optimization and comparisons; §§5.1–5.3 prompting, reasoning, retrieval and Agent systems; §5.4 efficiency; §§6–7 evaluation and open problems. The reading focuses on those mechanisms. It does not claim a complete derivation of every attention variant, optimizer, distributed-training primitive, reward algorithm or compression method. Some long extraction output was truncated around the §3.3 page boundary; no claim is made of exhaustive line-by-line coverage there.

Actual pixels opened and inspected from the locally rendered formal PDF:

| Physical PDF page | Inspected material |
|---|---|
| 1 | Title, 23 authors, formal identity and review-article attribution. |
| 3 | Figure 2: pre-/mid-training, SFT/RL, utilization and evaluation framework. |
| 4 | Figure 3: data sources, deduplication/filtering/tokenization, data mix/curriculum; adjacent scale discussion. |
| 7 | Table 1: attention, position-encoding and configuration families. Its formulas are not copied into the teaching comparison. |
| 12 | Figure 4: SFT and RL post-training pipeline, including general and long-CoT paths. |
| 16 | Table 3: data sources and learning strategies for SFT, RFT, DPO, OPD, online RFT, PPO and GRPO. |
| 18 | Figure 5: prompting, inference techniques/RAG, Agent systems and efficient deployment. |
| 24 | Figure 6: historical benchmark trends and adjacent evaluation caveats; curve values are not transcribed as independently checked scores. |

The product includes an original labeled Mermaid teaching diagram and an editorial comparison table. It does not bundle the original images. The formal article's open-access notice was read; original claims remain attributed. PDF fragments use physical page numbers with visible manual locators; actual external viewer fragment positioning remains unverified.

## Claim and mechanism checks

| Explanatory element | Source/condition checked |
|---|---|
| Four lifecycle dimensions with optional mid-training | §1–2 and Figure 2, pp2–4. Diagram arrows in the guide express dependencies/feedback, not a mandatory pipeline for every model. |
| Autoregressive training versus truth verification | §2, pp3–4. The probability factorization and negative-log-likelihood expression are explicitly labeled standard teaching notation for that paradigm, not a newly proposed paper formula. |
| Original encoder–decoder versus causal decoder designs; attention/resource tradeoffs | §2, §3.2 and Table 1, pp3, 6–9. No claim that all Transformer variants have the same mask or computation. |
| Data source, preprocessing and scheduling are distinct | §3.1, Figure 3, pp4–6. No unverified token counts or data percentages reproduced. |
| Scale findings are empirical and measurement-sensitive | §2, p4. The formal version discusses controversy around apparent emergence; the guide does not declare a universal parameter threshold. |
| Mid-training updates parameters and requires data/architecture support | §3.4, pp11–12. Distinguished from temporary context changes. |
| SFT demonstrations, preference signals and verifiable rewards | §4.1–4.2, pp12–16. Reward criteria are proxies; test coverage and reward hacking remain explicit. |
| Teaching comparison of SFT/RFT/DPO/PPO/GRPO | Table 3 and §4.3.1, pp16–17. Data/strategy comparison only; no effectiveness ranking. Online denotes continued training-time sample generation, not Internet access. |
| ICL does not normally update parameters; CoT/test-time computation changes conditions | §5.1–5.2.1, pp18–20. Sampling, verification and output budget cannot be treated as one equal-cost call. |
| RAG separates retrieval, prompt construction and generation | §5.2.2, p20. The guide distinguishes this generic workflow from the specific original RAG paper's probabilistic formulation. |
| Agent memory/planning/execution and feedback | §5.3, pp20–22; §7, p26. Functional roles need not be separate models; runtime memory and parameter updates remain distinct. |
| Evaluation contamination, judge bias and practical utility | §6, pp23–25. No source experiment or chart score is presented as reproduced. |
| Efficiency is not determined by parameter count alone | §5.4, pp22–23. No deployment benchmark or hardware recommendation is claimed. |

## Package and limits

The package is immutable guide **llm-survey / revision 1**, schema 2, type survey, depth deep, scope mainline, basis sections. It contains an introduction and nine substantive units. The body is original Chinese explanation rather than a translation or abstract compilation. Citation URLs, heading order and exact body hash are generated from the final Markdown. The chapter links and related entries refer to the complete planned batch and existing platform guides; the parent performs whole-package validation after all additions are ready.

Standalone authoring checks passed against the project's schema-2 validator: metadata schema, exact SHA-256, nine heading/order matches, all 18 external citation URLs inventoried including the primary source, and the project's safe Mermaid syntax policy. The final body contains 5,415 Han characters. These checks do not claim whole-package link validation or rendered-browser acceptance, which remain integration work.

The final reading-map paragraph connects this survey → Transformer → GPT-3 → InstructGPT → optional CoT/RAG → Agent survey/ReAct → Toolformer/Reflexion → HELM, while explaining that HELM can also be read earlier and no path is mandatory. It is explicitly platform editorial advice, not the survey authors' prescribed reading sequence, personal progress or evidence of mastery.

Unverified: exhaustive original-reference audit, reproduction of experiments, all architecture/optimizer derivations, complete arXiv–journal correspondence, live external source/anchor navigation and final rendered platform behavior. Source review, structural validation and browser/visual checks are separate. No private notes, other projects or personal biography were consulted.
