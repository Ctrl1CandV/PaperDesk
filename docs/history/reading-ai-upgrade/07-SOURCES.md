# 依据、现状与结论边界

本包编写于2026-10-27。再次读取GitHub后，PaperDesk主分支基准仍为`1668527a9e84cacac85019c569f44719bb90252d`。引用代码用于说明当时实现；本包不宣称已经修改应用、运行扩容测试或完成真实模型质量验收。性能阈值、30题结构、阶段安排和新数据关系属于本轮工程设计。

## A. PaperDesk代码与内容证据

| 依据 | 支持的现状判断 |
|---|---|
| [项目状态](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/PROJECT-STATE.md) | 14篇当前导读、18个保留修订；已有测试与真实质量/长期稳定性边界 |
| [内容生产合同](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/CONTENT.md)与[guide-v2](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/schemas/guide-v2.schema.json) | 导读、深读、unit、引用、覆盖及严格schema已存在；mainline与full-survey不同 |
| [内容更新](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/CONTENT-UPDATES.md)与[导入器](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/scripts/content-import.mjs) | 已有不可变修订、暂存验证、锁、原子目录切换与恢复；不应从零重复设计 |
| [书架brief数据](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/content/library-briefs.json)与[回退逻辑](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/src/library/briefs.ts) | 卡片完整段落由独立编辑层提供，按guide+revision绑定；没有匹配项时回退orientation |
| [前端内容仓库](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/src/content/repository.ts) | eager导入全部正文/元数据；list和关联读取的联动需审查 |
| [后端内容与检索](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/server/content.mjs) | 已有跨导读词项搜索和章节读取；搜索范围不含原论文全文；当前上下文及工具预算 |
| [AI存储](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/server/store.mjs)与[HTTP运行链](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/server/http.mjs) | SQLite事务/WAL、幂等、检查点与恢复；16MiB总预算、每轮2MiB预留和全库快照检查 |
| [个人存储](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/src/records/store.ts)与[个人验证](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/src/records/validation.ts) | IndexedDB事务/冲突检测；高频保存构造全库快照；旧5MiB备份预算 |
| [AI来源验证](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/server/validation.mjs)与[前端API类型](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/src/assistant/api.ts) | 来源目前为guide/web，context与工具名称严格白名单；original需要贯穿式升级 |
| [目录schema](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/schemas/catalog.schema.json)与[内容校验](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/scripts/content-validation.mjs) | 当前guide上限1000、保留entries上限10000；完整校验累计64MiB及单文件预算 |
| [AI说明及验证边界](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/AI-READING.md) | 既有有限真实API烟测、合成运行测试；不能由成功响应推断学术正确性 |
| [RAG审阅](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/research/rag-review.md)、[StreamingLLM审阅](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/research/streamingllm-review.md)、[记忆综述审阅](https://github.com/Ctrl1CandV/PaperDesk/blob/1668527a9e84cacac85019c569f44719bb90252d/docs/research/agent-memory-survey-review.md) | 已有逐主张/条件/图表检查实践，适合作为可重复工作流的种子；不表示已全量复现实验 |

## B. 阅读界面与学术问答的一手参考

1. [The Semantic Reader Project，2023](https://arxiv.org/abs/2303.14334)：按发现、效率、理解、综合等阅读任务设计辅助界面。用于支持任务分层，不能证明PaperDesk某个布局已经有效。
2. [ScholarPhi，CHI 2021作者论文](https://scholarphi.org/assets/pdf/scholarphi-chi-2021.pdf)：在术语/符号使用处提供定义和上下文定位。用于原文入口与复杂概念的就近辅助，不要求复制其完整产品交互。
3. [FutureHouse：PaperQA2工程研究，2024](https://www.futurehouse.org/research/engineering-blog-journey-to-superhuman-performance-on-scientific-tasks)：分开检索、证据重排/上下文化处理和回答，并测正确性及来源召回。其目标偏重准确性，不能把耗时/成本或基准成绩直接移植成本项目承诺。
4. [Anthropic：Contextual Retrieval，2024](https://www.anthropic.com/research/contextual-retrieval)：切块需要文档背景，词项和语义检索各有适用处。用于设计候选方案；没有“必须上向量库”的结论，具体增益需本项目测试。
5. [ALCE，EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398/)：答案正确性与引用质量需要分别评价。用于拆开引用存在、支持与覆盖，不能把自动评分当最终事实裁决。
6. [Lost in the Middle，TACL 2024](https://aclanthology.org/2024.tacl-1.9/)：被测模型利用长上下文会受相关信息位置影响。用于增加噪声/位置测试，不推断所有后续模型具有同样下降幅度。

## C. 实施机制参考

- [SQLite FTS5](https://www.sqlite.org/fts5.html)：全文查询、tokenizer与BM25的官方能力说明。实际Node构建支持、中文分词和语料效果需验证。
- [SQLite Online Backup](https://www.sqlite.org/backup.html)：一致性备份的官方机制与边界。具体Node接口和运行时版本要检查，不凭文档存在假定当前依赖已接通。
- [Vite glob import](https://vite.dev/guide/features.html#glob-import)：延迟与eager导入的官方行为说明。按需加载效果还取决于调用方是否立即加载全部模块。

## D. 三篇样板的固定原文入口

- [Agent记忆综述，arXiv 2404.13501v1](https://arxiv.org/html/2404.13501v1)：固定2024-04-21版本；不能当作最新领域综述。
- [StreamingLLM，arXiv 2309.17453v4](https://arxiv.org/html/2309.17453v4)：固定2024-04-07版本；正文、表格和附录条件应一起读取。
- [RAG，NeurIPS 2020正式PDF](https://proceedings.neurips.cc/paper/2020/file/6b493230205f780e1bc26945df7481e5-Paper.pdf)：期刊/会议记录可核书目信息，技术证据固定此版。

本轮已对部分定义、数值及代码路径做只读核对，并查看仓库提供的界面截图；没有对全库每一论断做独立审核，也未运行大规模真实问答。01–06要求的源文件保存、版本绑定、图像核验、程序改造和验收，均需在实际工作区完成并记录。
