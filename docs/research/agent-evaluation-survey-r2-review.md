# Agent 评测综述 r2：来源核对记录

日期：2026-11-05。本记录写的是导读 `agent-evaluation-survey` 第 2 修订（`content/guides/agent-evaluation-survey.r2.md`）的来源获取、实际阅读与逐条核对。记录的是作者自查，不是人工审阅、独立内容审阅或实验复现；合并与构建由整合环节另行执行。

## 固定来源与调阅

同一导读 ID 必须对应同一篇论文的同一版本。本次沿用第 1 修订的固定版本，没有换版本。

| 项目 | 内容 |
| --- | --- |
| 论文 | Survey on Evaluation of LLM-based Agents（Yehudai 等，IBM Research / 耶鲁大学 / 希伯来大学） |
| 固定版本 | arXiv:2503.16416v1，2025 年 3 月 20 日 |
| PDF | `https://arxiv.org/pdf/2503.16416v1`，20 页；SHA-256 `5899ce0e35f5dad08d0f5886134ac8ca68676a6cf0d70ce97d4901005c7e124b` |
| HTML | `https://arxiv.org/html/2503.16416v1`，仅用于章节锚点与检索；SHA-256 `dcde4a746e1cd0181836b19b5ed0f173852be68962b02ea095103a536bc07a78` |
| 许可 | arXiv 版本页面列出 CC BY-NC-SA 4.0 |
| 发表记录 | Findings of ACL 2026，`https://aclanthology.org/2026.findings-acl.1330/` |

PDF 哈希与既有记录 `docs/research/evaluation-reading-review.md` 中登记的值一致，说明取到的是同一份固定字节。没有使用第三方转载替代原文。

## 实际阅读范围与图像核查

用项目内 `.cache/pyreview` 的 PyMuPDF 提取全部 20 页文字，通读 §1–§7 正文（PDF 第 1–13 页），其余为参考文献。没有逐字阅读全部参考文献条目。

| 范围 | 实际做过的事 | 未覆盖 |
| --- | --- | --- |
| §1 与 Scope（pp1–3） | 读正文，确认四类读者、四个组织方向与排除范围（MMLU、GSM8K 等单轮基准；多 Agent、具身、游戏不为主线） | 未核对文中所有引用编号 |
| §2 能力（pp3–6） | 读四小节，逐项记录基准名、作者转述的发现与五项规划能力 | 未逐一读各能力基准的原文 |
| §3 应用（pp6–9） | 读三要素段落与四个领域，记录基准构造与判定 | 未逐篇核验被引基准的当前版本 |
| §4 通用（p9） | 读 GAIA、AgentBench、OSWorld、AppCompany、CRMArena、HAL 等段落 | 未核对 HAL 的聚合口径原文 |
| §5 框架（pp10–11） | 读三种粒度、评委问题、数据工作、A/B 与 Gym 类环境；逐格核对表 1 | 未查各产品当前功能 |
| §6–7（pp11–13） | 读趋势、四个方向与结论 | 作者判断未作为当前空白采信 |

图像与表格：

- 图 1：`render` 页码 2，裁切范围 `60,60,535,660`，zoom 3。用 `figure-tools.py webp` 转成 `content/guides/assets/agent-evaluation-survey/figure-1-survey-map.webp`，实际打开 PNG 与 WebP 各一次，确认五条主干、右侧文献格子与底部讨论分支完整，未切边，未包含图注文字。
- 表 1（p11）：`render` 裁切 `60,70,540,182`，zoom 4，实际打开查看。按原表逐格转录为 Markdown，勾叉与列名保持一致；未截成图片放入正文。
- 没有把“生成了但未打开”的图像计为已查看。

## 逐条核对

### 核心定义与结构

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 模型是静态、单轮文本接口；Agent 把多次调用连成多步流程、共享状态、使用工具 | §1 p1 | 一致 |
| 作者称这是第一篇系统综述 | 摘要 p1 | 原文为 “the first comprehensive survey”；正文按作者自述处理 |
| 四个组织方向：能力、应用、通用、框架；§6 讨论 | 摘要、§1 pp1–3、图 1 p2 | 一致 |
| 单轮文本基准（MMLU、AlpacaEval、GSM8K 等）不在范围 | Scope p3 | 一致 |
| 多 Agent、具身、游戏不在主线 | Scope p3 | 一致 |
| 基准 = 任务数据 + 运行环境 + 指标；指标可用于不同粒度 | §3 p6 | 一致，导读把这些放在“先定义被测系统与三样东西” |
| 应用分四类：网页、软件工程、科学、对话 | §3 pp6–9 | 一致 |
| 框架分开发框架与 Gym 类环境 | §5 pp10–11、图 1 p2 | 一致 |
| 讨论分当前趋势与新兴方向 | §6 pp11–12、图 1 p2 | 一致 |

### 数字与具体工作

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 多步推理通常需要 3–10 个中间步骤 | §2.1 p3 | 原文 “typically requiring 3-10 intermediate steps” |
| 五项规划能力：任务分解、状态跟踪、自我修正、因果理解、元规划 | §2.1 p4 | 一致；导读标为综述的归纳 |
| 早期工具基准用合成数据与规则匹配（如抽象语法树），覆盖单步、参数明写 | §2.2 p4 | 一致 |
| BFCL v2 加组织工具，v3 加多轮多步逻辑 | §2.2 p4 | 一致 |
| ToolSandbox：有状态执行、隐式状态依赖、内置用户模拟器、里程碑动态检查 | §2.2 p4 | 与原文一致；另对照 arXiv 摘要 |
| 反思早期测法只检查最终答案是否改对；改进可能依赖提示技巧 | §2.3 p5 | 一致 |
| LLF-Bench 把任务说明放进环境，并可随机化说明与反馈措辞 | §2.3 p5 | 一致；另对照 arXiv 摘要 |
| LTM benchmark：单任务好、交错变差；短上下文 + 长期记忆可追上大窗口 | §2.4 p6 | 一致；另对照 arXiv 摘要 |
| WebCanvas 用关键导航节点完成率 | §3.1 p7 | 一致；另对照 arXiv 摘要 |
| 网页基准多测完成与效率，政策合规、风险与安全测得少 | §3.1 p7 | 一致，导读以此作为作者的缺口陈述 |
| SWE-bench 2,294 题、12 个 Python 仓库 | §3.2 p7（综述未给数）；arXiv 摘要 | 综述只说真实 issue 与仓库；数字取自摘要，正文已分别标注来源 |
| SWE-bench Lite 300 题；LiteS、Verified、SWE-bench+ 各修正一处弱点 | §3.2 p7 | 一致 |
| ScienceAgentBench：102 题、44 篇论文、四个学科、九位专家 | §3.3 p8（综述未给数）；arXiv 摘要 | 数字取自摘要，正文标注 |
| CORE-Bench：270 题、90 篇论文 | §3.3 p8（综述未给数）；arXiv 摘要 | 数字取自摘要，正文标注 |
| AAAR-1.0 四项任务；MLGym 13 项；DiscoveryWorld 120 项；LAB-Bench 生物 | §3.3 p8 | 一致 |
| ABCD 一万多段对话、55 种意图 | §3.4 p8 | 原文 “over 10K”“55 distinct user intents” |
| ALMITA：14 种意图、192 段对话、1,420 个测试 | §3.4 pp8–9 | 一致 |
| τ-bench：115 零售 + 50 航空；政策写入系统提示；判定数据库状态与必要输出 | §3.4 p9 | 一致；pass^k 与“<50%”“pass^8<25%”取自 arXiv 摘要，正文标注 |
| GAIA：466 题、300 个答案留榜；人 92%、插件 GPT-4 15% | §4 p9（综述只给 466）；arXiv 摘要 | 466 与综述一致；其余取自摘要，正文标注 |
| AgentBench 八环境 | §4 p9、图 1 p2；arXiv 摘要 | 一致；环境清单以原文与摘要为准 |
| 表 1：八个框架、六项能力 | §5 p11 | 逐格核对；七家有单步与监控，三家有轨迹，三家有合成数据，七家有 A/B，六家有在环 |
| 最佳 Agent 得分有时低到 2% | §6.1 p12 | 一致，作为作者对难度的说明 |
| AgentHarm 110 个任务、440 个增强、11 类危害 | §6.2 p12（综述未给数）；arXiv 摘要 | 数字取自摘要，正文标注 |

### 导读自编内容

- 「蓝隼航空」的订单号、政策条款、延误时长（3 小时 10 分 vs 2 小时门槛）、费用（120 元）、四套运行与表格，全部为教学例子，与真实航空公司无关；正文开篇和覆盖说明各标明一次。
- 重复运行算式 $0.75^4\approx0.32$、$1-0.25^4\approx1.00$ 按独立假设手算复核：0.3164、0.9961。正文已说明独立性仅为演示。
- 三要素表、四套运行表、粒度取舍表、速查表由综述叙述整理，不冒充原表；正文已注明。
- 把综述 §5 的“最终回复—单步—轨迹”三层映射到基准上的“任务结果—单步行动—完整轨迹”，以及把三要素套用到能力层，都是导读的整理，正文已说明来源。
- “跨任务汇总的权重”与“总分混合了不同成功定义”两段是导读对汇总方式的分析；综述只描述通用基准、HAL 的聚合与各领域的判定，没有展开权重问题。
- 重复运行与 pass^k 来自 τ-bench 原论文摘要和站内导读，不是 v1 综述的指标介绍。
- 与 τ-bench、AgentBench、HELM、大模型评测综述、多 Agent 通信综述的站内链接均为编辑建议，指向固定修订；不表示这些导读之间存在实验证明关系。

## 原文问题与旧修订出入

1. §3.2 把 AgentBench 描述为 “a dedicated framework for evaluating the interactive capabilities of SWE agents”。AgentBench 本身是八种交互环境的多环境集合（其摘要与 §4 均可核对），不是软件工程专用框架。导读在软件工程一节只说明综述在那里提到它，在通用一节按它自己的八环境描述，具体协议链接到本库 AgentBench 导读。这处出入保留在本记录，正文没有展开成审稿意见。
2. 同一篇 AgentBench 在 §3.2 引作 Liu et al. (2023b)，在 §4 引作 Liu et al. (2023a)，引用键不一致；不影响导读内容。
3. 第 1 修订导读写“τ-bench 展示重复成功和至少一次成功为什么应分开”。v1 正文只描述 τ-bench 的模拟用户、数据库状态与政策，没有介绍 pass^k；该说法来自 τ-bench 原论文摘要与站内 τ-bench 导读。第 2 修订改为分别标注，并把 pass^k 的说明放在重复运行一段。
4. 第 1 修订在通用层末尾用一段谈多 Agent，并标为编辑联系。第 2 修订把这段收成一句，明确 v1 的 Scope 不覆盖多 Agent，并链接到站内的多 Agent 综述。
5. 表 1 的“轨迹评价”在 Langfuse、Arize、Galileo、Patronus、Mosaic 标为不支持，与 §5 正文只点名 Vertex AI、LangSmith、AgentEvals 支持轨迹的表述一致，没有冲突；导读没有把“轨迹评价”写成行业普遍能力。

## 未核对与不能核对的内容

- 综述列举的基准和框架数量很大，只对 SWE-bench、GAIA、τ-bench、ToolSandbox、LLF-Bench、ScienceAgentBench、CORE-Bench、LTM benchmark、AgentHarm 九项对照了 arXiv 摘要；其余（如 WebArena 的四类站点、WebCanvas 的数据集构成、CRMArena 的数据关系）按综述描述转述，未逐篇读原文。
- 表 1 与框架能力是 v1 的 2025 年初快照，没有访问各产品当前文档，也没有验证勾叉是否仍然成立。
- 没有运行任何基准、没有复现任何成功率或对比实验；所有性能、规模与难度数字均来自原文或摘要，未做独立测量。
- 没有检查 2026 正式版全文，只打开 ACL 发表页核对“五个视角”和发表身份；正式版新增的第 4 个视角（benchmark 核心维度）没有进入本导读。
- 外部 PDF 阅读器是否响应 `#page=` 未验证；正文链接同时写明章节与页码，便于手工定位。
- 没有读取任何个人记录、账户信息或本机环境变量；固定原文与截图保存在项目忽略的 `.source-review/agent-evaluation-survey/`。

## 交付自查（对照 GUIDE-WRITING.md 第十一节）

- [x] 正文、公式、表格与数字逐条对照固定原文；外部数字另注摘要来源。
- [x] 核心为“被测系统 + 三要素 + 三种粒度”，篇幅集中在定义、应用判定与粒度三部分。
- [x] 有原图（图 1）、步骤/结构表（三要素、四套运行、表 1、粒度取舍、速查表）与手算算式（重复运行）。
- [x] 综述代表方法按“问题—做法—区别—条件/局限”展开的有 ToolSandbox、LLF-Bench、SWE-bench、ScienceAgentBench、τ-bench、WebCanvas、GAIA。
- [x] 自编例子标明了身份；多 Agent 联系与后续阅读标明为编辑补充。
- [x] 背景与概念先于机制；每个术语使用时就地解释。
- [x] 限定条件集中在结论处；`guide-work.mjs check` 报否定词密度 6/万字符（12 处）。
- [x] 没有成段祈使句；叙述为主。
- [x] `node scripts/content/guide-work.mjs check agent-evaluation-survey` 通过（12 单元、24 条引用、1 个资产）。
- [x] 图 1 的裁切结果亲眼看过；表 1 逐格核对。
- [x] 信息卡四段概述、两段价值、三段建议；无图。
- [x] 新增 20 条术语，均核对过与现有条目无 id/别名冲突，未使用单独普通词作别名。
- [x] 本核对记录已写。

## 本轮生成的文件

| 文件 | 说明 |
| --- | --- |
| `content/guides/agent-evaluation-survey.r2.md` | 新修订正文，21,362 字符 |
| `content/guides/agent-evaluation-survey.r2.json` | 由脚本生成；正文 SHA-256 `41d5c7594ee1a7333c8722ac5b9f13ae95a695adb5e9e243f905949fac69a830` |
| `content/guides/assets/agent-evaluation-survey/figure-1-survey-map.webp` | 原论文图 1 裁切，SHA-256 `a42c49345f31d1ff39eefe2dc57e9a6dcf1449aba201f02a9cca24d0af2d2644` |
| `.cache/guide-work/agent-evaluation-survey/spec.json` | 生成说明 |
| `.cache/guide-work/agent-evaluation-survey/brief.json` | 新信息卡 |
| `.cache/guide-work/agent-evaluation-survey/glossary.json` | 20 条新术语 |

共享文件 `content/catalog.json`、`content/library-briefs.json`、`content/glossary.json` 未改动；没有提交、推送或部署。
