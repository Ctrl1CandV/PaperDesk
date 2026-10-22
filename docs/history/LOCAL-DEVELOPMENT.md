> Archived milestone. Current instructions: [Operations](../OPERATIONS.md) and [project state](../../PROJECT-STATE.md). Screenshot paths and commands below describe the original run; generated PNGs are not bundled.

> Historical W1 record. For the current complete platform and commands, use OPERATIONS.md and DELIVERY.md. W1 was accepted before W2–W6 implementation.

# Local development at W1

Specification 1.1. This document covers the implemented W0/W1 commands. The complete product operations and acceptance handoff remain W6 deliverables.

## Runtime and installation

Verified runtime: Node 22.23.3, npm 10.9.9. Direct dependencies are exact versions in package.json and all transitive dependencies are pinned by package-lock.json. React 19.3.1, Vite 8.3.5 with plugin-react 6.1.2, TypeScript 7.0.2 and Playwright 1.64.1 were installed. The runtime satisfies the installed Vite engine requirement. Current technical references were checked at the [Vite guide](https://vite.dev/guide/), [React versions](https://react.dev/versions), [Mermaid security setting](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html) and [KaTeX options](https://katex.org/docs/options.html).

From the project directory, in a shell without a profile dependency:

```text
npm ci
npm run validate:content
npm test
npm run build
npm run preview
```

For editing, use `npm run dev` in place of preview. Both use `http://127.0.0.1:4173`, strict port and loopback binding. Stop one before launching the other. Do not substitute another host or port for normal reading; future personal storage will belong to the origin. There is no installation, offline or synchronization promise.

Stop all development/preview processes before `npm ci` on Windows: loaded native build-tool files cannot be replaced. The project-local npm cache is `.npm-cache/`. With a populated cache, `npm ci --offline --no-audit` was successfully exercised; the first install requires package downloads. Do not copy generated caches into a content package.

## Browser checks

Install the browser locally with PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.playwright'
npm exec -- playwright install chromium --only-shell
npm run test:e2e
```

The Playwright configuration selects `.playwright/` itself when tests run. It starts a separate strict loopback origin at port 4174 and uses only synthetic test state. Screenshots contain webpage pixels only and are written to `docs/evidence/`. The external source document is mocked for the new-tab test; this verifies deliberate opening, URL, referrer policy and reading return, not online source availability or anchor accuracy. No private note data is needed.

With a production preview already running on port 4173, `node tests/preview-smoke.mjs` checks the built reader independently of development mode. In a restricted execution environment, localhost browser checks may require explicit network/process execution permission; ordinary local terminals do not use that sandbox.

The clearly labeled `/__fixtures/reader` route exists in development only for long tables/formulas and unsafe-input checks. It is excluded from the production route. It is not a research essay or an additional guide.

## Content and continuation

`npm run validate:content` checks the supplied schemas and semantic invariants, including exact UTF-8 body hashes, stable units, URLs and all retained exploration targets. The validator is read-only; source accuracy still requires editorial review. Raw HTML, external images and unsupported Mermaid statements are rejected. Formula rendering uses bounded expansion/size, isolated macros and `trust: false`. The renderer also fails closed on unsupported content.

`npm run verify:preparation` checks the original preparation snapshot. It passed 30/30 before implementation. It now reports deliberate changes to implementation-facing files; it must not be used to revert legitimate work. Content and schema files remain unchanged. See PROJECT-STATE.md for the exact changed preparation files.

The content importer, transactional catalog switch/recovery, records store and backup format are not implemented at W1. Do not edit an existing immutable guide revision to add new claims. Follow CONTENT.md and MAINTENANCE.md in W2, after the reader feedback gate. The generic loader already reads catalog metadata and stable units; future content should not require article-specific components.

## Dependency maintenance

The math parser's transitive KaTeX dependency initially triggered three linked low-severity audit findings. `overrides.micromark-extension-math.katex` now follows the direct patched KaTeX version (`$katex`); the resulting npm audit reports zero findings. Keep this override until the parser's dependency range is updated and verify the formula fixture when changing it. No forced major downgrade was applied.

Mermaid is dynamically imported from the local dependency. Its distributed renderer includes additional diagram chunks even though the content policy only accepts the small reviewed flowchart subset. Production build currently reports large-chunk warnings; no remote script or diagram service is used.
