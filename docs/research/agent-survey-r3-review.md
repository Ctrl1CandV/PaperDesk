# Agent 综述 r3 核对记录

## 固定原文与阅读范围

- 论文：Lei Wang 等，*A Survey on Large Language Model based Autonomous Agents*，arXiv:2308.11432v7（2025-03-02）。
- 固定入口：`https://arxiv.org/html/2308.11432v7`；同时取得 `https://arxiv.org/pdf/2308.11432v7`，PDF 共 42 页。
- 实际通读：PDF 第 1–33 页正文（§1–7），包括摘要、图 1–5、表 1–3 与结论；第 34–42 页为参考文献，只用于核对代表方法的编号和名称，没有逐条阅读。
- 版本许可：arXiv v7 摘要页标注 CC BY 4.0；期刊排版页脚写 © Higher Education Press 2025。导读使用 arXiv v7 的图，保留图号与署名。
- 阅读方式：用 `figure-tools.py text` 抽出全文通读；对关键页回看 PDF 原页；图 2–5 裁切后逐张打开确认；表 1–3 渲染为图片后查看。

## 原图与原表

| 对象 | 位置 | 核对结果 |
| --- | --- | --- |
| 图 2 统一框架 | PDF 第 4 页 | 已裁切并查看：四列 Profile、Memory、Planning、Action，顶部 LLM；箭头从 LLM 指向各模块，角色影响记忆和规划，前三者共同影响行动。裁切完整，无图注。 |
| 图 3 单路与多路推理 | PDF 第 10 页 | 已裁切并查看：左半 CoT、Zero-shot CoT、ReWOO、HuggingGPT；右半 CoT-SC、ToT。图注确认 LMZSP 是 [44] 的模型。 |
| 图 4 能力获取的三个时代 | PDF 第 19 页 | 已裁切并查看：机器学习、大模型、Agent 三栏；灰色文字表示参数学习和提示工程仍在沿用。 |
| 图 5 应用与评价 | PDF 第 22 页 | 已裁切并查看：左侧社会科学、自然科学、工程；右侧主观评价（人工标注、图灵测试）与客观评价（指标、协议、基准）。 |
| 表 1 系统索引 | PDF 第 17 页 | 已渲染查看：31 个系统，列为 Profile、Memory Operation、Memory Structure、Planning、Action、CA、Time；表头说明“-”表示论文未明确讨论。 |
| 表 2 应用代表 | PDF 第 25 页 | 已渲染查看：社会科学、自然科学、工程三组；工程下列 CS & SE、工业自动化、机器人与具身智能。图 5 还列出土木与航空航天，正文 §3.3 未展开。 |
| 表 3 评价方式 | PDF 第 29 页 | 已渲染查看：主观（人工标注、图灵测试）与客观（真实世界模拟、社会评价、多任务、软件测试），另标是否使用基准。 |

## 关键数字与说法

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 综述整理了 100 项相关工作 | §5，PDF 第 31 页 | 原文 “we have compiled 100 relevant works”，一致。 |
| 表 1 标注 31 个系统 | 表 1，PDF 第 17 页 | 逐行清点为 31 行；初稿曾写 34，已改正。 |
| 图 1 统计 2021-01 至 2023-08 | 图 1 与 §1，PDF 第 2 页 | 横轴与图注一致。 |
| 记忆读取式 $m^*=\arg\max(\alpha s_{rec}+\beta s_{rel}+\gamma s_{imp})$ | 式 1，PDF 第 8 页 | 符号、加权和、$s_{imp}$ 与查询无关均一致。 |
| Generative Agents 读取时三项等权 | §2.1.2，PDF 第 8 页 | 原文 “α=β=γ=1.0”，一致。 |
| GITM 在同一子目标成功动作达到 5 条时压缩 | §2.1.2，PDF 第 9 页 | 原文 “size of the list reaches N(=5)”，一致。 |
| RET-LLM 用固定大小缓冲、FIFO 覆盖最旧记录 | §2.1.2，PDF 第 9 页 | 原文一致；原论文摘要只说明可读写记忆和三元组，未提 FIFO，导读采用综述描述。 |
| 反思：3 个问题、5 条洞察 | §2.1.2，PDF 第 9 页 | 原文一致；Generative Agents 摘要未给这两个数字。 |
| CoT 在算术、常识、符号推理上有效 | CoT 原论文摘要 | 摘要明确列出三类任务。 |
| ToT 在 24 点游戏上 4% → 74% | ToT 原论文摘要 | 摘要明确 “4%” 与 “74%”。 |
| ReWOO 在 HotpotQA 上约 1/5 token | ReWOO 原论文摘要 | 摘要写 “5x token efficiency”，导读写成“约五分之一”。 |
| Reflexion 在 HumanEval 上 91% pass@1，GPT-4 为 80% | Reflexion 原论文摘要 | 摘要明确两个数字。 |
| WebShop 118 万件商品、13 名工人 | §2.2，PDF 第 17–18 页 | 原文 “1.18 million products”“13 workers”，一致。 |
| WebShop 12087 条指令 | WebShop 原论文摘要 | 摘要写 “12,087 crowd-sourced text instructions”。 |
| WebShop 最好模型 29%、人类专家 59% | WebShop 原论文摘要 | 摘要写 “task success rate of 29%”“human expert performance (59%)”。 |
| 记忆手算：B 的等权总分为 2.1 | 式 1，PDF 第 8 页；数值为导读指定 | 0.3+0.9+0.9=2.1，算术正确；分数本身不是论文数据。 |
| ToolBench 16464 个 API、49 类 | §2.2，PDF 第 18 页 | 原文 “16,464 real-world APIs spanning 49 categories”，一致。 |
| Mind2Web 2000+ 任务、137 网站、31 领域 | §2.2，PDF 第 18 页 | 原文 “over 2,000”“137”“31 domains”，一致。 |
| AgentBench 8 个环境 | AgentBench 原论文摘要 | 摘要写 “8 distinct environments”；综述 §4 未列数字。 |
| SocKET 58 个任务、5 类社会信息 | §4.2，PDF 第 30 页 | 原文 “58 tasks”“five categories”，一致。 |
| EmotionBench 400+ 情境、8 类负面情绪 | §4.2，PDF 第 30 页 | 原文 “over 400 situations”“eight negative emotions”，一致。 |
| Generative Agents 用 25 个问题、5 个领域做主观评价 | §4.1，PDF 第 27 页 | 原文 “25 questions”“five key areas”，一致。 |
| 心理健康研究收集 120 条 Reddit 帖子 | §3.1，PDF 第 22 页 | 原文 “120 posts from Reddit”，一致。 |
| ChemCrow 的工具数量 | §2.1.4、§3.2，PDF 第 15、23 页；ChemCrow 原论文摘要 | 综述写 17 个，原论文摘要现为 18 个；导读正文不使用具体数字，只在覆盖声明中记录差异。 |
| ChatLaw 的机制 | §3.1，PDF 第 22–23 页；ChatLaw arXiv 摘要 | 综述描述偏向数据库/关键词检索与自注意力；当前 arXiv 摘要强调多 Agent 协作与角色对齐的混合专家架构。导读只把它作为法律应用示例，不展开机制。 |

## 机制与分类核对

- 图 2 的四模块、影响关系与 §2.1 开头一致；导读明确说明“四列是设计维度，不是一次执行的流水线”，这是对图 2 的读法说明，不是原文原句。
- §2.1.1 的三种角色生成方式、§2.1.2 的结构/格式/操作、§2.1.3 的“有反馈/无反馈”与三类反馈、§2.1.4 的目标/产生/空间/影响，均按原文小节顺序整理。
- §2.2 的“微调/不微调”二分，以及不微调下的提示工程、机制工程，按原文整理；机制工程的四类（试错、众包、经验积累、自我驱动演化）与原文一致。
- §3 的三类应用与 §4 的主观/客观评价、指标/协议/基准，按原文整理；图 5 与表 2、表 3 用于核对栏目。
- 导读中的“文献助手”是自编教学例子；三条记忆分数、检索结果、排除理由均为虚构，不对应论文实验。

## 代表方法的核对方式

对正文中展开较多的方法，核对了 arXiv 摘要页的标题与摘要，包括：CoT、CoT-SC、ToT、ReAct、Reflexion、Generative Agents、ToolFormer、HuggingGPT、Voyager、ChatDev、MetaGPT、ReWOO、LLM+P、SayCan、Inner Monologue、SayPlan、DEPS、RAP、Self-Refine、MemoryBank、ChatDB、RET-LLM、GITM、AgentSims、Social Simulacra、S3、ChatMOF、ChemCrow、ToolLLM/ToolBench、RoCo、LLM-Planner、WebShop、AgentBench、Mind2Web。

没有逐篇精读这些方法的全文，也没有复现其数字；正文中的方法结果只用于说明方法差异，不用于比较系统优劣。一些应用系统（如 ChatDev 的具体流程、MetaGPT 的角色表）只按综述描述概述。

## 发现的问题与处理

1. **表 1 行数**：初稿写“34 个系统”，逐行清点为 31 个，已改为 31。
2. **ChemCrow 工具数**：综述 17、原论文摘要 18，正文不使用数字，覆盖声明中说明。
3. **ChatLaw 描述差异**：综述与当前 arXiv 摘要的侧重点不同，正文只保留“面向中文法律咨询”的应用示例。
4. **图 5 与 §3.3 的范围差异**：图 5 的工程类含土木、航空航天，正文 §3.3 没有展开；导读只把它们列为图上的类别，没有补写应用细节。
5. **“记忆反思”的计数**：3 个问题、5 条洞察来自综述，未在原论文摘要中重复出现；正文按综述描述，未把它当作原论文摘要内容。
6. **“知识边界”例子**：电影选择例子来自综述 §6.5，不是原论文实验；正文按作者论述转述。

## 未核对或无法核对的内容

- 没有逐篇阅读 100 项被引工作，也没有核对每一条参考文献的版本。
- 没有复现任何实验、基准分数或系统行为；导读不报告自己的评测结果。
- 没有核对表 1 中每个系统在原文中的全部模块声明，只核对了表头、行数和若干代表行。
- 没有核对所有应用系统的论文全文；部分应用描述只依据综述转述。
- 没有验证 CC BY 4.0 之外的其他再利用条件；导读按私有仓库个人学术阅读处理。
- 图 2–5 为原图裁切，未重绘；裁切范围已目视确认，但没有做像素级出版质量检查。
