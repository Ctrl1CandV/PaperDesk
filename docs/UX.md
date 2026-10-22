# Reader experience specification

This is an implementation direction, not a claim of visual acceptance. It applies the content, layout, typography and rendered-review requirements below. There is no requirement to copy an earlier interface or install a particular skill bundle.

## Home and library

Use a compact header, then Continue reading when a real resume record exists. Otherwise show the first recommended guide with a concrete purpose. Under it show the three ordered guide entries: title, what it explains, source type and honest coverage. Keep visible navigation to Library, Explore and Notes, with local library search; no dashboard of invented counts or empty side panels. A short Explore preview explains the next step from reading to a question. Show public editorial suggestions separately from any real saved explorations; no inferred profile or immediate specialist assignment.

## Reading layout

```text
Desktop
  compact navigation / article identity
  section contents | title + orientation + continuous prose | source details when opened
                   | examples / diagrams / tables          | (otherwise absent)

Narrow screen
  back / concise article identity
  collapsed section navigation
  title, orientation, first substantive paragraph
  continuous prose with local-width figures and tables
  source or note dialog when deliberately opened
```

At desktop widths reserve roughly 190–230px for the contents, 640–760px for the article, and 280–340px for an optional source panel only when there is enough space. These are starting ranges, not rigid columns. At intermediate widths the source panel becomes a dialog; never shrink the article to preserve three columns. Below roughly 800px use a single reading column with 16–24px side padding. A 390px viewport must show title, orientation and actual prose rather than a wall of metadata.

Initial style: near-white neutral background, dark ink, restrained blue/teal links and a few spacing levels. Body 17–18px desktop, 16–18px narrow, line-height about 1.8, left/start alignment. Use system CJK-capable fallbacks and verify actual glyphs; package a licensed font only if actual evidence justifies it. Headings need genuine weight support. English terminology, numbers, punctuation and long titles must wrap naturally. Keep controls legible and touch targets approximately 44px where practical. Reader font adjustment should preserve layout and local table scrolling.

Continuous argument stays visible. Do not hide core mechanisms or essential conditions in accordions. Optional source metadata, supplementary calculation and nonessential background can disclose on demand. No question-shaped heading quota. Keep the guide's actual headings and orientation.

## Source and return behavior

1. A citation opens an accessible source panel/dialog showing locator label, main/background role, known version and URL.
2. Open original launches a new tab with no referrer. Keep the reading tab and scroll position unchanged.
3. If PDF page fragments or a source anchor fail, the visible page/figure/section label is a manual fallback. Do not pretend that a successful HTTP request verifies a locator.
4. Closing the panel restores focus to the invoking citation. Back from an internal related-guide route restores the previous guide, revision and reading position.

Do not embed every PDF or track its scrolling. No original figures have been bundled; a source link is not an inline viewed original figure. Teaching diagrams have an adjacent short label and text explanation. Wide tables/equations scroll only inside their own containers, with keyboard access and a visible overflow cue.

## Exploration experience

The Explore page starts with the three supplied editorial lenses and their order/rationale, reading targets and next actions; a distinct My explorations area shows only actual saved records. With none, offer a useful guide target or Create a question, not an empty dashboard. Allow direct custom questions.

A lens explains its context before presenting its prompt. Its self-check is an optional understanding standard, not a gate or score. Adopting a prompt opens an editable preview and requires Save. A reading selection offers Add to exploration: choose an existing record or create one, inspect quotation/provenance/source locations, then save. Cancel preserves the current reading position and creates nothing.

An exploration detail gives priority to question, evidence with readable attribution and pinned return links, reader interpretation/unknowns, next action and explicit status. Do not force long forms or display every technical ID. Source gaps and missing links are visible; auto-generated text never pretends to be the reader's judgment. Editing and navigating away preserve or explicitly handle drafts. Following a guide target and returning restores the exploration and reading position without rewriting its evidence.

On narrow screens use one column, readable excerpts and deliberate editor panels; keyboard and focus-return rules also cover creation/attachment dialogs. The question/evidence/action loop must work without a graph or AI chat.

## Notes and context handoff

Use a deliberately invoked note panel and a small Save action, or visibly indicate draft/autosave behavior backed by actual storage. Notes remain distinct from AI guide prose. Separate Guide status from Original paper status in wording and action placement. No one ambiguous Read button.

The context action takes selected text or the current section plus a new question. Preview shows exactly: paper/source version, guide revision, unit/paragraph locator, the selected text, relevant source links/coverage gaps and the question. Optional personal notes require an explicit checkbox and preview; no whole-library or conversation attachment. Limit preview size (initial cap 12,000 characters) and let the reader shorten it; never silently truncate.

An exploration packet follows EXPLORATION.md: question/evidence/interpretation/unknowns/next action are chosen explicitly, personal text is labeled and previewed, and unrelated notes are excluded.

Copy only after a click and show success only after the clipboard call succeeds. If unsupported/denied, offer a selectable text area and manual copy. A return link uses a neutral relative route in the packet, never an absolute machine path or a local network address. Copying is not resolving the question. Online model calls remain outside the website.

## Required states

Empty library, no search match, missing article/revision, unavailable source, broken content validation, formula/diagram failure, long title, long table, note-save error, storage unavailable/quota error, duplicate/import conflict, orphaned note/evidence, empty exploration list, unsaved exploration draft, missing lens/guide, clipboard unavailable, reduced motion, focus-visible and 200% zoom. Errors preserve the user's text and provide a recovery action. Unavailable storage must allow reading without showing false persistence success.

## Visual review

W1 must inspect actual rendered pixels at 1280px and 390px, both first screen and lower content, plus at least one source-open state. W6 adds the longest content, exploration and notes/error states, 200% zoom and keyboard traversal. Record the actual fonts. Fix the largest three visual issues first and inspect again; no repeated screenshot loop once issues are resolved.

Public explanatory articles such as Distill are optional layout-study inputs, not a mandated aesthetic. Their text was consulted during preparation, but browser capture timed out, so this handoff makes no visual benchmarking claim. The implementer must judge its own rendered pages, and the representative-page feedback gate remains mandatory.
