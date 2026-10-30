# 通信、评价与基础学习：当前阅读集合

本轮书架包含 **18 篇独立文献：7 篇综述、11 篇论文**。其中8篇沿用现有已发布导读，10篇新增主线讲解。三组互不重复计数；分组是公共编辑阅读路线，不是个人阅读记录或已确定的研究选题。书架存在一篇文章不代表已经阅读原文。

## 多智能体通信：两篇综述与三篇论文

| 次序 | 材料与本地导读 | 采用原文 | 选择理由 |
| --- | --- | --- | --- |
| 1 | [Beyond Self-Talk 通信综述](../../content/guides/multi-agent-communication-survey.md) | [2502.14321v3](https://arxiv.org/abs/2502.14321v3) | 以通信架构、策略与范式建立方法地图，区分谁与谁交流以及如何利用消息 |
| 2 | [多智能体协作机制综述](../../content/guides/multi-agent-collaboration-survey.md) | [2501.06322v1](https://arxiv.org/abs/2501.06322v1) | 补充目标关系、角色、结构和编排维度，与通信综述互补 |
| 3 | [CAMEL](../../content/guides/camel.md) | [2303.17760v2](https://arxiv.org/abs/2303.17760v2) | 用双角色系统理解协议、共享历史、失败与停止条件 |
| 4 | [AutoGen](../../content/guides/autogen.md) | [2308.08155v2](https://arxiv.org/abs/2308.08155v2) | 把消息传递、工具反馈和控制流程连接为可执行协作 |
| 5 | [AgentPrune](../../content/guides/agentprune.md) | [2410.02506v1](https://arxiv.org/abs/2410.02506v1) | 进入通信冗余、结构选择和效果—成本比较；明确保留该版本表格疑点 |

先用综述区分设计变量，再通过CAMEL/AutoGen恢复具体消息过程，最后读AgentPrune如何改变连接。目标是逐步形成可检验的问题，例如哪一类消息影响结果、哪些跨轮信息不可省略，而非先接受“更多Agent一定更好”。

## Agent与模型评价：两篇综述与三篇论文

| 次序 | 材料与本地导读 | 采用原文 | 选择理由 |
| --- | --- | --- | --- |
| 1 | [大模型评测综述](../../content/guides/llm-evaluation-survey.md) | [2307.03109v1](https://arxiv.org/abs/2307.03109v1) | 建立测什么、在哪里测、怎样解释分数的基本框架 |
| 2 | [Agent评测综述](../../content/guides/agent-evaluation-survey.md) | [2503.16416v1](https://arxiv.org/abs/2503.16416v1) | 把能力、应用、通用Agent与评测框架联系起来，区分结果、步骤和轨迹 |
| 3 | [HELM，沿用r2](../../content/guides/helm.md) | 以已发布r2元数据中的固定来源为准 | 理解场景、适配和多指标如何共同定义一次比较 |
| 4 | [AgentBench](../../content/guides/agentbench.md) | [2308.03688v2](https://arxiv.org/abs/2308.03688v2) | 理解跨交互环境的指标、归一化总分和终止类型 |
| 5 | [τ-bench](../../content/guides/tau-bench.md) | [2406.12045v1](https://arxiv.org/abs/2406.12045v1) | 分清一次成功、重复成功、最终状态和过程约束 |

这些固定版本用于学习测量与实验设计，不作为当前模型排名。两篇综述的正式发表身份与所采用预印本版本分别记录；原文历史开放问题不直接认定为今天的研究空白。

## Agent与大模型基础：三篇综述与五篇论文

| 类型 | 材料 | 在路线中的作用 |
| --- | --- | --- |
| 综述，沿用 | [LLM综述](../../content/guides/llm-survey.md) | 建立预训练、能力与使用方式的整体认识 |
| 综述，沿用r2 | [Agent综述](../../content/guides/agent-survey.md) | 从语言模型转向环境、行动与系统组织 |
| 综述，新增 | [RAG综述](../../content/guides/rag-survey.md)，[2312.10997v5](https://arxiv.org/abs/2312.10997v5) | 把外部知识接入拆成检索、生成、增强与评价环节 |
| 论文，沿用 | [Transformer](../../content/guides/transformer.md) | 理解注意力与序列建模 |
| 论文，沿用 | [GPT-3](../../content/guides/gpt3.md) | 理解预训练与上下文学习 |
| 论文，沿用r2 | [InstructGPT](../../content/guides/instructgpt.md) | 理解指令跟随、偏好材料与训练阶段 |
| 论文，沿用r2 | [RAG](../../content/guides/rag.r2.md) | 具体理解检索与生成怎样结合 |
| 论文，沿用 | [ReAct](../../content/guides/react.md) | 理解行动、观察和后续判断之间的循环 |

建议先读LLM综述，再按缺口补Transformer、GPT-3和InstructGPT；接着把RAG综述与原始RAG对照，最后用Agent综述和ReAct进入交互系统。可以按问题跳读，不要求先全部完成基础材料。

## 当前书架之外的材料

Toolformer、Reflexion、Chain-of-Thought、Agent记忆综述、StreamingLLM、概念漂移综述已从本轮默认书架及默认导读检索移除。它们并非不相关或质量不合格，只是本次限定数量下未选入核心集合。原始导读文件、固定修订入口、旧笔记和摘录引用保留；`catalog.archivedGuideIds`控制这一选择，移除相应标识可恢复显示。既有原文材料亦未删除。

## 来源、审阅与使用边界

新增10篇均提供连续中文讲解、章节目标、三段式书架简介、固定来源和覆盖声明；三篇通信论文包含自绘教学流程，评测论文包含必要公式。每篇实际阅读固定原文主线，并对关键图表进行视觉核对；没有实验复现，也不声称覆盖所有附录或全部被引工作。

- RAG：[作者记录](../research/rag-survey-review.md)、[独立审阅](../research/rag-survey-independent-review.md)。
- 通信综述：[作者记录](../research/communication-surveys-review.md)、[独立审阅](../research/communication-surveys-independent-review.md)。
- 通信论文：[作者记录](../research/communication-papers-review.md)、[独立审阅](../research/communication-papers-independent-review.md)。
- 评价材料：[作者记录](../research/evaluation-reading-review.md)、[独立审阅](../research/evaluation-independent-review.md)。

本机材料库已保留10份固定HTML与10份PDF。HTML供原文文本检索，PDF以reference-only保留作视觉来源，避免重复参与检索。解析状态保持partial，自动解析单元保持unreviewed；导读及局部图表审阅不等于每个原文单元都已核验。公开URL、文件哈希与版本在[来源清单](../research/research-refresh-sources.json)中。

源码、导读、目录、简介和本文随Git传递；`private/reading`中的原文及本机个人记录不随Git传递。另一工作区需要原文检索时，可按来源清单重新取得固定材料，用 `npm run reading:materials -- import` 导入，或按OPERATIONS说明备份/恢复原文库；这不影响导读的阅读。

探索记录位于读者使用的浏览器。本轮没有改写这些记录：可在方向页“关联文献”勾选对应五篇，再继续讨论。关联只建立固定修订关系，不自动标记已读，也不会把书目当成已核验证据。
