# Reader experience specification

This is an implementation direction, not a claim of visual acceptance. It applies the content, layout, typography and rendered-review requirements below. There is no requirement to copy an earlier interface or install a particular skill bundle.

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

Style: warm grey workspace, near-white reading surfaces, dark ink and restrained burgundy for actions and the current location. A header toggle switches day (light header) and night (warm charcoal surfaces, lighter rose accent); without a choice the system setting applies, and teaching diagrams redraw in the active theme. Headings break at phrases; short first table columns never break per character. Body 17–18px desktop, 16–18px narrow, line-height about 1.8, left/start alignment. Use system CJK-capable fallbacks and verify actual glyphs; package a licensed font only if actual evidence justifies it. Headings need genuine weight support. English terminology, numbers, punctuation and long titles must wrap naturally. Keep controls legible and touch targets approximately 44px where practical. Reader font adjustment should preserve layout and local table scrolling.

Continuous argument stays visible. Do not hide core mechanisms or essential conditions in accordions. Optional source metadata, supplementary calculation and nonessential background can disclose on demand. No question-shaped heading quota. Keep the guide's actual headings and orientation.

## Source and return behavior

1. A citation opens an accessible source panel/dialog showing locator label, main/background role, known version and URL.
2. Open original launches a new tab with no referrer. Keep the reading tab and scroll position unchanged.
3. If PDF page fragments or a source anchor fail, the visible page/figure/section label is a manual fallback. Do not pretend that a successful HTTP request verifies a locator.
4. Closing the panel restores focus to the invoking citation. Back from an internal related-guide route restores the previous guide, revision and reading position.

Do not embed every PDF or track its scrolling. No original figures have been bundled; a source link is not an inline viewed original figure. Teaching diagrams have an adjacent short label and text explanation. Wide tables/equations scroll only inside their own containers, with keyboard access and a visible overflow cue.

## Exploration experience

With saved records, My explorations comes first with question, evidence count and next action. The three supplied editorial lenses remain a separate area with their order/rationale and reading targets; with no records, the editorial area comes first. With none, offer a useful guide target or Create a question, not an empty dashboard. Allow direct custom questions.

A lens explains its context before presenting its prompt. Its self-check is an optional understanding standard, not a gate or score. Directions are normally created in the reading conversation with `/方向`; reading files with `/选文` (see RESEARCH-ASSISTANT.md). Adopting a prompt or 手动新建方向 opens a one-question form and requires Save. A reading selection offers Add to exploration: create a direction from one question about the shown quotation, or attach it to an existing direction; **保存并开始讨论** links the reading conversation to that direction with the question waiting for Send. Cancel preserves the current reading position and creates nothing.

A direction page gives priority to the direction and its core question, the stage track, and “现在可以做什么” (one to three concrete steps derived from the record). The overview and confirmed decisions, accumulated discussion and excerpts follow; a side column lists related papers (with the reason each is related and reading marks) and reading files with versions. The conversation opens in a drawer only on request; low-frequency tools sit under “更多”. Do not force long forms or display every technical ID. Source gaps and missing links are visible; auto-generated text never pretends to be the reader's judgment. Editing and navigating away preserve or explicitly handle drafts. Following a guide target and returning restores the exploration and reading position without rewriting its evidence.

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
