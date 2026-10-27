# Reading content and production contract

## Authoring workflow

The durable detailed process is [Content workflow](paperdesk-upgrade/01-CONTENT-WORKFLOW.md); use [Sources and visuals](paperdesk-upgrade/02-SOURCES-AND-VISUALS.md) for fixed originals, physical PDF pages, visual checks, teaching diagrams and focused explanations. These documents refine the contract below without replacing immutable revisions, approved prose, attribution or personal-action boundaries. No plugin modification or integration is required.

The [three r2 samples](research/reading-upgrade-samples.md) and [independent review](research/reading-upgrade-independent-review.md) record actual 2026-10-27 changes. Fixed materials use `reading-material-v1`, parsed units use `reading-derived-v1`, and claim/condition/guide-unit mappings use `reading-evidence-v1`. An AI visual check is labelled AI, never human; a checked claim does not change the entire parser output from `unreviewed` to reviewed. Evidence files survive index reconstruction and are pinned to the question's index generation. Missing images, PDF text order and incomplete coverage remain explicit. Operations documents import, backup and rebuild commands.

Content is authored outside the website by a human-directed harness following the reading contract below. Existing authoring skills can be used in that separate workflow; no particular installed plugin or private record is an implementation dependency. The website consumes reviewed packages, not an assumed skill API.

1. Select a paper for a concrete learning purpose and explain priority and alternatives. Broad context precedes narrower exploration when needed.
2. Fix the actual source identity/version; record what was obtained and what could not be read.
3. Extract claims, conditions, mechanisms, results, limitations and source locations before compressing prose.
4. Write an orientation, then a coherent explanation of the author's problem, method and evidence. Organize surveys by objects, classification rationale, component/branch relationships, applications, evaluation and open questions as the article requires.
5. Within the requested scope, let the paper's complexity and explanatory dependencies determine depth, then adjust for explicit reader requests. Necessary formulas, architectures and experimental design belong near the relevant argument. Age, citations and number of papers read do not set depth.
6. Keep citations near claims. Separately recommend any original passages worth reading, with purpose and focus; none may be needed at the present stage. Cross-paper relations are optional and must distinguish evidence-backed relations from editorial reading order.
7. Review factual support, explanatory continuity, source coverage and permissions. A structurally valid file is not an academically reviewed guide.
8. Produce an explicit content package, validate it, preview it and deliberately add it to the local catalog. Generation never marks personal state or overwrites notes.

The existing plugin saves paper metadata and Markdown separately. Its `reading.mode` describes the delivered note; `reading.status` and user quotations describe personal actions and must not be exported into the site content. `note.coverage_sources` can contain multiple source versions. Export needs an adapter/authoring step; copying the entire record or .grad directory is not an adapter.

A `full-survey` declaration requires substantive treatment of all main branches, key evidence and necessary figures/tables, with source and figure checks actually completed. Non-priority branches still need meaningful explanation. A deep label, complete contents list or large word count cannot conceal coverage gaps. The supplied guides remain `mainline`.

## Seed materials

The three included Chinese guides preserve accepted prose. Relative links between them have been normalized to their new filenames; no research claims were rewritten. Their source review is inherited, not newly rerun in this preparation:

| Paper | Fixed main version | Coverage and figure review |
|---|---|---|
| Agent survey | arXiv 2308.11432v7 | Main research narrative; Figure 2 previously viewed. Not a full explanation of every subcategory, table or cited work. |
| InstructGPT | arXiv 2203.02155v1 | Research narrative and selected results; Figures 1, 2, 4 previously viewed. Not all appendix experiments; no reproduction. |
| HELM | arXiv 2211.09110v2 | Evaluation narrative; Figures 5–7 and 24 previously viewed. Not every scenario or appendix; no reproduction. |

The diagrams in the guides are teaching diagrams, not copied original figures. No original PDF/image assets are bundled. Supplemental abstract links are background evidence only, not full readings. Preserve all scope statements. Historical results are not current model rankings.

## Package v1

Each guide has a JSON metadata file and a Markdown body. `schemas/guide.schema.json` and `schemas/catalog.schema.json` define field shapes. `content/catalog.json` lists metadata paths for retained revisions; `currentRevisions` explicitly selects the recommended revision for each guide. The initial catalog has three guides with one revision each. The immutable content key is `(id, revision)`; the same paper and source version may have multiple guide revisions or distinct guides. A guide ID must retain the same paper identity.

`metadataFile` is relative to the catalog directory. `bodyFile` and asset paths are relative to the metadata file's directory. Resolve paths inside the supplied package root and reject symlinks, traversal, absolute paths and non-normalized segments. Do not resolve paths against a process working directory or a private authoring record.

| Field | Meaning |
|---|---|
| id / paperId | Stable guide identity and separate scholarly identity; no title-derived personal keys |
| revision / bodySha256 | Immutable content revision and SHA-256 of exact UTF-8 Markdown bytes |
| title / paperTitle / language / type | Display title, original title, content locale and primary article type |
| source | Main source ID, known version and primary URL |
| purpose / mode | Editorial learning purpose and delivered depth, never mastery |
| units | Stable explicit IDs; intro plus each level-two heading in body order. Level-three headings stay under their containing unit. |
| citations | Unique URL inventory with IDs, visible labels, source role and known version or null. Labels alone do not prove support. |
| related | Optional editorial links to other guide IDs with a stated relation |
| coverage | Delivered scope, covered section labels, actually viewed figures, limitations and inherited review basis |
| bodyFile | A normalized relative path to the associated body |

For the seed files, URL citations stay in Markdown and match the inventory by exact URL. The renderer intercepts a matched citation to open its source details; an explicit Open original action opens that URL. Do not globally rewrite unrelated links. Relative guide links identify the linked guide through its declared body path, then resolve to that guide's `currentRevisions` entry. They are editorial recommendations, not fixed-version evidence. Exact `/read/:guideId/:revision` routes remain pinned. Old revisions remain addressable; the normal library shows only current revisions, ordered by their recommendation rank. Every HTTP(S) link in a body must be inventoried; unknown internal targets fail validation.

Build/import checks: unique `(id, revision)` keys; a valid current revision for every guide; unique ranks among current entries; consistent paper identity across a guide's revisions; unique unit IDs within a revision; exact heading/order match; matching body hash; valid source URLs/versions; resolvable related guides; no dangling citation/asset; honest scope; limits and source roles preserved. Same URL can have several labels. Do not invent coordinates, section anchors, DOI or figure checks. PDF page numbers are physical pages beginning at 1; show a manual locator when fragment navigation is unsupported.

Only local, deliberately supplied content packages are imported in v1. CLI import is a staging/validation operation, not a URL fetcher or code executor. It must accept a specified directory or manifest, reject absolute/parent-traversal/symlink paths and unknown properties, and never read an author's private records. No zip extractor is required. A failed import changes neither the catalog nor existing content.

A revision includes the Markdown bytes, all metadata field values and all declared assets. A repeated `(id, revision)` is a no-op only when all three match; `bodySha256` alone is insufficient. Compare metadata after parsing, ignoring object-key order and JSON whitespace but preserving array order and exact scalar values. Any changed source locator, unit, coverage declaration, body or asset under the same key is a conflict and requires a new revision and appropriate content review. Catalog recommendation order and the current-revision pointer are separate editorial settings; update them only through an explicit validated catalog change. Retain every previous revision in v1; no automatic pruning based on the currently visible browser's records.

The first implementation may use the included files directly while building this validation path. A fourth content package must be addable without editing reader components. That check may reuse a clearly identified test fixture; do not manufacture another research essay.

## Exploration material

The public editorial seed is specified in EXPLORATION.md and has a separate JSON Schema. It supplies useful starting paths without creating personal records. Pinned guide targets must resolve to known revisions/units; background links do not validate an exploration hypothesis. Each seed revision has unique lens IDs/ranks. Same revision plus identical parsed content is a no-op; any difference is a conflict requiring a new revision. Catalog `exploration.currentRevision` and `exploration.revisions` select and retain seed files relative to the catalog directory. Publish guide and seed changes through one atomic catalog switch after staging dependencies; failure preserves the old active collection and retained seed origins. An imported seed must not contain personal states, notes or identity fields. Personal questions and evidence live only in PersonalRecordStore. Full update/recovery rules are in MAINTENANCE.md.

## Rendering boundary

Markdown is data: no MDX, raw HTML execution, embedded scripts, arbitrary components or remote image loading. External links are HTTP(S); images are approved package assets only. Formula errors fail locally with a readable fallback. Mermaid rendering is restricted to reviewed flowcharts, strict security, no click callbacks, HTML labels, external icons or configuration overrides; render from the local dependency and retain a text alternative. Diagram safety must be tested independently of general Markdown safety.

The initial reader preserves long-form content rather than converting every metadata field into a card. Metadata is for navigation and transparency; meaning stays in the prose.
