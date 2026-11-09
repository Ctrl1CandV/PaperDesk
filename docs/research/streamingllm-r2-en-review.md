# StreamingLLM r2 English translation note

This is an author translation, not an independent review or reader acceptance.

- Sources used: the complete Chinese revision `content/guides/streamingllm.r2.md`, its metadata, the English glossary, and the guide-writing workflow. No fixed English source material was supplied; the linked paper was not browsed or independently checked for this translation. The Chinese revision identifies v4 PDF physical pages 2–9 and 16–17 for its figures and tables; those pages were not viewed in this translation work.
- Terminology: retained attention sink, KV cache, rolling window, RoPE, ALiBi, Zero Sink, perplexity, and the paper's $x+y$ cache notation. The original teaching flowchart was translated in place; metadata declares no image assets.
- Examples: the device-log example and numerical cache-position example are language-independent and were retained. No wordplay adaptation was needed.
- Checks: `node scripts/content/translation-work.mjs check streamingllm` passed, reporting 2741 words, 9.1 negations per 1,000 words, one caveat template, and seven new glossary cards. A local URL-set comparison found no missing or extra citation URLs; the body has nine H2 headings and 19042 Unicode code points.
- Remaining uncertainty: the paper, figures, numerical results, and terminology were not independently verified against the source; fidelity here is to the Chinese revision. Experiments were not reproduced. The translation has not undergone independent content or visual review.
