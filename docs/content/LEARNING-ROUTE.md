# Agent 记忆与动态决策：编辑阅读路线

> 历史路线：本页保留此前记忆与动态决策材料的组织依据。当前书架已经调整为通信、评价与基础学习三组，具体18篇及顺序见 [当前阅读集合](RESEARCH-READING-SET.md)。本页提到的部分导读保留固定入口，但不再默认展示。

这是一条公共学习路线，用来连接平台已有材料与后续核心理论，不是个人已读记录、强制课程或已成立的论文选题。书库有一篇文章只说明材料可用，不能说明读者已经掌握。下面的排列依据解释依赖；可以随具体问题调整，不需要全部学完才能做一个小实验。

## 已有基础与已交付扩展

现有 Agent/LLM 综述、Transformer、GPT-3、InstructGPT、CoT、RAG、ReAct、Toolformer、Reflexion 和 HELM，分别提供模型、交互、检索、经验更新及评价的入口。它们尚不能覆盖部分可观察决策、元推理、信念修订和长期在线评价的全部基础。

首批扩展选择 **A Survey on the Memory Mechanism of Large Language Model based Agents**，主源固定为 [arXiv 2404.13501v1](https://arxiv.org/html/2404.13501v1)。它适合承接 RAG、ReAct 和 Reflexion，建立记忆来源、表示、操作与评价之间的关系。正式 TOIS 版另有 [DOI 10.1145/3748302](https://doi.org/10.1145/3748302)；预印本与正式版的内容覆盖不能混用。

随后补充了 [StreamingLLM 导读](../../content/guides/streamingllm.md)与[概念漂移综述导读](../../content/guides/concept-drift-survey.md)。前者固定 arXiv v4，解释有限缓存怎样维持持续语言建模及其记忆边界；后者依据含附录的作者接收稿，解释规律变化、检测与适应，以及遵守时间顺序的评价。接收稿的物理页码与正式出版版不能混用。三篇新增材料均为有明确覆盖边界的 mainline 导读。

下表中的部分可观察决策、信念修订和元推理仍是后续候选，尚未制作本地导读；来源可定位不等于已完成全文审阅。

## 核心模块与候选入口

| 模块 | 要理解的核心问题 | 阅读入口及前置连接 |
|---|---|---|
| 记忆机制的整体地图 | 信息从哪里来、以什么形式保存、如何写入/管理/读取，以及怎样评价实际作用 | Memory Mechanism 综述（2024 v1）；连接 RAG 的外部知识、ReAct 的交互历史和 Reflexion 的反馈经验。 |
| 持续序列处理与有限上下文 | 保持模型运行和记住全部过去有哪些差别？窗口、KV cache 和位置处理约束了什么？ | 已有 [StreamingLLM 导读](../../content/guides/streamingllm.md)，技术依据为 [arXiv v4](https://arxiv.org/html/2309.17453v4)，发表身份为 [ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/5e5fd18f863cbe6d8ae392a93fd271c9-Abstract-Conference.html)；先补 Transformer、KV cache 与位置编码。 |
| 部分可观察环境与状态估计 | 观察不等于真实状态；怎样利用历史维护对当前状态的判断？ | [Planning and Acting in Partially Observable Stochastic Domains，1998](https://people.csail.mit.edu/lpk/papers/aij98-pomdp.pdf)；需要条件概率、期望和马尔可夫性质，以 Agent/行动循环作为直觉入口。 |
| 新证据与信念修订 | 旧前提失效时，哪些结论应撤回，哪些仍可保留？ | [On the Logic of Theory Change，AGM，1985](https://www.cambridge.org/core/journals/journal-of-symbolic-logic/article/abs/on-the-logic-of-theory-change-partial-meet-contraction-and-revision-functions/7ED837BAD5FB6D9A7C77906D73527F9C)；先解释逻辑闭包、收缩和修订，不直接要求完整掌握公理证明。与 Reflexion 是问题联系，不是同一种机制。 |
| 有限理性与元推理 | 继续计算的收益是否抵得上时间代价，何时应停止思考或继续观察？ | [Principles of Metareasoning，1991](https://www.sciencedirect.com/science/article/abs/pii/000437029190015C)；可先读作者的 [Metareasoning 条目草稿，1997](https://people.eecs.berkeley.edu/~russell/papers/mitecs-metareasoning.pdf)。草稿不冒充 1991 年论文全文。 |
| 非平稳环境与在线评价 | 过去有效的规律何时失效，如何评价适应而不使用未来信息？ | 已有[概念漂移综述导读](../../content/guides/concept-drift-survey.md)，正式文献为 [ACM Computing Surveys，2014](https://doi.org/10.1145/2523813)，实际阅读含附录的作者接收稿；连接 HELM 的评价意识。状态变化与数据分布/关系漂移需要区分，不能混称。 |

记忆综述建立分类地图后，可以优先读 StreamingLLM，理解“持续处理”与“长期记忆”的边界；再按问题选择状态估计、修订或元推理。流式多模态、事件检测、参数持续学习等分支，在核心问题出现后继续补充，避免把全部相关技术变成前置门槛。

## 每轮阅读留下什么

导读应帮助读者区分：论文提出的问题和假设；核心方法或理论如何成立；原文证据支持的范围；仍不清楚的概念和下一篇材料。原文结论、辅助解释和待验证问题分别标注。经典论文服务于概念理解，近期论文服务于了解当前方法与边界，二者不能互相替代。

新增文章继续走 CONTENT.md 与 CONTENT-UPDATES.md 的来源审阅、不可变版本、导入和渲染检查流程。学习路线不自动创建阅读状态、私人笔记或探索记录，也不宣称研究空白。
