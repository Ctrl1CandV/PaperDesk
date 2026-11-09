# ReAct r3 English translation note

This is an author translation, not an independent review or reader acceptance.

- Sources: Chinese r3 body and metadata; fixed arXiv 2210.03629v3 text, particularly main text PDF pp. 1–10, Figure 1 and Figures 2–3, Tables 1–4, and the relevant appendix examples. The local text extraction of Figure 1 is garbled; the Chinese description and metadata were used for its visual details. No image was independently inspected for this translation.
- Terminology: retained the paper's thought, action, observation, chain-of-thought, self-consistency, and sparse-thought vocabulary. Distinguished interface responses from model-generated text and prompting from fine-tuning.
- Examples: retained the paper's Apple Remote and pepper-shaker trajectories and the Chinese guide's explicitly invented voting and product-scoring examples. None depended on Chinese wordplay; no substantive replacement was needed.
- Checks: `node scripts/content/translation-work.mjs check react` passed, with 5 negations per 1,000 words and zero caveat templates. A separate local link-set comparison found no missing or added citation, internal-reading, or image paths; the English body has 12 H2 headings.
- Remaining uncertainty: Figure 1's extracted text is partially unreadable, and the figure-license record is inherited from r2 rather than independently verified online. The experiments were not reproduced, and the translation has not received independent scholarly or visual review.
