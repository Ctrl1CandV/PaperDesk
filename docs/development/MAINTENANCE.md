# Sustainable content and product development

The first release must be usable with a small library and repeatable to extend. Sustainability means stable data boundaries, actual operating instructions and recoverable updates, not building a plugin marketplace or background pipeline.

## Content operating loop

1. Outside the website, choose a paper or survey for a learning purpose. Explain priority, coverage and how it fits an existing question; a direction need not be settled beforehand.
2. Use an available reviewed authoring workflow to read sources, write the guide and review claims/locators/coverage. The developer must not discover the operator's plugin locations or private authoring records. The contract in CONTENT.md is sufficient to implement the consumer.
3. Prepare only the deliberate Markdown/metadata/assets package. Strip personal records, operator identity and machine provenance before bringing it into this workspace.
4. Validate schema plus paths, references, limits and hashes; preview changes and the actual rendered text. An import cannot certify scholarly accuracy.
5. Explicitly apply the validated package and catalog choice; retain earlier immutable revisions. Recheck linked exploration targets without editing personal notes or evidence snapshots.
6. After reading feedback, revise content or navigation under the version rules and record a brief release note. If an update fails, recover the previous active catalog without reverting personal data.

The implementer must deliver and document working commands: `npm run validate:content`, `npm run import:content -- --from <package-directory> --dry-run`, and an explicit `--apply` mode for that importer. These commands are required implementation outputs, not supplied executables. Keep import local, bounded and non-executable; untrusted packages may not replace validators or schemas. Use staging and a final catalog switch so a rejected or interrupted update cannot expose half an import. Document recovery after an interrupted switch. No zip ingestion or URL downloader is required.

Exploration seeds use their own schema/version and pinned guide targets. Every revision has unique lens IDs and ranks. Reimporting a revision is a no-op only when its full parsed JSON matches (ignore object-key order/whitespace, preserve array order and scalar values); otherwise reject as a conflict. Update them through the same validation/preview/apply workflow. A new seed revision never overwrites a reader's adopted question or its remembered origin.

The guide catalog's `exploration.currentRevision` selects the active seed; `exploration.revisions` maps retained revision numbers to package-relative seed files (relative to the catalog directory). The initial revision is `exploration.json`; retain it when adding later revisions under distinct paths. Stage immutable guide/seed files first, then atomically replace one validated catalog containing guide and seed pointers. A rejected or interrupted import retains the previous active collection; unused staged files are never treated as current. Old seed origins remain resolvable through the retained mapping. A changed lens concept gets a new lens ID; merely changing reading targets or wording uses a new seed revision. No catalog update migrates personal state.

## Product continuation

Keep PROJECT-STATE.md small: specification version, completed packages, actual checks, open issues and the next work package. Update it after each implementation handoff. Do not paste chat logs, personal reports, terminal environment dumps or a running narrative of abandoned work. A new developer should be able to continue using this project alone.

Keep the application modular inside one project; add a fourth guide or another editorial lens through content, not reader component rewrites. Include schema fixtures and migration tests when data changes; test with synthetic records. Maintain the dependency lock and documented runtime versions. Do not add services or generic extension engines before an actual need.

Before declaring v1 complete, verify a synthetic content revision, rejected import and catalog recovery while notes and explorations persist unchanged. Deliver docs/development/OPERATIONS.md with install/start/build, fixed-origin details, adding/revising content, backing up/restoring personal records, content rollback and common failures. Deliver docs/history/DELIVERY.md with evidence for every acceptance item. Future server work is separately scoped after this loop works well.
