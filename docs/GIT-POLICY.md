# Repository policy

## Branches and commits

Use one long-lived `main` branch for the complete, buildable source tree. Create short-lived feature/fix branches when isolation or review is needed. No permanent develop/release branch is needed for the current local application. Deployment and package publication remain separate operations.

Commit titles start with the actual local date in `MM.DD` form, followed by a type and concrete change, for example `10.22 feat: deliver PaperDesk reading and research platform`. Use `feat`, `fix`, `docs`, `test` or `chore` according to the snapshot; this is a project convention. Do not invent identities, coauthors or test results. Use the configured Git author without copying its value into project files or reports.

Only the integrating writer changes the index, branches or commits. Review exact paths before staging. Check `git diff --cached --check`, the full staged changes and lockfile. Inspect all outgoing commits and push an explicit branch to the verified remote. Do not force-push or rewrite shared history without separate authorization. Branch protection and hosted automation are not configured by this policy.

## File ownership

| Track | Keep local / ignore |
|---|---|
| Source, schemas, tests, portable configuration and `package-lock.json` | `node_modules/`, `dist/` and `.cache/` |
| Reviewed immutable content, attribution and source-review notes | `incoming/` authoring packages and `.source-review/` downloads/tooling |
| Current docs, useful archives and compact evidence JSON | Generated `docs/evidence/*.png`, logs and temporary test copies |
| Curated public-content images in `docs/images/` | Private notes, exported backups, credentials and local environment files |

`.content-update/` is ignored but **is not disposable cache**: its previous catalog and receipt support intentional selection rollback. Inspect interrupted transactions with the importer; do not delete recovery records during routine cleanup. Ignoring files does not remove tracked copies or their history.

Content hashes cover exact bytes. `.gitattributes` disables text normalization for `content/**`; never blanket-format or convert reviewed content. Other source text uses LF for portable checkouts.

## Local artifacts and cleanup

Npm downloads live in `.cache/npm/`, browser binaries in `.cache/playwright/`, test output in `.cache/test-results/`, and isolated synthetic copies in `.cache/test-workspaces/`. Dependencies/builds support the active preview; they are not removed merely to make Git status clean.

Delete only inspected, reproducible targets inside this project after relevant processes stop. Resolve absolute paths before recursive Windows operations; remove verified directory links themselves without traversing their targets. Never use blanket `git clean -fdx`, remove `.git`, erase private backups or delete recovery receipts as generic cleanup. Full-paper PDFs are review inputs, not bundled project assets; public citations and original teaching material remain. No project license is assigned by this policy.

## Validation

Run content validation, unit tests, typecheck/build and affected browser checks. For initial source delivery, verify a separate copy exported from the index, install its lockfile, build and compare immutable content hashes. Use synthetic records only. Report actual failures/skips and distinguish screenshot review from physical-device testing. Historical reports do not prove a later build passed.
