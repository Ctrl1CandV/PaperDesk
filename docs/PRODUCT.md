# Product and first-release scope

## Purpose and audience

PaperDesk is a personal research-learning platform with three connected capabilities in v1: survey guidance, paper-reading assistance and research-direction exploration. It helps a computer-science graduate reader build a literature framework, understand methods and evidence, accumulate questions and gradually develop a grounded research direction. Later research execution and writing can use this accumulation; v1 does not promise novelty or publication.

Assume technical competence and some previous paper-reading experience, but not a complete literature map or familiarity with the current article. Explain missing prerequisites in context. Do not replace the research narrative with elementary courses, disconnected questions, unexplained quotations or forced quizzes. Technical depth follows the paper's actual complexity and explanatory dependencies, then explicit reader requests; age or paper count is not a depth ladder.

## Three capabilities and their connection

| Capability | First-release behavior | Useful outcome |
|---|---|---|
| Survey guidance | Explain the object, necessary background, organizing rationale, major branches and their relationships, applications, evaluation and open questions; supply reading priorities and sources. | The reader can place a later paper in a field rather than collect isolated summaries. |
| Paper-reading assistance | Orient before analysis, then explain the problem, approach, necessary technical mechanisms, experimental evidence and limits; preserve original locators and purposeful original-reading suggestions. | The reader can explain what was done, why and what the evidence supports. |
| Direction exploration | Offer grounded editorial starting lenses; let the reader create questions, attach versioned reading evidence, record interpretations/unknowns and choose a next action; revisit and revise later. | Reading produces a durable, revisable question trail instead of scattered notes or an automatic topic recommendation. |

The actual loop is survey → paper → question → evidence → next reading/action → revision or deferral. None of these steps automatically marks mastery, originality, original-paper reading or research success. The platform does not require a newcomer to choose a specialist topic before seeing useful guidance.

## Initial content and direction

The initial subject is Agent applications. Three existing guides form an editorial sequence: Agent survey for system/environment/action and relationships; InstructGPT for goals, data, optimization and evidence; HELM for scenarios, adaptation and measurement limits. Any guide can be opened directly; no unlocks or prescribed paper count.

`content/exploration.json` provides three public editorial starting lenses: application construction, evaluation and failure analysis, and optional collaboration. Their order and reasons are supplied, as are reading targets, a self-check and a next action. They are not an authoritative field taxonomy, frontier literature review or claims about the operator's unpublished research. Sources explain the background; they do not establish a research gap or prove a proposed intervention works. No new unverified specialist reading list is required for v1.

## Complete first release

- Home with a clear learning path and a real resume entry when one exists; local library/search, three complete guides and source navigation.
- Long-form survey/paper reading, section navigation, the two existing teaching diagrams and HELM table; formula-ready rendering without invented formulas in the seeds.
- Local resume and separately explicit guide/original reading states, notes, persistence recovery and JSON backup/restore.
- A real Explore entry, the supplied editorial lenses, a personal exploration list and detail/editor; create or attach a reading question, preserve evidence provenance, select status and next action, revisit after further reading.
- Preview and copy a selected reading or exploration context to a harness, with deliberate inclusion of personal text and a manual clipboard fallback; no model API call.
- A validated local content-import path, immutable revisions, maintained project state and operating instructions so more content and product iterations can follow.
- Responsive layouts, accessible keyboard behavior and honest empty/error/partial-coverage states.

Three articles are the initial inventory, not an architectural limit. A representative page alone, a static exploration label, a collection of empty forms or merely passing code tests does not complete v1.

## Boundaries

No automatic AI discovery/generation, online model keys, topic scoring, novelty assessment, experiment execution, paper-writing engine, citation graph or vector database in v1. No preloaded personal records, profile inference or migration of an old project. Server deployment, authentication, synchronization, PWA installation and offline downloads remain future options after the local reading/exploration loop is accepted.

The representative reading page receives feedback at W1 before implementation spreads. After W6 the entire survey–paper–exploration loop still needs reader acceptance. A reading platform can support learning; it cannot certify learning or publication prospects.
