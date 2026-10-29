# Personal records and backups

The research extension uses IndexedDB layout 3 and personal archive v3, preserving v1 JSON and v2 archive imports. Optional research state, immutable decision/proposal audit and embedded documents/tasks/receipts are included in v3. Normal writes cannot replace accepted audit or frozen task/receipt prefixes. A pre-research recovery copy is retained in `_migrationV2` and has a separate download action. v1 export refuses research records rather than discarding fields. The v2 capacity/streaming/conflict rules below remain, with version dispatch described in [research contracts](RESEARCH-CONTRACTS.md).

This document governs browser records. AI conversations use a separate backend SQLite store; original papers and evidence mappings use a third materials directory. See [AI reading](AI-READING.md) and [operations](OPERATIONS.md). Exporting or clearing one collection does not include the others.

PaperDesk retains the IndexedDB name `paperdesk-personal-v1` and opens **database version 3**. Notes, explorations, resume positions, guide marks, original-paper marks and preferences remain separate stores. Reviewed guides and editorial exploration seeds are read-only and never imported from a personal backup.

## Normal use

Open **备份与本地记录**. Export runs only after a click. Small collections without research extensions and within the old size/count contract download compact v1 JSON; larger or research-containing collections download the v3 chunk archive as `.jsonl`. Both contain intentional records, embedded evidence, actions, explicit marks, positions and settings. Confirm that the browser download completed. Files may contain private text; no upload, account or synchronization service is involved.

Select a backup, inspect counts, conflicts and unavailable references, then confirm import. v1 offers a bounded full-content preview; v2/v3 stage validated chunks and show summaries and conflict pages instead of rendering the whole large file. Selection or cancellation makes no live-record changes, although v2/v3 preview uses temporary IndexedDB space. Identical records are skipped. Conflicting notes/explorations default to keeping both; the imported copy receives a new UUID and imported exploration references follow a copied note. Choosing the imported version explicitly increments its revision. Positions, status and settings default to keeping local values; higher imported revision numbers do not automatically win.

Missing guide revisions, units or related notes remain unresolved links with quotations and provenance intact. Deleting a note does not delete linked evidence. The database revision invalidates a stale import preview. Final import writes every accepted group in one transaction; failure rolls back that transaction. Cancel, missing/duplicate chunks, bad hashes and conflicts do not expose partially restored live records.

Removal requires the separate confirmation dialog and checkbox and succeeds only after empty readback. It also clears this browser's migration and staging stores. Export needed records first. Unsaved drafts are separate in-memory buffers: save, copy or download them before leaving the browser. Storage eviction or browser clearing can remove IndexedDB. There is no synchronization or offline-content guarantee. Changing protocol, host or port changes the storage origin.

## Runtime capacity and writes

The application limit is **512 MiB of serialized live record data**, at most **250,000 records per record store**, plus an **8 MiB per-record** limit and existing field/schema checks. Preferences are one record. These limits are separate from the old 5 MiB file contract. Browser quota may be lower; migration recovery rows, staging copies and database overhead are not included in the live-data counter. No records are silently deleted at capacity.

`PersonalRecordStore` validates the changed record and updates byte/count metadata in the same transaction. Note, exploration and resume saves do not read all stores or serialize a complete backup. Note/exploration writes require the expected revision (`null` means create only), preserve stale editor drafts, and acknowledge only after commit/readback. Quota failure retains drafts and copy/export recovery. Cross-tab notifications contain change signals, not private text. Resume saves never imply a reading mark or mastery.

Lists use indexed cursor pages (default 100, maximum 500), with exact guide/revision lookups. Loading more is explicit; a page is not presented as the whole collection. Reading state is resolved by its target rather than treating an unloaded record as unread.

## Formats and migration

`schemas/personal-backup.schema.json` remains the strict **v1** contract: `paperdesk-personal-backup`, `schemaVersion: 1`, maximum **5 MiB** per file and original array/field bounds. Existing v1 files remain importable. The merged live database may exceed 5 MiB and is then backed up using the current v3 archive. Unknown fields, malformed IDs/times, unsafe URLs, duplicate identities and invalid provenance remain errors; missing content is not malformed data.

The chunk transport introduced in **v2**, extended with research records in **v3**, is `paperdesk-personal-archive`, using newline-delimited JSON. A manifest fixes counts, live bytes and snapshot revision; ordered blocks contain records and SHA-256 checksums; a chained digest and mandatory footer detect missing/reordered/truncated data. The transport cap is **768 MiB**. Blocks target 128 KiB; one large record may exceed that target, with a line cap of 8 MiB plus 256 KiB. Import validates the complete staged archive before committing to live stores and preserves the conflict rules. The input file is never rewritten.

IndexedDB v1→v2 migration validates old rows, adds indexes and counters, and retains original v1 rows in `_migrationV1` within the version-change transaction. Failed upgrades leave the old layout intact. A v1 client cannot open the newer database. **导出升级前记录副本** exports the retained original collection as v1 JSON for an old application; it excludes later edits. Before downgrading, export current records separately, then restore the original v1 file into a fresh/explicitly cleared old-version origin after retaining both backups. Do not decrement database versions or drop fields to force compatibility. Content revisions never automatically relocate personal targets or rewrite quotations.

## Large archive resources and cleanup

The current archive exporter first copies a consistent snapshot into `_backupStage`. It serializes bounded blocks and combines browser-managed `Blob` parts; it does **not** build a single full-library JavaScript JSON string. Import reads `Blob.stream()` and parses bounded lines. Small v1 exports intentionally use whole JSON, bounded by 5 MiB.

This is not an end-to-end constant-memory or direct-to-disk streaming guarantee: the full downloadable Blob stays alive, browser Blob allocation/backing is implementation-dependent, and the IDB snapshot needs extra quota. Snapshot and final atomic restore transactions can hold write locks. A 512 MiB application limit is not a measured promise that every browser/device can export a full-capacity collection. The greater-than-5 MiB synthetic round trip does not establish a maximum-size heap bound.

Completed/cancelled operations normally discard their staging rows. A browser/process crash can leave orphaned `_backupStage` jobs; no automatic orphan cleanup or resume UI exists. These rows are not live records but consume quota. Do not clear the whole database to remove staging. Preserve a verified export first; maintenance may remove only confirmed abandoned job keys from `_backupStage`, with all other tabs/operations closed. Keep `_migrationV1` until the downgrade recovery copy is no longer needed.

## Verification

```text
npm run test:e2e -- tests/e2e/records.spec.ts tests/e2e/records-upgrade.spec.ts
```

The isolated test origin uses synthetic records: a collection over 5 MiB, successful/failed migration, conflicts, pages, hot writes without full-store reads, concurrent export consistency, corrupt/duplicate/missing chunks, cancellation, quota rollback and UI download/restore. The targeted workstream run on 2026-10-27 passed 17 tests before subsequent pagination checks were added; final integration counts belong in `docs/development/PROJECT-STATE.md`. These injections do not claim physical disk-full, power-loss, eviction or all-browser maximum-capacity verification.

Historical evidence: the 2026-10-21 38-test browser suite and subsequent 15-test compact-v1 export run predate this upgrade. They are not evidence for v2 migration or archives.
