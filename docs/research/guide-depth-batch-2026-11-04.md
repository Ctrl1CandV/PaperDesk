# 导读深度批量修订汇总 · 2026-11-04

本记录汇总本轮按[导读写作工作流](../content/workflows/GUIDE-WRITING.md)完成的导读修订、实际检查和尚未完成的事项。它是工程与内容交接记录，不是读者验收，也不把结构检查当成论文事实复核。

## 范围与结果

本轮以 Transformer r5 与 RAG 综述 r5 为写作样例，修订其余导读。`content/catalog.json` 当前选择 24 篇导读；以下 17 个修订为本轮新增或更新的当前版本。

| 导读 | 当前修订 | 正文字符 | 限定性否定（每万字） | 独立审查 |
| --- | ---: | ---: | ---: | --- |
| transformer | r5 | 20,601 | 10 | 样例，读者已确认；独立审查未单列 |
| rag-survey | r5 | 23,791 | 9 | 样例，读者已确认；独立审查未单列 |
| agent-survey | r3 | 24,991 | 6 | 无，作者自核 |
| instructgpt | r3 | 24,981 | 6 | 无，作者自核 |
| react | r3 | 15,033 | 12 | 有独立抽查报告；中等问题已修正，未二次独立复核 |
| gpt3 | r2 | 25,502 | 5 | 无，作者自核 |
| rag | r3 | 26,411 | 8 | 无，作者自核 |
| llm-survey | r2 | 31,461 | 5 | 无，作者自核 |
| agentbench | r2 | 18,002 | 7 | 无，作者自核 |
| tau-bench | r2 | 21,431 | 6 | 无，作者自核 |
| autogen | r2 | 18,256 | 9 | 无，作者自核 |
| camel | r2 | 23,303 | 9 | 无，作者自核 |
| agentprune | r2 | 23,936 | 11 | 无，作者自核 |
| llm-evaluation-survey | r2 | 25,647 | 11 | 无，作者自核 |
| multi-agent-communication-survey | r2 | 24,614 | 6 | 无，作者自核 |
| multi-agent-collaboration-survey | r2 | 22,819 | 9 | 无，作者自核 |
| helm | r3 | 18,004 | 12 | 有独立抽查报告；中等问题已修正，未二次独立复核 |
| agent-evaluation-survey | r2 | 21,362 | 6 | 无，作者自核；2026-11-05 补做 |

`react` 的 r2 与 `helm` 的 r2 作为旧修订保留；当前选择分别是 r3。上表中 16 个有 `.cache/guide-work/<id>/spec.json` 的修订通过：

```text
node scripts/content/guide-work.mjs check <guideId>
```

`rag-survey` r5 是既有样例，没有 `guide-work` 工作目录，因此不以该命令作为证据；它和其余全部 17 个修订一起通过 `npm run validate:content`。

正文、信息卡、术语片段、固定原文核对记录和必要的原图均在各导读的交付范围内。逐篇核对记录位于 `docs/research/<guideId>-r<N>-review.md`；`react` 与 `helm` 另有 `-r3-independent-review.md`。

## 整合与工程检查

已合并共享文件并刷新导航索引：

- `content/catalog.json`：当前选择与保留修订；
- `content/library-briefs.json`：当前修订的信息卡；
- `content/glossary.json`：新增术语；
- `src/content/catalog-index.json`：由 `build-index` 生成。

实际命令与结果：

```text
npm run build -- --logLevel warn
Content valid: 55 guides, 590 units, 608 cited URLs, 3 editorial lenses, 12 pinned targets.
Library briefs valid: 51 revision-specific briefs.
Glossary valid: 409 reviewed terms.
Content navigation index: 55 retained revisions; bodies excluded.
typecheck passed; build passed with the existing large-chunk warning.
```

```text
npm test
529 passed, 0 failed, 1 skipped (530 total).
```

测试中的旧修订断言已更新为当前目录（`tests/integration/content-validation.test.mjs`、`tests/integration/prompt-budget-upgrade.test.mjs`）。`tests/e2e/reading-aids.spec.ts` 也已按当前 Transformer 结构更新，但本轮没有取得浏览器运行结果。

## 独立审查

- `docs/research/react-r3-independent-review.md`：独立抽查认为“需修正后合并”；图 2 优势表述、表 2 假阳性类别、两张图的替代文字、自编例子标注和笔误已修正。该报告是范围受限的抽查，不是全文核对或读者验收。
- `docs/research/helm-r3-independent-review.md`：独立抽查认为“需修正后合并”；图 7/17 的替代文字、图 26 两两比较例子、校正变体表述、重复段落、信息卡用语和审查状态已修正。报告仍明确列出未核对页和未确认条件。
- 其余 13 篇没有独立第二审阅；核对记录均标为作者自核。

## 未完成与限制

- **浏览器检查未完成**：`npm run test:e2e -- reading-aids.spec.ts reading-guidance.spec.ts library-brief.spec.ts` 在启动本地 `4174` 服务后超时；手动启动 Vite 后 `curl http://127.0.0.1:4174/` 返回 `No route to host`。这是当前执行环境的本机回环限制，不应当报告为浏览器测试通过。
- **页面视觉未检查**：本轮没有查看新修订的书架卡、深读正文、图 7/17、桌面或 390px 模拟窄屏截图；构建通过不代表视觉验收。
- **内容事实仍有边界**：`helm` 的 OPT 175B 分开校正 54.8% 对应 shot 数、图 7 对数概率来源、图 26 缺失/平局计入规则仍未确认；`react` 的原图 CC BY 4.0 记录沿用 r2，本轮未联网独立核实。
- **补做一篇（2026-11-05）**：`agent-evaluation-survey` 当初漏派，已由 deepseek-flash 按同一工作流补做 r2，整合者抽读核心章节后合并；书架上的 18 篇导读至此全部完成本轮修订。
- **读者验收未完成**：除读者已确认的 Transformer/RAG 两篇样例，其余导读尚待实际试读；独立抽查不是读者接受。
- **Git**：没有提交、推送或部署。

## 下一步

1. 在有本机回环的普通环境重跑相关 E2E，并查看桌面与 390px 模拟视口的书架卡、正文首图、图 7/17 和公式。
2. 由读者分批试读；优先 `react`、`helm`，再处理其余导读的实际阅读反馈。
3. 对 13 篇仅作者自核的导读安排独立抽查，至少覆盖核心机制、实验数字和覆盖声明。
4. 根据验收结果更新 `PROJECT-STATE.md`、[导读加深试点](reading-depth-pilot.md)和[运行说明](../development/OPERATIONS.md)中受影响的状态。
