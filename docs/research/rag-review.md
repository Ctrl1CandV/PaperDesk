# RAG source and authoring review

## Identity and selection

Reading: **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks**, Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler, Mike Lewis, Wen-tau Yih, Tim Rocktäschel, Sebastian Riedel and Douwe Kiela, NeurIPS 2020, *Advances in Neural Information Processing Systems 33*. Checked the [official proceedings record](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html), twelve-author identity and [official conference PDF](https://proceedings.neurips.cc/paper/2020/file/6b493230205f780e1bc26945df7481e5-Paper.pdf). arXiv identity is 2005.11401; the reading source is the conference version.

Learning purpose: explain how retrieved external evidence participates in generation and training, so the reader can distinguish original RAG, prompt-only retrieval augmentation and iterative Agent tool use. Selection complements Transformer, Toolformer, ReAct and HELM; it does not infer personal interests or claim to cover all contemporary RAG methods.

## Actual source inspection

The official main PDF has 16 physical pages. Read the main methods, experimental setup and results (§§1–4), discussion (§6) and the broader-impact note about knowledge-source accuracy and bias. Source-review work uses public PDFs in the ignored project-local review directory only. A sandbox network attempt failed; an authorized retry succeeded.

Rendered with the already installed project-local PyMuPDF and actually opened PDF pp2,3,6,8. Inspected Figure 1, both marginalization equations and the retriever formula, Tables 1–2, Tables 4–6 and Figure 3. Figure 2's textual discussion was read, but its pixels are not claimed as inspected in this pass. The product's Mermaid flow is an original labeled teaching diagram; no original paper image is bundled.

## Checked claims

| Reading claim | Verified source/conditions |
|---|---|
| DPR query/document representations use inner-product retrieval; BART-large is the 400M generator | §2.2–2.3, PDF p3. Dense retrieval weights and conditional generation probability have distinct roles. |
| RAG-Sequence sums document weights times a full token-product; RAG-Token multiplies per-token document mixtures | §2.1, p3; equations inspected visually. The top-K set is retrieved from input x, not freshly queried for every output token. |
| Only query encoder and BART are fine-tuned; document encoder and index remain fixed | §2.4, pp3–4. No claim of differentiating through discrete MIPS or updating every component. |
| No direct document supervision during this task fine-tuning, but DPR initialization has prior NQ/TQA retrieval supervision | §2.2 p3 and §4.1 p5. “No retrieval labels” is not generalized to the whole system's history. |
| Wikipedia December 2018, non-overlapping 100-word chunks, about 21M passages | §3, p4. A fixed corpus, not live web search. |
| Different Sequence/Token decoding approximations | §2.5, p4: per-token mixture beam decoding versus per-document candidates and full-sequence marginal scoring, with Thorough/Fast alternatives. |
| Test EM: DPR NQ/WQ/CT 41.5/41.1/50.6; RAG-Token 44.1/45.5/50.0; RAG-Sequence 44.5/45.2/52.2 | Table 1, p6; exact cells visually inspected. WQ/CT initialize from NQ RAG per §3.1. TQA's two incompatible test columns are omitted rather than conflated. |
| Learned dense retrieval is not always better than BM25 | §4.5 pp7–8, Table 6: FEVER dev BM25 label accuracies exceed learned dense retrieval. These are development-set ablations, separate from Table 1 test scores. |
| Index swap changes answers without generator retraining but is imperfect | §4.5 pp7–8: 82 changed leader positions, 2016/2018 matching indices roughly 70%/68%, mismatches 12%/4%. No inference about current leaders is made. |
| More retrieved documents do not monotonically improve every setting | §4.5 and Figure 3 p8; RAG-Token NQ peaks around 10, while metrics/runtime change. |

The paper contains an inconsistency: §4.3 prose on p6 reports 17% for both-factual generations, whereas Table 4 on p8 reports 11.7% in the “Both good” factuality cell. The reading does not use this disputed quantity or silently reconcile it. It uses the independently consistent QA and retrieval-ablation evidence instead.

## Package and boundaries

The original explanation has approximately 3,065 Han characters, seven substantive sections plus orientation, eight unique source URLs, three method formulas, a labeled teaching flow and a selected result table. One additional arithmetic mixture example is explicitly a teaching example, not experimental data. Metadata includes full bibliography, primary retrieval/knowledge topics, prerequisites, scope limits and four useful section targets.

Actual authoring checks: schema-v2 validation, body SHA-256, Markdown citation inventory matching, KaTeX parsing and teaching-diagram policy passed. The assembled package's `npm run import:content -- --from incoming/llm-to-agent --dry-run` passed with five additions and nine previous guide revisions retained; this check did not apply the import or mutate reader records.

The paper supports a mechanism for combining external and parameter memory; it does not establish that retrieved sources guarantee truthful or faithfully attributed output. The reading explicitly distinguishes retrieval success, evidence support and faithful generation as a mechanism-derived checking approach, not a verification system already evaluated by this paper.

No experiments were reproduced, no full corpus or code audit was performed, and not every appendix/example/reference was independently checked. Final rendering, keyboard navigation, citation return and catalog validation belong to parent integration. No existing content or personal records were modified by this writer.
