# 多智能体协作综述 r2 核对记录

日期：2026-11-04。对象：`multi-agent-collaboration-survey` revision 2（`content/guides/multi-agent-collaboration-survey.r2.md`）。本记录只记录本次修订的来源取得、逐主张自审与未覆盖范围，不替代独立审阅或页面验收。

## 1. 固定原文与版本

| 项目 | 内容 |
| --- | --- |
| 论文 | Tran 等，Multi-Agent Collaboration Mechanisms: A Survey of LLMs |
| 版本 | arXiv:2501.06322v1，2025-01-10 |
| 取得地址 | https://arxiv.org/pdf/2501.06322v1 、https://arxiv.org/html/2501.06322v1 |
| 许可 | arXiv 页面标注 nonexclusive-distrib/1.0（默认非独占分发，未授予再发布权） |
| PDF SHA-256 | `badaf8bb47535df96252be38c5a5b81d979478b860ed67c2c4ac0ebaa4483ae5` |
| HTML SHA-256 | `612f357d0bff086110081e592f49a9afd7782f360d2a6cdbe6ea1a61ff97b4af` |
| 正文 SHA-256 | `d038ce2ac0aa3a3ebd01ffe9cab123d6bb6825b0f7a03a85e9354e8fdd11a280` |

PDF 共 35 页。用 `scripts/content/figure-tools.py text` 转出全文后通读 §1–§7（PDF 第 1–29 页），参考文献（第 30–35 页）只用于确认被引编号与题名，没有逐条核对外部文献。HTML 用于核对章节锚点（`S1`–`S7`、`S4.SS2` 等）与公式 alttext。

## 2. 查看过的图与表

裁切后亲眼确认的原图（均已产出 webp 并存入 `content/guides/assets/multi-agent-collaboration-survey/`）：

| 图 | PDF 页 | 裁切范围 | 检查内容 |
| --- | --- | --- | --- |
| 图 1 | p3 | 66–426 × 80–262 | 用户、支持方、反对方、两名研究助理与两条通道图例完整，无切边 |
| 图 2 | p9 | 52–434 × 80–285 | 左中右三栏与绿色编排箭头完整；左列 Adapter 为两个方框加省略号 |
| 图 3 | p11 | 50–436 × 272–400 | 三个场景与角色标签完整 |
| 图 5 | p17 | 42–444 × 80–299 | 中心式 Type 1/Type 2、去中心化 AgentCF、层级 CAMEL 三段完整 |

只查看、未复制的图：图 6（p23，LLM 语义通信系统）、图 8（p27，社会与文化应用分类）。表格逐页核对：表 1（p4）、表 2（p11）、表 3（p14）、表 4（p16）、表 5（p19）、表 6（p22）。正文只摘录与论证相关的列，没有整表搬入。

## 3. 逐主张核对

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 单个模型的三个短板：幻觉、自回归（不能慢思考）、规模规律 | §1.1，p2 | 一致 |
| 四条期待收益（记忆分担、长期规划、泛化、交互效率）与“集体智能超过各自贡献之和” | §1.1，p2 | 一致；原文以引用 [51,154]、[58]、[24] 支撑 |
| 表 1 用四个标准比较八篇相关综述，作者自己一行四项均为 High | §1.2 与表 1，p3–4 | 一致；行数为八篇 + OURS |
| Agent 记为 $\{m,o,e,x,y\}$，$m=\{\text{arch},\text{mem},\text{adp}\}$，$y=m(o,e,x)$ | §3.1，p7 | 一致；适配器举例为投机解码与参数高效适配器 |
| 系统含 $\mathcal{A}$、$\mathcal{O}_{\text{collab}}$、$\mathcal{E}$、$\mathcal{C}$、$x_{\text{collab}}$、$y_{\text{collab}}$ | §3.1，p8 | 一致 |
| 式 1 的三层嵌套 | §3.2 式 (1)，p9 | 与 HTML alttext 逐字比对一致 |
| 通道由参与者、类型、结构、策略刻画，任一属性不同即另一条通道 | §3.2，p9 | 一致 |
| 共同基础假设（都用英语、都在题内） | §3.1，p8 | 一致 |
| 三个交换阶段：早期数据/上下文、中期参数权重、晚期输出与动作 | §3.1，p8；图 2 右列 | 一致；图 2 另列输入嵌入、智能交换、目标与任务共享 |
| 合作 $\bigcup_i o_i$、竞争 $\{o_i\mid o_i\neq o_j\}$ | §4.2.1–4.2.2，p10–12 | 一致 |
| 辩论、LLMArena、CompeteAI（50 名顾客）、LEGO、MoE 归类 | §4.2，p10–13 | 一致；MoE 为作者类比，导读注明 |
| 三类策略的定义与表 3 优缺点 | §4.3 与表 3，p13–14 | 一致 |
| 规则式四例（社会心理学、事件触发、同行评审、共识寻求四策略与人格/拓扑影响） | §4.3.1，p14 | 一致 |
| 角色式：AgentVerse 四阶段、MetaGPT SOP、RoCo、BabyAGI 三链 | §4.3.2，p14–15 | 一致 |
| 模型式：心智理论、逻辑规则+分层 RL（Watch-and-Help、HandMeThat）、PGM（Chameleon）、概率时间自动机（停车） | §4.3.3，p15–16 | 一致 |
| 结构三组与原文“四类”的表述不一致 | §4.4 开头，p16 | 原文写 “four main classes” 后只列三项，小节也是三个；导读写明 |
| 中心式两类（FedIT / AutoAct），LLM-Blender 成对排序，AgentCoord 用户研究 | §4.4.1，p16–17；图 5(a) | 一致；图 5 图注说明两种类型 |
| 去中心化小节所列系统（MedAgent、ChatDev、MetaGPT、AutoAgents、OKR-Agent、SOA、ProAgent、生成式智能体、OpenAgents、AgentCF） | §4.4.2，p18 | 一致 |
| 层级：AgentVerse 氢储存站选址、DyLAN 两阶段与 25.0% | §4.4.3，p19；DyLAN 摘要 | 一致；25.0% 见 DyLAN 摘要 MMLU 部分科目 |
| 交换之思四范式对应总线/星形/环形/树形 | §4.4.3，p19；EoT 论文 §4.1 | 一致；EoT 原文写明 Memory–Bus、Report–Star、Relay–Ring、Debate–Tree |
| 静态编排：CoMM 串联式 $y_{i+1}=y_i\Vert x_i\Vert x_{\text{collab}}$、MapCoder、MACRec、文学翻译 | §4.5.1，p19–20 | 一致；MapCoder 的 HumanEval 93.9% pass@1 取自原论文摘要，已在正文标注“原论文报告” |
| 动态编排：SPP 人格识别与生成、DAG 编排者与委派者 | §4.5.2，p20 | 一致；SPP 的“只在 GPT-4 出现”见原论文摘要 |
| 表 5 静态与动态的优劣 | §4.5，p19 | 一致 |
| 六条经验，以及单 Agent 强提示反超竞争通道设计不佳的 MAS | §4.6，p20–21 | 一致；反例引自原文对 [128] 的转述 |
| §5.2 末尾“现有框架多为角色式、中心或去中心结构” | §5.2 末段，p26 | 一致 |
| Agent-as-a-Judge 的 DevAI 55 个任务、Orca-AgentInstruct 最多 54% | §5.2，p25–26 | 一致 |
| 评价三层（整体表现、协调效率与上下文适当性、Agent/协作级诊断）、配置不可比、动态基准 | §6.2，p28–29 | 一致 |
| 伦理：过度自信与误解导致放大、对抗攻击、欺骗、拟人化导致过度依赖 | §6.3，p29 | 一致 |
| 结论的五维表述（actors、types、structures、strategies、coordination mechanisms） | §7，p29；摘要，p1 | 一致；摘要同样列出 coordination protocols，导读据此改写 |

## 4. 发现的原文问题与出入

1. **§4.4 的“四类”**：正文写 “categorized into four main classes”，随后只列中心式、去中心化/分布式、层级式三项，小节也只有 4.4.1–4.4.3。导读按小节展开，并在结构一节写明这处表述问题。
2. **通道属性与维度数**：§3.2 说通道由四个属性刻画，摘要与结论把编排列为第五个维度，§4 又把它单列一节。导读按“四个属性 + 编排层”呈现，并说明这处结构差别来自章节安排。
3. **小节归属与标签不完全对应**：MetaGPT、ChatDev 出现在“去中心化”小节，但按角色流水线组织；它们在合作与角色策略小节也出现。导读提示读者按句子判断，而不是按小节标题归档。
4. **MoE 作为竞合**：作者把混合专家列为竞合类型，专家之间通过门控竞争。原文没有给出自然语言通道，导读注明这是类比，并说明它与对话式协作的机制差别。
5. **AgentCF 的来源记录**：综述引用 Zhang 等 2024 的 WWW 论文 “AgentCF: Collaborative Learning with Autonomous Language Agents for Recommender Systems”（编号 [150]）。arXiv 2310.10108 的现行版本已改题为 “On Generative Agents in Recommendation”（Agent4Rec）。因此导读按综述描述介绍 AgentCF，没有为它添加带 arXiv 链接的术语条目。
6. **与旧导读的出入**：r1 把 §4.4 写成“三类”、把 §4.5 的静态例子概括为“先找资料、再分析、最后审阅”，并在评价一节提出预算与消融建议。r2 保留后者并标明为导读建议；前者改为按原文章节核对后的表述，并新增 §4.6 经验、图 1 示例与表 1 定位。r1 没有使用原图，r2 放入图 1、2、3、5。
7. **共享术语表中的 CAMEL 条目**：现有条目把 `full` 写作 “Cooperative Role-playing Communication”，与论文题名 “Communicative Agents for ‘Mind’ Exploration of Large Language Model Society” 不同。作者不修改共享文件，故未改动；建议整合时核对。r2 的术语片段没有重复添加 CAMEL、DyLAN、AgentCoord 三个已有条目。

## 5. 未核对或无法核对

- 没有逐篇精读综述引用的 166 条文献。代表方法的机制依据综述描述，并对照了 arXiv 摘要（Debate 2305.14325、LLMArena 2402.16499、CompeteAI 2310.17512、MetaGPT 2308.00352、AgentVerse 2308.10848、LLM-Blender 2306.02561、DyLAN 2310.02170、SPP 2307.05300、MapCoder 2405.11403、MACRec 2402.15235、CoMM 2404.17729、EoT 2312.01823）；其余被引工作没有单独核对。
- 没有复现任何结果，也无法核对表 6 中每个应用系统的报告数字。正文只使用综述正文明确写出的数字（25.0%、55 个任务、54%、50 名顾客、七个游戏环境），以及 MapCoder 摘要中的 93.9%，并在正文标明来源层级。
- §5.1 的 5G/6G 通信细节、联邦学习算法变体、§5.3 的社会与文化模拟实验没有展开，也没有核对其中单个系统的技术描述。
- 图 6、图 8 只查看，未复制作图；图 4（策略示例）与图 7（Swarm 客服流程）没有放入正文，只在相应段落用文字转述。
- 教学推演（按三种策略改写图 1、静态与动态编排的对照）是作者为说明框架而写，没有实验依据，正文与覆盖声明均已标明。

## 6. 机械检查

执行 `node scripts/content/new-revision.mjs .cache/guide-work/multi-agent-collaboration-survey/spec.json` 与 `node scripts/content/guide-work.mjs check multi-agent-collaboration-survey`：13 个单元、33 条引用、4 个资产，正文 22 819 字符，最长小节 2 712 字符，限定性否定每万字 9 处；检查通过，共享文件未改动。合并（`merge`）与构建由整合者执行。
