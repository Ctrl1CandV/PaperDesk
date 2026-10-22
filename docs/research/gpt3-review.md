# GPT-3 source and authoring review

## Selection and fixed source

Learning purpose: connect Transformer-based autoregressive modeling to pretraining, in-context task specification and the later need for instruction training and Agent system design. The selected contribution is the controlled distinction between frozen-parameter context conditioning and parameter updates, together with instructive mixed results and data-contamination caveats. This is an editorial learning sequence, not a personal-profile inference or a claim of present-day model superiority.

- Paper: Language Models are Few-Shot Learners.
- Authors: Tom B. Brown, Benjamin Mann, Nick Ryder, Melanie Subbiah, Jared Kaplan, Prafulla Dhariwal, Arvind Neelakantan, Pranav Shyam, Girish Sastry, Amanda Askell, Sandhini Agarwal, Ariel Herbert-Voss, Gretchen Krueger, Tom Henighan, Rewon Child, Aditya Ramesh, Daniel M. Ziegler, Jeffrey Wu, Clemens Winter, Christopher Hesse, Mark Chen, Eric Sigler, Mateusz Litwin, Scott Gray, Benjamin Chess, Jack Clark, Christopher Berner, Sam McCandlish, Alec Radford, Ilya Sutskever and Dario Amodei.
- Publication: NeurIPS 2020, Advances in Neural Information Processing Systems 33; scholarly identifier arXiv:2005.14165.
- [Official proceedings bibliography](https://proceedings.neurips.cc/paper_files/paper/2020/hash/1457c0d6bfcb4967418bfb8ac142f64a-Abstract.html).
- [Fixed main conference PDF](https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf), 25 physical pages, package version `NeurIPS 2020 conference paper`.
- [Linked official supplemental PDF](https://proceedings.neurips.cc/paper_files/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Supplemental.pdf), 32 physical pages, separately numbered from 1.

Metadata author names follow the inspected main PDF consistently; the bibliography webpage abbreviates several of these names. The package does not silently use a later arXiv revision or a later GPT product as the source.

## Material actually examined

Read main §§1–5, including task setups, architecture, data, evaluation, selected results, contamination and limitations. The declared scope uses §§3.1–3.4 selectively; translation details are not comprehensively explained. Main §6 was consulted for context, but the guide does not claim a complete related-work review. Supplement §§A–C, physical pp1–6, were read to verify filtering, training-window conditions, the data mix and the detailed overlap methodology. Later supplemental tasks, full prompt inventories and the main paper's full social-impact analysis were not comprehensively reviewed.

The public PDFs were downloaded into `.source-review/gpt3/` and rendered using the project-local temporary PyMuPDF runtime. Actual page pixels opened and inspected:

- Main p2, Figure 1.1: scale/context trends and the caption's development-versus-test warning.
- Main p4, Table 3.1: LAMBADA zero/one/few-shot accuracy and surrounding evaluation text.
- Main p5, Tables 3.2 and 3.3: closed-book question answering, comparison labels, reading-comprehension metrics and mixed results.
- Main p7, Table 3.5: test-set SuperGLUE average, WiC result and the 32-demonstration/no-gradient condition.
- Supplement p3, Figure C.2: clean-subset fraction and relative performance-change axes, qualified contamination findings.
- Supplement p4: follow-up caveats about PIQA, Winograd, LAMBADA and subset shift.
- Supplement p5, Table C.1: training mixture and 300B-token context.
- Supplement p6, Table C.2: actual dataset-specific N values, split/metric columns and the different-context-seed footnote.

Web screenshot calls produced unusable empty image references; they are not counted. Local rendered page images supply the visual review. No original PDF screenshots are bundled as product assets. The guide's teaching notation, example and Mermaid diagram are original explanatory material, not reproductions of paper artwork.

## Claim and condition checks

| Guide point | Source and checked condition |
| --- | --- |
| Autoregressive pretraining changes parameters; inference conditioning need not | Main §2 p3 and §5 p8. The NLL/factorization and context-conditioning notation are explicitly labeled as teaching formulations, not original numbered formulas. |
| Eight model sizes, 125M through 175B | Main §2.1 p3. The explanation identifies GPT-2-style pre-normalization and alternating dense/local sparse attention, avoiding a direct equation with the original encoder–decoder Transformer. |
| Data filtering is a proxy, not fact certification | Main §2.2 pp3–4, supplement §A p1. Quality-similarity filtering and document-level fuzzy deduplication are distinguished from human verification. |
| Sampling mixture differs from corpus size | Supplement Table C.1 p5 and surrounding §C pp4–5. The guide uses 300B training tokens as this table's reported training context, without confusing it with candidate-corpus token count. |
| 2048-token context, packed documents with end markers | Main §2 p3; supplement §B p1. No special document-isolation mask is described; this is separate from the model's causal attention. |
| Zero/one/few-shot settings do not update weights | Main §2 p3. Typical K is 10–100 subject to context fit; no claim that every task uses an identical number. Zero-shot still has pretrained parameters and task instructions. |
| Demonstrations and test examples are distinct | Main §2.4 p4. Typical demonstrations come from training; LAMBADA/StoryCloze use development demonstrations and test evaluation. |
| Figure 1.1 does not establish a particular internal meta-learning algorithm | Main Figure 1.1 p2 and introduction. Interpretation is qualified; GPT-3 curves use development data while the figure's reference lines are not direct same-split comparisons. |
| Main QA table selected values | Main Table 3.2 p5: Natural Questions 14.6/23.0/29.9; WebQuestions 14.4/25.3/41.5; TriviaQA 64.3/68.0/71.2. Model is 175B, no downstream parameter updates, closed-book inference. |
| QA comparison information matters | Table 3.2 p5 includes fine-tuned T5-11B+SSM and open-domain RAG with different conditions. No blanket claim of GPT-3 superiority. TriviaQA few-shot uses wiki split test server; Natural Questions/WebQuestions test splits are also recorded in supplement Table C.2. |
| Mixed SuperGLUE evidence | Main Table 3.5 p7: test average 71.8 versus fine-tuned BERT-Large 69.0 and listed fine-tuned SOTA 89.0; WiC 49.4 accuracy. GPT-3 uses 32 examples per task and no gradient updates. |
| More demonstrations are not uniformly monotonic | Main Table 3.1 pp4–5: LAMBADA zero/one/few-shot 76.2/72.5/86.4. Formatting explanation remains a possibility, not a proven cause. |
| Training-data filtering had a bug | Supplement §C pp2,5. The model was not retrained on a corrected corpus; subsequent analysis audits the existing model. |
| 13-gram in main text is a simplification | Main §4 p7 versus supplement §C pp4–6: actual overlap N varies with example length, limited to 8–13 for non-synthetic tasks. |
| Small score changes do not prove absence of contamination | Supplement Figure C.2 and §C pp3–5: PIQA/Winograd flagged; LAMBADA substantial overlap; clean-subset distribution shift remains a caveat. |
| Supplemental result rows cannot be swapped indiscriminately into main tables | Table C.2 p6 explicitly uses a different random seed for in-context examples; the guide's selected numerical table follows main Table 3.2. |
| A language-model foundation is not a complete Agent | Main §5 p8 explicitly distinguishes prediction from goal-directed actions and notes coherence, grounding and objective limitations. Later-reading connections are marked editorial. |

## Package validation and remaining scope

The package consists of `incoming/llm-to-agent/guides/gpt3.md` and matching JSON metadata. At authoring validation the body had 3,374 Han characters, nine units including introduction and twelve unique source URLs. A subsequent locator cleanup split a combined main/supplement label into separate links pointing to the correct PDF; the citation inventory and body hash were regenerated. Mode is `standard`, scope is `mainline`, and basis is `sections`. The complete author list, publication information, primary-topic aliases including GPT3/GPT-3, prerequisites, scope and explicit reading targets are supplied.

Actual Node checks using the project's Ajv 2020 and KaTeX dependencies passed schema, exact body hash, H2 order, both directions of URL/label inventory, bare main-PDF inventory membership and target-unit resolution. Ten mathematical expressions passed KaTeX rendering with `throwOnError: true`. Validation is rerun after the locator cleanup before handoff. Structural validity and formula rendering do not establish academic completeness or browser appearance.

Authoring review checked factual support, explanatory continuity and selective coverage. Independent integration review, assembled-package dry-run/import, rendered diagram/page inspection and desktop/narrow-viewport interaction checks remain parent integration work. No models, original training code, commercial API or benchmarks were executed. External PDF-fragment navigation is unverified; physical page and section labels remain usable manual locators.

No private notes or personal context were used, and no personal progress is created. The document does not claim full appendix coverage, full social-impact coverage, current frontier status, or automatic mastery from opening a guide.
