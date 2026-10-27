# Current project state

**PaperDesk 0.1.0 is the accepted first integrated local version.** Product specification remains 1.1. W0–W6 and subsequent reading/library refinements are complete; W1 was a feedback milestone, not the entire release.

## Implemented

- Survey reading, substantive paper explanations and research exploration, with citations, source locators and reading return.
- Two-level orientation → reading; title/primary-topic search; separate survey/paper filters.
- Fourteen current readings (four surveys, ten papers), twenty-one retained guide revisions, 180 retained units, 166 cited URLs, three editorial lenses and twelve pinned targets.
- Real resume positions, separate explicit explanation/original states, notes, questions/evidence/next actions, conflict handling, strict backups and opt-in context packets. Opening an article never marks it read.
- Reviewed immutable content updates, atomic catalog switching, recovery and selection rollback. Further discovery can be a deliberate reader–assistant workflow without background model services.

## Reading and AI data upgrade — 2026-10-27

Current continuation standard is practical personal use across four needs: reliable storage/management, helpful AI answers, usable original-paper links and explanatory visuals, and readable guide extraction/presentation. Storage, source navigation and the reviewed guide/card workflow meet this baseline and need no further redesign. The stricter retrieval targets below remain diagnostic results, not blockers to ordinary reading or grounds for another architecture expansion. AI tools are usable; real-model answer quality remains an observation to make during deliberate use, not a claimed test pass.

The usability follow-up centers display formulas while keeping long formulas scrollable, and gives teaching diagrams rounded pale-blue nodes, a clean white canvas and centered placement when they fit. The shared AI instructions now lead with the answer, expand explanations to match the question, and reserve full experiment plans for requests that need them. English keyword rewriting and one budget-permitting retry are explicit; this is prompt guidance, not a newly proven recall improvement. Reviewed prose and data formats are unchanged.

Follow-up checks: `npm run build` passed content validation, types and production bundling (existing chunk-size warning); `node --test --test-reporter=spec tests/prompt-budget-upgrade.test.mjs tests/ai-runtime.test.mjs tests/ai-runtime-review.test.mjs tests/original-materials.test.mjs` passed 39/39; `npx playwright test tests/lazy-content-samples.spec.ts tests/w1.spec.ts` passed 7/7. Initially restricted loopback connections blocked runtime checks and browser readiness; the permitted local rerun passed. Examined the regenerated desktop RAG formula and StreamingLLM diagram screenshots plus the narrow StreamingLLM and synthetic long-formula screenshots. Browser checks used an isolated frontend with synthetic data, not a live model or a physical phone.

The following records the earlier, stricter upgrade assessment; it does not add more mandatory work to the practical-use baseline above.

Implemented incremental SQLite/IndexedDB storage, summary/cursor history reads, bounded block backups and migration recovery; asynchronous guide bodies with bounded caches; versioned HTML/text-layer PDF originals; persistent FTS5 retrieval with pinned generations; original-source tools and replay through both AI providers. Reviewed evidence maps remain authoritative files alongside originals, independent of index rebuilding. Existing private data was not inspected or used as a fixture.

StreamingLLM, RAG and the agent-memory survey now recommend reviewed r2; all eighteen existing revision files retain their original bytes. The new source links, teaching diagram and formula explanation preserve the accepted prose/layout. The site does not mark original reading or mastery on generation/opening. Frontend-only production checks cover desktop and a simulated narrow viewport with the AI service unavailable.

Acceptance is **partial**: engineering and three sample revisions have actual automated/visual evidence; real-model understanding, citation support, research advice and provider stability remain unverified. Thirty real-paper questions and evidence requirements are saved. Direct Chinese candidate recall is 33/46 (71.74%), below the proposed 90% goal; predeclared English keyword queries reach 44/46, which is not proof of model query rewriting. These are development-set results, not held-out validation. See the [current report](docs/evidence/reading-ai-upgrade-report.md), [independent review](docs/research/reading-upgrade-independent-review.md) and [sample review](docs/research/reading-upgrade-samples.md) for commands, scale results, failures and next steps. No live model calls, Git commit, push or deployment were performed in this upgrade.

## Frontend and reading workflow — 2026-10-26 (historical milestone)

The library, reader, AI discussion, notes, exploration and backup share white/slate surfaces, ink headings and restrained indigo actions. White article rows separate from the library background. The reading brief now uses complete overview, research-value and reading-advice paragraphs, with one reading-action group above and all chapter links below. Compact author/publication information, the original link, source edition and verified version dates remain directly visible; no card bibliography dialog or folding sections are required. At desktop widths of at least 1200px, the library uses 85% of the previously balanced workspace: 1428px at a 1920px viewport, capped at 1632px. Smaller windows keep the available width. The reader retains its separate three-column layout: 1680px at 1920px, a 1920px maximum workspace and an independent 832px prose limit. Closing AI preserves article width and position.

Original-paper versions, guide revisions and explicit reading marks remain distinct. Reader actions flow beneath the contents; compact citations retain complete accessible labels and source return. AI drafts pin their materials, historical turns expose saved context, and long-answer completion retains transcript position. Notes support temporary filters and pinned-source return; explorations prioritize the saved question and next action. Reviewed content bytes and personal-record formats are unchanged.

Connection, model and search controls are grouped in AI settings. The revision-protected Tavily configuration endpoint keeps credentials in backend storage; saving a key does not enable search or send a request. Restart an already-running local service once to load the endpoint, and rebuild after frontend changes.

Final checks: `npm run build -- --logLevel warn` passed content validation, TypeScript and production bundling; `node --test --test-reporter=dot tests/*.test.mjs` passed; `npx playwright test` passed all 125 checks. The existing bundle-size warning remains. Final 1920px library and 1920/1440px orientation screenshots were examined; reader and combined AI settings states were reviewed during the same iteration. AI checks use synthetic responses, and narrow views are browser simulations. The [initial refactor record](docs/history/FRONTEND-REFACTOR-2026-10-26.md) and [feedback decisions and checks](docs/history/FRONTEND-FEEDBACK-2026-10-26.md) retain the design rationale, evidence and limitations.

The [complete library brief follow-up](docs/history/LIBRARY-BRIEF-2026-10-26.md) records the newer fourteen-card editorial and navigation revision, its isolated verification and the AI-panel focus repair. The 125-check result above belongs to the preceding broader frontend iteration.

The latest library follow-up passed build/content/type checks, Node regression and 46 affected browser checks. The subsequent [venue-label addition](docs/research/venue-rankings-2026-10-26.md) passed a rebuilt production bundle and 29 affected browser checks: verified CCF A/B takes precedence over CAS major-category zones 1/2, with explicit editions and unknown venues left blank. Venue classifications do not change scholarly content or reading-state data.

The compact venue-label follow-up places the classification inline with author/publication information, with natural wrapping in narrow columns. CAS zones now display as `CAS-1` / `CAS-2`; edition, full Chinese meaning and source caveats remain available. `npm run build -- --logLevel warn`, `node --test --test-reporter=dot tests/*.test.mjs`, and `npx playwright test tests/venue-rankings.spec.ts tests/library-brief.spec.ts tests/library-orientation.spec.ts tests/library-design.spec.ts` passed (14 browser checks). The initial browser run could not launch because the project-local Chromium executable was missing; `npx playwright install chromium --only-shell` with the project cache restored it before the successful rerun. Examined production-build masthead screenshots in `.cache/venue-inline/`: Agent survey at 1920/1280/320px and concept drift at 1920/390px. Desktop author/badge alignment and narrow wrapping were checked; these are browser simulations. Independent read-only diff review found no blocker. The existing bundle-size warning remains; no content or record format changed.

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
