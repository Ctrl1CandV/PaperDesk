# English reading

The reader can display an English-only version of the central guide prose for revisions that have a reviewed translation. It began as a two-guide pilot and now covers every current revision; it is still a presentation layer, not a second authoritative content library.

## Scope

- The toggle appears only when `content/translations.json` has an `en` entry for the current guide/revision. Its inactive label is `English` and its active label is `中文`.
- An older retained revision shows a notice linking to the current revision; it does not borrow the current revision's translation.
- Switching affects the article body and the term cards opened from that body. The sidebar, table of contents, action bar, reading states, notes, AI panel and page chrome remain in Chinese.
- Images, formulas, diagrams, citations, unit IDs and revision routes are unchanged. Figure captions and alternative text come from the English translation; the original image files are reused.
- The English glossary is a separate reviewed layer (`content/glossary-en.json`). It does not replace or modify the Chinese glossary.
- If the English body cannot be loaded, the reader keeps the Chinese body and shows an error instead of substituting a partial translation.

## Current coverage

Every current revision on the shelf has an English body (24 guides); `tests/integration/english-translations.test.mjs` fails if a current revision lacks one. The two pilot translations are `transformer` r5 and `rag-survey` r5. The other 22 were first drafted in a 2026-11 batch; 15 of those drafts summarized instead of translating, and they were retranslated in full on 2026-11-09 (see [the batch note](../research/english-retranslation-2026-11-09.md)).

The English bodies follow the Chinese section order. Each guide has an author note `docs/research/<id>-r<N>-en-review.md`; the pilot notes are `transformer-r5-en-review.md` and `rag-survey-r5-en-review.md`. `docs/research/english-translation-independent-review.md` is a limited independent spot-check of the pilot; it is not a full translation review or reader acceptance. No reader has yet accepted the 22 later English versions.

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
- 2026-11-09: the same rendered-build method was used to view English and Chinese GPT-3 and English AgentBench pages at 1440 px and a 390 px simulated viewport: tables keep numbers and words whole and scroll when wide, and figure rights sit behind the folded “Source and permission” control.

## Producing more translations

Follow section 13 of the [guide-writing workflow](../content/workflows/GUIDE-WRITING.md). Each translation is prepared in `.cache/translation-work/<id>/` and checked with `node scripts/content/translation-work.mjs check <id>`, which validates against a temporary manifest and glossary and reports length and negation density; the integrator then runs `merge`. Length is the ratio of English prose words to Chinese prose characters, with link targets, figure lines, code and display math removed on both sides. Complete translations measure 0.43–0.57 with no section below 0.37; `check` fails below 0.38 and warns below 0.41 or when a section falls below 0.31. A passing ratio is a prompt for review, not proof of completeness: compare the two versions section by section. Several translations can therefore be written at once without editing `content/translations.json` or `content/glossary-en.json` directly.

## Next increment

Add more translations through the same manifest and body convention; do not add a language toggle to a revision without a complete English body and glossary coverage. Reader review should check English terminology, example adaptation, figure captions and whether the untranslated surrounding interface is acceptable.
