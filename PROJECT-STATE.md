# Current project state

**PaperDesk 0.1.0 is the accepted first integrated local version.** Product specification remains 1.1. W0–W6 and subsequent reading/library refinements are complete; W1 was a feedback milestone, not the entire release.

## Implemented

- Survey reading, substantive paper explanations and research exploration, with citations, source locators and reading return.
- Two-level orientation → reading; title/primary-topic search; separate survey/paper filters.
- Fourteen current readings (four surveys, ten papers), eighteen retained guide revisions, 153 retained units, 133 cited URLs, three editorial lenses and twelve pinned targets.
- Real resume positions, separate explicit explanation/original states, notes, questions/evidence/next actions, conflict handling, strict backups and opt-in context packets. Opening an article never marks it read.
- Reviewed immutable content updates, atomic catalog switching, recovery and selection rollback. Further discovery can be a deliberate reader–assistant workflow without background model services.

## Frontend and reading workflow — 2026-10-26

The library, reader, AI discussion, notes, exploration and backup share white/slate surfaces, ink headings and restrained indigo actions. White article rows separate from the library background. The reading brief directly displays overview, value, prerequisites, coverage and chapter entry points; complete bibliography opens separately. At desktop widths of at least 1200px, the library uses 85% of the previously balanced workspace: 1428px at a 1920px viewport, capped at 1632px. Smaller windows keep the available width. The reader retains its separate three-column layout: 1680px at 1920px, a 1920px maximum workspace and an independent 832px prose limit. Closing AI preserves article width and position.

Original-paper versions, guide revisions and explicit reading marks remain distinct. Reader actions flow beneath the contents; compact citations retain complete accessible labels and source return. AI drafts pin their materials, historical turns expose saved context, and long-answer completion retains transcript position. Notes support temporary filters and pinned-source return; explorations prioritize the saved question and next action. Reviewed content bytes and personal-record formats are unchanged.

Connection, model and search controls are grouped in AI settings. The revision-protected Tavily configuration endpoint keeps credentials in backend storage; saving a key does not enable search or send a request. Restart an already-running local service once to load the endpoint, and rebuild after frontend changes.

Final checks: `npm run build -- --logLevel warn` passed content validation, TypeScript and production bundling; `node --test --test-reporter=dot tests/*.test.mjs` passed; `npx playwright test` passed all 125 checks. The existing bundle-size warning remains. Final 1920px library and 1920/1440px orientation screenshots were examined; reader and combined AI settings states were reviewed during the same iteration. AI checks use synthetic responses, and narrow views are browser simulations. The [initial refactor record](docs/history/FRONTEND-REFACTOR-2026-10-26.md) and [feedback decisions and checks](docs/history/FRONTEND-FEEDBACK-2026-10-26.md) retain the design rationale, evidence and limitations.

## AI service baseline — accepted 2026-10-25

The reader-triggered AI extension adds a local backend, official ChatGPT authorization or an OpenAI-compatible API, streamed answers with source snapshots, optional web search, model/Thinking selection and separately backed-up SQLite conversations. Notes, exploration, reading marks and browser backups retain their existing contracts. Only an explicit subscription/application usage-limit response permits the optional API fallback, with its own charges.

Connection recovery, bounded catalog caching, capability-based Thinking and validated per-message final-text reconciliation are implemented. Provider credentials stay in ignored backend storage; no other application's account files are used. See [AI reading](docs/AI-READING.md) for configuration, request/data boundaries, recovery and compatibility limits.

The previous interface and accepted source-delivery checks are preserved in [AI/interface history](docs/history/AI-READING-AND-INTERFACE.md). They describe that earlier snapshot, not the current visual design. Content acceptance and review records remain under [research](docs/research/) and [delivery history](docs/history/README.md).

## Repository and operation

Follow [Git policy](docs/GIT-POLICY.md): one long-lived `main`, date-prefixed descriptive commits and exact-path staging. Source, tests, schemas, lockfile, operating contracts, useful history and curated public-content images belong in Git. Generated screenshots/reports and tooling remain in ignored `.cache/`; dependencies and builds remain local for the preview. Credentials, private records and backups are excluded. Ignored `.content-update/` receipts support rollback and are not disposable cache. Content bytes are protected by `.gitattributes`.

Use `npm ci` on a fresh checkout, `npm run build`, then `npm start` at `http://127.0.0.1:4173/library`. The launcher starts the website and local AI service; Ctrl+C stops both. Keep this origin fixed for browser records. `npm start` serves the existing build: rebuild after frontend changes and restart after backend changes. Stop project servers before reinstalling on Windows. See [Operations](docs/OPERATIONS.md).

## Limits and continuation

Live subscription inference, renewal, real quota exhaustion, answer correctness and long-running provider stability are not established by synthetic tests. Earlier bounded live diagnostics are documented in the history. Physical phones/touch, native browser zoom, other engines, screen readers, OS clipboard permissions, live PDF anchors and physical power-loss durability remain unverified. Scholarly coverage is limited to the named versions and recorded claims; no experiment reproduction or exhaustive appendix/reference audit is claimed.

Continue with targeted improvements and reviewed immutable content revisions. Persistent-format changes require migrations. Deployment, GitHub Release, hosted accounts, synchronization and cloud provisioning remain separately scoped; remote protection/deployment automation has not been configured by this project.
