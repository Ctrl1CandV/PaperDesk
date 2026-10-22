# Transformer source and authoring review

## Selection and fixed source

Learning purpose: establish the information-flow and training concepts needed to read later language-model and Agent papers. The article is selected for its explanation of attention, causal access, sequence modeling and conditioned evidence, rather than citation count or a current performance ranking. It precedes GPT-3 in the proposed editorial sequence; this is not an inference about personal reading history.

- Paper: Attention Is All You Need.
- Authors: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser and Illia Polosukhin.
- Publication: NIPS 2017, Advances in Neural Information Processing Systems 30; scholarly identifier arXiv:1706.03762.
- [Official proceedings bibliography](https://papers.nips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html).
- [Fixed conference PDF](https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf), 11 physical pages; package version `NIPS 2017 conference paper`.

The proceedings abstract webpage contains older values (27.5 English–German BLEU, 41.1 English–French BLEU and a 165-million-parameter statement). The downloaded linked conference PDF instead gives 28.4/41.0 in its abstract and Table 2, and 65M/213M for the English–German configurations in Table 3. The reading consistently follows the fixed PDF. The web abstract is used for bibliographic confirmation, not merged into the result evidence. PDF title capitalization and author spelling are retained.

## Material actually examined

Read main-text §§1–7, PDF pp1–9, including encoder/decoder structure, attention equations, the three information routes, position encoding, complexity, training and evaluation conditions. The remaining two pages are references. This review does not claim execution of the authors' code or review of attention-map appendices from a different arXiv version.

The public PDF was downloaded into `.source-review/transformer/` and rendered with the project-local temporary PyMuPDF runtime. Actual page images were opened and inspected:

- p3, Figure 1: shifted output inputs, encoder/decoder attention paths, residual Add & Norm arrangement.
- p4, Figure 2 and Equation 1: Q/K/V inputs, scaling, optional mask before softmax, parallel projected heads and concatenation.
- p6, Table 1 and position formulas: complexity, sequential operations, maximum path lengths, sine/cosine dimensions.
- p8, Table 2: base/big English–German and English–French results, and adjacent checkpoint/beam/dropout conditions.
- p9, Table 3: base/big dimensions and parameters, single-head comparison, learned-position row and development-set conditions.

Web PDF screenshot calls in this environment returned unusable empty image references; they are not counted as visual inspection. The local PDF page images supplied the visual evidence. PDF and PNG files remain source-review material, not product assets. The guide uses a newly written teaching diagram and a small attributed selection of result facts, not copied source figures.

## Claim and dependency checks

| Guide point | Checked source and qualification |
| --- | --- |
| Translation predicts output conditionally on source and previous output | §3, pp2–3. The guide's probability factorization is teaching notation, not an alleged original numbered equation. |
| Right shift plus causal masking prevents target leakage | §3.1 p3 and §3.2.3 p5. Training with true prefixes is explained as teacher forcing; generation still depends on earlier generated outputs. |
| Scaled dot-product attention | §3.2.1, Eq1 and Figure 2 p4. Denominator is square root of key dimension; the independence/variance argument is a motivating simplification. |
| Multiple learned projections and concatenation | §3.2.2 pp4–5. Base uses eight heads and 64-dimensional keys/values, with model dimension 512. No predefined semantic role is assigned to each head. |
| Original residual/norm order | §3.1 p3, Figure 1. LayerNorm follows residual addition; later variants are not silently equated with the original. |
| Self versus cross-attention | §3.2.3 p5. Encoder outputs provide K/V for decoder cross-attention; decoder representation supplies Q. |
| Position encoding is required for order; sinusoidal extrapolation is a hypothesis | §3.5 p6 and Table 3 row E p9. No claim of guaranteed unbounded context. |
| Complexity and parallelism are different from universal runtime superiority | §4, Table 1 pp6–7. Full attention has quadratic sequence-length cost; the source's comparison depends on sequence length and representation dimension. |
| Data and optimization are part of the evidence | §5 pp7–8: about 4.5M English–German and 36M English–French pairs; base 100K and big 300K steps. |
| Selected translation result cells | Table 2 p8: base 27.3/38.1 and big 28.4/41.0 on newstest2014. BLEU is not presented as an overall intelligence score. |
| Result-generation conditions | §6.1 p8: base last five checkpoints, big last twenty; beam size 4 and length penalty 0.6. English–French big dropout 0.1 is distinguished from Table 3's big setting 0.3. |
| Parameter count is tied to the displayed configuration | Table 3 p9: 65M base and 213M big are described as English–German configurations, not claimed as identical across both vocabularies/tasks. |
| Ablation scores are not test-score deltas | §6.2 p8 and Table 3 p9: newstest2013 development set, without checkpoint averaging; base eight-head 25.8, single-head 24.9, learned-position 25.7. |

## Package checks and limits

The authored package is `incoming/llm-to-agent/guides/transformer.md` plus its JSON metadata. It contains 3,168 Han characters at authoring validation, nine units including introduction, nine unique source URLs, formulas, an original teaching flowchart, selected results, gaps and purposeful original-reading advice. Mode is `standard` and coverage is `mainline`, not a full treatment of later Transformer variants. Metadata includes complete bibliography, primary topics, explicit reading targets, exact citation labels and SHA-256 of the UTF-8 body.

Actual checks used Node with the project's Ajv 2020 schema and KaTeX dependencies: schema validation, body hash, exact H2 order, bidirectional URL/label inventory, bare primary-PDF inventory presence and reading-target unit resolution all passed. All 26 inline/display math expressions rendered with KaTeX `throwOnError: true`. These checks are structural and formula-rendering checks, not experiment reproduction or browser visual review.

The authoring pass reread the complete Chinese explanation for continuity and matched factual claims to the inspected source. Parent integration review separately read the draft and inspected Table 2/page 8, confirming result and decoding conditions; the later clarification ties parameter counts explicitly to the English–German Table 3 configuration. Catalog assembly, complete-package import, browser rendering, narrow-viewport checks and source-panel navigation remain integration responsibilities. Native external PDF fragment behavior has not been certified; section and physical-page labels provide a manual locator.

No private record, personal progress or requester identity is included. There is no claim that viewing this material completes the original reading, and no experiment or model was run.
