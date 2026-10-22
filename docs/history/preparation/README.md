# Preparation snapshot

`HANDOFF.md` and `PACKAGE-MANIFEST.json` describe preparation revision codex-2026-10-21, before implementation. The manifest is unchanged: paths, byte counts and hashes refer to the original layout, not the current application.

The duplicate initial task prompt was retired; its requirements remain in the specifications and handoff. The obsolete `verify:preparation` command was removed because deliberate implementation changes cannot pass a preparation-only snapshot. Use content validation, tests and the build for current checks. Original content-integrity evidence remains in `../../evidence/`.

Current development starts at [START-HERE](../../../START-HERE.md). Historical statements about implementation or repository authorization do not describe the accepted first version.
