# PaperDesk operations

## Research assistant extension

Use the same `npm run build` and `npm start` commands. In the reading AI panel choose a current exploration, or open the assistant from an exploration detail. Explicitly enable that topic's research context before sending; select individual notes and saved documents when needed, checking the previewed revisions. Use the recent-conversation action or history to continue an existing discussion. Full responses can offer changes to adopt or be saved as research documents. The exploration's document area can prepare an implementation-file request, and saved documents download directly as Markdown with source excerpts. Fixed task versions and receipt import remain optional expanded features. See [workflow and limitations](RESEARCH-ASSISTANT.md).

Before a downgrade, export current personal archive v3 and AI backup v4 separately, stop the service, and preserve upgraded data. IndexedDB layout 3 retains a pre-research record copy available on the backup page; SQLite layout 3 creates a verified pre-v3 copy when upgrading layout 2. Recover those older snapshots in a separate old-version working copy/origin; they exclude later changes. Never decrement version markers or delete research fields to force compatibility. Original materials and credentials keep their existing independent boundaries. Task and receipt downloads are private handoff files and must not be committed as public content.

Specification 1.1. The local platform includes survey guidance, paper assistance, research exploration, personal accumulation and reviewed-content maintenance. W1 reader feedback was accepted before W2–W6. The integrated first version has completed reader acceptance. See [project state](PROJECT-STATE.md) for current checks and [history](../history/README.md) for milestone evidence.

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

For a backup API, save the API form while keeping ChatGPT selected, then leave **ChatGPT 订阅 → 额度用尽时使用备用 API** enabled. This switch saves independently of the model list. Only an explicit subscription/application usage-limit error uses the API, which may incur its own charges; network failures and ordinary rate limits do not. Each question starts with ChatGPT and can switch once. The answer shows its actual provider/model and separately retains unfinished subscription text. AI exports use v4 NDJSON when research conversations exist, otherwise v3; legacy v1/v2 JSON import is retained. Personal chunk exports use v3, while small non-research collections can still use v1 JSON; v1/v2/v3 personal imports remain supported. Original materials have a third backup workflow below.

Under **ChatGPT 订阅 → 使用状态**, **未确认** means no successful request has yet established availability in this service session. An explicit subscription/application quota error shows **当前不可用（额度已达上限）**. A later successful ChatGPT answer restores **可用**; the time and model identify that observation. **尝试连接 / 重新尝试** sends one short request to confirm recovery and may consume a small amount of subscription usage. Save model changes first. No article, notes or conversation history are sent by this check, and it cannot use the backup API. Closing settings cancels the check. **刷新状态** reads the existing local result without a new inference request. Opening settings does not automatically check. The official Usage link remains for allowance details; numeric five-hour/weekly balances are not available through the current published SIWC contract.

The website binds to loopback 4173 and AI to loopback 4176. Startup fails on occupied ports and cleans up only the services started by that invocation; it never stops an existing server. Stop a previous project terminal with Ctrl+C before starting another. Do not switch to localhost or a random port for normal reading: browser records belong to the exact scheme, host and port. Development and preview cannot run on 4173 simultaneously. For frontend-only operation use `npm run dev:web` or `npm run preview:web`; the separate `npm run ai` command remains available for manual operation. Browser tests use `dev:web` on 4174 and do not open the personal AI database; that origin rejects AI API requests instead of proxying them to the normal service.

The AI backend automatically uses Windows system proxy decisions for its outgoing requests. Keep the existing proxy application running; no proxy address or fixed port needs to be entered in PaperDesk. Existing explicit environment proxies take precedence, and local website/backend traffic stays direct. The proxy application continues to apply its own rules. See [system network proxy](AI-READING.md#system-network-proxy) for routing precedence and limits. After updating the project, stop the old project launcher, run `npm run build`, and restart with `npm start`.

On Windows, stop the project's servers before reinstalling dependencies; loaded native build files may be locked. Dependencies and `.cache/npm/` are project-local. With the cache already populated, `npm ci --offline --no-audit` works; a first install needs registry access. Keep package-lock.json and use npm ci for repeatable installs. No deployment is performed by these commands.

## Read and accumulate

The library filters local/original titles and reviewed topic labels/aliases; AI original-source retrieval is a separate operation. Use All / Surveys / Papers to distinguish article types. Select an article to inspect identity, value, prerequisites and coverage, then choose “进入深入阅读”. Desktop places orientation beside the list; narrow screens show it separately with “返回筛选结果”. Choosing orientation creates no reading state. Returning restores query/type/selection and reading-list position/focus. The 2026-10-27 upgrade has fourteen current readings and twenty-one retained revisions, including new r2 versions of the memory survey, StreamingLLM and RAG. The catalog determines the current recommendation. A reader route stays pinned to `/read/<id>/<revision>#<unit>`; missing revisions are explained instead of silently replaced. Bodies load on demand with loading/retry states; old version routes remain readable.

Scrolling saves the most recent unit and its approximate relative position. Home offers a real saved position only after one exists. Reload and continuing reading restore it; explicit chapter links go to the chapter. These position records never mark a guide or paper read. In “阅读记录”, the guide and the specific original source version can be marked independently.

Select a passage within one section, then choose “记笔记”, “加入探索” or “复制上下文”. Without a selection, these actions use the current section. The toolbar states which context is active. Clear the selection to return to section context. A passage crossing section boundaries is not adopted as a new selection; select within one section. Long notes/excerpts are bounded by the backup schema. Oversized note excerpts can be deliberately removed while preserving the written note; no silent excerpt truncation occurs.

Notes and explorations are saved only through explicit controls and acknowledged after the storage transaction and readback. Clicking outside an editor, Escape and Close retain changed session drafts; “丢弃草稿” explicitly discards them. Clicking blank space inside an editor does not cancel it, and saving/copying prevents accidental dismissal. Note drafts are bound to their exact selection or chapter; “本章其他草稿” lets you deliberately resume a different passage draft. Editors keep unsaved drafts in memory across local navigation. They warn before reload/close while drafts exist, but the browser controls whether that warning is shown. Drafts are not durable records: save, copy or download them before closing the browser. After a two-tab conflict, compare the saved version and keep a separate copy or deliberately use the saved version; no silent last-write-wins replacement of notes/questions occurs.

Exploration offers the supplied editorial lenses before personal records exist. Opening a lens does not create a personal interest or question. Adopt and edit a suggested question, or create your own; save evidence as a guide excerpt, manually attributed original excerpt, or reader observation. Save an interpretation, unknowns and a next action independently. Read next-action targets and use Back to return. Deferral and archive statuses are explicit choices; none certifies novelty, correctness or mastery.

In an exploration, “寻找下一步阅读” opens local assistance. Deliberately include the question/unknowns, edit the reading goal/concepts, and retrieve matching reviewed sections. Inspect the reason, reading purpose, limitation and explicit reading states before choosing “设为下一步”. That action updates the existing exploration next action and is covered by normal backup/conflict handling. Changing inputs makes previous results stale until rerun. No suitable local match is reported honestly. The editable “文献检索任务” can be copied or deliberately saved as a next action, but does not execute external search.

Further papers do not need to be discovered automatically by the website. Select the relevant notes/exploration fields in an editable context packet, or prepare a literature-search brief, and give the chosen material and reading question to an assistant. The assistant can search public scholarly sources, verify candidates, prepare reviewed explanations, and add them through the versioned content-update workflow below. Keep private notes and reasoning out of public content packages; use public concepts and criteria for external search rather than silently transmitting the whole packet. See ASSISTED-DISCOVERY.md for the complete loop and the distinction between a verified candidate and a ready-to-read local explanation.

## Back up and restore

This section covers browser records. AI conversations use the separate backend store and separate controls in the reader's AI panel; they are not included in “导出完整备份” below. See [AI reading](AI-READING.md) for backend configuration, start commands, AI backup and recovery. Clearing browser records does not clear backend conversations.

Use `/backup` → “导出完整备份”. Confirm that the browser download actually completed. The file contains notes, exploration questions/evidence/actions, resume locations, independent reading marks and reading preferences. It may contain private text; keep it outside public content packages, source fixtures and reports.

Choose a personal v1 JSON or v2/v3 `.jsonl` archive to preview. Selection/preparation changes no live records; v2/v3 use temporary staging space. Review duplicates, conflicts, unavailable targets and missing notes before applying. Note/question conflicts default to keeping both; position/status/settings conflicts default to keeping local values. Cancel discards the prepared preview. If local records change, re-preview rather than applying stale choices.

Strict validation rejects unsupported versions, unknown fields, unsafe URLs, invalid times/IDs, duplicate keys and oversized records. v1 JSON remains limited to 5 MiB. Live records may reach 512 MiB subject to browser quota, with separate single-record/field limits; larger or research-containing exports use v3 (768 MiB transport cap). v2/v3 import validates ordered chunks/checksums/footer before one conflict-aware live transaction. Missing guide versions or linked notes retain quotations/provenance. The exporter avoids a giant JavaScript JSON string but retains a complete browser-managed download Blob and an IDB snapshot, so extra memory/quota is still required. See [records](RECORDS.md) for migration, downgrade and interrupted-stage cleanup.

“清除本地记录” requires its own explicit confirmation. It clears this origin's durable records/settings only. Export first if they are needed. Unsaved in-session editor buffers are separate and should be saved/exported or deliberately canceled before a cleanup. Browser data clearing or storage eviction can remove IndexedDB without the application being able to recover it. There is no synchronization or offline guarantee.

### AI history, capacity and recovery

Use the AI panel's **备份与恢复** for conversations. v3/v4 NDJSON downloads use a consistent temporary SQLite snapshot; import validates in a separate SQLite stage and commits once, rejecting any conversation/turn/request ID collision. A preview does not reserve IDs; confirmation revalidates against current data. Legacy JSON imports remain bounded to 16 MiB. Restore never starts model inference. History pages contain compact summaries and a cursor; use **读取完整问答与…条依据** for full saved evidence instead of assuming the preview is the complete answer.

Large AI downloads require the browser's File System Access save picker, which pipes to a selected file. The fallback Blob path is capped at 32 MiB; without direct-save support, the interface asks for a supporting desktop Chrome/Edge browser. Confirm completion before relying on the file. This AI download path differs from the personal-record Blob exporter described above.

AI layout v3 tracks serialized bytes and running-turn reservations incrementally. Backend settings in `server/config.example.json` now include `contextTokenLimit: 32768`, `storageCapacityMiB: 512` and `minimumFreeMiB: 32`; the latter two default to 512 MiB logical capacity and a 32 MiB free-space guard. Stop the service before manual configuration edits and restart to apply store limits. These counters exclude SQLite/index/journal/temp-file overhead; leave room for whole snapshot/staging copies. A low-disk rejection preserves existing records; free space or export/organize data deliberately rather than repeatedly retrying writes. Configuration bounds and provider-budget limitations are in [AI reading](AI-READING.md#backend-configuration).

The research upgrade v2→v3 creates a checked pre-v3 copy. Before the earlier SQLite v1→v2 migration, the backend creates and checks a `paperdesk.sqlite.pre-v2-<id>.sqlite` recovery copy. Keep it until recovery is verified. Downgrade requires stopping the service, preserving the upgraded data and restoring that old copy separately; it excludes new edits. Do not change `user_version` manually. Normal transfer completion/cancellation deletes its generated `ai-export-<id>.sqlite`/`ai-import-<id>.sqlite` files, but a killed process may leave them. With the backend stopped, identify exact abandoned transfer files and their own journals before removing them. Never apply wildcard cleanup to `private/ai/`, live journals, credentials or pre-migration backups.

### Local original papers and evidence

The CLI consumes a deliberately acquired **project-local** PDF/HTML file. It does not download URLs or call a model. Fix the actual paper version, URL and identity first; a URL string alone is not evidence that the file came from that version. Do not import private notes as paper sources. Example for the fixed public RAG material used by this upgrade:

```text
npm run reading:materials -- import --file .cache/upgrade/originals/rag.pdf --format pdf --paper-id arxiv:2005.11401 --source-id rag-neurips2020-pdf --title "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" --version "NeurIPS 2020 camera-ready" --url "https://proceedings.neurips.cc/paper/2020/file/6b493230205f780e1bc26945df7481e5-Paper.pdf"
npm run reading:materials -- status
npm run reading:materials -- reindex
```

Use `--directory <project-local-directory>` when working with an isolated materials collection. Import validates file type and a 64 MiB per-material cap, preserves content-addressed raw bytes, writes a versioned manifest and parsed units, then refreshes the index. Reusing the same fixed source identity with different bytes/version is rejected; use an explicit new source revision. An interrupted import keeps original bytes and its job state, and can retry the same identity. `partial` means text was extracted with gaps, not a fully reviewed paper. HTML external images are not automatically acquired; PDF tables/formulas/page labels still require visual checks. No imported raw HTML executes in the website origin.

For a PDF retained specifically for visual checking alongside an indexed HTML version, add **`--reference-only`** on its first import with a separate source ID. This writes the optional manifest boolean `referenceOnly: true` (absent means false). It preserves the actual PDF, its hash, manifest and derived data for review/backup, while excluding its units from text retrieval so HTML/PDF duplicates do not compete for candidate slots. For example:

```text
npm run reading:materials -- import --file .cache/upgrade/originals/streamingllm.pdf --format pdf --paper-id arxiv:2309.17453 --source-id streamingllm-v4-pdf-reference --title "StreamingLLM" --version v4 --url "https://arxiv.org/pdf/2309.17453v4" --reference-only
```

Material purpose participates in `indexGeneration`. An existing source ID cannot be reused to change between searchable and reference-only purpose; create a distinct fixed source revision instead of editing its manifest. This upgrade uses three searchable originals (618 parsed units: two HTML papers and the RAG PDF) plus two separately retained visual-reference PDFs for StreamingLLM v4 and the memory survey v1. The 30-question retrieval corpus remains the same three searchable originals. Merely retaining a reference PDF does not mean its images have been inspected or its parser output reviewed.

Reviewed claim mappings are separate JSON files conforming to `schemas/reading-evidence-v1.schema.json`. They must identify the precise guide revision/unit, original source/parser/units, conditions, attribution and an honest AI/human review scope. For example, after creating a checked record in `incoming/reading-evidence/claim.json`:

```text
npm run reading:materials -- evidence --file incoming/reading-evidence/claim.json
npm run reading:materials -- reindex
```

Ingestion/reindex does not promote `unreviewed` parser output to reviewed evidence, alter old question sources, change reading marks or invoke models. The index can be regenerated from canonical files; do not delete raw/derived/manifests/evidence when cleaning an index.

### Back up original materials separately

Stop concurrent ingestion/evidence writes before these offline operations. Use a **new** destination every time. Both paths must stay inside this project:

```text
npm run reading:materials -- backup --directory private/reading --to private/reading-backups/reading-2026-10-27
npm run reading:materials -- restore --from private/reading-backups/reading-2026-10-27 --directory private/reading-restored-2026-10-27
npm run reading:materials -- status --directory private/reading-restored-2026-10-27
npm run reading:materials -- reindex --directory private/reading-restored-2026-10-27
```

Backup includes allowed `materials/`, `manifests/`, `derived/` and `evidence/` files plus `backup-manifest.json` with byte counts and hashes. It excludes `index.sqlite`, job files, AI/browser records and credentials. The limit is 10,000 files, 64 MiB per file and a 2 MiB restore manifest. Files are copied/checked one at a time, so a single maximum-size material still enters memory. This is not an instantaneous snapshot of a directory undergoing writes.

Reference-only originals are included in this backup just like searchable ones; excluding a PDF from retrieval must not omit it from preservation. For this upgrade, verify all five original files and the six scoped evidence records are included. The review record sources and import commands are documented in [reading-evidence](../research/reading-evidence/README.md). Their review applies to stated claims/figures only, not to every unit produced by a parser.

Restore requires the destination directory **not to exist**; an existing empty directory is also rejected. It verifies file paths, hashes, parsers and evidence references in a sibling staging directory, then publishes by rename. The running app still uses `private/reading`; restoring another directory does not switch it automatically. After validation and service shutdown, preserve the existing collection under a separate name before deliberately selecting the restored one as `private/reading`. Keep both until the app and old source replay have been checked.

Cancellation/failure can leave `<destination>.staging-<id>` with incomplete files; neither backup nor restore automatically removes it. No live destination is published before successful verification/rename. After stopping the operation, confirm the exact staging path is inside the intended project backup/restore area and belongs to this failed attempt before deleting it. Do not remove the source backup, existing materials directory or unrelated staging jobs. These process-level guarantees are tested with synthetic failures; physical power-loss durability and every filesystem are not verified.

### Retrieval and question-quality limits

Local original retrieval is FTS5 with lexical-v4 Chinese/English aliases, not semantic/vector search. The fixed 30-question development set recalls 33/46 necessary units from original Chinese questions (71.74%, below the proposed 90%) and 44/46 with predeclared English queries (95.65%). These are offline top12 index-candidate diagnostics; they do not measure what fits in the actual prompt or whether a model chooses good queries. Budgeted search can return fewer than the requested 8/12 candidates, with explicit `omittedCount` and ranges. Six calls still constrain multi-paper follow-up. Missing evidence must be disclosed, not guessed.

Initial guide excerpts are capped at 5000 UTF-8 bytes and marked in `metadata.guideRanges`. Original search shares repeated material identity; `read_source_unit` accepts `offset`/`maxChars` and returns a budgeted `range`/`nextOffset`. Saved `source.readRanges` merges only intervals actually returned; unread gaps never enter the evidence snapshot. Both provider adapters refresh budget before each tool, including multiple reads in a single round. Previously accepted history/evidence stays intact; a full guide-section read that cannot fit returns an explicit error. The local regression suite plus original-material tests passed 24/24 using synthetic transports. Independent checks with the three public materials also completed search→read→final through both adapters within default reserves; none called a real provider.

No real-model run of this set has been performed. Answer correctness, citation support, research advice quality and provider stability remain unverified. Input budgeting uses serialized UTF-8 bytes plus framing/output reserves, not exact tokenizer counts; the ChatGPT output reserve does not enforce a precise upstream token cap. See [independent review](../research/reading-upgrade-independent-review.md) and [AI reading](AI-READING.md).

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

Rollback restores earlier selections while retaining immutable published revisions. It does not roll back personal thinking. Do not edit journals or hashes to force recovery. See [content updates](../content/CONTENT-UPDATES.md) for locks, backup receipts, before/after-switch behavior and filesystem limitations.

## Test and troubleshoot

Install the isolated browser with PowerShell if absent:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/playwright'
npm exec -- playwright install chromium --only-shell
npm run test:e2e
```

The suite uses fresh synthetic browser contexts on strict port 4174, never the normal preview profile. With production preview running, use `node tests/smoke/preview-smoke.mjs`. `node tests/smoke/content-update-browser.mjs` uses a separate project-local copy and port 4175 to test content changes alongside persistent synthetic records. Do not run two instances of the same test server. A sandbox may require local process/network permission; report actual failures rather than skipping silently.

Screenshots are webpage pixels only in ignored `.cache/screenshots/`; curated images are in `docs/images/`. Browser binaries and test artifacts are grouped under `.cache/`. Narrow viewports and CSS zoom are simulations, not phone or native-browser-zoom certification. External document opening is mocked; actual source availability and locator behavior require separate checking. No real user notes are needed for tests.

For cleanup, stop the relevant tests and remove only their identified synthetic workspaces or obsolete generated screenshots. Keep `.cache/npm/` and `.cache/playwright/` for the installed local tools. Some earlier runs also retained original-source review inputs and material backup/restore copies under `.cache/upgrade/` and `.cache/test-workspaces/source-review-2026-10-24/`; their ignored location does not make them disposable. Keep those materials, `private/`, `server/config.local.json`, `.content-update/` recovery receipts and deliberate backups. The 2026-10-27 structure cleanup removed only generator-confirmed synthetic benchmark/test copies and archived old screenshots; it did not clear the cache wholesale.

- Port occupied: stop the known project server; do not silently change the reading origin.
- Storage failure: continue reading, preserve drafts with copy/download, and export existing records if possible. Never interpret a failed save as success.
- Import rejected: keep active content unchanged, read the relative validation message and correct the proposed package. A stale transaction requires the documented recovery.
- Source did not reach its anchor: use the citation's version and manual section/figure/PDF page locator.
- Large production chunks: currently a known local Mermaid/math bundle cost. Build success does not imply a performance budget has been met.

PROJECT-STATE.md identifies the next work. Do not initialize Git, publish, deploy or add cloud services as part of ordinary maintenance without separate authorization.
