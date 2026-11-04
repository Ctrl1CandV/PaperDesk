# 多智能体通信综述 r2：原文核对记录

本文记录《多智能体通信综述：谁在何时把什么交给谁》第 2 版（下称 r2）在撰写过程中实际核对过的内容。核对执行者为具备视觉能力的 AI，没有人工复核；记录只说明实际做了什么，不把“看过图”等同于“验证了结论”。

## 一、固定原文与阅读范围

| 项目 | 记录 |
| --- | --- |
| 论文身份 | arXiv:2502.14321；Beyond Self-Talk: A Communication-Centric Survey of LLM-Based Multi-Agent Systems |
| 固定版本 | v3，提交时间 2026-05-26 03:02:22 UTC（arXiv 摘要页 submission history） |
| 取得材料 | `.source-review/multi-agent-communication-survey/source.pdf`（16 页，1158630 字节）；同目录的 `source.html`（arXiv HTML v3，用于核对章节锚点与图表编号）；`abs.html`（摘要页，用于核对标题、作者、日期、许可与 DOI） |
| 实际通读 | PDF 第 1–12 页正文（§1 Introduction、§2 Background、§3 System-Level Communication、§4 System Internal Communication、§5 Challenges and Opportunities、§6 Conclusion） |
| 查阅但未通读 | PDF 第 13–16 页参考文献表，只用于核对被引编号 [3][4][22][23][24][29][35][47][49][50][51][59][61][63][68][69][70][71][72][73][74][75][76][79][81][82][86][89][90][91][101][102] |
| 许可 | arXiv 摘要页链接为 `licenses/nonexclusive-distrib/1.0/`，即默认非独占分发许可；导读按此记录 `rights` 字段 |

HTML 与 PDF 的章节编号、图号、表号一致（`#S1.F1`…`#S4.F9`、`#S2.T1`、`#S3.T2`、`#S4.T3`），因此正文中的 HTML 锚点与 PDF 页码可以互相对应。HTML 只用于定位，凡引用数字与措辞均以固定 PDF v3 为准。

## 二、查看过的原图与表格

裁切后打开 PNG 亲眼确认的图像（4–5 倍缩放）：

| 图表 | 物理页 | 用途 | 是否重新发布 | 确认内容 |
| --- | --- | --- | --- | --- |
| Figure 1 | p2 | 框架图，r2 核心 | 是 | 三栏 (a)(b)(c) 完整；(c) 左为系统层四元素、右为内部四标签；图下七行说明可读 |
| Figure 3 | p4 | 五类架构 | 是 | 五个虚线框、箭头方向、Rules/join in/get out 标记、Team 与 Hybrid 的多框画法 |
| Figure 4 | p5 | 四类目标 | 是 | 四栏标签、握手/奖章/交叉剑图标、Mix 栏的虚线框与握手 |
| Figure 5 | p6 | 协议分层 | 否 | 上半 MCP 调用链、左下 A2A 任务与产物、右下 ANP 三层（应用/元协议/身份与加密）与实际顺序 |
| Figure 6 | p7 | 三种策略 | 是 | 左格为方向回路（顶→左下→右下→顶）、中格四个 Agent 两两双箭头、右格三蓝一黄汇总 |
| Figure 9 | p11 | 内容分类 | 是 | 显式两行（自然语言、程序化结构化语言）与隐式两行（行为反馈、环境信号）及其示例框 |

未查看、未使用：Figure 2（结构树，正文只用文字描述其内容）、Figure 7（范式示意）、Figure 8（对象示意）。r2 初稿曾放入图 7 与图 8，后来因为原图数量上限与未实际查看而删除，正文改为纯文字说明；因此这两张图既没有裁切结果，也没有“已查看”声明。

逐行清点过的表格：

| 表格 | 物理页 | 清点方式 | 结果 |
| --- | --- | --- | --- |
| Table 1 | p4 | 按架构、目标分行，数分号分隔的工作项 | 扁平 4/1/2、层级 18/1/2、团队 13/0/2、社会 4/0/4、混合 10/2/5，合计 68 |
| Table 2 | p7 | 逐列对照表头与单元格 | 拓扑、发现、格式、安全、优势、局限、用例七行；局限行内容不统一（见第五节） |
| Table 3 | p8 | 68 行逐行解析策略、范式、对象、内容与时间列 | 策略标 OO 28、ST 22、SS 30；单用 17/13/26，并用 12；范式 MP 68、SA 18、BB 7；对象 OA 68、EN 34、SE 15、HU 10；内容 EC 68、IC 24；年份 2023:11、2024:33、2025:24 |

r2 正文只使用 Table 3 的策略计数与年份计数，其余清点结果保留在本记录，未写入正文。

## 三、关键说法与数字的逐项核对

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 综述把通信当作分类主轴，指出综合型与领域型综述的不足 | §1，p1–2 | 一致（“overlooking the central role of communication”“lack generalizability”） |
| LLM-MAS 的定义（受协议约束、由目标驱动、在既定架构内运行） | §1，p1–2 | 一致，r2 为中文转述，未改变成分 |
| 七个维度与表 1 的章节对应（§3.1–3.3、§4.1–4.4） | §3、§4 标题与 §2 结构图 | 一致 |
| 单 Agent 由大脑、感知、行动组成，记忆分短期与长期 | §2.1，p2 | 一致 |
| 传统 MAS：BDI、言语行为、合同网、拍卖；学习型 MAS 的 CTDE 与图神经 Agent | §2.2，p2–3 | 一致 |
| 五类架构及其代表（ChatDev、CausalGPT、MAGIS、POLCA、Generative Agents、EconAgent、FixAgent、ChatSim、Tulip Agent） | §3.1.1–3.1.5，p4–5；Table 1，p4 | 一致；ChatDev 的角色与“自然语言利于设计、编程语言利于调试”见原论文摘要，与综述描述相符 |
| Table 1 共 68 项，层级 21、混合 17、团队 15、社会 8、扁平 7 | Table 1，p4 | 导读清点结果，与正文“层级和混合占 38 项”一致 |
| 目标分直接合作、辩论式合作、竞争、混合；辩论代表为 Du 等 | §3.2，p5–6 | 一致；原论文摘要确认“多实例提出并辩论、最后取共同答案、可用于黑箱模型” |
| GAMA-Bench 覆盖八种博弈场景、动态打分 | §3.2.2，p5；Table 1 | 一致，摘要同样写 eight classical game theory scenarios |
| Agent4Debate 四角色、66 个中文辩题、200 场辩论 | §3.2.2，p5 | 与综述描述一致；数量来自原论文摘要 |
| POLCA 用多语言数据集模拟联盟谈判、层级 MDP | §3.1.3、§3.2.3，p4、p6 | 与摘要一致（multilingual dataset、hierarchical Markov decision process） |
| MCP 为 JSON-RPC 客户端—服务器结构，主机/客户端/服务器/资源四层，解耦工具调用 | §3.3.1，p6 | 一致 |
| A2A 用 Agent 卡经 HTTP 与服务器发送事件分发，点对点、异步 | §3.3.2，p6 | 一致 |
| ANP 基于 DID 与 JSON-LD，含加密通道 | §3.3.3，p6–7 | 一致 |
| Table 2 的拓扑、发现、格式、安全四行与 MCP 优势 | Table 2，p7 | 逐格核对一致（RBAC、OAuth 2/企业 IAM、双向 TLS、DID 握手）；安全与优势两列仅作技术差异摘录 |
| 三种策略：逐个发言、同时发言、带汇总者；代表 Chain-of-Agents、AutoAgents/EconAgent、CausalGPT/AgentCoord | §4.1.1–4.1.3，p7–9 | 一致；Chain-of-Agents 的“工作 Agent 依次处理分段、管理 Agent 汇总”见原论文摘要 |
| 串行延迟随轮数线性、误差沿链条累积（语义漂移）；并发有状态陈旧与冲突；汇总者重新引入串行依赖并有误读风险 | §4.1.1–4.1.3，p7–9 | 一致（linear、cumulative error propagation、semantic drift、state staleness、conflict resolution、misrepresentation or hallucinations） |
| Table 3 策略计数 28/22/30，单用 17/13/26，并用 12 | Table 3，p8 | 导读清点结果；80 个策略标签分布在 68 行上（56 行单标，12 行双标） |
| 三种范式：消息传递、言语行为、黑板；代表 Chuang 等、GameChat、MetaGPT、MDTeamGPT | §4.2.1–4.2.3，p9–10 | 一致 |
| GameChat 在门洞与路口模拟中把到达目标的总时间减少 35% 以上 | §4.2.1，p9 | 综述写“safe and socially optimal navigation”；35% 取自原论文摘要（“over 35%”），导读注明是模拟场景 |
| 言语行为失效（illocutionary misfire）会导致死锁与连锁错误 | §4.2.2，p9 | 一致 |
| 四类对象：自身、其他 Agent、环境、人；代表 AgentCoord、FixAgent、MAGIS、AgentFM、EmbodiedGPT、ChatSim、PeerGPT、MedAgents | §4.3.1–4.3.4，p10 | 一致 |
| 内容分显式（自然语言、代码与结构化数据）与隐式（行为反馈、环境信号）；代表 Generative Agents、MAGIS、AutoData、Richelieu、Flooding、ChatSim、EcoLANG | §4.4.1–4.4.2，p11 | 一致 |
| 表 3 的时间分布 2023:11、2024:33、2025:24 | Table 3，p8 | 导读清点结果，2025 只到 5 月 |
| 现有基准以 Agent 为中心，缺协调效率、带宽与时延、对陈旧或欺骗消息的鲁棒性、群体公平与安全；主张多粒度指标 | §5.6，p12 | 一致 |
| 五个挑战的内容 | §5.1–5.5，p11–12 | 一致，未添加上原文没有的理由 |
| MAGIS 在 SWE-bench 上解决 13.94% | 不在综述正文 | 取自 MAGIS 摘要；r2 已注明来源为原论文 |
| Generative Agents 25 个角色 | §3.1.4，p4 | 与综述一致；摘要亦写 twenty five agents |

D-102 的角色、缺陷单、补丁、测试结果、40 秒与 30 秒、6 个 Agent 的 30/10 条消息、评价一节的 3/12/40 与 9/40/150，全部是导读自编的教学设定，没有对应的原文或实验，正文与覆盖声明均已标明。

## 四、与第 1 版的出入

| 项目 | r1 | r2 |
| --- | --- | --- |
| 覆盖 | §2–§5 主线，声称查看了图 3 与图 6 | §1–§6 全文，另查看并重发布图 1、3、4、6、9，另查看图 5 |
| 框架 | 以“两层框架”分段叙述，未给七个维度的表 | 以图 1 与七个维度的提问表为主线，章节顺序与原文 §3、§4 对齐 |
| 表格 | 未使用 Table 1、2、3 | 清点 Table 1 与 Table 3，摘录 Table 2 的五行 |
| 教学例子 | 三个 Agent 修文件解析器，未给出具体缺陷单 | 改为 D-102 缺陷单（日期解析越界），并贯穿架构、策略、范式、内容、评价 |
| 原文问题 | 未记录 | 记录 Table 2 局限行、RealWorldBench/Realm-Bench、FixAgent/UniDebugger、Table 3 的“MP. SA” |

r1 中“图 3 把通信架构分为扁平、层级、团队、社会与混合五类”“协议仅讲概念层次”等说法与 r2 一致，没有发现 r1 与原文冲突的内容。r1 的覆盖声明写“实际查看了 PDF 第 4 页的图 3 与第 7 页的图 6”，与 r2 的查看范围不同，不作为本轮的核验依据。

## 五、发现的原文问题

1. **Table 2 的 Limitations 行不统一**（p7）。MCP 一列是“Centralised service dependency; safety risks”，属于真正的局限；A2A 一列是“Cross-team workflows; delegated multi-step automation”，ANP 一列是“P2P logistics coordination; DAO-driven negotiation”，与 Use Cases 行重复。r2 只把 MCP 一列当作局限，另外两条代价在正文中标明是从设计推出。
2. **§5.6 的 RealWorldBench 与实际文献名不符**（p12）。综述写“MultiAgentBench and RealWorldBench [101, 102]”，而 [102] 的原题是 “REALM-Bench: A Benchmark for Evaluating Multi-Agent Systems on Real-world, Dynamic Planning and Scheduling Tasks”。r2 在正文与术语卡中都以 Realm-Bench 为准，并说明综述的写法。
3. **FixAgent 的 arXiv 标题与综述用名不同**。[71] 的原题是 “UniDebugger: Hierarchical Multi-Agent Framework for Unified Software Debugging”，正文与摘要使用 FixAgent。r2 保留综述用名，并注明原题。
4. **Table 3 的分隔笔误**（p8）。Chuang 等一行范式写为“MP. SA”，按表头说明应为“MP, SA”。导读清点时按“两种范式同时使用”计入，得到 SA 18 而非 17。

## 六、未能核对的部分

- 综述引用的 100 余项工作没有逐篇精读；代表方法的做法以综述描述为主，只对照了各方法 arXiv 摘要的标题与摘要文字，没有核对它们的实验设置、指标、基线与预算。
- 协议部分没有验证任何现行实现：MCP、A2A、ANP 的官网与规范只是综述引用的入口，未打开核对当前版本，也未测试互操作性。r2 因此只写概念与 Table 2 的技术差异。
- 综述对 Richelieu [69] 的“行为反馈”描述、对 Flooding [47] 的描述，只核对了论文标题与摘要，没有阅读其方法部分。
- 图 7、图 8、图 2 未裁切、未查看，正文只按图题与综述文字概述，未描述图中细节。
- 原文第 13–16 页参考文献表的条目编号由节选核对，未逐条比对全部 102 条。
- Table 1 与 Table 3 是否覆盖同一组 68 项工作，未做集合比较；r2 没有据此下结论。
