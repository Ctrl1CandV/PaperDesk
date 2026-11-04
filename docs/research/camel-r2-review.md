# CAMEL 导读 r2 核对记录

## 固定原文与阅读范围

- 导读 ID：`camel`，新修订：r2。旧修订 `camel.md` / `camel.json` 未改动。
- 固定原文：Guohao Li、Hasan Abed Al Kader Hammoud、Hani Itani、Dmitrii Khizbullin、Bernard Ghanem，*CAMEL: Communicative Agents for “Mind” Exploration of Large Language Model Society*，arXiv:2303.17760v2，2023-11-02，NeurIPS 2023。论文页面：https://arxiv.org/abs/2303.17760v2。
- 下载文件：`.source-review/camel/source.pdf`（77 页），SHA-256 `926c73c2ae9f9abc7612ab58373e428476f4de55db78646ed59de09810db7777`；同时下载了 `.source-review/camel/source.html` 用于章节锚点。正文与附录文字用 PyMuPDF 提取到 `source.txt`，表格和图像另看原页渲染。
- 实际阅读：正文 §1–6（PDF 第1–10页）全读。附录选读 A 的开头（第11–12页）、B 的开头（第18–20页）、C–H（第23–30页）、I 的开头（第35页）、J–K（第38–46页）、M–O（第50–55页）、Q–T（第67–69页）中与主线相关的部分。没有逐页阅读附录 L、P，A/B/H 的其余示例，没有阅读参考文献正文；被引方法的身份通过 arXiv API 核对了编号与标题。
- 查看的原图与表格：Figure 1（p4）、Figure 8（p38）、Figure 9（p39）、Figure 10（p39）经裁切后逐张打开查看，确认图例、坐标和主要文字完整；Figure 7（p28）通过文本提取阅读，没有单独裁切；Table 1（p9）、Table 2（p10）、Table 3（p10）通过原页渲染和文本提取核对；Table 9（p68）通过文本提取核对。Figure 2（p6）的提示模板通过文本提取阅读，没有复制成图片。
- 许可：arXiv v2 页面标注 CC BY 4.0；四张复制图在元数据中记录作者、图号、固定 PDF 页码和许可依据。裁图不含原图注，图注由导读另写。

## 关键说法与数字

| 导读说法 | 原文位置 | 核对结果 |
| --- | --- | --- |
| 作者来自 KAUST；论文为 NeurIPS 2023，arXiv v2 日期 2023-11-02 | 首页作者栏、页脚、arXiv 记录 | 一致。 |
| 人的逐轮提示是瓶颈；例子是非交易专家难以写出交易机器人提示 | 摘要、§1，p1 | 一致；论文用 trading application 举例。 |
| 初步观察遇到角色反转、重复指令、空泛承诺、无进展循环 | §1、§4.1，p2、p8；附录 G，p28 | 一致；四类名称与 Figure 7 相符。 |
| 人类只给初步想法和角色；task specifier 生成具体任务 | §3.1 与 Figure 1，p4 | 一致；Figure 1 的交易机器人任务文本逐句核对。 |
| AI user 是任务规划者，AI assistant 是任务执行者；实验用两个 gpt-3.5-turbo | §3.1，p4–5；§4，p7 | 一致；论文称二者为 LLM agents。 |
| 式 1–4：$M_t$、$I_{t+1}=U(M_t)$、$S_{t+1}=A(M_t,I_{t+1})$、$M_{t+1}=M_t\cup\{(I_{t+1},S_{t+1})\}$ | §3.1 式 1–4，p5 | 一致；导读把式 2–4 并排写，未改符号含义。 |
| 可扩展到消息传递图和 critic-in-the-loop；评论者可为 AI 或人 | §3.1，p5；附录 O，p54 | 一致；导读明确标为主实验之外的扩展。 |
| 三条提示：$P_T$、$P_A$、$P_U$；提示只在开始时使用 | §3.2，p5 | 一致；$P_T$ 不是系统消息，导读在正文用“起始提示”统称、随后分开说明。 |
| 提示包含角色、任务、交流格式、终止条件、拒绝条款；assistant 以 Solution 开头、Next request 结尾；user 用 Instruction/Input；结束标记只由 user 发出 | §3.2 与 Figure 2，p5–7 | 一致；逐条对照 Figure 2 的 AI Society 模板。 |
| 五种终止条件：User No Instruct（3 轮）、Assistant Instruct、End of Task Token、Token Limit、40 条消息上限 | §4.1，p8 | 一致；导读按原文列出。 |
| 对话成本随长度平方增长；40 条上限用于控制成本 | §4.1，p8；附录 J，p38 | 一致；正文解释为历史反复送入模型导致的成本增长。 |
| AI Society：50 个 assistant 角色、50 个 user 角色、每个角色组合 10 个任务，共 25,000 段对话 | §4.1，p8 | 一致；50×50×10=25,000。 |
| Code 数据：20 种语言、50 个领域；正文没有给出对话总数 | 附录 E 与 Figure 6，p25 | 一致；图为 20 种语言、50 个领域；正文未给总数，导读没有自行相乘。 |
| Math：50K 问题—答案对，25 主题×25 子主题×80 题；Science 三科各 20K，25×25×32 | 附录 F 与 Table 4，p26 | 一致；导读按科目分别说明。 |
| Misalignment 数据模拟恶意应用，例如黑客帮助 AGI“控制世界” | 摘要、§1，p2；附录 B，p18–23 | 一致；导读把它描述为风险示例，没有当作能力基准。 |
| 代码 Apache 2.0，数据 CC BY-NC 4.0，仅限研究 | 附录 K.4，p45 | 一致。 |
| 评价从 AI Society 和 Code 各抽 100 个任务；GPT-4 把对话整理成方案，再与 gpt-3.5-turbo 单次回答比较 | §5.1，p8–9；附录 H，p29 | 一致；正文称 summarization，附录提示要求 extract full solution，导读同时说明两种措辞。 |
| 人工评价只覆盖 AI Society，共 453 份回应；Code 只做 GPT-4 评价 | §5.1，p9；附录 K.5，p46 | 一致；人工评价指南要求匿名并排比较、可选“一样好”。 |
| Table 1：AI Society 人工 13.3% 平局、10.4% gpt-3.5 胜、76.3% CAMEL 胜；AI Society GPT-4 4.0/23.0/73.0；Code GPT-4 0.0/24.0/76.0 | Table 1，p9 | 对照原表逐格一致。 |
| 人工与 GPT-4 的平局比例不同，方向一致 | Table 1，p9 | 一致；论文只说 highly aligned，没有给统计检验。 |
| 逐步微调 LLaMA-7B，顺序为 AI Society→Code→Math→Science；评测 20/20/20/60 题 | §5.2，p9–10 | 一致；Table 2 每块四行对应四个评测领域。 |
| Table 2 节选：+AI Society 在 AI Society 上 0/6/14；+Code 在 Science 上 1/19/40；+Math 在 Math 上 1/3/16；+Science 在 Science 上 9/2/49；+Science 在 Math 上 10/5/5 | Table 2，p10 | 对照原表逐格一致；“平局/前一个模型胜/新模型胜”的列序与论文 Draw/Model 1/Model 2 对应。 |
| 论文说加入新领域数据后“几乎总是”变好；Math 的反例保留 | §5.2，p9–10；Table 2，p10 | 一致；导读明确写出反例。 |
| HumanEval：CAMEL-7B 14.0/57.9，HumanEval+ 12.2/50.0；LLaMA-7B 10.5/36.5；Vicuna-7B 11.0/42.9，HumanEval+ 9.9/34.7；gpt-3.5-turbo 69.4/94.0，HumanEval+ 61.7/89.8 | Table 3，p10 | 对照原表逐格一致；LLaMA-7B 的 HumanEval+ 原表为“-”，导读没有引用。 |
| 训练配置：4×A100-80GB、3 epochs、lr 2e-5、batch 4/GPU、grad accumulation 8、cosine、warmup 0.04 | 附录 K.2，p44 | 一致。 |
| 提示消融：原始提示胜 75.0%，消融提示 25.0%，平局 0.0% | 附录 T 与 Table 9，p68 | 一致；消融提示保留角色、任务、共同利益、不交换角色和 TASK_DONE，删去格式与拒绝等条款。 |
| 消融后结束原因：原始 34.3/52.4/7.3/5.9；V2 59.5/12.9/25.4/2.1；V1+Task Planner 56.7/26.9/11.5/5.0（顺序为结束标记/角色反转/user 不再指令/消息上限） | 附录 J 与 Figure 9，p39；原图 Figure 8，p38 | 对照两图一致；Figure 9 图例没有 Token Limit 扇区，导读没有补写。 |
| 图 10 空泛消息：原始最低，V2 更高，V1+Task Planner 最高；最高约为原始的 1.8 倍 | 附录 J 与 Figure 10，p39 | 柱高读数约 5.8 万、6.8 万、10.5 万；1.8 倍为近似值，导读已标注“按图读数”。 |

## 原文内部需要留意的地方

1. **Figure 9 图注与正文的措辞差异。** §3.2 和正文说 assistant 输出格式以“Solution”开头；Figure 9 图注写成“starting with ‘Output:’”。两处指的都是同一个输出格式，导读采用正文的“Solution”，没有把“Output”当成另一条提示。
2. **正文“summarization”与附录“extraction”的差异。** §5.1 正文说 GPT-4 summarize 对话，附录 H 的提示明确要求“extract full and complete solutions ... not summarize”。导读把这一步描述为“整理/提取”，并指出两种措辞，避免把“摘要”理解成压缩掉代码和细节。
3. **AI Society 的 Token Limit 扇区。** Figure 8 的 AI Society 图里紫色 Token Limit 几乎不可见；导读写“几乎看不见”，没有把它写成 0，也没有补一个具体百分比。Code 的 Token Limit 为 46.7%，可以明确引用。
4. **Figure 9 的四个扇区。** 该图图例只有 End of Task Token、User No Instruct、Assistant Instruct、Max Number of Msgs 四类，没有 Token Limit；导读只列这四类，没有把两图的类别强行对齐。
5. **Table 2 不是所有领域都单调提升。** 论文正文说“almost always performs better”，但最后一个块中 +Science 对 Math 是 10 平、5 比 5；导读保留了这个反例。Table 2 的每格列序是 Draw / Model 1 / Model 2，导读表头改成“平局 / 前一个模型胜 / 新模型胜”，避免读者把中间一列当成新模型。
6. **52.4% 的口径。** Figure 8 统计的是对话终止原因，不是任务失败率；同一段对话可能先出现重复或空泛消息，最后因角色反转结束。导读反复区分“结束原因”和“任务成功率”，没有把 52.4% 写成任务失败率。
7. **Code 数据总数。** 正文只给 AI Society 的 25,000 段对话；Code 的角色、语言、领域生成方式在正文和附录 E 有说明，但没有给对话总数。导读明确写“正文没有给出”，没有用 20×50×10 之类的方式推算。
8. **评价预算不对等。** CAMEL 一侧是多轮调用加 GPT-4 整理，基线是 gpt-3.5-turbo 单次回答；论文没有匹配 token 预算。导读把这一点列为解释 Table 1 的限制。
9. **评价者同源风险。** GPT-4 既参与整理 CAMEL 对话，又担任 GPT-4 评价者；人工评价只覆盖 AI Society。导读把这写成“同一模型家族参与两端的偏置风险”，没有说论文证明了因果关系。
10. **“AI Society”是模拟数据。** 角色与任务由模型生成，对话是模型对模型；导读把它与真实人群抽样、真实社会互动分开。

## 与旧导读（r1）的出入

- r1 的核心事实与数字没有发现冲突：双角色流程、task specifier、四类失败、五种终止条件、100+100 任务、453 份人工回应、76.3% 偏好、LLaMA-7B 微调与 HumanEval 评价都与原文一致。
- r1 的篇幅约 3,100 字符，信息卡约 150 字，正文以要点式段落为主；r2 按 GUIDE-WRITING 重写为约 23,000 字符，补充图 1 的逐块读法、式 1–4、两轮消息追踪、图 8 的结束原因、Table 1 的分母、Table 2 的成对比较和提示消融。
- r1 已经正确提醒“76.3% 不是任务执行成功率”“给出方案不等于执行”；r2 保留这些判断，并把它们放回具体证据链。
- r1 把“四种失败”和“五种停止条件”并列，但没有展开附录 G 的例子；r2 增加了四类失败的对话片段和 Figure 8 的统计口径。
- r1 没有讨论 Figure 9/10 的提示消融和 Table 9；r2 增加了这一组证据，并指出“更多结束标记不等于更多任务完成”。
- r1 的 `coverage` 只写实际查看 PDF 第 3、4、5、8、9 页；r2 实际阅读范围更大，记录已更新。r1 的正文与元数据没有修改。

## 没有核对或无法核对的内容

- 没有复现双角色对话、GPT-4 整理、微调训练或 HumanEval 评测；没有运行论文中的 pip/import 代码或交易机器人方案。
- 没有逐页阅读附录 L（数据集示例）、P（角色选择）、A/B/H 的全部案例；没有核对全部提示模板的每一个词，也没有核对参考文献条目。
- 没有独立重新标注四类失败，也没有计算角色反转、重复、空泛承诺在全部消息中的比例；Figure 8 只提供终止原因，Figure 10 只提供以“I will...”开头的消息数量。
- 没有重新做人工评价或 GPT-4 评价，无法验证 453 份回应的参与者构成、随机化方式和评分者一致性；论文没有报告这些细节。
- 没有核对 Figure 10 的精确柱高；1.8 倍是按图像坐标读取的近似值，论文正文没有给出具体计数。
- 没有验证 Table 2 的评测问题与训练数据是否重叠，也没有检查 HumanEval 的数据污染；论文没有报告这类分析。
- 没有独立审阅者从原文重新审核本导读；本次为作者自核，工作流的 `guide-work.mjs check` 只检查结构、引用、资产和长度，不能替代内容审阅或读者验收。
