# Local content updates

The importer changes reviewed public content only. It does not open IndexedDB or read, migrate, delete or export personal notes, states, quotations, exploration records or backups. Content validation is not scholarly review.

## Library presentation briefs

`content/library-briefs.json` holds the separately maintained library explanation, short chapter labels and verified source-version dates. It is keyed by guide ID plus revision and does not alter approved guide metadata or bodies. Editing this public editorial copy requires checking its claims against the named guide/source, running `npm run build`, and inspecting the rendered card. Build validation checks that each entry targets an existing revision and that its chapter labels cover exactly that revision's chapters.

The importer still accepts only catalog-declared immutable content; it does not apply this application-owned presentation file from incoming packages. After importing a new revision, an absent matching brief uses that revision's own orientation metadata until an individually reviewed brief is added. Old brief entries are never applied to a new revision. Publication year, source-version date and guide revision remain separate; unknown source dates are omitted.

## Deliberate package format

Place a reviewed release under a named project-relative directory, for example `incoming/release-one/`. It contains **catalog.json at its root**, plus the metadata, Markdown, image assets and exploration seed files declared by that catalog. Paths inside metadata/catalog remain normalized relative paths; they may not contain traversal, absolute paths, symlinks or unknown fields. The package root may contain spaces when quoted. Use forward slashes in the CLI argument. The importer does not discover other directories or download URLs.

The catalog is the full intended collection, including **every retained guide and editorial seed revision**. Copy the current `content/` into the release directory as the starting package, then deliberately add new versions and edit its catalog selections. The importer reads only declared content files; do not include private authoring records or credentials. Extra undeclared files are not imported.

For a new guide, supply its reviewed Markdown and schema-valid metadata at distinct paths, add one catalog entry and a `currentRevisions` selection with a unique current recommendation rank. For a revision, keep the stable guide ID and paper identity, increment the revision, add distinct metadata/body paths, and retain prior entries. Reusing an unchanged body or image file is allowed; changing existing file bytes is not. A synthetic fourth guide in the tests exercises this contract without changing reader components.

A revision includes all metadata values, exact Markdown bytes and declared asset bytes. Identical parsed JSON may differ in whitespace/object-key order; arrays and scalar values must still match exactly. An existing immutable key with any changed metadata, locator, scope, body or asset is rejected. Keep the retained metadata and seed paths stable. Recommendation reasons/order and current pointers are explicit catalog choices, not immutable guide metadata.

Exploration seed revisions use distinct files such as `exploration-r2.json`; keep the initial `exploration.json` and every prior revision in `exploration.revisions`. Set `exploration.currentRevision` deliberately. Changed same-revision seed content, duplicate lens IDs/ranks and unresolved guide targets are rejected. Editorial changes never rewrite an adopted personal question.

## Preview and apply

```text
npm run import:content -- --from incoming/release-one --dry-run
npm run import:content -- --from incoming/release-one --apply
npm run validate:content
npm run build
```

Quote a root directory containing spaces, such as `--from "incoming/release one"`. Dry-run is read-only and reports new revisions/files and exact proposed current selections. It does not certify the prose. Inspect the reviewed source changes before apply; then rebuild/restart the local preview and inspect rendered prose, diagrams, source labels and affected exploration links. A development page alone is not publication or reader acceptance.

Apply acquires a project-local lock, validates the complete candidate, compares retained immutable revisions, snapshots only declared files into `.content-update/stages/`, and validates that snapshot again. It writes only missing immutable files under `content/`, then validates a temporary catalog beside the active catalog. The **single publication point is an atomic rename over content/catalog.json**. There is no delete-then-rename fallback. If replacement fails, the prior active catalog remains available; an interruption may leave unused staged files, which are never selected automatically.

The tool uses the application's schemas and validators, never code or schemas from the input package. Files outside `content/` and the importer's `.content-update/` working directory cannot be replaced by package paths. Importing an identical collection is a no-op.

## Interrupted updates and rollback

Do not run recovery while another importer is active. Recovery refuses to release a lock whose owning process is still running. Close that process first. A lock after a crash is intentionally not ignored on the next import. Run one recovery at a time.

```text
npm run import:content -- --recover
npm run import:content -- --recover --apply
```

The first command inspects the transaction without changing it. The second verifies the recorded previous-catalog hash and then:

- Before the switch: retains the old valid active catalog and releases the interrupted transaction.
- After the switch: retains the new valid active catalog and completes transaction cleanup.
- If the active catalog is missing/damaged during a recorded interruption: validates and restores the verified previous catalog.

Recovery refuses an invalid journal or changed backup. Recovery records are written through temporary files and atomic replacement, and a successful update retains a hash receipt for the selection backup. Do not edit recovery files to force success. `.content-update/previous-catalog.json` is the last selection backup; it is content metadata, not a personal-data backup. Unselected immutable files can remain after an interruption and may be reused only when a later fully validated catalog deliberately selects them.

For an intentional selection rollback after a successful update:

```text
npm run import:content -- --rollback
npm run import:content -- --rollback --apply
npm run validate:content
npm run build
```

Rollback restores previous current-version selections, editorial seed selection and prior recommendation settings while retaining all published guide/seed revisions. Newly introduced guide IDs remain accessible and are appended after earlier recommendations; the v1 catalog requires one current revision for every retained guide. It does not prune published content or undo personal thinking. Rebuild/restart the preview after any catalog switch.

## Test evidence

`node --test tests/integration/content-import.test.mjs` covers a synthetic fourth guide, JSON-identity no-op, new guide/seed revisions, metadata/asset/seed conflicts, invalid packages, retained revisions, local path and symlink boundaries, injected process-interruption phases before/after the switch, damaged-catalog recovery, running-owner protection, changed-backup rejection and selection rollback. Tests use isolated project-local temporary directories and a clearly synthetic personal-record sentinel; they do not use actual notes. The interruption tests inject faults at explicit transaction boundaries; they do not simulate physical power loss or prove durability on every filesystem. Integration with browser persistence is checked separately in the complete application suite.
