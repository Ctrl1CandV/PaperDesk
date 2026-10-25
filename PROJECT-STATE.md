# Current project state

**PaperDesk 0.1.0 is the accepted first integrated local version.** Product specification remains 1.1. W0–W6 and subsequent reading/library refinements are complete; W1 was a feedback milestone, not the entire release.

## Implemented

- Survey reading, substantive paper explanations and research exploration, with citations, source locators and reading return.
- Two-level orientation → reading; title/primary-topic search; separate survey/paper filters.
- Fourteen current readings (four surveys, ten papers), eighteen retained guide revisions, 153 retained units, 133 cited URLs, three editorial lenses and twelve pinned targets.
- Real resume positions, separate explicit explanation/original states, notes, questions/evidence/next actions, conflict handling, strict backups and opt-in context packets. Opening an article never marks it read.
- Reviewed immutable content updates, atomic catalog switching, recovery and selection rollback. Further discovery can be a deliberate reader–assistant workflow without background model services.

## AI reading and interface — accepted 2026-10-25

The reader-triggered AI extension adds a local backend, official ChatGPT authorization or an OpenAI-compatible API, streamed answers with source snapshots, optional web search, model/Thinking selection and separately backed-up SQLite conversations. Notes, exploration, reading marks and browser backups retain their existing contracts. Only an explicit subscription/application usage-limit response permits the optional API fallback, with its own charges.

Connection recovery, bounded catalog caching, capability-based Thinking and validated per-message final-text reconciliation are implemented. Provider credentials stay in ignored backend storage; no other application's account files are used. See [AI reading](docs/AI-READING.md) for configuration, request/data boundaries, recovery and compatibility limits.

The accepted interface retains the horizontal navigation, adjacent article orientation, continuous reading and pale forest-green palette. Orientation prioritizes the approved summary, reading actions and reading value. AI uses a compact composer and one settings entry, with connection/model/Thinking and API forms grouped by task. Routine explanatory copy was removed; fees, coverage limits, transfer scope and recovery actions remain available. Approved academic bodies, attribution and source locators are unchanged.

## Current checks

- Final interface validation: `npm run build -- --logLevel warn` passed, including content validation and TypeScript; the existing >500 kB bundle warning remains.
- `npx playwright test --config .cache/frontend-craft/preview-test.config.ts`: **103 passed**. All **34 approved content files** match the pre-edit SHA-256 snapshot; `content/` has no diff.
- Desktop and simulated narrow views, expanded orientation details, article endings, reading-state dialogs, ChatGPT/API forms, the composer, context scope and error/recovery states were actually examined before acceptance. No horizontal overflow was found at reviewed widths 320, 390, 820, 1280 and 1920. Narrow views are simulations, not phone tests.
- Fresh browser checks of `/library` and `/read/agent-survey/2` on 4173 loaded JS/CSS matching the final production build, without page errors or unexpected requests. AI/network checks used synthetic responses and blocked real requests.
- Source-delivery verification: the exact staged tree was exported to an isolated local directory. `npm ci --offline --no-audit --cache ../../npm` installed all 260 locked packages; `node --test --test-reporter=spec tests/*.test.mjs` passed **338 tests, no skips**, and `npm run build -- --logLevel warn` passed content validation, TypeScript and bundling. All 34 content files match the export. Only the documentation of these results was subsequently updated.

Detailed commands, intermediate failures, source references and earlier implementation checks are retained in [AI/interface history](docs/history/AI-READING-AND-INTERFACE.md). Earlier content acceptance and review records remain under [research](docs/research/) and [delivery history](docs/history/README.md).

## Repository and operation

Follow [Git policy](docs/GIT-POLICY.md): one long-lived `main`, date-prefixed descriptive commits and exact-path staging. Source, tests, schemas, lockfile, operating contracts, useful history and curated public-content images belong in Git. Generated screenshots/reports and tooling remain in ignored `.cache/`; dependencies and builds remain local for the preview. Credentials, private records and backups are excluded. Ignored `.content-update/` receipts support rollback and are not disposable cache. Content bytes are protected by `.gitattributes`.

Use `npm ci` on a fresh checkout, `npm run build`, then `npm start` at `http://127.0.0.1:4173/library`. The launcher starts the website and local AI service; Ctrl+C stops both. Keep this origin fixed for browser records. `npm start` serves the existing build: rebuild after frontend changes and restart after backend changes. Stop project servers before reinstalling on Windows. See [Operations](docs/OPERATIONS.md).

## Limits and continuation

Live subscription inference, renewal, real quota exhaustion, answer correctness and long-running provider stability are not established by synthetic tests. Earlier bounded live diagnostics are documented in the history. Physical phones/touch, native browser zoom, other engines, screen readers, OS clipboard permissions, live PDF anchors and physical power-loss durability remain unverified. Scholarly coverage is limited to the named versions and recorded claims; no experiment reproduction or exhaustive appendix/reference audit is claimed.

Continue with targeted improvements and reviewed immutable content revisions. Persistent-format changes require migrations. Deployment, GitHub Release, hosted accounts, synchronization and cloud provisioning remain separately scoped; remote protection/deployment automation has not been configured by this project.
