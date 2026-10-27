# Work packages

These packages document the original implementation of the now accepted first integrated version. Their W0–W6 gates are historical; ordinary maintenance follows [current state](PROJECT-STATE.md), [continuation](START-HERE.md) and the contracts for the affected module.

Scope version 1.1. Every package uses this standalone workspace. One writer owns overlapping files; reviews are read-only. No old project or personal material is an implementation input. The complete v1 is the integrated reading-and-exploration platform; W1 alone is not completion.

| Package | Read inputs | Write scope | Required result and gate |
|---|---|---|---|
| W0: reproducible foundation | All contracts, schemas and guide/exploration seeds | package manifest/lock, build config, content types/loader, validation tooling and tests | Pin supported dependencies; validate all content and exploration targets; minimal loopback launch. No global config change or deployment. |
| W1: representative reader | UX, Content, Agent survey, A1–A6 | reader, styles, minimal app/routes and relevant tests | Full Agent prose, diagram, contents, source dialog/open/return. Inspect actual pixels at 1280/390 and keyboard path. Stop for representative-page feedback. |
| W2: complete reading and content maintenance | Accepted W1, remaining guides, Maintenance | library/search, content loader/import tooling and routes; reviewed metadata corrections only | All three guides and current/old routes; local validation/dry-run/apply and recovery. Add a synthetic fourth guide without reader component edits; failed imports preserve active content. |
| W3: persistent personal foundation | Architecture, Exploration data rules, A7–A11 | records layer, strict backup schema, note/state controls and tests | Resume, explicit statuses, notes, expected-revision conflicts and failure recovery; backup covers explorations as well as notes. Use synthetic data. |
| W4: actual direction exploration | Product, Exploration, UX, editorial seed, A19–A22 | exploration views, attachment controls, required record operations/tests | Explore/lens/question routes; useful empty state; adapt a prompt or create a question; attach evidence, choose next action, revisit/edit/defer. Preserve provenance, old versions, drafts and backup round-trips. |
| W5: selected context handoff | Reading and exploration packet contracts | handoff module, deliberate entry points and tests | Preview/copy exact selected reading or exploration context; personal inclusion opt-in, size handling, manual fallback, no network/model call. |
| W6: integrated acceptance and continuation | All contracts/acceptance cases | affected fixes/tests, OPERATIONS, DELIVERY and PROJECT-STATE | Fresh locked build; full survey–paper–question–evidence–next-reading loop; inspected visuals, records and update/recovery safety; documented operating commands. Present real evidence and seek final reader feedback. |

W0/W1 may share a turn, but the W1 page-feedback gate is real. W2–W6 follow that feedback and do not each need another permission ceremony for routine reversible work. Complete v1 includes W4 and maintenance even if the reading page already looks good. Reader acceptance remains separate from code tests.

Each handoff records spec version, changed files, behavior, actual checks, remaining issues and recovery. Update PROJECT-STATE.md so continuation needs no chat history. Use project-relative artifact paths, neutral test records and screenshots without window chrome or personal accounts.

## Tests and evidence

Use unit/integration tests for schema/path rejection, content identity, import transactions, record/evidence ownership, conflicts, context assembly and migration. Use browser tests for source return/focus, route restoration, note/exploration persistence, a second evidence attachment, backup round-trip and clipboard fallback. Inspect the real teaching diagrams and HELM table; use a clearly labeled technical fixture for formulas/oversized inputs, not a fabricated research essay.

Run appropriate checks per package and the full agreed suite/content validation/production build at W6. Screenshot files alone are not visual acceptance; inspect pixels, typography and interactions. Source changes need factual review separate from layout edits. If a source target is unavailable, report the missing locator without guessing success.

## Change control

The subsequent AI reading extension has its own implementation contract in AI-READING.md. Its source changes do not imply that the new feature has inherited the accepted baseline's visual or reader acceptance. Existing content and personal-record formats remain unchanged; the new backend database has a separate versioned schema.

Preserve accepted guide prose until a factual correction is separately reviewed. New content/revisions need explicit coverage and sources, not just component compatibility. Keep deferred features out of the current loop; no cloud or AI integration is necessary for direction exploration.

No Git history is supplied. Repository initialization, identity selection, commits, pushes and deployment need separate authorization. Do not copy global identity or invent it. This preparation does not publish anything.
