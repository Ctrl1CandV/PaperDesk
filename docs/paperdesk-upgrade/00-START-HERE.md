# PaperDesk 本轮实施材料：从这里开始

版本：1.0 · 日期：2026-10-27。

这套材料把已经认可的阅读体验保留下来，明确内容生产、原文证据、数据管理、AI 解答与研究探索的下一轮实施要求。它是一套工作区文档与任务说明，尚未修改应用代码，也未执行其中的验收。它不属于 skill/plugin，不要求修改 `grad-companion-plugin`。

## 放置位置

把压缩包解压到 **PaperDesk 项目根目录**。解压后本文件应位于 `docs/paperdesk-upgrade/00-START-HERE.md`，同目录其他文件一起保留。只会新增本目录；不要用它替换项目现有 `AGENTS.md`、`CONTENT.md`、`AI-READING.md` 或已有源码。

若本目录已经存在旧版材料，先比较和保留旧版，再合并本轮文件，避免覆盖未完成的实施记录。包中的 `SHA256SUMS.txt` 仅用于核对这次交付文件，不是产品内容的哈希清单。

## 文件分工

| 文件 | 用途 | 何时读 |
|---|---|---|
| [01-CONTENT-WORKFLOW.md](01-CONTENT-WORKFLOW.md) | 导读与深读的生产、压缩、审阅和发布要求 | 制作任何新阅读内容前 |
| [02-SOURCES-AND-VISUALS.md](02-SOURCES-AND-VISUALS.md) | 原文保存、章节/图表/页码定位、教学图和专题深读 | 处理证据与复杂内容时 |
| [03-AI-DATA-IMPLEMENTATION.md](03-AI-DATA-IMPLEMENTATION.md) | 存储、备份、按需加载、原文索引、解释与探索问答 | 实施前完整阅读 |
| [04-CODEX-TASKS.md](04-CODEX-TASKS.md) | 可直接交给 Codex 的实施任务与阶段交付 | 启动实施时 |
| [05-ACCEPTANCE.md](05-ACCEPTANCE.md) | 功能、迁移、性能、内容与真实问答质量验收 | 开始前确认，完成后逐项检查 |
| [06-CODEX-FINAL-REVIEW.md](06-CODEX-FINAL-REVIEW.md) | 交给独立 Codex 会话的最终验收任务 | 实施完成后 |
| [07-SOURCES.md](07-SOURCES.md) | 基准代码与一手研究依据 | 核对事实与设计取舍时 |
| `templates/` | 证据记录示例、真实题集示例、验收报告模板 | 创建对应产物时 |

## 给 Codex 的最短启动指令

> 请在当前 PaperDesk 项目内，先读 AGENTS.md 和 docs/paperdesk-upgrade/00-START-HERE.md，再执行 docs/paperdesk-upgrade/04-CODEX-TASKS.md。按其中阶段落实代码、内容样板和验证，不要只输出计划。不要修改或集成 grad-companion-plugin。

实施完成后，新开独立验收会话并提供：

> 请按 docs/paperdesk-upgrade/06-CODEX-FINAL-REVIEW.md 对当前 PaperDesk 进行只读独立验收，报告通过、失败和未验证项，不能仅依据实施者总结判断。

## 本轮已经确定的决定

保留现有视觉、导读三段式和深读自然段表达；保留审核内容不可变版本、原有阅读记录、来源快照和 SQLite。优先修复高频保存时的全库处理，再做内容按需读取、原文证据与索引，最后形成可检验的理解和研究探索回答。至少以记忆综述、StreamingLLM、RAG 三篇现有内容跑通全链路。

“深读”表示讲解深度，`mainline/full-survey` 表示覆盖范围；二者不能互相代替。研究建议必须区分文献证据与假设，并落到可执行实验、比较条件和反证。定位、图表和问答来源需要可回到确切版本。

不安排插件改造、云部署、网站账号、同步系统或自动改写个人研究结论。模型配置与联网使用延续现有明确授权；缺外部条件时完成未受影响的部分，真实质量验证如实记为未完成。

## 如何与现有项目文档一起使用

本包依据 PaperDesk `1668527a9e84cacac85019c569f44719bb90252d` 撰写。后续代码可能已经前进：实施者先做差异核对，把已存在的改进视为已完成候选，补证据即可，不重复重构或退回旧提交。

01/02 定义长期内容工作流；03/04 定义这次工程改造；05 定义完成门槛。它们不把现有严格 schema 变成新 schema，也不宣称建议字段已经可直接导入。新增来源、索引、备份格式需显式版本与迁移，阈值为本轮拟定工程目标。实际通过状态只写进实施后的验收报告。

Codex 应将入口链接加到 `docs/README.md`、`START-HERE.md`，并在 `docs/CONTENT.md`、`docs/AI-READING.md` 中链接相关工作流。现有架构/操作说明中与已实现状态冲突的历史措辞应针对性修正；不要再复制一份彼此矛盾的规范。实施后把实际变化与未验证项写入 `PROJECT-STATE.md`。
