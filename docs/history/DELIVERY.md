> Archived milestone. Current instructions: [Operations](../OPERATIONS.md) and [project state](../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Delivery evidence — local integrated platform

Historical W0–W6 baseline: the current reading-experience refinement and its verification are in **REFINEMENT-CHECKS.md** and PROJECT-STATE.md. In particular, the current library uses title/main-topic search and two-level entry, and current metadata revisions are now 2. Counts and initial catalog-integrity statements below describe the earlier baseline; the catalog has since deliberately changed while original bodies and non-catalog inputs remain intact.

Specification 1.1; implementation handoff codex-2026-10-21. W1 reader/content feedback was accepted before W2–W6 work. The integrated local implementation is ready for final reader feedback. This is an implementation handoff, not a claim that final reader acceptance, publication or deployment has occurred.

## Delivered behavior and boundaries

All three supplied guides are available in full, with their original structures, citations, conditions, coverage gaps and original-reading advice. Library search, pinned revisions, contents, diagrams/table, source checking and return are integrated with resume, independent guide/original marks, notes, research questions/evidence/actions, strict backups and explicit context copying. Local dry-run/apply/recovery makes reviewed content extensible without reader component edits or personal-data migration.

The initial manifest's **8/8 public content files retain exact bytes and SHA-256**: catalog, editorial seed and three Markdown/metadata pairs. Original guide/catalog/exploration schemas also remain unchanged. A new personal-backup schema is implementation work. No research claims were rewritten. Preparation-facing .gitignore, README.md, START-HERE.md and PROJECT-STATE.md intentionally changed; the initial manifest is retained as a historical snapshot.

Only the generic audience from PRIVACY.md was used. No other project, private profile, real note, model service or cloud account was used. All personal test records are explicitly synthetic, created in fresh browser contexts. There was no Git initialization, commit/push, deployment or cloud provisioning.

## Actual execution

Verified runtime: Node 22.23.3, npm 10.9.9, Vite 8.3.5, TypeScript 7.0.2, Playwright 1.64.1 and Chromium 156.0.8078.4. Versions describe the tested setup, not an assertion about latest releases.

| Command / check | Observed result |
|---|---|
| `npm run validate:content` | Pass: 3 guides, 23 units, 39 cited URLs, 3 editorial lenses, 12 pinned targets. Structural checks do not certify scholarship. |
| `npm test` | **80/80 pass**, zero skips in the final permitted run, including Windows symlink boundaries and four injected interruption phases. |
| `npm run test:e2e` | **38/38 pass**: exploration 6, platform 11, records 10, visual 5 and W1 regressions 6. |
| `npm run test:e2e -- tests/records.spec.ts tests/visual.spec.ts` | **15/15 pass** after compact backup export and complete horizontal diagram/table checks. |
| `npm run test:e2e -- tests/visual.spec.ts --grep "all platform surfaces"` | **1/1 pass** after correcting the narrow lens-list numbering. |
| `npm run build -- --logLevel warn` | Pass, including content validation and typecheck. Known >500 kB chunk warning remains. |
| `node tests/preview-smoke.mjs` | Production pass: 3 readers, diagrams/table, library, 3 lenses, explicit question save, opt-in packet, backup count; development-only fixture absent; zero page/console errors or unsolicited external requests. |
| `npm run import:content -- --from content --dry-run` | Pass: unchanged collection, no apply, zero new files. |
| `node tests/content-update-browser.mjs` | Pass on isolated port 4175 and a temporary full source copy: fourth guide r1→r2, seed1→seed2, illegal same-key rejection and before-switch failure/recovery preserve identical complete personal-record snapshots. Old guide routes and seed origins remain available. |
| Independent neutral-directory rebuild | `.tmp-tests/rebuild-check`: offline locked `npm ci --offline --no-audit` installed 258 packages; validation, typecheck, 80/80 tests and production build passed. Final source changes were synchronized and rebuilt; package-lock hash remained identical. |

Reproducible browser and content-update scripts remain under tests/. Compact reports are retained as docs/evidence/rebuild-check.json, docs/evidence/content-update-check.json and docs/evidence/content-integrity.json. The final integrity check matches all 11/11 original content and content-schema inputs. Detailed temporary snapshots are implementation artifacts under .tmp-tests/ and are not application content or personal backups.

Failures found and addressed: nested form labels made exact automated control lookup unstable until explicit accessible labels were supplied; history return needed to wait for asynchronous record content/diagrams; late optional-note loading could overwrite an edited copy preview; deleted-note conflicts needed a new-copy recovery path; no-quote imported notes needed omission of undefined optional fields; failed deletes needed feedback inside their dialog; stale draft base revisions and save-in-flight edits needed preservation; compact backup export now shares the same size bound as import; new content coverage labels now follow metadata. Tests initially made two incorrect timing/expectation assumptions about copy-save dialog closing and React preview effects; those assertions were corrected to observe completed state. A decorative citation arrow was excluded from a source-label assertion. Source claims were not changed.

During parallel checking, temporary copied tsconfig/index files triggered Vite reloads; development watching now excludes test/staging/cache/evidence directories. Early browser/symlink runs were denied by sandbox loopback/filesystem permissions; narrow permitted reruns passed. These failed attempts are not counted as passes. No physical power failure was simulated.

## Acceptance matrix

“Pass” below applies to the named observed behavior; limitations are explicit. Native browser zoom and final human acceptance are not folded into a green automated result.

| ID | Status | Evidence / limit |
|---|---|---|
| A1 | Pass | platform: exact three-guide order, purposes, direct entry, body search/clear/no-match; fresh home has no invented resume/read marks. |
| A2 | Pass | visual + W1: all approved paragraph/heading/table-cell text compared to rendered DOM; orientation appears at 1280×900 and 390×844. |
| A3 | Pass | Agent relation diagram, InstructGPT training process and HELM metric table rendered separately; no question-card rewrite. |
| A4 | Pass for local UI | Each article's representative citation displays the supplied version/locator; W1 verifies deliberate new-tab URL and focus/position return with a synthetic external response. Live original availability/anchor behavior not reverified. |
| A5 | Not-run for native browser zoom; other checks pass | Both teaching diagrams and HELM table inspected; 390px local overflow and keyboard horizontal access pass. Synthetic formula/hostile-Markdown test passes. CSS 200% zoom screenshots have no document overflow; this does not certify native browser zoom or a physical phone. |
| A6 | Pass | Exact preserved mainline text/gaps/reading advice; metadata-driven coverage labels for new abstract/selected/mainline/full-survey packages; no new ranking or completeness claim. |
| A7 | Pass | Actual scrolling/reload retains unit and approximate offset; resume never creates read marks; history return and explicit chapter targets remain separate. |
| A8 | Pass | Guide and original state can differ and persist; source version/null is stored honestly; no mastery field. |
| A9 | Pass | Exact notes survive reload; simulated unavailable/quota paths retain downloadable drafts; two tabs and remote deletion preserve a separately saved latest draft. Optional quotation/fingerprint regression covered. |
| A10 | Pass | Full strict backup round-trip into fresh isolated context; duplicate idempotency; preview/cancel; conflicts/remapping; invalid/new format and oversized merged collection reject transactionally. Compact export revalidates. |
| A11 | Pass | Actual content-update browser test compares complete personal snapshots across revision/seed switch, rejected import and recovery; old r1 targets and saved seedRef remain usable. |
| A12 | Pass for application clipboard contract | Preview equals submitted clipboard text; versions/locators/gaps/relative returns included; unchecked notes excluded; explicit selection, 12,000-character handling and manual fallback tested. OS clipboard permission itself was simulated. |
| A13 | Pass | Synthetic fourth guide added without UI edits; paths, symlinks, hash/link/heading/unknown fields, changed metadata/assets and immutable identity all tested. Both revisions/current selection rendered. |
| A14 | Pass | Validator and rendering fixture reject/inertly handle HTML, unsafe URLs, executable diagram directives, remote images, invalid/oversized input; no unsolicited fixture requests. |
| A15 | Pass for exercised flows | Local dependencies/fonts/CSP; no analytics/model calls. Test contexts observed zero external requests except one deliberately mocked source opening. No private operator material in shipped content or screenshots. |
| A16 | Pass for exercised keyboard/UI | Focus trapping/Escape/return, source and table/diagram keyboard use, labels, empty search, missing routes and storage-unavailable recovery checked. Screen-reader audit not performed. |
| A17 | Pass | Independent locked install/build with final synchronized source, unchanged lock, 80/80 unit checks; runtime recorded above. |
| A18 | Not-run: final reader review | W1 page/content was accepted before broad work. Integrated survey–paper–exploration review awaits the reader; automated checks do not substitute for it. |
| A19 | Pass | Three supplied lenses have reasons, order, pinned reading targets and next steps; no personal record until explicit save; cancel unchanged. |
| A20 | Pass | Exact selection from Agent plus second InstructGPT excerpt, question/interpretation/unknown/action, HELM next target and Back; deferral/reload; independent manual original excerpt and unlinked observation. |
| A21 | Pass | Two-tab conflict, failure recovery, navigation drafts, backup round-trip, deleted note, missing target and immutable update preserve evidence/provenance/actions. |
| A22 | Pass | Editorial vs personal distinction, open unknowns and research-boundary copy; exploration packets default to excluding every personal field. |
| A23 | Pass | Real importer dry-run/apply/recovery; guide/seed revision maps and same-key conflicts; temporary live application plus IDB update test; OPERATIONS and CONTENT-UPDATES document continuation. |
| A24 | Pass | PROJECT-STATE, OPERATIONS, module documentation, scripts, lock and this evidence map support continuation without old chats or personal data. |

## Pixels actually examined

The following webpage-only captures were opened and inspected, rather than merely generated:

- `v1-home-desktop.png`, `v1-library-narrow.png`, `v1-explore-narrow.png`, `v1-lens-narrow.png`, `v1-backup-narrow.png`: clear hierarchy, readable controls and no document overflow. Lens numbering was corrected and the resulting narrow image re-examined.
- `v1-instructgpt-narrow.png`, `v1-instructgpt-detail-desktop.png`, `v1-instructgpt-detail-narrow.png`, `v1-instructgpt-detail-end-narrow.png`: initial prose visible, labeled teaching diagram and its rightmost PPO stage accessible by local horizontal scrolling.
- `v1-helm-desktop.png`, `v1-helm-detail-narrow.png`, `v1-helm-detail-end-narrow.png`: initial prose, seven metric rows and rightmost explanations remain readable with local overflow/focus outline.
- `v1-instructgpt-source.png`, `v1-helm-source.png`: version labels, academic titles, manual locator fallback and return focus are readable in the source dialog.
- `w4-question-desktop.png`, `w4-question-narrow.png`, `w4-save-error-narrow.png`: synthetic question/evidence attribution, next-step controls and selectable failure-recovery text.
- `v1-agent-survey-zoom200.png`: actual rendered CSS-zoom simulation with local diagram overflow; native browser zoom remains unverified. W1's prior inspected reading/source/formula evidence is documented in W1-CHECKS.md.

Other generated views are available beside these; generation alone is not claimed as a pixel inspection. Paragraph fonts actually reported by Chromium were Segoe UI and Microsoft YaHei. No window chrome, account pages or private reader text was captured.

## Remaining work and verification limits

Obtain final reader feedback on the complete loop, especially exploration editing, evidence provenance, next-step return and backup recovery. Make targeted refinements from that feedback. Native browser 200% zoom, physical phone/touch/soft-keyboard behavior, other browser engines, screen readers, real OS clipboard permission, live source anchors and physical crash/power-loss durability were not verified. Large local Mermaid/math bundles still trigger a chunk warning; no startup-performance budget has been measured. Browser draft warnings and storage eviction are browser-controlled; durable saved records require backups.

No cloud, PWA/offline, synchronization, online generation or deployment claim follows from these checks. New scholarly content still requires its own source/coverage review and an immutable revision.
