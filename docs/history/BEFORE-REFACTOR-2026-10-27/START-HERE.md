# Continue PaperDesk

The first integrated version (0.1.0, product specification 1.1) has completed reader acceptance. It includes survey reading, paper assistance, research exploration and sustainable local accumulation. W1 was a feedback milestone, not the complete release.

1. Read [AGENTS](../../../AGENTS.md) and [PROJECT-STATE](../../development/PROJECT-STATE.md) for boundaries and current checks.
2. Use [Operations](../../development/OPERATIONS.md) for install/start, records, backups and content updates. The [documentation index](../../README.md) separates current contracts from historical reports.
3. Before changes, read the relevant [product](../../development/PRODUCT.md), [implementation](../../development/IMPLEMENTATION.md), [privacy](../../development/PRIVACY.md) and module contracts. Use [Git policy](../../development/GIT-POLICY.md) for repository work.

Run `npm ci` on a fresh checkout, `npm run build`, then `npm start`. This starts the website and local AI service together and opens `http://127.0.0.1:4173/library`. Ctrl+C stops both. Keep the origin fixed for browser records; stop project servers before reinstalling on Windows.

For the optional reader AI panel, open **AI 设置** to connect through official ChatGPT login or enter an OpenAI-compatible API's Base URL, Model ID and Key. Settings are saved in the ignored backend file; saved keys are never returned to the page. No second terminal is needed. `npm run dev` and `npm run preview` also start both services, with `-- --open` for automatic browser opening. For frontend-only use or isolated browser tests, use `npm run dev:web` or `npm run preview:web`. See [AI reading](../../development/AI-READING.md) for setup, data boundaries and separate conversation backups.

The composer's combined connection/search control opens **AI 设置**. Under **联网查证**, save a Tavily API Key and explicitly enable **允许联网查证** when wanted. Saving the key alone never sends a search or enables search permission; credentials remain backend-only. The reader's **资料** button shows the exact guide/selection scope for the current question without adding another scrolling area above the conversation.

To use the API as a quota fallback, save its configuration while keeping ChatGPT selected. **ChatGPT 订阅 → 额度用尽时使用备用 API** is enabled by default and can be disabled independently. Only an explicit subscription/application usage-limit error switches that question to the configured API; separate API charges may apply.

Under **ChatGPT 订阅**, choose **思考强度（Thinking）** and **保存模型** for subsequent questions. Choices follow the model's advertised capabilities; **模型默认** works when no capability choices are supplied. **刷新模型** reloads the catalog immediately; ordinary questions reuse it for up to five minutes. After source updates, restart the combined local service to use the new backend.

The library has fourteen current articles (four surveys, ten papers) and twenty-one retained guide revisions. The reading upgrade adds r2 of StreamingLLM, RAG and the agent-memory survey while retaining all earlier bytes. Add reviewed immutable revisions rather than editing a published body. See [content updates](../../content/CONTENT-UPDATES.md) and [source-review records](../../research).

The [reading/AI upgrade report](../reading-ai-upgrade/REPORT.md) records the 2026-10-27 implementation and remaining acceptance gaps. The durable [content workflow](../../content/workflows/CONTENT-WORKFLOW.md) and [sources/visuals workflow](../../content/workflows/SOURCES-AND-VISUALS.md) govern future reviewed additions. AI/record storage now uses incremental statistics and paginated reads; guide bodies load on demand. Fixed original materials and reviewed evidence remain separate from rebuildable indexes. Their CLI backup is separate from AI conversations and browser records; see Operations before moving data. This implementation does not certify real-model answer quality: direct Chinese retrieval on the development questions remains below the proposed target.

The original handoff and byte manifest are archived under `docs/history/preparation/`. Their paths and status describe the preparation snapshot, not the current checkout. Superseded screenshots are reproducible local artifacts; curated accepted library images are in `docs/images/`.

Current continuation uses the practical personal-use baseline in PROJECT-STATE: retain the completed storage, source links and guide/card workflows; improve concrete reading or answer problems when they arise. The earlier retrieval percentage is diagnostic, not a mandatory blocker. Display formulas are now centered, teaching diagrams have a cleaner style, and AI instructions favor direct answers with depth matched to the question. Real-model answer quality still needs observation in normal deliberate use.

No previous conversation, other repository, private biography or real notes are needed. Continue through targeted improvements and reviewed content additions; deployment and cloud services remain separately scoped.
