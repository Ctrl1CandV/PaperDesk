# Chain-of-thought r1 English translation note

This is an author translation, not an independent review or reader acceptance.

- **Sources used:** the complete Chinese revision and its metadata, including the existing citations to the NeurIPS 2022 main paper and separate supplement. The Chinese guide locates its discussion in main-paper §§1–6 and supplementary §A.1 and Tables 2–3; the cited PDF page locators are retained. No paper pages were opened or independently checked for this translation, and no browsing was performed.
- **Terminology:** used chain-of-thought prompting, demonstrations, greedy decoding, ablation, and length generalization. The English glossary already covers in-context learning and autoregression; three new cards cover CoT, greedy decoding, and length generalization.
- **Examples:** retained the language-independent box problem, arithmetic, teaching diagram, and explanatory probability decomposition; translated the diagram labels. No Chinese wordplay required adaptation.
- **Checks:** compared the structure, table, formula, and citation URLs with the Chinese guide; `node scripts/content/translation-work.mjs check chain-of-thought` passed with 1,965 words, 9.2 negations per 1,000 words, zero caveat templates, and three glossary additions. Seven H2 headings and 14,433 characters including whitespace were counted separately.
- **Remaining uncertainty:** factual and page-locator accuracy inherits the Chinese revision; the original papers, experimental results, and rendered presentation were not independently verified. No experiments were reproduced.
