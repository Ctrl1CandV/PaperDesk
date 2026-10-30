# Multi-Agent Communication 两篇综述：选文、来源与作者自审

日期：2026-10-30。本文记录 AI 作者的来源取得、提取与逐主张自审；它不替代独立审阅或实际页面验收。候选为 `multi-agent-communication-survey` revision 1 与 `multi-agent-collaboration-survey` revision 1。

## 选文理由与互补关系

两篇都讨论 LLM 多智能体系统，但采用不同分析中心。Beyond Self-Talk 从通信出发，将系统架构、目标和协议，与系统内部的时序、范式、对象和内容联系起来。Collaboration Mechanisms 从协作通道出发，进一步解释参与者、角色规则、连接结构和静态或动态编排。前者适合追踪一条消息如何参与决策，后者适合分辨分工与流程安排改变了什么。

本次没有把二者堆成“多 Agent 总览”目录；分别写成连贯主线，并保留一个贯穿的原创教学场景。场景不含读者私人记录，也不作为原文实验。两个分类体系中辩论的归类层级不同，正文明确区分系统共同目标与角色局部竞争。后续方法论文应回答具体通信或编排问题，而不是仅凭标题相关加入。

## 固定来源与实际取得

| 候选 | 学术身份与技术版本 | 实际取得与阅读范围 |
|---|---|---|
| `multi-agent-communication-survey` | Bingyu Yan、Zhibo Zhou、Litian Zhang、Lian Zhang、Ziyi Zhou、Dezhuang Miao、Zhoujun Li、Chaozhuo Li、Xiaoming Zhang；Beyond Self-Talk: A Communication-Centric Survey of LLM-Based Multi-Agent Systems；arXiv:2502.14321v3，2026-05-26，首稿2025-02-20 | 固定 HTML 与16页PDF；正文§2–§5用于主线，已解析并核对具体小节；查看指定原图像素 |
| `multi-agent-collaboration-survey` | Khanh-Tung Tran、Dung Dao、Minh-Duong Nguyen、Quoc-Viet Pham、Barry O’Sullivan、Hoang D. Nguyen；Multi-Agent Collaboration Mechanisms: A Survey of LLMs；arXiv:2501.06322v1，2025-01-10 | 固定 HTML 与35页PDF；正文§3、§4、§6用于主线；§5应用未完整展开；查看指定原图像素 |

版本身份依据官方 [Beyond Self-Talk 记录](https://arxiv.org/abs/2502.14321v3)与[Collaboration Mechanisms 记录](https://arxiv.org/abs/2501.06322v1)。前者官方摘要页标记已被 Frontiers of Computer Science 接收，并列出 DOI；此次取得的是固定 arXiv 技术版本，未成功取得正式出版页，未从中推断卷期页码或混入正式版本内容。元数据明确标识本次使用的预印本，年份采用初稿年份2025，来源更新日期另列2026-05-26。后者的 HTML 带 ACM 模板 DOI 占位符，不能作为真实发表信息，书目仅保留已核 arXiv 身份。

实际下载于2026-10-30，来源地址分别为 [communication HTML](https://arxiv.org/html/2502.14321v3)、[communication PDF](https://arxiv.org/pdf/2502.14321v3)、[collaboration HTML](https://arxiv.org/html/2501.06322v1)、[collaboration PDF](https://arxiv.org/pdf/2501.06322v1)。工作副本位于 `.source-review/research-refresh/communication-surveys/`；原始来源未作为导读图像资产发布。整包集成时如需进入项目原文材料存储，应保留这些固定来源与哈希，不能把网页摘要当作全文取得记录。

| 工作文件 | SHA-256 |
|---|---|
| `communication-v3.html` | `780682e43bc87814e09bd1108c45814b709837526ef43021d7b378389202f433` |
| `communication-v3.pdf` | `cf56d3cdde0d759ef6f642393938a0cddfa182cd7166c5816ba6374965c4dfd5` |
| `collaboration-v1.html` | `612f357d0bff086110081e592f49a9afd7782f360d2a6cdbe6ea1a61ff97b4af` |
| `collaboration-v1.pdf` | `badaf8bb47535df96252be38c5a5b81d979478b860ed67c2c4ac0ebaa4483ae5` |

## 图表实际核对

采用项目 pdfjs-dist 与本地 canvas 渲染固定 PDF，AI 实际打开以下 PNG 页面查看。物理页码与印刷页码在这些页面相同。全部是概念图，无坐标轴、数值单位或误差条；核对对象是图例、组织关系、方向和图注，不把分类图解释成实验比较。

| 来源与图表 | 页面和工作文件 | 实际核对内容 |
|---|---|---|
| Beyond Self-Talk Figure 3 | 第4页，`communication-v3-p4.png` | Flat、Hierarchical、Team、Society、Hybrid 五类；社会图包含规则、加入与退出；图不提供性能排序 |
| Beyond Self-Talk Figure 6 | 第7页，`communication-v3-p7.png` | One by One、Simultaneous-Talk、Simultaneous-Talk with Summarizer；核对汇总者位置与连接关系 |
| Collaboration Figure 2 | 第9页，`collaboration-v1-p9.png` | Agent的模型/目标/环境/输入输出，协调编排层，Types/Structures/Strategies，输入、模型、输出等交换位置 |
| Collaboration Figure 4 | 第15页，`collaboration-v1-p15.png` | 规则例为多数投票、角色例为软件项目、模型例为游戏中的决策；不推断角色必然拥有独立专业知识 |
| Collaboration Figure 5 | 第17页，`collaboration-v1-p17.png` | 中心式、去中心化、层级式及图注；注意中心式同时含分布式学习与中心Agent示例，不能按边数直接比较成本 |

Beyond Self-Talk 第7页同屏 Table 2 的 Limitations 行中，A2A/ANP 单元格看起来重复用途描述；未将这一行或相邻协议属性用作技术规格依据。没有沿该表声称某协议保证安全或低时延。其他图和长表只用于定位目录或类别，未在元数据声明为已核图像；正文没有依赖未查看图的细节。

## Beyond Self-Talk 逐主张自审

| 单元 | 来源与提取内容 | 条件、归属与压缩检查 |
|---|---|---|
| u01 | §2与§3/4两层框架 | 收到、理解、行动的区分是解释性分析；解析器修复是原创场景，未运行；不把通信存在写成有效性证明 |
| u02 | §3.1、Figure3 | 保留五类架构；可用连接与实际消息轨迹为阅读分析，不假称原文新定理；不按类型排名 |
| u03 | §3.2合作/竞争/混合，§3.3协议 | 明确原文把合作式辩论放于合作；对照另一综述只解释层级差别；MCP/A2A/ANP仅作原文讨论对象，不给当前产品建议 |
| u04 | §4.1、Figure6 | 顺序依赖、并行陈旧状态、汇总者瓶颈分别解释；补丁版本例是教学推演；未引用被引系统的收益数值 |
| u05 | §4.2范式、§4.3对象、§4.4内容 | 区分消息/言语行为/黑板及显隐式内容；结构化数据正确性、自我反思边界是解释性限定；不复制“格式可完全消除歧义”等过强说法 |
| u06 | §5.1与§5.6 | 保留任务表现、协调效率、带宽时延和陈旧/欺骗消息鲁棒性；同预算与删除消息对照为阅读建议，未归为已完成实验；没有编造基准分数 |
| u07 | 分类与挑战的综合 | 下一篇筛选条件为编辑建议；明确2026版本的挑战仍需核查后续文献，不视为当前空白证明 |
| u08 | 实际取得与所看图表 | 主线范围与限制相符；未逐篇重读全部参考文献；未声称实验复现或协议实现验收 |

## Collaboration Mechanisms 逐主张自审

| 单元 | 来源与提取内容 | 条件、归属与压缩检查 |
|---|---|---|
| u01 | §3.1/3.2、Figure2 | 通道由参与者、类型、结构和策略刻画；包含输入/模型/输出交换的广义范围；教学任务未运行；未把描述性公式当成有效性定理 |
| u02 | §4.2，尤其§4.2.2明确竞争仍可面向共同目标 | 辩论的分类区别有正文支持；一致不等于正确为解释性限定；不抄录MoE专家即聊天Agent的类比 |
| u03 | §4.3、Figure4 | model-based保留对环境/他人/结果建模含义，不误解为凡LLM都是此类；三策略可组合是设计解释；不把角色命名当专业能力证据 |
| u04 | §4.4、Figure5 | 原文章首写“四类”但随后列中心、去中心/分布、层级三组，导读按实际分节三组说明；保留FL与推理消息的边界；不转写泛化收益 |
| u05 | §4.5 | 静态事先安排、动态依输入和状态调整；不把动态称作必然优越；追加补查的例子为教学推演 |
| u06 | §6.1/6.2/6.3 | 任务表现与协作层诊断、配置不可比、错误放大；预算和消融建议为编辑分析；未复述原文未经本次核验的成比例风险增长等强断言 |
| u07 | 主分类与研究限制的综合 | 后续阅读范围为编辑建议；没有将“多Agent更好”作为结论，没有声称新研究空白 |
| u08 | 实际取得与所看图表 | 不声称应用、联邦学习与全部被引工作的完整覆盖；不以35页文件长度充当已全文审计 |

## 候选文件、机械检查与待集成事项

候选目录为 `incoming/research-refresh/communication-surveys/`：

- `multi-agent-communication-survey.md`、`multi-agent-communication-survey.json`、`multi-agent-communication-survey-brief.json`。
- `multi-agent-collaboration-survey.md`、`multi-agent-collaboration-survey.json`、`multi-agent-collaboration-survey-brief.json`。

两个元数据均为 `schemaVersion:2`、revision1、`standard/mainline/sections`，各包含导言与8个正文单元；前者11个固定来源链接，后者9个。每份 brief 单独提供概述、价值、建议、章节名和采用来源更新日期，供集成侧进入 `library-briefs.json` 使用；它们不是内容导入器的独立根目录。

执行了 `node .source-review/research-refresh/communication-surveys/package-surveys.mjs`：使用 `ajv/dist/2020.js` 按 `schemas/guide-v2.schema.json` 校验两份元数据，均通过；依据实际 HTML 的ID核对全部引用片段，均存在；标题数与阅读目标数一致；正文哈希来自实际UTF-8字节。

- Communication 正文 SHA-256：`f50470cd704f10eefb10f7b32f27874acd17442c859c47d1939716ad0b8c70cb`。
- Collaboration 正文 SHA-256：`e4483f903f544632eb78ca223c72a361c4cd7c147fa5efad5e578fef986cd7c7`。

作者自审结论：可提交独立内容审阅。当前候选相关导读只关联 `agent-survey` 与两篇新综述；具体方法论文关系可由整包编辑在核对身份后添加。尚未执行整包导入、目录关联验证、页面渲染和链接点击检查；没有运行真实模型或论文实验。独立内容审查应另记实际回查的原文和图表，不能用本记录或 schema 通过代替。

独立审阅后修订：审阅者指出内容校验要求 `source.url` 与一条 primary 引用完全一致。两篇元数据主来源已改为实际取得且已在正文引用库存中的固定 PDF URL；章节级 HTML 引用保持不变。正文与正文哈希没有变化。修订后重跑 schema 与锚点检查通过，并逐项确认主来源存在于 primary 引用库存；整包验证仍由集成侧执行。
