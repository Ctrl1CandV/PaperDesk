# RAG survey r5 English translation: author notes

## Source and scope

- Fixed survey: Gao et al., *Retrieval-Augmented Generation for Large Language Models: A Survey*, arXiv 2312.10997v5, March 27, 2024. The translation follows `content/guides/rag-survey.r5.md` and its metadata; it does not update the survey's early-2024 coverage.
- For this translation, the locally available v5 PDF text was consulted at PDF pages 3–4 (Naive and Advanced RAG, Figure 3 and Modular RAG) and 7–8 (retrieval sources, granularity, and indexing). The guide itself supplies the other section locators and PDF page references. No full re-review of the survey or cited papers was undertaken in this translation pass.
- The Chinese guide's coverage statement, fictional example, caveats about LLMLingua reference [100], Cuconasu et al.'s experimental conditions, and figure-use limitation are retained. The guide's statements about earlier source checking and AI figure inspection describe the source guide's authoring, not new checks performed here.

## Terminology and adaptations

- Use the survey's Naive RAG, Advanced RAG, Modular RAG, retrieval, generation, augmentation, pre-retrieval, post-retrieval, retrieval granularity, context relevance, answer faithfulness, and negative rejection. “Context curation” renders the guide's discussion of organizing retrieved context; “commissioning acceptance record” and “review interval” make the fictional archive scenario natural in English. Qingyu is a transliteration of the fictional station name.
- The three-stage indexing–retrieval–generation account and the progressive relationship among paradigms were phrased against the v5 text on pages 3–4. Proposition-level retrieval, Small2Big, and Reverse HyDE were worded consistently with pages 7–8. These are editorial adaptations, not new findings or changes to the example's numbers.
- Sentence structure, examples' phrasing, and link labels were edited for idiomatic English. Figures, image paths, citation destinations, section order, and pinned internal routes were retained. The English body is integrated through `content/translations.json`; its term cards use the separate `content/glossary-en.json` layer. Reader-level rendering is checked separately.

## Checks and uncertainty

- A local text comparison found one H1 and 12 H2 headings in each body, no Han characters in the English body, and matching counts for every external URL, image path, `/read/` route, and local fragment destination. The English body contains 58,997 Unicode characters, including whitespace.
- The survey was only spot-checked as described above; method-level claims and numerical results outside those passages remain dependent on the Chinese guide's prior authoring and source checks. No independent verification of the other cited papers was performed. A later headless rendered-build check verified the toggle, all figures and an English term card; live-server E2E remains unavailable in this environment.
- The first attempted character comparison used `python`, which was unavailable; the checks were rerun successfully with Node.js. No merge, build, or Git command was run.

This is an **author translation**, not an independent review or reader acceptance.
