# PaperDesk operations

Specification 1.1. The local platform includes survey guidance, paper assistance, research exploration, personal accumulation and reviewed-content maintenance. W1 reader feedback was accepted before W2–W6. The integrated first version has completed reader acceptance. See ../PROJECT-STATE.md for current checks and history/ for milestone evidence.

## Install, start and rebuild

Run from this project directory. Verified Node 22.23.3 and npm 10.9.9; package.json records the supported engine range. No shell profile, global package, Git repository or cloud credential is required.

```text
npm ci
npm run validate:content
npm test
npm run typecheck
npm run build
npm start
```

`npm start` starts the built website and AI service together, then opens `http://127.0.0.1:4173/library`. Keep the terminal open; Ctrl+C stops both services. `/library`, `/explore`, `/notes` and `/backup` are the main entries. `npm run dev` runs the development site with AI, and `npm run preview` runs the built site with AI without automatically opening a browser. Either accepts `-- --open`; `npm start -- --no-open` suppresses opening. If build files are missing or frontend source has changed, run `npm run build` first; `npm start` does not rebuild automatically.

For AI, open a deep reader and select the provider/connection control beside the AI input to open **AI 设置**. **ChatGPT 订阅 → 连接 ChatGPT 订阅** opens official authorization; the backend remembers the chosen connection and refreshes it when possible. Once connected, select an available model and save it. Alternatively choose **API**, fill Base URL, Model ID and API Key, then save; the ignored `server/config.local.json` file is updated and the next question uses the new configuration without restarting. Blank Key preserves an existing key. If another provider is selected, use **使用此 API** to switch explicitly. `search.apiKey` remains a separate optional Tavily key in that backend file; empty disables web search while guide/library questions remain available. Full steps and data boundaries are in [AI reading](AI-READING.md). After dependency changes, stop the service and run `npm ci` before rebuilding. Shutdown may wait for an in-flight credential refresh to be saved; allow the launcher to finish instead of closing its terminal immediately.

For a backup API, save the API form while keeping ChatGPT selected, then leave **ChatGPT 订阅 → 额度用尽时使用备用 API** enabled. This switch saves independently of the model list. Only an explicit subscription/application usage-limit error uses the API, which may incur its own charges; network failures and ordinary rate limits do not. Each question starts with ChatGPT and can switch once. The answer shows its actual provider/model and separately retains any unfinished subscription text. AI exports now use version 2; this build still imports version 1, while older builds cannot import version 2. Browser backups are unchanged.

Under **ChatGPT 订阅 → 使用状态**, **未确认** means no successful request has yet established availability in this service session. An explicit subscription/application quota error shows **当前不可用（额度已达上限）**. A later successful ChatGPT answer restores **可用**; the time and model identify that observation. **尝试连接 / 重新尝试** sends one short request to confirm recovery and may consume a small amount of subscription usage. Save model changes first. No article, notes or conversation history are sent by this check, and it cannot use the backup API. Closing settings cancels the check. **刷新状态** reads the existing local result without a new inference request. Opening settings does not automatically check. The official Usage link remains for allowance details; numeric five-hour/weekly balances are not available through the current published SIWC contract.

The website binds to loopback 4173 and AI to loopback 4176. Startup fails on occupied ports and cleans up only the services started by that invocation; it never stops an existing server. Stop a previous project terminal with Ctrl+C before starting another. Do not switch to localhost or a random port for normal reading: browser records belong to the exact scheme, host and port. Development and preview cannot run on 4173 simultaneously. For frontend-only operation use `npm run dev:web` or `npm run preview:web`; the separate `npm run ai` command remains available for manual operation. Browser tests use `dev:web` on 4174 and do not open the personal AI database; that origin rejects AI API requests instead of proxying them to the normal service.

The AI backend automatically uses Windows system proxy decisions for its outgoing requests. Keep the existing proxy application running; no proxy address or fixed port needs to be entered in PaperDesk. Existing explicit environment proxies take precedence, and local website/backend traffic stays direct. The proxy application continues to apply its own rules. See [system network proxy](AI-READING.md#system-network-proxy) for routing precedence and limits. After updating the project, stop the old project launcher, run `npm run build`, and restart with `npm start`.

On Windows, stop the project's servers before reinstalling dependencies; loaded native build files may be locked. Dependencies and `.cache/npm/` are project-local. With the cache already populated, `npm ci --offline --no-audit` works; a first install needs registry access. Keep package-lock.json and use npm ci for repeatable installs. No deployment is performed by these commands.

## Read and accumulate

The library searches local/original titles and reviewed primary topic labels/aliases only. Use All / Surveys / Papers to distinguish article types. Select an article to inspect its bibliographic identity, learning value, prerequisites and coverage, then choose “进入深入阅读”. Desktop places orientation beside the list; narrow screens show it separately with “返回筛选结果”. Choosing orientation creates no reading state. Returning from reading restores the query/type/selection and reading-list position/focus. Fourteen current readings retain their distinct structures, citations and explicit coverage boundaries. A reader route is pinned to `/read/<id>/<revision>#<unit>`; a missing revision is explained instead of silently replaced. The original three readings and concept-drift survey select metadata revision 2 and retain revision 1; the other ten current readings use revision 1.

Scrolling saves the most recent unit and its approximate relative position. Home offers a real saved position only after one exists. Reload and continuing reading restore it; explicit chapter links go to the chapter. These position records never mark a guide or paper read. In “阅读记录”, the guide and the specific original source version can be marked independently.

Select a passage within one section, then choose “记笔记”, “加入探索” or “复制上下文”. Without a selection, these actions use the current section. The toolbar states which context is active. Clear the selection to return to section context. A passage crossing section boundaries is not adopted as a new selection; select within one section. Long notes/excerpts are bounded by the backup schema. Oversized note excerpts can be deliberately removed while preserving the written note; no silent excerpt truncation occurs.

Notes and explorations are saved only through explicit controls and acknowledged after the storage transaction and readback. Clicking outside an editor, Escape and Close retain changed session drafts; “丢弃草稿” explicitly discards them. Clicking blank space inside an editor does not cancel it, and saving/copying prevents accidental dismissal. Note drafts are bound to their exact selection or chapter; “本章其他草稿” lets you deliberately resume a different passage draft. Editors keep unsaved drafts in memory across local navigation. They warn before reload/close while drafts exist, but the browser controls whether that warning is shown. Drafts are not durable records: save, copy or download them before closing the browser. After a two-tab conflict, compare the saved version and keep a separate copy or deliberately use the saved version; no silent last-write-wins replacement of notes/questions occurs.

Exploration offers the supplied editorial lenses before personal records exist. Opening a lens does not create a personal interest or question. Adopt and edit a suggested question, or create your own; save evidence as a guide excerpt, manually attributed original excerpt, or reader observation. Save an interpretation, unknowns and a next action independently. Read next-action targets and use Back to return. Deferral and archive statuses are explicit choices; none certifies novelty, correctness or mastery.

In an exploration, “寻找下一步阅读” opens local assistance. Deliberately include the question/unknowns, edit the reading goal/concepts, and retrieve matching reviewed sections. Inspect the reason, reading purpose, limitation and explicit reading states before choosing “设为下一步”. That action updates the existing exploration next action and is covered by normal backup/conflict handling. Changing inputs makes previous results stale until rerun. No suitable local match is reported honestly. The editable “文献检索任务” can be copied or deliberately saved as a next action, but does not execute external search.

Further papers do not need to be discovered automatically by the website. Select the relevant notes/exploration fields in an editable context packet, or prepare a literature-search brief, and give the chosen material and reading question to an assistant. The assistant can search public scholarly sources, verify candidates, prepare reviewed explanations, and add them through the versioned content-update workflow below. Keep private notes and reasoning out of public content packages; use public concepts and criteria for external search rather than silently transmitting the whole packet. See ASSISTED-DISCOVERY.md for the complete loop and the distinction between a verified candidate and a ready-to-read local explanation.

## Back up and restore

This section covers browser records. AI conversations use the separate backend store and separate controls in the reader's AI panel; they are not included in “导出完整备份” below. See [AI reading](AI-READING.md) for backend configuration, start commands, AI backup and recovery. Clearing browser records does not clear backend conversations.

Use `/backup` → “导出完整备份”. Confirm that the browser download actually completed. The file contains notes, exploration questions/evidence/actions, resume locations, independent reading marks and reading preferences. It may contain private text; keep it outside public content packages, source fixtures and reports.

Choose a PaperDesk v1 JSON file to preview. Merely choosing/preparing it changes nothing. Review duplicate counts, conflicts, unavailable reading targets and missing linked notes before applying. Note/question conflicts default to keeping both; position/status/settings conflicts default to keeping local values. Cancel is read-only. If local records change after preview, re-preview rather than applying stale choices.

The strict schema rejects unsupported versions, unknown fields, unsafe URLs, invalid timestamps/identifiers, duplicate keys and oversized data before writing. Each complete backup and the resulting merged collection must fit 5 MiB. Export uses compact JSON so formatting cannot make a valid collection too large to restore. Import is transactional; a failure leaves previous records intact. Missing guide versions or deleted linked notes do not delete saved quotations or provenance.

“清除本地记录” requires its own explicit confirmation. It clears this origin's durable records/settings only. Export first if they are needed. Unsaved in-session editor buffers are separate and should be saved/exported or deliberately canceled before a cleanup. Browser data clearing or storage eviction can remove IndexedDB without the application being able to recover it. There is no synchronization or offline guarantee.

## Copy selected context

Reading packets include the chosen guide text, source identity/version, relevant source locators, guide revision, relative return position and coverage gaps. Optional personal notes start unchecked. Exploration packets start without personal fields; select each question/interpretation/unknown/action/evidence field to include it. Original excerpts retain their manual-attribution qualification.

The complete preview is editable and is exactly what the copy action submits. When it has been manually edited, changing selections or the question requires an explicit choice: “按当前选项重建预览” or “继续使用手改预览”. Closing retains the session preview/draft; optional notes arriving later do not overwrite manual edits. Restored optional-note selections must finish loading before rebuilding/copying against them. Over 12,000 characters disables automatic copying and explains how to shorten it; nothing is silently truncated. Clipboard denial leaves a selectable manual-copy fallback. No content is sent to a model or service.

## Add and revise reviewed content

Follow CONTENT.md and CONTENT-UPDATES.md. Content production and scholarly review occur outside this consuming application. Prepare a deliberate project-relative directory such as `incoming/release-one/`, containing a complete proposed catalog, all retained guide revisions/assets and all retained exploration seeds. Never include private notes or authoring context. The importer does not download or execute a package.

```text
npm run import:content -- --from incoming/release-one --dry-run
npm run import:content -- --from incoming/release-one --apply
npm run validate:content
npm run build
npm run preview
```

Use a new revision and distinct file paths for changed metadata, claims, citations, body or assets. Keep all published revisions and old reading-unit IDs when they still refer to the same material. Set current guide/seed pointers deliberately. Same-key changed immutable content is rejected even when its Markdown hash is unchanged. New guide/lens content needs no reader component edits. The importer stages immutable files then atomically switches one validated catalog. Stop development/preview before applying and restart after building, so no reader sees intermediate development HMR changes. Content updates never migrate or rewrite personal records.

For interruption recovery, inspect first, then apply after the importer process has stopped:

```text
npm run import:content -- --recover
npm run import:content -- --recover --apply
```

For a deliberate selection rollback after a successful update:

```text
npm run import:content -- --rollback
npm run import:content -- --rollback --apply
npm run validate:content
npm run build
```

Rollback restores earlier selections while retaining immutable published revisions. It does not roll back personal thinking. Do not edit journals or hashes to force recovery. See CONTENT-UPDATES.md for locks, backup receipts, before/after-switch behavior and filesystem limitations.

## Test and troubleshoot

Install the isolated browser with PowerShell if absent:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/playwright'
npm exec -- playwright install chromium --only-shell
npm run test:e2e
```

The suite uses fresh synthetic browser contexts on strict port 4174, never the normal preview profile. With production preview running, use `node tests/preview-smoke.mjs`. `node tests/content-update-browser.mjs` uses a separate project-local copy and port 4175 to test content changes alongside persistent synthetic records. Do not run two instances of the same test server. A sandbox may require local process/network permission; report actual failures rather than skipping silently.

Screenshots are webpage pixels only in ignored `docs/evidence/*.png`; curated images are in `docs/images/`. Browser binaries and test artifacts are grouped under `.cache/`. Narrow viewports and CSS zoom are simulations, not phone or native-browser-zoom certification. External document opening is mocked; actual source availability and locator behavior require separate checking. No real user notes are needed for tests.

- Port occupied: stop the known project server; do not silently change the reading origin.
- Storage failure: continue reading, preserve drafts with copy/download, and export existing records if possible. Never interpret a failed save as success.
- Import rejected: keep active content unchanged, read the relative validation message and correct the proposed package. A stale transaction requires the documented recovery.
- Source did not reach its anchor: use the citation's version and manual section/figure/PDF page locator.
- Large production chunks: currently a known local Mermaid/math bundle cost. Build success does not imply a performance budget has been met.

PROJECT-STATE.md identifies the next work. Do not initialize Git, publish, deploy or add cloud services as part of ordinary maintenance without separate authorization.
