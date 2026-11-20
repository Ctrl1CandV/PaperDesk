# Reader experience specification

This is an implementation direction, not a claim of visual acceptance. It applies the content, layout, typography and rendered-review requirements below. There is no requirement to copy an earlier interface or install a particular skill bundle.

## Taller browsing rows, formal venues, display-only talk page — 2026-11-20

Browsing rows on wide screens are at least 100 px with a wider source column; long journal names use the journal's own abbreviation on the row. In the brief, a venue without a CCF A/B or CAS 1/2 badge is written out in full, and a paper the guide read as a preprint shows its checked formal publication with "导读依据 arXiv …". The talk page is shared on screen, so it carries display material only: speaker notes and their toggle are gone from the page and the handout.

## Roomier shelf rows beside a brief, no section times, map motion — 2026-11-19 (third pass)

With a brief open on a wide screen, the list now takes 0.9 : 1.1 of the row (was 0.74 : 1.26) and each row is at least 88 px with its title, subtitle and source line; search sits on its own line above the type tabs and reading status. The talk page shows only the total length in its header: the route, the map, the section headings and the phone outline carry no per-section time. The overview draws itself from the centre outward and lights a branch under the pointer; the trail to the current stop is drawn heavier. In the following map, new stops and key terms grow out of their parent while their edges draw in, and the camera glides. All motion is off under reduced-motion settings.

## Wider shelf rows and the following map restored — 2026-11-19 (second pass)

At the reader's request the shelf layout takes 94% of the content width on wide screens (max 1800 px). The talk page returns to the structure the reader preferred: the thesis and the whole map at the top (with the order and time of the talk), then a sticky map on the left beside the content on the right. The left map now reuses the animated stage layout: the trunk at the opening, only the current branch open and framed while it is told, the current stop lit with its key terms, every branch at the closing. The full-screen stage, side card and script section described below were removed.

## One-list shelf and the talk as a map stage — 2026-11-19

Supersedes the collection shelf and the telling mode below. Agreed in [the brief](../briefs/2026-11-19-shelf-and-talk-map.md); checks in [project state](PROJECT-STATE.md).

**Shelf.** One list in shelf order, no collection headings, counts or progress, no Explore link beside the title. Collections survive only as search vocabulary (`collectionTerms`, `collectionForQuery` in `src/library/collections.ts`): a query that is exactly a category word or collection title returns that collection; category words also take part in ordinary matching, collection titles do not. The result count appears only while a filter is active.

**Talk page.** The supervisor asked for a short talk that makes the paper's value clear with a mind map, so the map is the page: the thesis on one line, then a stage that fills the screen. The opening draws the paper and its branches with a count of folded stops; a branch opens its stops, a stop opens its key terms, dims the other branches and brings a card beside the map with the sentence to remember, the figure or table (points when there is neither), sources and the guide section. The root opens the closing on value and limits. `←` `→` walk the stops in order and end on the value; fullscreen applies to the stage only and also takes PageUp/PageDown from a clicker. Nodes keep identity and slide to their new layout (CSS transforms and `d` transitions); branches keep their side while unfolding. “全部展开” shows branches and stops but not every key term, so labels stay at projection size (stops ≥15 px at 1440×900). The script below holds the full points, notes and evidence for the speaker and is what prints after the fully unfolded map. Below 560 px the stage is an outline and the card follows it.

## Collections, reader bar, map talks and quick questions — 2026-11-14

Two passes on this date: a refinement pass, then, at the reader's request, a structural pass (collections on the shelf, a sticky reader bar, and talk pages rebuilt as a told mind map). Details and checks are in [project state](PROJECT-STATE.md).

**One type scale.** Font sizes across the stylesheets were folded from about fifty values into ten (12, 13, 14, 15, 16, 18, 20, 24, 28, 32 px); nothing renders below 12 px. Page titles on the shelf, Explore, Notes and Backup share 28 px (24 px on narrow screens); the article title stays 32 px and prose stays at the reader's chosen size. `src/styles/refine.css` is loaded after the page modules and holds this layer's cross-page rules.

**Shelf as collections.** The shelf is grouped into the three public reading collections from [the reading set](../content/RESEARCH-READING-SET.md) (`src/library/collections.ts`): Agent 与大模型基础, 多智能体通信, Agent 与模型评价. Each collection is one surface with its route sentence, a count and an explicit-mark progress line (“导读已读 n / m”, from the reader's own guide marks only), and its articles as aligned rows in reading order: number, title and subtitle, what the article lets you do, and type · venue · year with marks and a talk marker. This follows a dense aligned list (rows, hairlines, column alignment) instead of one floating card per article. Search, type and status share one toolbar row; filtering keeps the grouping and hides empty collections. With a brief open, the rows become compact navigation and the brief takes the larger share. Catalog ranks already follow the collections, so shelf order and keyboard order are unchanged.

**Reader bar.** The tool row is sticky at the top of the article column and always names the current section (number and short label) with a thin reading-progress line under it; the original-paper link moved to the article labels. The contents heading counts the current section (“06 / 13”) and passed sections read as done. Only the AI toggle carries the accent.

**Talk pages** (`/present/:guideId/:revision`). A talk is told as one mind map, not as slides. References examined on 2026-11-14: [markmap](https://markmap.js.org/) (two-sided map, colored branch lines with labels sitting on them; paragraphs, tables and code stay off the map until needed) and [Kumu presentations](https://docs.kumu.io/guides/presentations) (the same map shown with focus and zoom, “to unfold a map step-by-step”, beside text). Applied as:
- *Page*: the thesis and the whole map at reading size (two-sided on wide windows, one-sided when that would shrink key terms below 12 px, an outline on phones), then the talk as web content — each stop a section with its one-sentence message, the guide's original figure, key terms with explanations or a table, its sources, speaker notes and “导读原文”, which opens the reviewed guide section in a dialog. On wide windows a sticky map pane beside the content frames the branch being read and highlights the current stop.
- *Telling*: opening with the trunk only; each part first frames its branch and lists its stops, then each stop highlights its node, unfolds its key terms and shows its content beside the map; a recap shows the full map; the closing gives use, limits and a question. O peeks at the whole map, N shows notes, the rail and stopwatch track planned minutes. Content is sized from the viewport and checked to fit at 1440×900.
- *Content*: `content/presentations/<guideId>.r<revision>.json` — opening, 2–6 parts of stops, closing; only sections, figures and sources of that guide revision. See [the authoring note](../content/workflows/PRESENTATION.md).

**Asking from the article.** A mouse selection inside one section shows “解释这段 / 问 AI / 记笔记” beside it (touch keeps the system menu). “解释这段” opens the panel if needed and sends at once with that passage attached. Above the composer, a one-line row offers questions that send immediately for the current selection or section, plus “有个想法”, which only prepares the composer. A quick question never replaces a written draft; when the service is not connected, the question is placed in the composer instead of being dropped. The empty state keeps the two “answer first” starters.

## Reading workspace — 2026-11-06

Closing the desktop AI panel expands the actual prose into the available space, up to 68rem in a workspace capped at 1920px. Reopening restores the docked columns and 52rem prose limit. At 1100–1199px the closed state restores the chapter/tool sidebar; narrow screens keep the existing drawer and single-column reader. This supersedes the earlier decision to keep prose width unchanged on close. Source content, revision identity and explicit reading marks do not change.

Selection validation errors offer a direct, deliberate **不附带选文，保留问题** action and access to the question's materials. This keeps the question and fixed chapter without sending another request. Connection controls are reserved for connection errors. Unconfirmed sends retain their exact request identity in the in-memory draft across panel close/reopen; this is not durable storage across browser reload.

## Current implementation — 2026-10-30

Guidance and next steps stay present but quiet: they live in existing places (the chapter list, the contents rail, the article end, one hairline row on the home page) in muted text, never as new highlighted cards. Approved guide prose is unchanged; the interface only reveals reviewed fields such as reading targets and related guides. Day and night themes share one structure. Details and checks are in [project state](PROJECT-STATE.md).

## Earlier implementation — 2026-10-26

The frontend redesign and subsequent feedback iteration implement wider workspaces, white reading surfaces with slate tools and ink/indigo hierarchy, stable desktop prose width across AI open/close, fixed per-question materials, and traceable notes/exploration. The library brief presents complete explanatory paragraphs and directly visible chapters, compact bibliography and version information. AI settings group connection, model and search decisions, with a compact composer status and wider primary actions. See the [initial refactor record](../history/FRONTEND-REFACTOR-2026-10-26.md) and [feedback decisions and checks](../history/FRONTEND-FEEDBACK-2026-10-26.md). Earlier W1 feedback and first-release scope below are historical; no new stage approval is implied.

## Home and library

Use a compact header, then Continue reading when a real resume record exists. Otherwise show the first recommended guide with a concrete purpose. Show the fourteen current readings as naturally sized white rows on a distinct grey workspace, with complete titles, research-question subtitles, source type and reviewed topics. Wide browsing also shows the reviewed reading value for comparison. The adjacent brief explains the research problem and contribution, why the work is worth reading, and necessary preparation, reading order and boundaries in two or three complete paragraphs. Keep the original-paper link and concise author/publication information at the top, the single reading-action group before the prose, all chapter links below it, and source edition/version date and guide revision at the end. No Accordion, expanded text, tabs or separate bibliography dialog should hide these card contents. Full author lists and original bibliographic records remain available through the original-paper link. Each chapter in the brief shows its authored reading target beneath it in muted text when one exists, and a single “相关导读” line follows the chapters with any explicit reading marks. Explicit guide/original marks appear as small text on the shelf row and in the brief; a quiet “全部阅读状态” selector filters by guide mark. The home row beneath the heading lists the saved position and, when a direction has a recorded next step, that step; it is a hairline-separated line, not a card. A selected row uses a light tint with an accent edge. Keep visible navigation to Library, Explore and Notes, with local library search; no dashboard of invented counts or empty side panels. A short Explore preview explains the next step from reading to a question. Show public editorial suggestions separately from any real saved explorations; no inferred profile or immediate specialist assignment.

At viewports of at least 1200px, the library heading, list and adjacent brief share a centered width of 85% of the balanced workspace, capped at 1632px. This gives a 1122px library at 1440px and 1428px at 1920px. The list/detail ratio stays unchanged; smaller windows keep the available width and the existing narrow-screen reflow. Explore, direction pages and Notes use the same width rule so page edges stay aligned when switching. The reader uses its own dimensions rather than inheriting this reduction.

## Reading layout

```text
Desktop
  compact navigation / article identity
  section contents | title + orientation + continuous prose | AI discussion and composer
                   | examples / diagrams / tables          | saved question materials

Narrow screen
  back / concise article identity
  collapsed section navigation
  title, orientation, first substantive paragraph
  continuous prose with local-width figures and tables
  AI, source or note dialog when deliberately opened
```

At desktop widths the contents, article and AI discussion form three columns with outer margins that grow on wider windows. The effective reader workspace spans 1320px at a 1440px viewport, 1680px at 1920px, and at most 1920px on larger screens. Prose has a separate 832px maximum measure. These are local layout choices, not a universal occupancy target. The AI column stays reserved when closed to preserve article wrapping and position. Accumulation actions flow beneath the contents rather than appearing as a floating card. The current contents entry expands to “本节要弄清” (the authored reading target) and “留意” (its limit); a collapsed “读…时可以留意” offers three type-specific questions. The article ends with one quiet line for guide/original marks (“标为已读”, “修改记录”) and related guides. AI starters ask the reader to recap or answer first and only fill the composer. Citation chips and type tags are neutral until hover. Between 1100px and 1199px the contents become a compact control above the prose; below 1100px AI opens as a dialog. Below roughly 800px use a single reading column with 16–24px side padding. Source details use an explicit dialog with focus and position return. Compact citations retain their complete original label in accessible text and the source dialog. A 390px viewport must show title, orientation and actual prose rather than a wall of metadata.

Style: warm grey workspace, near-white reading surfaces, dark ink and restrained burgundy for actions and the current location. A header toggle switches day (light header) and night (warm charcoal surfaces, lighter rose accent); without a choice the system setting applies, and teaching diagrams redraw in the active theme. Headings break at phrases; short first table columns never break per character. Table cells wrap only at normal opportunities, so numbers such as 44.1 and words such as WebQuestions stay whole; a table too wide for the column scrolls instead of squeezing its cells. Body 17–18px desktop, 16–18px narrow, line-height about 1.8, left/start alignment. Use system CJK-capable fallbacks and verify actual glyphs; package a licensed font only if actual evidence justifies it. Headings need genuine weight support. English terminology, numbers, punctuation and long titles must wrap naturally. Keep controls legible and touch targets approximately 44px where practical. Reader font adjustment should preserve layout and local table scrolling.

Continuous argument stays visible. Do not hide core mechanisms or essential conditions in accordions. Optional source metadata, supplementary calculation and nonessential background can disclose on demand. No question-shaped heading quota. Keep the guide's actual headings and orientation.

## Source and return behavior

1. A citation opens an accessible source panel/dialog showing locator label, main/background role, known version and URL.
2. Open original launches a new tab with no referrer. Keep the reading tab and scroll position unchanged.
3. If PDF page fragments or a source anchor fail, the visible page/figure/section label is a manual fallback. Do not pretend that a successful HTTP request verifies a locator.
4. Closing the panel restores focus to the invoking citation. Back from an internal related-guide route restores the previous guide, revision and reading position.

Do not embed every PDF or track its scrolling. Original figures that a guide reproduces show their caption, then one quiet line: a link to the original page and a folded “来源与许可 / Source and permission” control. The full rights statement opens on request and appears in the enlarged figure dialog; it is not printed under every figure, because a paragraph of licence text after each figure interrupts reading. Teaching diagrams have an adjacent short label and text explanation. Wide tables/equations scroll only inside their own containers, with keyboard access and a visible overflow cue.

## Exploration experience

With saved records, research directions come first as rows showing stage, question, the latest stage-log entry from the working paper (or the next step) and a few counts. Reading accumulation follows. The three supplied editorial lenses keep their order and rationale; with no records they come first as cards, otherwise they step back to a compact list at the bottom. With none, offer a useful guide target or Create a question, not an empty dashboard. Allow direct custom questions.

A lens explains its context before presenting its prompt. Its self-check is an optional understanding standard, not a gate or score. Directions are normally created in the reading conversation with `/方向`; reading files with `/选文` (see RESEARCH-ASSISTANT.md). Adopting a prompt or 手动新建方向 opens a one-question form and requires Save. A reading selection offers Add to exploration: create a direction from one question about the shown quotation, or attach it to an existing direction; **保存并开始讨论** links the reading conversation to that direction with the question waiting for Send. Cancel preserves the current reading position and creates nothing.

A direction page gives the main column to the working paper (研究工作稿), followed by excerpts and earlier material. One side panel holds the stage and decided next step, the stage log with a one-line “记一笔”, related papers (with the reason only when it adds information, and reading marks), reading files as single rows opened in a viewer, and the folded direction fields and decisions. Actions stay few: “继续讨论” and “编辑方向” in the header, “编辑” and “让 AI 整理” on the paper, the version line opens history, and rare actions (export the project start file, add an excerpt) sit in a “⋯” menu. The conversation opens in a drawer only on request. Do not force long forms or display every technical ID. Source gaps and missing links are visible; auto-generated text never pretends to be the reader's judgment. Editing and navigating away preserve or explicitly handle drafts. Following a guide target and returning restores the exploration and reading position without rewriting its evidence.

On narrow screens use one column, readable excerpts and deliberate editor panels; keyboard and focus-return rules also cover creation/attachment dialogs. The question/evidence/action loop must work without a graph or AI chat.

## Notes and context handoff

Use a deliberately invoked note panel and a small Save action, or visibly indicate draft/autosave behavior backed by actual storage. Notes remain distinct from AI guide prose. Separate Guide status from Original paper status in wording and action placement. No one ambiguous Read button.

The context action takes selected text or the current section plus a new question. Preview shows exactly: paper/source version, guide revision, unit/paragraph locator, the selected text, relevant source links/coverage gaps and the question. Optional personal notes require an explicit checkbox and preview; no whole-library or conversation attachment. Limit preview size (initial cap 12,000 characters) and let the reader shorten it; never silently truncate.

An exploration packet follows EXPLORATION.md: question/evidence/interpretation/unknowns/next action are chosen explicitly, personal text is labeled and previewed, and unrelated notes are excluded.

Copy only after a click and show success only after the clipboard call succeeds. If unsupported/denied, offer a selectable text area and manual copy. A return link uses a neutral relative route in the packet, never an absolute machine path or a local network address. Copying is not resolving the question. The optional reader-triggered AI extension has its own explicit outbound and storage boundaries in AI-READING.md.

## Required states

Empty library, no search match, missing article/revision, unavailable source, broken content validation, formula/diagram failure, long title, long table, note-save error, storage unavailable/quota error, duplicate/import conflict, orphaned note/evidence, empty exploration list, unsaved exploration draft, missing lens/guide, clipboard unavailable, reduced motion, focus-visible and 200% zoom. Errors preserve the user's text and provide a recovery action. Unavailable storage must allow reading without showing false persistence success.

## Visual review

W1 must inspect actual rendered pixels at 1280px and 390px, both first screen and lower content, plus at least one source-open state. W6 adds the longest content, exploration and notes/error states, 200% zoom and keyboard traversal. Record the actual fonts. Fix the largest three visual issues first and inspect again; no repeated screenshot loop once issues are resolved.

Public explanatory articles such as Distill are optional layout-study inputs, not a mandated aesthetic. Their text was consulted during preparation, but browser capture timed out, so this handoff makes no visual benchmarking claim. The implementer must judge its own rendered pages, and the original representative-page feedback gate was completed before this continuation.
