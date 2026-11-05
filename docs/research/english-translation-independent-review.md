# Independent review: English translations and glossary

## Overall judgment: needs correction

The translations are broadly faithful and readable, and their principal technical terminology follows the fixed papers. The Transformer teaching example, however, loses an essential language distinction, and the results table leaves its training-cost columns ambiguous. The RAG guide also presents a frozen, prompt-only generator as if it characterized all three paradigms. Correct these before reader testing. This is a spot-check, not a re-translation or reader acceptance.

## Findings

### High

None identified in this spot-check.

### Medium

1. **`content/guides/transformer.r5.en.md`, “What is predicted” and “The big picture” — invented translation example no longer illustrates the stated language distinction.** The Chinese guide, same sections, translates *They reached the river bank* into a Chinese sentence and contrasts Chinese words for riverbank and bank; the NIPS paper §5.1 instead tests English–German and English–French, not this example. The English version uses the English gloss “They arrived at the riverbank” as if it were the target output, then says “the target-language word for *riverbank*” differs from the target word for a financial bank. Both displayed source and target are English, so the reader cannot see those different target-language words or understand why the output word is not simply the English source expression. **Correction:** retain the explicit gloss and no-Han requirement, but say throughout that this is a word-by-word English gloss of an imagined Chinese output; replace the target-word comparison with an explicit explanation that the actual Chinese alternatives are not displayed. Alternatively use an invented English–German example with clearly distinguished target words, and update the shift/mask walkthrough consistently.

2. **`content/guides/transformer.r5.en.md`, “Results and ablations,” Table 2 excerpt — training-cost attribution is ambiguous.** Chinese guide, same table; NIPS 2017 Table 2, p. 8 has separate EN–DE and EN–FR cost columns, with the two Transformer costs shown in the EN–DE column only. The English table combines the costs under “English–German / English–French,” but gives Transformer rows only one number, without stating which task it belongs to. A reader may reasonably take it to apply to both tasks. **Correction:** use separate cost columns, leaving the English–French cells blank or marked “not reported in this table”; or explicitly label the single values EN–DE only. Do not infer EN–FR FLOPs.

3. **`content/guides/rag-survey.r5.en.md`, “Three Paradigms” — frozen prompt-only model presented as a general property.** Chinese guide, same section, makes the same unqualified assertion; survey v5 §II-A and §II-C and Figure 3 distinguish a basic inference-time pipeline from modular systems that can include retriever or generator fine-tuning. Saying “a frozen model writes the answer and can see only the text in its prompt” while introducing all three paradigms obscures both parametric knowledge and trainable variants. The survey §II-A explicitly allows generation to draw on parametric knowledge. **Correction:** frame the backward walkthrough as the depicted basic frozen inference-time pipeline, say that the model receives retrieved text in its prompt but may also draw on parametric knowledge, and note that other variants can train components.

4. **`content/glossary-en.json`, `seq2seq` aliases — individual “encoder” and “decoder” trigger a joint definition.** Chinese `seq2seq` entry uses the combined encoder–decoder term, and NIPS §3 distinguishes the two components. The individual aliases are broad technical words, not synonyms of the combined architecture; a card opened on “encoder” describes both and can suggest the terms are interchangeable. **Correction:** alias the complete phrase “encoder–decoder” (and a hyphenated spelling if matching requires it); if individual cards are desired, define each component separately. Confirm matching behavior in the reader rather than assuming it here.

### Low

1. **`content/guides/rag-survey.r5.en.md`, “Returning Methods to the Map,” HyDE row — awkward and potentially inverted comparison.** Chinese guide, same row, contrasts using the question to match an answer directly with generating a hypothetical answer for retrieval; survey v5 §III-C describes query transformation via hypothetical documents. “Matching an answer directly to a question” makes the answer sound like the search input. **Correction:** “Matching the original question directly against candidate documents.”

2. **`content/guides/rag-survey.r5.en.md`, “Generation,” context compression — unqualified model capability claim.** Chinese guide, same paragraph, says compressed text is difficult for people but understandable to LLMs; survey v5 §IV-A discusses compression and its reported results, not universal intelligibility. “Intelligible to LLMs” reads categorically. **Correction:** “The compressed text can be difficult for people to read, while a model may still be able to use it for the task”; retain the original-paper attribution and performance conditions.

3. **`content/glossary-en.json`, missing foundational cards — selective coverage.** Relevant Chinese glossary entries include `token`, `hallucination`, `icl`, `attention`, and `ragas`. Both guides use these concepts; the survey’s §II and §VI discuss in-context learning, hallucination, and RAGAS, and NIPS §3.2 defines attention. These omissions do not make the 35 existing cards incorrect, but readers may need cards for concepts that are at least as central as individual methods. **Correction:** prioritize concise English cards for token, attention, hallucination, in-context learning, and RAGAS, if the planned glossary scope permits; avoid generic aliases such as “model,” “attention,” or “context” without testing false positives.

4. **`content/guides/rag-survey.r5.en.md`, “Returning Methods to the Map,” opening — interaction claim remains unverified.** Chinese guide, same section, also instructs readers to select method names; survey v5 Table I is a source index, not evidence of website behavior. In the standalone Markdown table the names are plain text, and the author notes say decoration depends on integration. **Correction:** verify that method-name cards actually work in the intended English reader before retaining the instruction, or phrase it conditionally. This is an integration risk, not a claim that the rendered reader is broken.

## Fidelity spot-check record

Checked the English passage against the corresponding Chinese section and the fixed English paper’s extracted text. These are distinct checks, not a claim to have verified every sentence or underlying cited method.

### Transformer — NIPS 2017 conference PDF

- Encoder and decoder stacks, six layers, width 512, residual then normalization: “The big picture”; §3.1, p. 3 — consistent.
- Autoregressive next-token generation and shifted inputs plus causal mask: “What is predicted” and “Three attention pathways”; §§3 and 3.1, pp. 2–3 — mechanism consistent; see the example finding above.
- Scaled dot-product equation, division by √dₖ, and the variance argument’s assumptions: “Scaled dot-product attention”; §3.2.1 and footnote 4, p. 4 — consistent.
- Eight heads, 64-dimensional keys and values, learned projections and concatenation: “Multi-head attention, part 2”; §3.2.2, pp. 4–5 — consistent; hand calculation is explicitly invented.
- Q/K/V origins and decoder masking: “Three attention pathways”; §3.2.3, p. 5 — consistent.
- Sinusoidal positions, relative-offset hypothesis, learned-position comparison, and extrapolation as a possibility: same section; §3.5, pp. 5–6 and Table 3 — consistent.
- Complexity comparison, n < d condition and restricted attention’s longer path: “Why self-attention”; §4 and Table 1, pp. 6–7 — consistent with the stated comparison and caveats.
- WMT data, 4.5 million English–German pairs, 37,000-token vocabulary, 8 P100s, warmup 4,000: “Training recipe”; §5, p. 7 — consistent.
- 28.4/41.0 BLEU, checkpoint averaging, beam 4, and Table 3’s 0.9 BLEU one-versus-eight-head difference: “Results and ablations”; §6 and Tables 2–3, pp. 8–9 — consistent, except the cost-column presentation flagged above.

### RAG survey — arXiv 2312.10997v5

- Survey scope of 26 tasks and nearly 50 datasets: introduction; v5 §I, p. 2 — matches the survey’s own count.
- Indexing, same-model query encoding, top-K retrieval, and generation: “An Example”; §II-A, p. 3 — consistent for the described Naive pipeline.
- Naive, Advanced, and Modular relationship and pre-/post-retrieval optimization: “Three Paradigms”; §II and Figure 3, pp. 3–4 — consistent apart from the generalization flagged above.
- Retrieval units from tokens through documents, noise/completeness tradeoff, and Small2Big neighboring context: “Retrieval I”; §III-A–B, pp. 7–8 — consistent.
- MTEB 8 tasks/58 datasets and C-MTEB 6 tasks/35 datasets: “Retrieval II”; §III-D, p. 9 — matches the survey’s historical figures, not verified as current leaderboard counts.
- RA-DIT aligns retriever and generator scores with KL divergence: “Generation”; §IV-B, p. 10 — consistent with the survey’s account; the detailed two-step procedure is not independently checked against the method paper here.
- Iterative, recursive, and adaptive retrieval distinctions and iterative risks: “Augmentation”; §V and Figure 5, pp. 10–11 — consistent as the survey’s taxonomy.
- Retrieval/generation evaluation targets, three scores and four abilities: “Evaluating a RAG System”; §VI-B–C, pp. 12–13 — consistent, with the guide’s numerical ranking example clearly fictional.
- More than 200,000-token contexts as a then-current survey claim: “Challenges and Future Directions”; §VII-A, p. 15 — consistent as a historical claim, not a present-day limit.

## Structure and terminology

A local text comparison found one H1 in each file; Transformer has 13 H2s in both languages and RAG survey 12 in both, in corresponding order. Markdown link destinations, including citation URLs, image paths, internal routes and fragment destinations, match as multisets including counts. No Han characters were found in the English guides or the 35-entry English glossary. This does not check link resolution or rendered figures.

The guides consistently use the source terms *scaled dot-product attention*, *multi-head attention*, *retrieval-augmented generation*, *Naive RAG*, *Advanced RAG*, and *Modular RAG*. “Cross-attention” is introduced as a synonym for the Transformer paper’s encoder–decoder attention, not attributed as its original label.

All 35 English glossary entries were read for definitions, specificity and aliases; relevant Chinese entries were compared, including `seq2seq`, foundational terms, and the RAG method entries. Apart from the alias and coverage findings above, no clearly inaccurate definition or ordinary-word alias was identified by inspection. Similar capitalized aliases are not themselves evidence of erroneous matching.

## Not verified

- No rendered-page, visual, interaction, accessibility, or real reader testing; the fixed papers were checked via local text extractions, not independent inspection of figure pixels.
- No full source-to-source translation audit, mathematical reproduction, exhaustive bibliography review, or independent verification of every cited method paper and secondary numerical result (including Cuconasu and LLMLingua).
- Actual glossary matching, case handling, route resolution, figure licensing, and the claimed first-use decoration were not tested.
- No build, merge, or Git command was run. The two author review notes were read as context, not treated as independent evidence.

## Post-review corrections

The writer addressed the medium and low findings after this report:

- The Transformer example now identifies the displayed target as an English gloss of an imagined Chinese output and says the Chinese target words are not displayed; the target-word comparison was reworded accordingly.
- The Transformer results table now has separate EN–DE and EN–FR cost columns and marks the Transformer EN–FR cells as not reported, without inferring FLOPs.
- The RAG paradigm walkthrough now describes the depicted basic pipeline, acknowledges parametric knowledge, and notes that later variants can train components.
- `seq2seq` no longer aliases the individual words `encoder` and `decoder`.
- The HyDE and context-compression wording and the five missing foundational cards were addressed; the English glossary now has 40 entries (token, attention mechanism, hallucination, ICL and RAGAS were added).

These corrections were not re-reviewed independently. The original “needs correction” judgment above remains the report's snapshot; reader testing and a second spot-check are still required.
