> Archived milestone. Current instructions: [Operations](../OPERATIONS.md) and [project state](../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# W0/W1 observed checks

Specification 1.1; implementation handoff codex-2026-10-21. This is representative-page evidence, not complete v1 acceptance. Implementation used Codex with separate content-validation and browser-test writers, plus a read-only handoff/code reviewer. Each owned disjoint files; the reviewer made no edits. No unavailable named model is claimed.

## Preparation and content

Before implementation, a read-only review compared all 30 entries in PACKAGE-MANIFEST.json: every file, exact byte count and SHA-256 matched. The five content JSON files also passed the supplied schemas. The implemented validator now checks all 3 guide revisions, 23 stable units, 39 distinct source URLs, 3 editorial lenses and 12 pinned targets. The accepted bodies, metadata, catalog, seed and schemas are unchanged. Source/figure review remains inherited; no new scholarly audit is claimed.

`npm run verify:preparation` now deliberately exits 1 for .gitignore, README.md, START-HERE.md and PROJECT-STATE.md. Those are recorded implementation changes, not unexplained source drift. The original manifest was not regenerated to hide them.

## Commands and outcomes

| Command / check | Observed outcome |
|---|---|
| `node --version`, `npm --version` | Node 22.23.3, npm 10.9.9. |
| Project-local exact dependency installation | package-lock.json generated; no global installation/configuration. |
| `npm ci --offline --no-audit` | Pass, 258 packages restored from the project cache after stopping servers. This was a locked reinstall in this workspace, not a fresh separate-directory acceptance. |
| `npm run validate:content` | Pass; counts above. Schemas plus paths, hashes, identities, heading order, citations, assets, source-version consistency and exploration targets. |
| `npm test` | 54 cases: 53 pass, 1 junction-creation EPERM skip, no failure. |
| `node --test --test-name-pattern="rejects linked package directories" tests/content-validation.test.mjs` with required execution permission | Junction rejection exercised separately and passed. Synthetic targets stayed inside the project. |
| `npm run build` / final `npm run build -- --logLevel warn` | Pass; includes content validation and TypeScript checking. Large-chunk warnings remain. |
| `npm audit --json --fetch-retries=0 --fetch-timeout=20000` | Zero vulnerabilities after the documented transitive KaTeX override. |
| Project-local `npm exec -- playwright install chromium --only-shell` | Completed; Chromium headless 156.0.8078.4. Auxiliary download mirrors had DNS failures; the tool's fallback download succeeded. |
| `npm run test:e2e` | Final 6/6 pass, 8.5 seconds; separate loopback port 4174. |
| `node tests/preview-smoke.mjs` with production preview running | Pass: reader boots, 8 units and SVG present, zero page/console errors or outbound requests, development fixture absent. |

The browser suite verifies every supplied Agent paragraph/heading against parsed Markdown, not only the title. It verifies all five diagram labels and rejects foreignObject labels; source role/version/manual fallback, deliberate new-tab URL and no-referrer attributes; Tab/Enter/Escape, modal focus containment and return; cross-guide revision/position/focus return; TOC and history; 390px layout and font controls; safe formula/table overflow and invalid input fallback; missing revision recovery. No action creates a personal read mark.

The external document is a clearly labeled synthetic response. Tests demonstrate that the application makes no external reading request before a deliberate click and that the click opens the exact source URL. They do not establish that an online source responds or honors its locator.

## Pixels inspected

Actual Chromium webpage screenshots were opened and inspected, not merely generated. The primary implementer inspected desktop and narrow first screens, diagrams, lower prose, source details, production first screen and the synthetic table/formula views. A separate browser reviewer also inspected narrow first screen and desktop/narrow diagram/source pixels. Actual rendered prose font families, obtained from the paragraph's platform-font data, were **Segoe UI and Microsoft YaHei**. No remote font was requested. KaTeX fonts are bundled locally; the Mermaid dependency also contains an inline font permitted by the local CSP.

| View | Evidence | Observation |
|---|---|---|
| Desktop 1280×900 first screen | [Desktop first](../evidence/w1-desktop-first.png) | Balanced title, readable continuous prose, 220px contents and 720px article. Orientation and substantive text visible. |
| Desktop diagram | [Desktop diagram](../evidence/w1-desktop-diagram.png) | Labels and directed connections visible; local horizontal scrolling preserves label size. |
| Desktop lower prose | [Desktop lower](../evidence/w1-desktop-lower.png) | Original-reading recommendations and complete scope paragraph preserved; current contents marker verified. |
| Desktop source open | [Desktop source](../evidence/w1-desktop-source.png) | Visible keyboard focus, locator, role, version, manual fallback and return/open controls. |
| Narrow 390×844 first screen | [Narrow first](../evidence/w1-narrow-first.png) | Collapsed contents, title and complete first paragraph; 20px margins, no page overflow. |
| Narrow diagram | [Narrow diagram](../evidence/w1-narrow-diagram.png) | Readable labels with local scrolling cue; only part of the wide diagram is visible at once. Text flow is separately available. |
| Narrow lower prose | [Narrow lower](../evidence/w1-narrow-lower.png) | Prose, recommendations and coverage limitations remain continuous and available. |
| Narrow source open | [Narrow source](../evidence/w1-narrow-source.png) | Dialog fits viewport and all actions remain reachable. |
| Synthetic technical fixture | [Table](../evidence/w1-synthetic-overflow.png), [formula](../evidence/w1-synthetic-formula.png) | Explicit synthetic label, local keyboard scroll and readable invalid-formula fallback; no whole-page horizontal overflow. |
| Production preview | [Production first](../evidence/w1-production-first.png) | Built application visually matches the reader and runs under production CSP. |

## Failures found and resolved

- The first shell invocation loaded a pre-existing profile and emitted an unrelated startup error. Subsequent commands explicitly used no profile. No profile file was inspected or copied into project artifacts.
- The first locked reinstall ran while a preview process held a native build file; Windows rejected it with EPERM. Both preview and test processes were stopped, then the locked reinstall succeeded and subsequent checks were rerun.
- Restricted local-network access prevented Playwright readiness and the first production connection. Running the local checks with the required execution permission resolved access. Both servers remained bound only to loopback.
- A read-only code review found a stale history-return flag and mismatches between accepted link syntax and renderer handling. Unique navigation entries, flag consumption, AST-based section splitting, shared definitions and pinned/relative/asset link handling were corrected. Back → TOC → Back/Forward is covered by browser regression.
- Initial source-dialog keyboard checks exposed Tab leaving the modal and a detached invoking citation after rerender. Explicit Tab wrapping, stable Markdown props and focus restoration by stable ID fixed both.
- Pixel inspection found blank teaching-diagram nodes even though an SVG existed. Mermaid's global htmlLabels setting takes precedence over the old per-flowchart setting. Global pure SVG labels fixed the issue; tests now require the actual labels. Sanitization was retained.
- The desktop title initially left two characters alone on its last line. Balanced wrapping improved the title without changing the accepted text.
- Production smoke found a bundled inline font blocked by CSP. The font policy now permits local/data fonts, while remote fonts remain blocked. Production smoke was rerun successfully.
- Initial dependency audit reported three linked low-severity findings through the math parser's older KaTeX. A specific override to the direct patched KaTeX resolved them; audit now reports zero.

## Acceptance boundary and next step

A2 and A6 have Agent-reader evidence. A4, A5, A14–A16 have the targeted W1 behavior and synthetic checks above, not a blanket full-product pass. A1/A3 across all three articles and A7–A13/A19–A23 still require later package work. A17 has a locked local reinstall/build, with fresh separate-directory acceptance reserved for W6. A18 remains waiting for representative-page feedback; A24 is supported by the updated state and operating commands.

Not verified: physical phone use; other browser engines; screen-reader use; 200% zoom acceptance; actual remote PDF/HTML locator behavior; fresh factual/figure review; persistence, conflict recovery, backups, import/apply/recovery, exploration operations or clipboard handoff. Narrow screenshots are simulated viewports. Bundle size warnings remain an optimization item. No cloud, offline, installation, synchronization, Git or deployment result is implied.

Stop here for the reader's W1 page feedback. The complete first release must still deliver all three capabilities and content maintenance through W2–W6.
