# Personal records and backups

This document governs browser records. AI conversations are a separate backend SQLite store with a separate backup format and controls; see [AI reading](AI-READING.md). Browser export and clearing operations do not include those conversations.

PaperDesk stores intentional personal records in IndexedDB database `paperdesk-personal-v1`, database version 1. Notes, explorations, resume positions, guide marks, original-paper marks and preferences are separate stores. Reviewed articles and editorial exploration seeds are read-only and never imported from personal backup files.

## Normal use

Open **备份与本地记录** from the application navigation. Export downloads a JSON file only after a click. The file includes private note and exploration text, embedded evidence, next actions, explicit reading marks, positions and presentation settings. Downloads use compact JSON so formatting cannot inflate an otherwise valid backup beyond the file-size limit; the on-screen full preview remains indented. Confirm the download in the browser. No upload, account or synchronization service is involved.

To restore, select a JSON file, inspect the record counts, exact content and conflicts, then confirm import. Selecting a file or cancelling the preview makes no record changes. Identical records are skipped. Different note or exploration content under the same UUID defaults to keeping both; the imported copy receives a fresh UUID. References from imported explorations to copied notes follow that copy. Explicitly choosing the imported version increments its record revision. Reading-position, status and preference conflicts default to keeping local data. Higher imported revision numbers do not silently win.

Unavailable guide revisions, units or related notes are reported and retained as unresolved links. Existing quotations, provenance and source snapshots remain in the record. Deleting a note never deletes linked evidence. A changed local database invalidates an older import preview and requires another preview. Import writes all record groups in one transaction; an error aborts the transaction.

The removal control opens a confirmation dialog with a backup action and a separate confirmation checkbox. Successful removal is reported only after an empty readback. Browser storage can be cleared or evicted. A different browser, protocol, host or port is a different storage origin; transfer records by export/import. This release does not promise offline content availability.

## Contract and migration policy

`schemas/personal-backup.schema.json` is the strict v1 contract. The application interprets this fixed schema without dynamic code generation, so production CSP does not need `unsafe-eval`. Files are limited to 5 MiB and bounded array/text lengths; UUIDs, pinned targets, timestamps, safe source URLs and provenance-specific evidence fields are checked. Unknown properties, duplicate IDs within a store or exploration, unsupported versions, malformed JSON and invalid provenance are rejected before persistence. Missing content is not malformed data and is preserved.

Writes and merged imports also validate the prospective complete backup within the transaction. If the total would exceed the v1 limits, the write fails and the existing records remain exportable; the editor must retain the unsaved draft. This avoids creating records that the application itself cannot back up or restore.

Only `format: paperdesk-personal-backup` with `schemaVersion: 1` is accepted. There is no implicit older/newer schema migration. A future version must add a documented pure conversion and fixtures, preview the result, preserve the original input and apply a transactional migration only after user confirmation. Never drop unrecognized fields to make an import pass. Database upgrades must similarly preserve old stores or fail without rewriting them. Content revision changes do not migrate personal targets or quotations automatically.

`PersonalRecordStore` owns all persistence. `saveNote` and `saveExploration` require an expected record revision (`null` means create only); read-modify-write occurs in one transaction. A stale editor receives `ConflictError.current` and retains its own buffer. The UI offers the current version and a separate-copy path rather than choosing by timestamp. Writes are acknowledged only after commit and readback. Storage/quota failure must keep the editor and copy/export recovery available. Cross-tab notifications contain only a change signal, never private text. Resume writes are independent of deliberate guide/original marks and never imply reading completion or mastery.

## Verification

`npm run test:e2e -- tests/records.spec.ts` runs ten synthetic browser tests on the separate test origin configured in `playwright.config.ts`. It exercises revision conflicts, fresh-context backup round trips, strict validation, unavailable links, atomic failure, quota failure, deletion without cascades and the merged-size boundary. Tests use synthetic text only. Browser-emulated failures verify application behavior; they do not claim physical disk-full or browser-eviction testing.

Observed integration results on 2026-10-21: `npm run typecheck` passed. The complete browser suite passed 38/38, including all ten records tests and eleven platform tests. Platform cases cover actual scroll/reload restoration, separate reading marks, note UI conflicts/deletion recovery, optional quote/fingerprint retention, failed-save recovery and exact, explicitly selected reading/exploration context packets. Clipboard outcomes and storage failures use synthetic browser injections. After the final compact-download adjustment, `npm run test:e2e -- tests/records.spec.ts tests/visual.spec.ts` passed 15/15: all ten records tests, including compact-byte validation and validation of the downloaded backup, plus five visual/interaction tests. This final targeted run confirms the adjusted exporter produces a complete, valid compact backup.
