> Archived milestone. Current instructions: [Operations](../../OPERATIONS.md) and [project state](../../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

# Implementation handoff

Handoff revision: codex-2026-10-21. Product specification: 1.1, unchanged. Implementer: Codex. Status: reviewed preparation ready; application implementation not started.

## Goal and current scope

Build an integrated, sustainable personal platform for survey guidance, paper-reading assistance and research-direction exploration. The audience is a computer-science graduate reader with some prior paper-reading experience. Agent applications are the initial subject area. Start by providing orientation and coherent explanations; connect source passages to claims, preserve coverage gaps, and recommend original reading when it adds value. Necessary depth follows the paper and its explanatory dependencies rather than an assumed beginner level or the number of papers read.

The first release includes all three capabilities, local personal notes/questions/evidence/next-reading actions, recoverable backups, selected-context copying and repeatable content updates. Three approved guides and three editorial exploration lenses are the initial inventory. Editorial suggestions are not personal decisions or proof of research novelty. Do not infer reading progress or mastery from page views. Sustainable development means extendable content, clear modules, operating instructions and recoverable data; it does not require speculative infrastructure.

## Authority and inputs

AGENTS.md governs execution/privacy. docs/PRODUCT.md defines product scope; docs/CONTENT.md and docs/EXPLORATION.md define the teaching and evidence contracts. docs/ARCHITECTURE.md, docs/UX.md, docs/MAINTENANCE.md and docs/ACCEPTANCE.md define engineering behavior. docs/IMPLEMENTATION.md defines W0–W6 and the reader-feedback gates. PROJECT-STATE.md is the concise continuation record.

This handoff changes the implementation owner and local work environment only. No product requirement, guide body, metadata, catalog, seed, schema or acceptance condition has been revised. Resolve an apparent conflict against these explicit boundaries and the user's latest instruction; do not silently drop requirements.

## Start here

Complete W0 and W1. Validate package hashes, schemas, stable IDs and referenced targets. Set up React, TypeScript and Vite with compatible supported dependencies, a local lockfile and documented runtime versions. Implement the actual Agent survey reader with complete prose, its real diagram, contents, source navigation and return behavior. Check desktop and narrow-screen pixels, keyboard behavior and production build. Then present the preview and evidence and wait for the reader's W1 feedback.

After that feedback, continue W2–W6 without treating each routine reversible choice as a new approval request. Full v1 must include exploration, persistence, backup/recovery and content maintenance. Do not report prototype success as product completion. Final integrated reader acceptance remains necessary.

## Local environment and version control

The workspace is a standalone Windows directory and may contain spaces in its path. Use quoted paths and portable project-local commands; do not depend on a previous Linux environment, shell profile or running server. Required npm commands in the architecture and maintenance documents are future implementation outputs, not currently available scripts.

No repository or remote is supplied. Do not initialize Git, invent an identity, create branches, commit or push without explicit authorization. No branch convention from an unrelated plugin repository applies here. Maintain useful sources, schemas, tests and dependency locks; keep private records, secrets and generated caches outside future commits. No global configuration or installed skill/plugin cache edits are needed.

## Safety and continuation

Only the functional audience description above is needed. Retain accurate public scholarly citations, but do not add operator identity, personal paths, affiliations, contact details, account information, real reading history or private hypotheses. Do not inspect unrelated files or use chat history as a hidden implementation dependency. Use synthetic test data. Product cloud hosting, authentication, sync, online models and mobile installation remain future choices after reading quality is accepted.

One implementer owns an overlapping file set. Reviewers report findings without editing. Record the actual agent/tool used rather than claiming a model that is unavailable. At each handoff, update PROJECT-STATE.md with completed work, actual checks, unresolved issues and the next package. Later deliver docs/OPERATIONS.md and docs/DELIVERY.md as specified. No application tests or browser acceptance are implied by the preparation review.
