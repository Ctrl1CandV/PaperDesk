> Archived milestone. Current instructions: [Operations](../development/OPERATIONS.md) and [project state](../development/PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Library design refresh

Current follow-up: [ADDITIONS-AND-RESTORATION.md](ADDITIONS-AND-RESTORATION.md) documents restoration of the original grey-green style, retained 2:3 library columns and three new readings. This page and [STYLE-CONSISTENCY.md](STYLE-CONSISTENCY.md) are historical iterations; the blue palette is superseded. Shared screenshot paths have since been refreshed by the latest browser run.

## Brief and direction

Subject: a research reading library for a computer-science graduate reader. Its single job is to help the reader choose an article, understand its purpose and coverage, and deliberately enter substantive reading. Reading state is never inferred from a selection.

The supplied frontend-design guidance informs this iteration. References are the official [Linear Inbox documentation](https://linear.app/docs/inbox), for compact selection and keyboard access, and [Zotero's item-pane redesign](https://www.zotero.org/blog/zotero-7/), for stable article identity and progressive disclosure of supplementary bibliography. These public documents were read; a reference-image/browser fetch failed, so no successful visual inspection of those external screenshots is claimed. No reference product's private workspace or account was opened.

## Plan before implementation

Initial palette: ink `#1F2A44`, slate `#5B667A`, indigo `#4262AC`, mist `#EEF2F8`, line `#DCE2EC`, paper `#FFFFFF`. These tokens originally applied only to the library. The subsequent consistency pass promotes them to the entire platform while preserving accepted long-form content, readable prose sizing and reading measure.

Typography: Georgia with CJK sans fallbacks for the concise research-name masthead; Segoe UI / Microsoft YaHei for navigation, Chinese explanatory titles and prose; Consolas for small publication-year/version data. The masthead uses the real leading part of an existing title, never an invented name. Main preview text remains readable, with restrained 12–14px utility text and 15px orientation paragraphs. No remote font or new dependency is needed.

Layout alternatives:

```text
A: tall cards                 B: compact index + article folio
   title / summary | details     search / types | article identity + action
   title / summary | details     concise rows   | content + reading value
   title / summary | details     (sticky)       | preparation / coverage
                                                source details / chapters
```

Choose B. Tall cards duplicate the reading summary and push comparisons apart. A compact index keeps the three current articles in view; the right pane provides the complete orientation. Use natural page scrolling and a sticky left index on sufficiently tall desktop viewports, preserving existing window-position restoration. Narrow screens retain list → orientation → reader, with a visible return path and unchanged query state.

Signature: a typographic article masthead pairs the recognizable research name with a separate explanatory subtitle, like the identity on a paper's first page. This is the one expressive device. The surrounding list, controls and section structure remain quiet; no fake cover, decorative numbering, invented figures or reading-progress scores are added.

## Critique and revision

A generic dashboard treatment with boxed rows, coloured section cards and a large page hero would reproduce the rejected design. Remove the hero eyebrow, repeated row summaries, row-level entry footers and repeated section dividers. Concentrate emphasis on the selected row and the article identity. Publication facts remain available without dominating the preview; reading purpose and value receive the useful space. Keep optional bibliography details expandable, while substantive orientation, prerequisites and limitations remain visible.

## Implemented behavior

The library now uses a compact document index and a distinct white article preview on a cool neutral surface. Article names and explanatory subtitles use separate type roles. Repeated row summaries and per-row entry footers are removed; full orientation remains in the preview. Basic authors/publication identity stay visible, and complete authors/source-version details are keyboard-expandable below the orientation. Prerequisites and coverage limits remain visible. The current library navigation also exposes `aria-current="page"`.

On sufficiently tall desktops the index stays visible while the preview scrolls naturally. Selecting another article after scrolling reveals its identity and retains focus on the selecting button. Narrow screens and constrained actual panel widths use the existing list → orientation → reading stages. Query, type, selection, pinned revision, return position and focus continue to work. No personal reading state is created by previewing an article.

The approved guide Markdown, metadata revisions, catalog and scholarly claims are unchanged in this visual iteration. The discovery panel's supporting text now explains handing a chosen search task to an assistant; ASSISTED-DISCOVERY.md documents that workflow. No literature search, private browser-record read or new content addition occurred here.

## Actual checks

| Command/check | Result |
|---|---|
| `npm run typecheck` | Passed after the initial layout change; also passed in the final build. |
| `npm run test:e2e -- tests/library-orientation.spec.ts` | 2/2 passed for title/topic search, type selection, two-level navigation and reading return. |
| `npm run test:e2e -- tests/library-design.spec.ts tests/library-orientation.spec.ts tests/visual.spec.ts` | 9/9 passed, including sticky index switching, keyboard source/chapter disclosure, complete original prose and platform layouts. |
| `npm run test:e2e` | **54/54 passed** in one complete run, including notes, drafts, explicit states, exploration, backups/conflicts and source-return behavior. |
| `npm run test:e2e -- tests/library-design.spec.ts tests/library-orientation.spec.ts` | Final **4/4 passed** after the actual-width/zoom layout correction and current-page accessibility mark. The full 54-case run preceded these two final changes; affected cases were rerun. |
| `npm run build -- --logLevel warn` | Final build passed, including content validation and TypeScript. Existing >500 kB chunk warnings remain. |
| `node tests/preview-smoke.mjs` | Initial attempt found the old preview stopped (`ERR_CONNECTION_REFUSED`). After `npm run preview` restarted the fixed 4173 origin, the check passed for all three readers, library, exploration save, opt-in context and backup. No page/console error or unsolicited external request in the successful run. |
| Content integrity | A read-only reviewer recomputed all 11 paths in the previous refinement integrity report; every hash matches that report. This includes the deliberately revised catalog and the 10 unchanged initial non-catalog inputs. |

No dependencies, lockfile, schemas, importer or record format changed. Content/unit/import suites were not independently rerun for this presentation-only iteration; their earlier results remain historical in REFINEMENT-CHECKS.md. Content validation and complete rendered-prose comparisons did run as listed above. Production preview remains available at `http://127.0.0.1:4173/library`; do not start a duplicate process on the same port.

## Visual review and corrections

Actual pixels were opened and examined, not merely generated. The inspected final screenshots under evidence/ are:

- library-refresh-desktop.png and library-refresh-desktop-full.png: 1280×900 viewport and full-page InstructGPT preview; article identity, reading action, research content/value and lower coverage/source sections.
- library-refresh-narrow-list.png and library-refresh-narrow-orientation.png: 390×844 list and orientation; three articles remain visible in the list, with a separate full-width preview and return control.
- library-refresh-width-1024.png and library-refresh-width-820.png: intermediate-width preview remains readable; long topic labels truncate only in the compact index, with the full topics in the preview.
- library-refresh-small-orientation.png: 320×700 orientation and natural long-title/source wrapping.
- library-refresh-css-zoom-200.png: corrected single-column layout under CSS 200% simulation. This does not certify native browser zoom.

The initial inspection caught an intrinsic grid width overflowing the left column and an older selector hiding narrow-screen topic rows; both were fixed and re-examined. A later 200% screenshot exposed an excessively narrow two-column preview despite passing the no-overflow assertion. Container-based width adaptation and matching selection behavior corrected it; the final screenshot and navigation were checked again. All final examined layouts have readable controls with no observed clipping or overlap. A separate read-only reviewer examined the desktop full page and both 390px stages and found no blocking issue.

Computed typography uses a 40px Georgia-led research-name stack, a 21px Segoe UI / Microsoft YaHei-led explanatory title and 15px orientation paragraphs; this records CSS selection, not independent glyph-font proof for the masthead. The existing reader font probe reported Segoe UI and Microsoft YaHei. Reduced motion was enabled in browser tests; transitions also have an explicit reduced-motion override. Test screenshots contain only public content and explicitly synthetic records, with no window chrome or personal reader text.

Still unverified: physical phone/touch/soft keyboard, native browser zoom, other engines and screen-reader output, actual OS clipboard permission, live academic source anchors and physical power-loss behavior. No startup-performance budget was measured. Reader aesthetic acceptance remains separate from these checks. No Git initialization/commit/push, deployment or cloud/model service was added.
