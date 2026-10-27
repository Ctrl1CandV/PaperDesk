# 固定原文证据记录

本目录包含三篇 r2 导读的六条主张级证据记录，使用 `schemas/reading-evidence-v1.schema.json`。记录绑定精确的导读修订/单元与原文来源修订、解析修订、原文单元，并保留条件、归属和核验范围。审查者均为 **AI**，不是人工审核；`visually-checked` 仅表示记录中明确列出的原文页/图表已看像素并与相关文字核对，不是整篇论文或整个 parser revision 已核验。

| 文件 | 绑定导读单元 | 本次核验范围 |
|---|---|---|
| [memory-r2-taxonomy-checked.json](memory-r2-taxonomy-checked.json) | agent-memory-survey / 2 / u03 | v1 图4与§5来源、形式、操作三维分类；不逐项核全部代表工作 |
| [memory-r2-evaluation-checked.json](memory-r2-evaluation-checked.json) | agent-memory-survey / 2 / u06 | v1 图5直接/间接评价及主客观分支；评价归因限制属于编辑解释 |
| [streaming-r2-cache-diagram-checked.json](streaming-r2-cache-diagram-checked.json) | streamingllm / 2 / u04 | v4 图4、§3.2及新增缓存教学图；有限KV与连续缓存位置，未做实验复现 |
| [streaming-r2-streameval-checked.json](streaming-r2-streameval-checked.json) | streamingllm / 2 / u06 | v4 表7指定模型/缓存/距离的数值、样本与单位；不外推全部长对话任务 |
| [rag-r2-two-token-expansion-checked.json](rag-r2-two-token-expansion-checked.json) | rag / 2 / u03 | 固定正式版第3页两种边缘化公式与教学展开；单词元充分条件及多词元特殊等价 |
| [rag-r2-fever-dev-checked.json](rag-r2-fever-dev-checked.json) | rag / 2 / u05 | 第7–8页FEVER开发集消融与解释；不混测试集，不裁定表4与正文数值冲突 |

先按 [运行说明](../../OPERATIONS.md#local-original-papers-and-evidence) 导入相同的固定原文身份，再从项目根目录逐个导入这些 JSON，最后重建索引：

```text
npm run reading:materials -- evidence --file docs/research/reading-evidence/memory-r2-taxonomy-checked.json
npm run reading:materials -- evidence --file docs/research/reading-evidence/memory-r2-evaluation-checked.json
npm run reading:materials -- evidence --file docs/research/reading-evidence/streaming-r2-cache-diagram-checked.json
npm run reading:materials -- evidence --file docs/research/reading-evidence/streaming-r2-streameval-checked.json
npm run reading:materials -- evidence --file docs/research/reading-evidence/rag-r2-two-token-expansion-checked.json
npm run reading:materials -- evidence --file docs/research/reading-evidence/rag-r2-fever-dev-checked.json
npm run reading:materials -- reindex
```

CLI 使用严格 schema、`validateEvidenceRecord` 和原文单元检查；已有 evidenceId 的不同内容不能覆盖。导读修订/单元与来源的关系还进入固定索引代次的验证与工具输出。若解析身份不匹配，应先恢复相同固定材料/解析输出，或重新核查并建立新的证据身份；不要只改 hash 来绕过验证。导入不调用模型、不改变阅读标记，也不把所有解析单元的 `unreviewed` 改为已核。

检索语料为记忆综述 v1 HTML、StreamingLLM v4 HTML、RAG 正式版 PDF，共 618 个单元。另将实际用于视觉核查的记忆综述 v1 PDF 与 StreamingLLM v4 PDF 用独立 source ID 和 `--reference-only` 固定保存；它们不参与文本检索，避免与 HTML 形成重复候选，但其用途仍属于 indexGeneration 身份。已存在的 source ID 不能被改成另一种用途。

材料备份应包含这五份原始文件、其 manifests/derived 和六条已导入的 evidence 记录；索引可重建，原文和核验记录不能随索引清理。AI 会话备份中的引用快照以及浏览器个人记录备份都不能替代这份材料备份。备份/恢复使用新目标目录，具体命令、暂存遗留和验证边界见 [运行说明](../../OPERATIONS.md#back-up-original-materials-separately)。实际页面/图表核验与问答限制见 [独立审查报告](../reading-upgrade-independent-review.md)。
