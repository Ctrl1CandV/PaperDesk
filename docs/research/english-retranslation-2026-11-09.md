# 英文版重译与阅读界面修正 · 2026-11-09

本记录汇总这一轮对英文版和阅读页的修改、实际运行的检查和尚未验证的部分。它是交接记录，不是读者验收，也不是独立的翻译审查。

## 起因

2026-11 第一批补齐的 22 篇英文版里，多数每节都在，内容却被压缩：解释性的句子、比喻、每节开头交代问题的句子和段落之间的承接被删掉，只留下公式、数字和结论。以 RAG r3 为例，核心的边缘化一节英文词数只有中文字数的 0.17 倍，而两篇样例约为 0.35。同一轮审查还发现两处阅读界面问题：表格单元格继承了正文的 `overflow-wrap:anywhere`，把 44.1、WebQuestions 这类数字和单词从中间断开；每张原图下面都印着一整段来源与许可文字。

## 改动

**表格。** `src/styles/reader-media.css` 让表格单元格只在正常断点换行；表格比正文栏宽时在自己的容器里横向滚动，不再压窄单元格。

**原图来源。** `src/reader/PaperFigure.tsx` 与 `src/reader/reading-aids.css` 把图注后的来源改成一行：原页链接和一个折叠的“来源与许可 / Source and permission”。完整许可文字点开才显示；放大图对话框仍完整显示。

**英文正文。** 15 篇压缩的英文版按中文修订逐段重译：rag、multi-agent-collaboration-survey、agentbench、multi-agent-communication-survey、gpt3、autogen、camel、llm-evaluation-survey、helm、instructgpt、tau-bench、agent-survey、llm-survey、agent-evaluation-survey、agentprune。每篇都经 `translation-work.mjs check` 后由 `merge` 写入 `content/translations.json`；各篇核对记录末尾追加了重译说明。其余 9 篇（两篇样例与 agent-memory-survey、chain-of-thought、concept-drift-survey、react、reflexion、streamingllm、toolformer）按段对照后保留。

**篇幅检查。** `scripts/content/translation-work.mjs` 原先用全文字符数计算比值。中文正文里的长链接（例如 NeurIPS 论文地址约 120 个字符）会被算作上百个“字”，在英文里却只算一个词，短导读因此被误判：reflexion 与 toolformer 每段都已译出，旧算法下比值却只有 0.31。现在先去掉链接地址、图片行、代码块和独立公式，只比较正文。按新算法，两篇样例为 0.43、0.45，24 篇全部在 0.43–0.57，单节最低 0.37；`check` 低于 0.38 失败，低于 0.41 或某节低于 0.31 警告。agentprune 在旧算法下为 0.31，新算法下为 0.39：它每段都在，句子却被逐句删短，所以也重译了。

**翻译写法。** 重译中发现，把中文的“不等于”“不能说明”逐字译成 “does not mean / not necessarily” 会连成一串审稿腔，tau-bench 第一稿的否定词达到每千词 11.7 个。改成肯定句时又要避免替原文加判断：multi-agent-communication-survey 第一稿有 8 处改写多出了中文没有的说法，已按中文改回。这两条规则写进了 `docs/content/workflows/GUIDE-WRITING.md` 第十三节第 5 条。

## 结果

| 导读 | 修订 | 英文词数 | 正文比值 | 否定词（每千词） | 本轮 |
| --- | ---: | ---: | ---: | ---: | --- |
| transformer | r5 | 7,124 | 0.45 | 6.9 | 样例，保留 |
| rag-survey | r5 | 8,646 | 0.43 | 5.8 | 样例，保留 |
| rag | r3 | 10,586 | 0.53 | 6.8 | 重译 |
| multi-agent-collaboration-survey | r2 | 10,483 | 0.55 | 3.2 | 重译 |
| agentbench | r2 | 7,975 | 0.55 | 6.1 | 重译 |
| multi-agent-communication-survey | r2 | 9,971 | 0.54 | 3.1 | 重译 |
| gpt3 | r2 | 10,758 | 0.57 | 3.5 | 重译 |
| autogen | r2 | 8,118 | 0.55 | 4.6 | 重译 |
| camel | r2 | 9,572 | 0.51 | 6.2 | 重译 |
| llm-evaluation-survey | r2 | 11,426 | 0.54 | 5.8 | 重译 |
| helm | r3 | 8,516 | 0.57 | 7.2 | 重译 |
| instructgpt | r3 | 11,110 | 0.56 | 4.4 | 重译 |
| tau-bench | r2 | 9,155 | 0.53 | 9.0 | 重译 |
| agent-survey | r3 | 10,571 | 0.52 | 4.7 | 重译 |
| llm-survey | r2 | 13,153 | 0.56 | 3.0 | 重译 |
| agent-evaluation-survey | r2 | 9,239 | 0.52 | 4.0 | 重译 |
| agentprune | r2 | 10,717 | 0.55 | 6.2 | 重译 |
| agent-memory-survey | r2 | 2,607 | 0.50 | 8.8 | 保留 |
| chain-of-thought | r1 | 1,965 | 0.50 | 9.2 | 保留 |
| concept-drift-survey | r2 | 3,168 | 0.48 | 8.5 | 保留 |
| react | r3 | 5,577 | 0.44 | 5.0 | 保留 |
| reflexion | r1 | 2,059 | 0.50 | 9.2 | 保留 |
| streamingllm | r2 | 2,741 | 0.46 | 9.1 | 保留 |
| toolformer | r1 | 2,108 | 0.50 | 8.1 | 保留 |

英文词数包括链接文字；比值按上文的正文算法计算。

## 实际运行的检查

- `node scripts/content/translation-work.mjs check <id>`：24 篇全部通过，没有警告。
- `npm run build`：通过（内容校验、类型检查、生产构建）；仍有原有的大 chunk 提示。
- `npm test`：582 项中 581 通过、1 跳过、0 失败。
- 用 headless Chromium 读取构建产物（拦截请求、直接返回 `dist` 文件），查看了中文与英文 GPT-3、英文 AgentBench 页面在 1440px 和 390px 模拟视口下的截图：表格数字与单词不再断开，AgentBench 的 11 列表格在栏内横向滚动；原图下方是“原页 ↗ · 来源与许可 ▾”一行，展开后显示完整许可文字。截图只在本次会话的临时目录，没有进入仓库。

## 未验证

- 15 篇重译只有作者自核，没有独立翻译审查，也没有读者验收；数字、公式和链接按中文修订照录，没有回到原论文逐项复核。
- 没有运行 Playwright web-server 端到端测试；390px 是模拟视口，不是真机测试。
- 篇幅比值和否定词密度只是提示，不能证明译文完整或准确。
