# Transformer r5 English translation: author review

## Source and scope

- Fixed source: *Attention Is All You Need*, NIPS 2017 conference PDF, as linked in the Chinese guide. Consulted the local text extraction of the conference PDF, `.source-review/transformer/nips.txt`, pages 1–9: abstract and motivation (pp. 1–2); architecture and attention, Figures 1–2 (pp. 2–5); positional encoding and complexity, Table 1 (pp. 5–7); training and results, Tables 2–3 (pp. 7–9); and conclusion (p. 9). The figures were not independently inspected as images during this translation.
- Input is `content/guides/transformer.r5.md`, with identity and coverage checked against `content/guides/transformer.r5.json`. The Chinese RAG survey was consulted as a writing sample.
- This is an **author translation and self-check, not an independent review or reader acceptance**. No experiments were reproduced, and no rendered-page or visual review was performed.

## Terminology and adaptations

- Use the paper's terms *sequence transduction*, *scaled dot-product attention*, *multi-head attention*, *positional encoding*, *position-wise feed-forward network*, *encoder–decoder attention*, and *label smoothing*. *Cross-attention* identifies encoder–decoder attention in the explanatory discussion; *teacher forcing* describes the shifted-reference training example rather than a term attributed to the paper.
- Revised on 2026-11-05 after review: the teaching example now translates *They reached the river bank* into German, *Sie erreichten das Ufer*. The earlier version kept the Chinese example as an "English gloss of an imagined Chinese output", which left English readers with an English-to-English pair. German, the paper's own test language, separates *Ufer* (river bank) from *Bank* (financial bank), so the sense distinction is visible in the target language. The shift, mask (now a 4×4 table) and multi-head passages were updated together; the example remains invented and illustrative, not a paper result.
- The dot-product explanation specifies that magnitude as well as direction affects a dot product; this qualifies the Chinese guide's directional shorthand. The cross-attention discussion identifies the unnecessary mask as a causal mask, rather than suggesting that no other kind of mask could be used. Both adaptations avoid overstating the mechanism while preserving the explanation and source context.
- The English results table now separates the EN–DE and EN–FR cost columns; the Transformer EN–FR cells are marked not reported, so the translation does not invent costs. Other numerical results and stated conditions were checked against the local conference text.

## Checks and remaining uncertainty

- A local Python character/structure check found 48,358 Unicode characters including the final newline, one H1, 13 H2 headings, and no characters in the U+3400–U+9FFF range. The external URLs, pinned `/read/` routes, and image paths match the Chinese guide as multisets, including occurrence counts. This is a structural check, not a factual or visual review.
- The English gloss necessarily changes the surface form and length of the bilingual teaching example. It is not a real translation experiment or a claim about learned attention patterns. The precise pedagogical suitability of that gloss has not been independently reviewed.
- The local PDF text extraction was used for source comparison; figure pixels and PDF rendering were not checked in this pass. The original guide's limitations remain: selected table rows, no experiment reproduction, and no arXiv appendix visualizations. Later-model discussion is editorial background rather than a conclusion of the 2017 paper.
- The first attempt to run the structural check with `python` failed because that command was unavailable; the same check completed using `python3`. No merge, build, or Git command was run.
