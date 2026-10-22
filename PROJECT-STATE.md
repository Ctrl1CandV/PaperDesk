# Current project state

**PaperDesk 0.1.0 is the accepted first integrated local version.** Product specification remains 1.1. W0–W6 and subsequent reading/library refinements are complete; W1 was a feedback milestone, not the entire release.

## Implemented

- Survey reading, substantive paper explanations and research exploration, with citations, source locators and reading return.
- Two-level orientation → reading; title/primary-topic search; separate survey/paper filters.
- Eleven current readings (two surveys, nine papers), fourteen retained guide revisions, 112 units, 126 cited URLs, three editorial lenses and twelve pinned targets.
- Real resume positions, separate explicit explanation/original states, notes, questions/evidence/next actions, conflict handling, strict backups and opt-in context packets. Opening an article never marks it read.
- Reviewed immutable content updates, atomic catalog switching, recovery and selection rollback. Further discovery can be a deliberate reader–assistant workflow without background model services.

The accepted library uses centered rows up to 900px wide with no selection. Selection opens a 1360px desktop workspace with a 340–540px right card and 32px gap. Its vertical center follows the selected row, bounded at the layout top; there is no connector or independent vertical scrollbar. Closing restores the centered list and focus. Narrow screens retain list → orientation → reader navigation.

All approved guide bodies, public attribution, locators, conditions, coverage gaps and original-reading advice are preserved. Source review and its limits are in `docs/research/`; historical content-hash evidence is in `docs/evidence/`. New claims require reviewed immutable revisions.

## First source delivery checks — 2026-10-22

- `npm test`: **90 passed, 4 skipped, 0 failed**. Four synthetic symlink rejection cases could not create links on Windows (EPERM).
- `npm run build -- --logLevel warn`: content validation, TypeScript and production build passed. Existing minified-chunk >500 kB warning remains; no performance budget was measured.
- `npm run test:e2e`: final **67/67 passed**. An earlier run had one failure during a cleanup-triggered Vite reload; after cleanup finished the full suite was rerun successfully.
- `node tests/preview-smoke.mjs`: passed current/retained readers, library, exploration, explicit saves, context packets and backup. No page/console errors or unsolicited outbound requests; development fixtures absent.
- `node tests/content-update-browser.mjs`: all six update/rollback/rejection/recovery checkpoints passed. Complete synthetic records and all 27 main content files remained unchanged. A stale exact accessible-name assertion was corrected to compare the visible orientation heading's normalized text; version/schema checks remain.
- Git candidate inventory and whitespace checks passed. All 27 content files match byte-for-byte in the working tree, index and exported candidate. An independent index export installed 258 packages with `npm ci --offline --no-audit --cache ../npm` and passed content validation, typecheck and build. No untracked runtime files were needed.
- Actual final library desktop/narrow pixels were examined before acceptance; final browsing/selection images are curated in `docs/images/`. The repository cleanup changes tooling and documentation, not product layout. Browser tests use isolated synthetic records and simulated viewports.

Restricted execution initially blocked localhost checks and Git index/network access; the same scoped commands completed with the required execution permission. No global Git identity/configuration was changed.

## Repository and local files

The initial source snapshot is prepared on `main` under `docs/GIT-POLICY.md`, with date-prefixed descriptive commits. Source, schemas, tests, lockfile, current docs, historical reports, public research records, compact evidence JSON and two curated UI images are included. `.gitattributes` preserves immutable content bytes across checkouts.

Historical handoff/manifest files are in `docs/history/preparation/`; superseded design/check reports are in `docs/history/`. The duplicate task prompt and obsolete preparation verifier were retired. Verified duplicate incoming packages, downloaded paper PDFs, temporary review tooling, old test copies and generated screenshots were cleaned. Npm/browser/test artifacts are grouped under ignored `.cache/`; `node_modules/` and `dist/` remain local for the working preview. Ignored `.content-update/` receipts are retained for rollback and are not disposable cache. Private records and credentials are never part of the source tree.

Runtime verified: Node 22.23.3 / npm 10.9.9 / project-local Chromium 156.0.8078.4. Use `npm ci`, `npm run build`, then one `npm run preview` at `http://127.0.0.1:4173/library`. Keep this origin fixed. Do not start a duplicate server on the occupied port; stop project servers before reinstalling on Windows. See `docs/OPERATIONS.md`.

## Limits and continuation

Physical phones/touch, native browser zoom, other engines, screen readers, real OS clipboard permissions, live PDF anchor positioning and physical power-loss durability remain unverified. Scholarly review is limited to the named versions and recorded pages/claims; no experiment reproduction or exhaustive appendix/reference audit is claimed. Drafts are session memory; durable browser records require explicit backups.

Continue with targeted improvements and source-reviewed content enrichment. Changes to persistent formats require migrations. No deployment, GitHub Release, account/sync service, online model or cloud provisioning is part of this source delivery. Remote protections and deployment automation have not been configured.
