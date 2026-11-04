# llm-survey r2：原文与作者自查记录

## 交付范围

- 日期：2026-11-04。
- 作者交付：`content/guides/llm-survey.r2.md`、脚本生成的 `.json`、`content/guides/assets/llm-survey/` 四张 WebP。
- 整合片段：`.cache/guide-work/llm-survey/{spec,brief,glossary}.json`。这些在忽略目录中，交接时需要显式保留；本轮没有调用 merge。
- 只写本导读文件集。未修改旧版 `llm-survey.md` / `.json`，未修改共享 catalog、briefs、glossary 或导航索引。共享文件在开始时已有其他工作，保留原样，不将其变动计入本轮成果。
- 按 `GUIDE-WRITING.md` 读完 Transformer r5、RAG 综述 r5 及各自信息卡后重写。核心：沿原文顺序解释参数学习、当前上下文、推理预算和环境交互分别改变什么。19 个有标题章节，另有无标题开篇；采用 mainline / fulltext，而非 full-survey。
- 本记录是 AI 作者自查，不是独立第二审阅。当前目录仍选择旧修订；整合与实际页面预览由整合者执行。

## 1. 固定原文、身份与取得材料

- 论文：Wayne Xin Zhao、Kun Zhou、Junyi Li 等，*A Survey of Large Language Models*。
- 固定 URL：<https://link.springer.com/content/pdf/10.1007/s11704-026-60308-3.pdf>。
- 固定版本字符串与 r1 相同：`Frontiers of Computer Science 2026, formal journal PDF (40 pages)`。
- DOI：`10.1007/s11704-026-60308-3`。保留 r1 的 23 位作者书目信息。
- 实际下载 PDF：40 页，SHA-256 `05994e07e1e1f39414d358e5661527523e16b347c20ced53b0b9cdeb2cfb3cff`。
- 发表页：<https://link.springer.com/article/10.1007/s11704-026-60308-3>。页面标明正式记录于 2026-05-09 发布，PDF 页脚为 2026 年第20卷第12期。正文没有把获取日期当成版本日期，brief 的两个来源日期字段按旧卡继续为 null。
- 复核阅读：正式 PDF 正文 §1–8，物理页1–26，完整读过抽取文字；参考文献按本文代表方法查阅。另读第26–27页许可段及发表页 Rights and permissions。
- 局部补读 FlashAttention v2：<https://arxiv.org/pdf/2205.14135v2>，§3.1–3.2、算法1、定理1–2，PDF第4–6页。没有声称通读这篇被引论文。
- 原文、API响应、文字及截图保存在 `.source-review/llm-survey/`，不提交 Git。未读取任何私有笔记、AI历史、原文私有材料库或研究工作区记录。

## 2. 实际像素查看、裁切与许可

以下图片均用项目内 PyMuPDF 工具渲染，并以 read 图像工具实际查看。查看者是 AI；不是只读图注或只生成文件。

| 对象 | 固定 PDF 物理页 | 裁切框（点）与缩放 | 实际核对 |
| --- | ---: | --- | --- |
| 图2，生命周期总览 | 3 | `47,70,565,277`，4倍 | 上方四框及橙色设计项，下方使用与评测条完整；没有裁断边框 |
| 图3，数据准备 | 4 | `75,70,537,182`，4倍 | 左侧来源、中间预处理、右侧阶段柱和底部标签完整 |
| 图4，后训练 | 12 | `313,70,562,143`，5倍 | 一般与长CoT两路、N与N+1模型、奖励反馈及底部迭代虚线完整 |
| 图5，使用方法树 | 18 | `47,70,565,391`，4倍 | 四色主分支、三级类别及右端名称完整，未切掉右边框 |
| 表1，架构公式 | 7 | 整页3倍 | GQA/MQA/MLA的键值下标、位置编码行；线性注意力行存在代数符号疑点，未照抄 |
| 表2，训练配置 | 10 | 整页3倍 | GPT-3与LLaMA-3.1行的参数、训练词元、上下文列以及单位 |
| 表3，后训练对照 | 16 | 整页3倍 | 七种方法的数据来源与学习策略；正文按关系重写为Markdown |
| 图6，历史雷达图 | 24 | 整页3倍 | 确认为不同年份、不同基准的定性趋势图；未逐点转录成绩 |
| 规模规律公式及图3上下文 | 4 | 整页3倍 | `L(X)=C_X X^{-alpha_X}`、N/D/C定义、代表性能力措辞 |

- 裁切 PNG 已逐张打开，确认清楚、边缘完整、空白适量，没有包含图注；随后转 WebP。输出尺寸依次为2072×828、1848×448、1245×365、2072×1284。
- 四图的版权均归 Wayne Xin Zhao 等原作者。PDF第26–27页及正式发表页明确 CC BY 4.0：<https://creativecommons.org/licenses/by/4.0/>，图片无另列权利说明。本轮仅裁去图注、转码，未改图内内容；来源、许可链接和处理方式逐图写在 spec / 生成元数据中。
- 没有将表格截图用作正文资产，也没有沿用 arXiv 默认许可描述此正式版。

## 3. 关键机制、公式及全部研究数字

| 导读说法 | 原文位置或补充依据 | 核对结果 |
| --- | --- | --- |
| 采用40页正式版；四个维度；正文到第26页 | §1及§8，p1–3、26；实际PDF页数 | 与文件和章节一致，未混入arXiv长版 |
| 统计、神经、预训练、大语言模型四阶段 | §1，p1–2 | 保留历史逻辑，弱化了原文对小模型能力的绝对措辞 |
| 图2上方大规模训练、中训练、SFT、RL，下方使用与评测 | 图2，p3；§2 | 与实际模块及箭头一致；说明中训练可选、多阶段可迭代 |
| 自回归概率连乘与负对数损失 | §2 Training paradigm，p3–4 | 本文为通用教学公式，明确非原文新公式；训练并行与生成顺序分开 |
| 幂律 `L(X)=C_X X^{-alpha_X}` 与N/D/C | §2 Scaling law，p4；页面像素 | 符号与正文一致；保留经验拟合条件，不写成通用三变量预测器 |
| Kaplan偏重参数，Chinchilla研究更平衡分配参数与数据 | §2，p4；被引[14]、[18]摘要 | 与两项研究摘要一致；未搬入它们的性能数字 |
| “代表性能力”替代硬参数阈值式涌现解释 | §2 Representative abilities，p4 | 与作者明确措辞及测量争议一致 |
| 来源—预处理—调度；mix与curriculum两层 | §3.1，p4–6；图3 | 各流程及概念位置一致 |
| 逐步增加长度还需要数据与位置适配 | §3.1.3、§3.4.2，p5–6、12 | 未把长窗口写成单开关能力 |
| 稀疏注意力选位置，线性机制压缩历史为状态 | §3.2.1，p6–7 | 按综述机制概述，不转录有疑点的线性公式 |
| MQA/GQA共享键值，MLA压缩缓存 | §3.2.1、表1，p6–7；[65]–[67]摘要 | 共享的是键值而非所有查询；不归并整体模型收益 |
| RoPE旋转与ALiBi距离惩罚 | §3.2.2、表1，p7–8；[74]–[75]摘要 | 保留作用位置与长度外推局限 |
| Mixtral每层八专家、每词元选二 | §3.2.3，p8；[111]原论文摘要 | 采用原论文“8可选、2被选”，澄清综述措辞 |
| ZeRO分片优化器状态、梯度、参数 | §3.3.2，p10；[154]摘要 | 三个层次与原文一致；未摘录固定通信节省承诺 |
| FlashAttention减少读写，标准精确算法仍需平方级成对运算 | §3.3.2，p11；[166]摘要；FlashAttention v2 §3.1定理1，p5 | 原定理明确 `O(N²d)` FLOPs与线性额外内存；据此澄清综述简写 |
| GPT-3：175B参数、300B训练词元、2K上下文 | 表2，p10，实际像素 | 三列逐格一致；B为十亿，K为千 |
| LLaMA-3.1表中版本：405B、15T、128K | 表2，p10，实际像素 | 三列逐格一致，T为万亿；特指表中版本，不做受控效果比较 |
| SFT按指令—回答学习，Self-Instruct合成并筛选 | §4.1，p12–13；[182]摘要 | 输入、输出、筛选及训练作用一致；损失公式标为教学记号 |
| LoRA冻结基础权重、训练低秩更新 | §4.1.3，p13；[198]摘要 | 不把参数高效更新混写为ICL或数据筛选 |
| InstructGPT的1.3B输出较175B基础GPT-3更受偏好 | §4.2.3，p15点名该路线；[25]原论文摘要提供数字 | 明确数字来自被引原研究的提示分布人类评价，非综述统一实验 |
| 规则/模型奖励，结果/过程奖励 | §4.2.2，p14–15 | 来源与粒度是不同分类轴；验证覆盖范围就近交代 |
| PPO裁剪、价值函数，RLHF另有参考策略KL约束 | §4.2.3，p15；[200]与[25]摘要 | 裁剪和KL是不同手段，未写成同一个机制 |
| GRPO用同题组内反馈替代价值模型 | §4.2.3，p15；[30]摘要 | 机制一致；手算是简化相对信号，不是完整算法 |
| RFT筛出正确路径再监督学习；DPO利用偏好对 | §4.2.3、表3，p15–17；[201]–[202]摘要 | 保留监督、对比、强化学习的执行差别，未照抄宽泛等价断言 |
| OPD让学生采样、教师给词元反馈 | §4.3.1、表3，p16；[228]摘要 | 同题在线RFT与在线蒸馏的反馈粒度不同 |
| R1-Zero无前置SFT；R1引入冷启动，多阶段训练 | §4.3.2，p17；[29] arXiv v1摘要 | 固定引用原始v1摘要，避免最新摘要省略问题描述 |
| 综述归纳R1四步：冷启动、长推理RL、混合SFT、混合RL | §4.3.2，p17 | 明确是综述的流程归纳，无新增成绩 |
| ICL在当前文本提供示范，CoT生成中间步骤 | §5.1.2–5.1.3，p18–19；[13]、[17]摘要 | 参数更新与前向读取分开；推理解释保留为研究视角 |
| 自一致性汇总完整路径，ToT在中间状态分支回退 | §5.2.1，p19–20；[251]、[254]摘要 | ToT的24点、创意写作、迷你填字来自摘要，未摘录性能率 |
| RAG三阶段与IRCoT交织检索推理 | §5.2.2，p20；[265]摘要 | 当前资料、候选整理与生成使用分开；未把全部RAG定义成无训练 |
| Agent记忆—规划—执行—观察循环；Reflexion文本经验 | §5.3，p20–22；[270]、[271]摘要 | 真实执行归执行器；反思记忆不等同权重训练 |
| 预填充与解码；PagedAttention及推测解码 | §5.4，p22；[289]、[291]摘要 | 分页改缓存管理，推测解码在相应修正规则下保持目标分布；无倍数承诺 |
| 量化、蒸馏、剪枝与无损存储 | §5.4.3，p22–23 | 只解释作用对象，无新增量化精度或部署数据 |
| MMLU覆盖57个学科任务 | §6.1，p23；[325]摘要提供57 | 数字及测量对象一致，不写成全部通用能力 |
| HumanEval执行测试、τ-bench动态交互、Arena偏好、HELM多维 | §6.1–6.2，p23–24；对应摘要 | 任务、评分和适用边界分别说明；没有横向拼分 |
| 公平、效用、基准饱和及第七章挑战 | §6.3–§7，p24–26 | 作为作者讨论而非已证当前研究空白；图6不转录数字 |

### 教学数字单独登记

这些内容全部是导读编辑示例，不属于任何原文实验：

- 100批次、60一般文本与40代码、六比四：演示总体混合与课程顺序不同。
- 8个查询头、8/2/1个键值头：一层单序列的缓存分别为 `16Td / 4Td / 2Td`，GQA例为普通多头的四分之一。没有计算模型总显存或速度。
- 四回答奖励 `[1,1,0,0]`：总体均值0.5、总体标准差0.5、标准化信号 `[1,1,-1,-1]`。实际GRPO还涉及其他目标项和数值处理；全同奖励时没有组内优劣。
- ICL示范“2+3=5”、五路径 `[5,5,6,5,6]`：只说明示范位置和多数投票规则。
- 文件汇总器及其交互表：完全虚构，没有访问实际文件、执行程序或使用私人记录。

## 4. 被引方法摘要核对

通过 arXiv API 分两批获取响应，原始 XML 和可读摘要保存在本导读来源目录。逐条对照题名与机制；正文引用33个不同摘要入口，另有1个FlashAttention固定PDF补读入口。未使用API返回但正文未引用的条目充数。

| 机制组 | 实际核过的标题与编号 |
| --- | --- |
| 规模 | Scaling Laws for Neural Language Models — 2001.08361；Training Compute-Optimal Large Language Models — 2203.15556 |
| 注意力与位置 | Fast Transformer Decoding: One Write-Head is All You Need — 1911.02150；GQA — 2305.13245；DeepSeek-V2 — 2405.04434；RoFormer — 2104.09864；Train Short, Test Long — 2108.12409；Mixtral of Experts — 2401.04088 |
| 训练工程 | ZeRO — 1910.02054；FlashAttention — 2205.14135 |
| 指令与偏好 | Self-Instruct — 2212.10560；LoRA — 2106.09685；Training language models to follow instructions with human feedback — 2203.02155；Proximal Policy Optimization Algorithms — 1707.06347；DeepSeekMath — 2402.03300；Scaling Relationship on Learning Mathematical Reasoning with Large Language Models — 2308.01825；Direct Preference Optimization — 2305.18290；On-Policy Distillation of Language Models — 2306.13649；DeepSeek-R1 — 2501.12948v1 |
| 提示与推理 | Language Models are Few-Shot Learners — 2005.14165；Chain-of-Thought Prompting Elicits Reasoning in Large Language Models — 2201.11903；Self-Consistency Improves Chain of Thought Reasoning in Language Models — 2203.11171；Tree of Thoughts — 2305.10601 |
| 检索与交互 | Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions — 2212.10509；ReAct — 2210.03629；Reflexion — 2303.11366 |
| 部署 | Efficient Memory Management for Large Language Model Serving with PagedAttention — 2309.06180；Fast Inference from Transformers via Speculative Decoding — 2211.17192 |
| 评价 | Measuring Massive Multitask Language Understanding — 2009.03300；Evaluating Large Language Models Trained on Code — 2107.03374；τ-bench — 2406.12045；Chatbot Arena — 2403.04132；Holistic Evaluation of Language Models — 2211.09110 |

摘要链接按工作流作为 background 标记；动态摘要页并不冒充全文固定版本。DeepSeek-R1刻意用v1，元数据 `sourceVersion` 也为 `v1`；FlashAttention补读PDF为v2。

## 5. 原文疑点与旧版差异

1. **Mixtral专家数。** 正式版p8的“activate ... (e.g., 8 experts in Mixtral)”容易把总专家数写成激活数。Mixtral摘要明确每层8个、每词元选2个。正文就近说明差异，没有复制不准确表述。
2. **FlashAttention复杂度。** 正式版p11把时间和内存平方负担一起简写。FlashAttention定理1明确完整精确注意力仍为 `O(N²d)` FLOPs，额外内存为线性；正文区分算术、存储和运行时间。
3. **表1线性注意力行。** p7的LA行把负内积损失的梯度步展开成负外积，代数符号存在疑点；Mamba相邻行也值得回原论文复核。本轮只解释固定状态与容量取舍，既没有转录这些行，也没有替作者给出未经逐篇核验的新公式。
4. **DPO与RL联系。** §4.3.1的等价性讨论非常压缩，容易混淆优化目标的理论联系和实际执行步骤。本轮依DPO摘要与表3解释固定偏好数据和分类式目标，不扩展成普遍逐步等价命题。
5. **相较r1。** 从约略机制概览改成沿§1–7逐章解释；补入原图2–5、架构缓存表、七种后训练方法、分阶段实践、部署与方法地图。原有同语义ID尽量沿用；原r1的u03综合训练内容分出architecture/training/mid-training，u04分出rewards/optimization/post-practice，u05分出inference，u08的成本内容移到deployment。所有旧链接仍留在r1，无迁移或改写。
6. **站内入口。** 清除旧稿的相对Markdown链接，全部使用固定guide/revision/unit路由。相关导读的顺序明确归编辑建议。

## 6. 检查、失败与未验证项

实际执行：

```text
node scripts/content/new-revision.mjs .cache/guide-work/llm-survey/spec.json
node scripts/content/guide-work.mjs check llm-survey
```

- 元数据生成成功：20单元、61个外部来源URL、4项资产。资产哈希及正文哈希由脚本生成，没有手写元数据。
- `guide-work check` 通过，核对临时完整目录、信息卡章节名、术语与链接；不写共享文件。信息卡为4/3/3段，短章名覆盖19个有标题单元。术语片段最终35项，去掉了同期已入共享表的7个同ID项。
- 首次检查因DeepSeek-R1的URL显式v1而通用来源说明非精确`v1`失败；增加专门citationInfo后解决。
- 检查脚本指出否定限定过密后，通读并改为正向机制解释，保留任务、数据和核验条件。最终扫描约每万字符5处，未再警告；未用增字稀释密度。
- 另执行一次项目内Node检查：用KaTeX实际渲染32处数学表达式，零解析错误；逐条检查11处固定站内链接，全部找到对应修订和单元。
- 新增正文为31,461字符（其中18,433汉字），单节最大2,736字符，均低于8,000字符建议界限。正文长度含公式、英文和URL，汉字数单独计算。
- 对新增交付文本执行 `git diff --no-index --check -- /dev/null <file>`，无空白错误诊断；该新文件对照的返回码1表示存在差异。另用Node检查六份文本的行尾与末尾换行，全部通过。旧正文实算SHA-256仍等于旧元数据保存值。

没有执行或声称：

- 独立第二作者审阅、全部被引论文全文审阅、全部架构或奖励公式推导。
- 训练或基准复现、真实模型调用、网页工具运行、部署性能测量。
- 合并共享目录、刷新导航、应用构建、浏览器页面预览或真机测试。工作流将merge和build留给整合者，因此当前页面选择未切换为r2。
- 对arXiv长版与正式版全面比对、图6全部源数据审计或图5右端全部叶节点讲解。

交付结论：作者范围完成，可交整合者进行独立抽查、合并与页面渲染检查；机械检查通过不等于读者验收。
