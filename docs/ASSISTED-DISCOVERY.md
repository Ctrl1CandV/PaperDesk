# Find and add the next reading

PaperDesk connects accumulated reading with the next useful paper or survey. This can be a collaboration between the reader and an assistant; it does not require an automated discovery feature, a background service or an online model integrated into the website.

The current application already provides local notes, exploration questions/evidence/unknowns, explicit next actions, editable opt-in context packets, literature-search briefs and immutable content import. It does not perform external literature searches. This document defines how those existing pieces support an assistant-led search and content addition. No real personal record or new external literature search was used to write it.

## Select the material and question

Use the reading context packet to include chosen notes, or the exploration packet to include relevant question, evidence, interpretation, unknowns and next action. Personal fields remain explicit choices. The exact preview can be edited before copying. The exploration's “寻找下一步阅读” panel can also produce an editable “文献检索任务”; its local suggestions only cover the reviewed library.

Give the assistant the selected material and a concrete reading goal, such as a missing mechanism, a result to compare, an evaluation condition to check, or a field overview that needs updating. The task may already authorize finding and adding suitable content; routine reversible preparation does not require repeated confirmation. A general request to improve the platform does not itself select every existing note or authorize reading unrelated browser records.

Preserve the distinction between cited evidence, the reader's interpretation and unresolved questions. A saved position or an opened article does not establish reading completion or understanding. Do not infer a background profile, a research direction or a novelty claim from the selected text.

## Search public sources and verify candidates

Turn the selected question into public concepts, source requirements and comparison criteria. Search academic primary sources such as publisher/conference pages, official repositories and public preprints. Do not silently submit an entire private packet, private quotations or identifying context as a search query.

For each useful candidate, establish the public title, authors, source URL/identifier, publication or preprint status, year and exact version inspected. Explain which selected question it may address, why that connection is supported, which parts merit reading, and what it cannot establish. Distinguish evidence from an abstract, full text, appendices and artifacts. If the source is unavailable or only an abstract is accessible, state that limit; a plausible title is not a verified finding.

Prioritize by the reading goal and explanatory dependencies, rather than popularity, venue prestige or a fabricated confidence score. A candidate can be relevant without proving the reader's interpretation or a novel research gap. A useful survey and a useful method/evaluation paper can play different roles in the same question trail.

## Prepare and review the local reading

A verified candidate is not yet a local explanatory article. Read the accessible source material needed for the intended coverage, then prepare the two levels:

- Orientation: accurate scholarly identity, primary topics, problem/scope, learning value, prerequisites and coverage limits.
- Substantive reading: coherent explanations of mechanisms, evidence, conditions and conceptual dependencies, with purposeful original-reading advice and resolvable source locators. Concision reduces repetition without reducing necessary depth.

Review research claims, numerical conditions, figures/tables, quotations and attribution against the inspected sources. Keep omissions explicit. The content validator checks structure, identity and safe paths; it cannot certify this scholarly review. Existing approved prose is preserved unless a deliberate reviewed revision replaces it.

Only public scholarly content, public attribution and editorial learning material belong in the package. Do not copy the reader's private notes, exploration text, conversation, identity or machine context into Markdown, metadata, fixtures, screenshots, evidence reports or public editorial seeds. A public explanation can address a general question without exposing the private text that motivated its selection.

## Add a version and return to the question

Prepare a package under an explicit project-relative directory with the complete retained catalog and reviewed new metadata/Markdown/assets. A new paper receives a stable identity and initial revision; changes to an existing explanation use a new immutable revision. Retain old revisions and pinned section targets. Follow CONTENT-UPDATES.md for the actual package contract and recovery rules.

```text
npm run import:content -- --from incoming/next-reading --dry-run
npm run import:content -- --from incoming/next-reading --apply
npm run validate:content
npm run build
```

Inspect the rendered orientation, substantive text, figures/tables, source locators and return links. Report actual checks and missing source access. Adding content creates no personal note, read mark or exploration evidence, and must not rewrite an existing question or old evidence snapshot.

The reader can then deliberately choose the new section as a next action, read it, attach relevant evidence and revise the original interpretation or unknowns. The next search may follow that revision. This makes the loop repeatable without requiring cloud services, automatic browsing, account sync, a recommendation profile or automatic research judgments.
