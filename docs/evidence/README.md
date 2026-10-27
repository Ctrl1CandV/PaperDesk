# Verification evidence

The [2026-10-27 reading/AI upgrade report](reading-ai-upgrade-report.md) separates engineering, content, performance and unverified real-model quality. The [30-question evidence set](reading-ai-qa.json) retains per-question fixed materials, expected behavior and before/after retrieval results; Chinese direct recall remains below target.

JSON reports preserve named historical content-hash comparisons, isolated rebuild results and synthetic content-update checks. Their counts and paths describe those runs; do not rewrite them to imply a new check occurred.

Browser tests generate webpage-only PNGs here. These are ignored and reproducible; old iterations were cleaned. Two reviewed library views are curated and versioned under `../images/`. Tests use synthetic or empty browser contexts; real notes and operator screenshots do not belong here.

See [PROJECT-STATE](../../PROJECT-STATE.md) for current checks and limitations. Narrow viewport and CSS-zoom simulations are not physical-device acceptance.
