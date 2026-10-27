# Reference notes

Technical documentation checked during preparation. Implementation must recheck supported versions and actual browser behavior. These references support constraints, not an endorsement or measured product quality.

| Source | Use in this design |
|---|---|
| [Vite guide](https://vite.dev/guide/) | React/TypeScript project template and static build workflow; no server backend implied. |
| [react-markdown security](https://github.com/remarkjs/react-markdown#security) | Disable raw HTML; URL policy and plugins/components remain security boundaries. |
| [KaTeX options](https://katex.org/docs/options.html) | trust=false, controlled macros and local error handling. |
| [Mermaid security level](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html) | Strict mode encodes HTML and disables click functionality; do not allow content to lower the policy. |
| [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Browser records are not permanent backup; handle quota/eviction and origin separation. |
| [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) | Secure context/user action constraints and manual fallback. |
| [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts) | Localhost exception does not make a phone's ordinary LAN HTTP connection secure. |
| [Chrome install criteria](https://web.dev/articles/install-criteria) and [install criteria update](https://developer.chrome.com/blog/update-install-criteria) | Installation routes differ; do not make service workers/offline support universal prerequisites. Future work only. |
| [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) | Potential future HTTPS operation, not a selected deployment. |
| [SQLite backup](https://sqlite.org/backup.html) and [WAL](https://sqlite.org/wal.html) | Future consistent snapshots and WAL file handling. |
| [Distill Activation Atlas](https://distill.pub/2019/activation-atlas/) | Optional content/figure relationship study. Text consulted; no successful visual capture in this preparation. |

The supplied reading and visual contracts are sufficient implementation inputs. External authoring/design skills are not runtime dependencies; no installation path, source repository identity or global tool setup is required.

Paper evidence is kept beside each guide in its metadata and in its prose. The guide coverage declaration is authoritative about what this package actually explains. A source URL being listed does not certify every claim or figure in the source.
