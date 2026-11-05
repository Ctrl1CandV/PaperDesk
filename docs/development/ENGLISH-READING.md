# English reading pilot

The reader can display an English-only version of the central guide prose for revisions that have a reviewed translation. This is a pilot, not a second authoritative content library.

## Scope

- The toggle appears only when `content/translations.json` has an `en` entry for the current guide/revision. Its inactive label is `English` and its active label is `中文`.
- An older retained revision shows a notice linking to the current revision; it does not borrow the current revision's translation.
- Switching affects the article body and the term cards opened from that body. The sidebar, table of contents, action bar, reading states, notes, AI panel and page chrome remain in Chinese.
- Images, formulas, diagrams, citations, unit IDs and revision routes are unchanged. Figure captions and alternative text come from the English translation; the original image files are reused.
- The English glossary is a separate reviewed layer (`content/glossary-en.json`). It does not replace or modify the Chinese glossary.
- If the English body cannot be loaded, the reader keeps the Chinese body and shows an error instead of substituting a partial translation.

## Current coverage

- `transformer` r5: `content/guides/transformer.r5.en.md`
- `rag-survey` r5: `content/guides/rag-survey.r5.en.md`

The English bodies follow the Chinese section order and were checked against the fixed English papers. Their author notes are:

- `docs/research/transformer-r5-en-review.md`
- `docs/research/rag-survey-r5-en-review.md`

`docs/research/english-translation-independent-review.md` is a limited independent spot-check; it is not a full translation review or reader acceptance.

## Content contract

`content/translations.json` maps `(guideId, revision, language: "en")` to a title, an English Markdown body, its SHA-256 and English asset text. `content/glossary-en.json` contains the English card definitions. Validation requires:

- one leading H1 equal to the manifest title;
- the same number and order of H2 sections as the Chinese revision;
- only citations and images already declared by the Chinese revision;
- every declared image used, with English alt text and rights;
- no Han characters in the English body or glossary prose;
- a valid body hash and a valid English card target.

The Chinese metadata, body hash, citations, coverage declaration and personal records are not changed by a translation.

## Reading and AI behavior

The English view is a presentation layer over the same guide identity. Notes, reading marks and exploration evidence use the same guide/revision/unit IDs; a selected English quotation is stored as entered. The AI panel continues to use the Chinese guide context for this pilot; it does not attach an English selection, which avoids silently sending text that the backend cannot validate against the Chinese guide body. A fully English AI context is outside this iteration.

## Verification

- `npm run build` validates both the Chinese catalog and the English translations.
- `npm test` includes a translation-structure check.
- `tests/e2e/english-reading.spec.ts` covers the toggle, English body, figures and term card in a normal browser environment.
- The current sandbox cannot bind the local loopback server, so the Playwright web-server run was not available. A headless Chromium check against the built static assets verified the transformer and RAG toggles, English prose, all figures, English term cards and a 390 px simulated viewport without horizontal overflow. This is a rendered-build check, not a live-server or physical-device test.

## Next increment

Add more translations through the same manifest and body convention; do not add a language toggle to a revision without a complete English body and glossary coverage. Reader review should check English terminology, example adaptation, figure captions and whether the untranslated surrounding interface is acceptable.
