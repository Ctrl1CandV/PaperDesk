# 阅读升级：独立内容与问答验收记录

审查日期：2026-10-27。审查者为 AI，与三篇候选内容的编写者不同。本报告没有人工审阅、实验复现或真实模型问答的含义。个人记录实现由本审查者负责，因此该部分测试不属于独立代码审查；本报告的独立范围是三篇新内容及原文题集。

结论：三篇 r2 的本轮内容增量在下述范围内通过；30 题原文验收集及本地候选召回已执行。真实回答正确性、引用支持、资料不足行为、研究建议质量仍未验证。中文原问题的必要证据召回从 24/46 提升至 33/46，仍不能宣称默认中文问答质量已经通过。预先补充英语词项后为 44/46；这个结果证明有界词项检索的潜力，不证明模型会自动进行同样的改写与补读。

## 1. 审查对象与不可变身份

审查候选位于 `incoming/upgrade-reviewed/guides/`。检查时旧 catalog 的 18 个 entry 在候选 catalog 中逐对象保持相同；3 篇 r2 增加后共 21 个修订，14 篇推荐导读。三篇原 unit 的 ID、顺序与 heading 保持一致，候选正文的 SHA-256 均与其 metadata 一致。本次检查不写正文、metadata 或原文清单，也不修改解析核验状态。

| 候选 | 正文 SHA-256 |
|---|---|
| `agent-memory-survey.r2.md` | `dbadf0cbee2582870b60512021cd5d4ec4308c25c5e8f1420faa569bfe2bef5b` |
| `streamingllm.r2.md` | `469102522e3ed9c58d5dfdb182b48bbbbf0e7324a65c86bb7892605d03708237` |
| `rag.r2.md` | `1fec1582c7131a68d88e4d846a4439608ba8ed96b870e140e0ec3301b494f359` |

原文使用本轮已取得的固定公开材料；本审查者没有另行联网下载，也未访问私人会话库。读取范围是 `.cache/upgrade/originals/` 及 `private/reading/manifests/`、`derived/`。清单记录及每题均包含 sourceRevisionId、materialSha256、parserRevision、sourceUnitId 与准确 locator；完整值保存在 [reading-ai-qa.json](qa/reading-ai-qa.json)。

| 材料 | 固定版本与公开出处 | 解析单元 |
|---|---|---:|
| Agent 记忆综述 | [arXiv:2404.13501v1 HTML](https://arxiv.org/html/2404.13501v1) | 406 |
| StreamingLLM | [arXiv:2309.17453v4 HTML](https://arxiv.org/html/2309.17453v4) | 196 |
| RAG | [NeurIPS 2020 camera-ready PDF](https://proceedings.neurips.cc/paper/2020/file/6b493230205f780e1bc26945df7481e5-Paper.pdf) | 16 |

三份解析 manifest 均为 `partial`，单元核验状态为 `unreviewed`。HTML 的外部图像未随解析自动下载；PDF 的公式、图形标签及表格顺序并不因文本提取成功而准确。例如 RAG 第 2 页流程图的符号在解析文本中存在乱码，而固定 PDF 像素可读。该限制必须随来源进入问答，不能用索引命中代替内容支持证明。

## 2. 独立原文与像素复核

实际检查了固定 HTML 中改动后的全部原文链接：StreamingLLM 的 18 个 anchor、记忆综述的 12 个 anchor 均存在；同时阅读相应原文段落，核对链接与主张关系。未在外部浏览器验证 PDF 阅读器是否服从 `#page=`，故保留“物理页 + 印刷页 + 手动定位”的说明。

实际查看的 PDF 整页截图如下。截图由固定 PDF 以 1.7 倍尺度栅格化，每页 1041×1347 像素，无裁剪；已查看的小字、表格列名、坐标轴及图例用于本次判定。截图文件与 PDF 的 hash 保存在题集 JSON 的 `visualReview` 中。仅生成但未查看的其他页不计入核验。

| 论文 | 实际查看物理页 | 核查范围 |
|---|---|---|
| RAG | 2、3、4、6、7、8 | 图 1 检索/生成路径、两种边缘化公式、训练冻结范围、表 1/2/4/6 的列及条件、图 2/3 |
| StreamingLLM | 5、8、9、15、16、17 | 表 1/2、图 4 缓存组成与位置、表 5/6、图 10 延迟/显存、附录限制、表 7/8 与相邻上下文；第 17 页热图未逐格量化 |
| Agent 记忆综述 | 7、8、9、11、20 | 定义前后文、图 3 跨 trial 路径、图 4 来源/形式/操作分类、图 5 直接/间接评价；未逐篇核实全部代表工作 |

上述已查看页的页脚印刷页号均与物理页序一致。这三篇样板没有提供印刷页偏移的真实 PDF 验收证据；项目中的合成页码测试应另列。仅部分定位页检查了相邻页，不应宣称每一个外部跳转页都已完整做邻页视觉验收。

内容结论：

- **通过（增量范围）**：StreamingLLM 新教学图保留固定初始 KV、滚动最近 KV、当前词元与淘汰路径，正文明确中段淘汰不会自动恢复历史；与固定 PDF 第 5 页图 4 及位置处理文字一致。常用 4 个初始词元没有被写成所有模型的定理。
- **通过（修正后）**：RAG 两词元展开的求和与乘积次序正确，明确比较相同指定输出和目标前缀。独立审查发现“只有一个输出位置时才重合”把充分条件写成必要条件，作者已改为单词元必然等价、特殊多词元参数也可能等价。本报告重新读了修正后的文本，不继承原作者结论。
- **通过（有限覆盖）**：记忆综述明确本轮只核图 3–5 的路径与分类，没有把代表工作、引用全集或全文写成已审核；分类图不是实验性能排名。
- **保留争议**：RAG 正文第 6 页写两者均事实正确为 17%，第 8 页表 4 的 Both good 为 11.7%。两处确有冲突，三篇材料不能裁定哪一个是勘误；r2 继续排除该争议数值，题集 I02 专门要求披露冲突。
- **通过（压缩边界抽查）**：表 1 的 NQ EM、表 6 的 FEVER dev 标签准确率、StreamingLLM 表 7 的距离/模型/样本条件、22.2× 对比重新计算基线均保留条件。没有将生成稳定性等同无限记忆，也没有将检索命中等同事实认证。

这不是完整文献审计、所有图片审计或实验复现。内容审查也不代替生产页面的排版、链接点击、窄视口和旧版本回放测试；这些由集成验收另行记录。

## 3. 30 题与检索实测

题集包含 10 道事实数字题、6 道机制题、4 道真正跨篇比较题、4 道资料不足题与 6 道探索题。前 20 题先读原文再确定预期要点、不可省略条件与常见误解，没有看任何模型答案。所有题均有固定资料身份，I01 额外固定仅导读模式及 r2 body hash；其原文搜索只是评测 oracle，不能偷偷提供给 guide-only 回答。

执行环境只记录必要版本：Node 22.23.3、SQLite 3.51.3；解析器 `paperdesk-structure-1/pdfjs-6.4.299/parse5-8.0.1`。使用 `ContentIndex.load({indexFile: ':memory:', readingDirectory: 'private/reading'})`，没有打开生产 AI 数据库。实际检索代码 hash、目录 hash、固定代次及逐次候选在 JSON 中。词项索引 v3 的 76 条直接/改写查询复跑候选顺序一致；这是确定性检查，不是性能采样。

预算为每道题每篇所需论文一次查询，`kind: original`、`limit: 12`、明确 `paperId`。前 20 题单篇最多 12 候选、跨篇最多 24 候选。中文原问与预先制定的英语词项改写分别执行，没有看到遗漏后修改查询。必要证据总数为 46；一题只找到其中一篇不能算全题成功。

| 检索配置与输入 | 必要证据召回 | 全部必要证据齐全的题 | 建议 90% 门槛 |
|---|---:|---:|---|
| 调整前 v3，原始中文问题 | 24/46（52.17%） | 10/20 | 失败 |
| 调整前 v3，预先补充英语术语 | 44/46（95.65%） | 18/20 | 此固定改写配置通过 |
| 调整后 v4，原始中文问题 | 33/46（71.74%） | 13/20 | 失败 |
| 调整后 v4，同一英语查询 | 44/46（95.65%） | 18/20 | 此固定改写配置通过 |

根代理在看到这套开发题集的 v3 遗漏后，增加了通用中英研究术语映射，并让英文别名优先于中文切词占用查询预算。审查者没有改变任何题目、必要证据或查询，随后重跑全部查询。**v4 属于开发集调优结果，不是独立持出集验收**。JSON 的 `beforeTuning` 与逐题 `retrievalBefore` 完整保留旧结果，`summary` 与 `retrieval` 为调整后结果。初次测量与候选 r2 正式应用后的目录代次不同；v3 的复跑证实这两个目录下原文候选列表完全相同，没有把导读切版造成的差异算作检索改进。

改写后仍遗漏 F03 的 `streamingllm-v4-html/u00037`（表 1 具体数值格）与 M01 的 `u00033`（换行符消融段落）。v4 中文仍有 F03、F09、M01、M05、M06、C02、C04 共 7 题证据不全。不能用附近的表注或 attention sink 概念段代替所需证据。所有候选身份、遗漏单元、查询与单次耗时均保存在 JSON。

必须保留的解释边界：

- 英语改写是评审者预先提供的词项查询，不是已验证的产品自动翻译/模型选词能力。中文默认使用链路仍有明显差距。
- RAG 按整页索引且仅 16 页，top 12 是较宽预算；页级命中可能掩盖真正所需句子位于 1800 字节节选之外，不能等同精确证据已进入最终 prompt。
- 尚未执行相似术语多轮、重复版本、无关论文注入与矛盾材料复测。本结果不是千篇真实论文质量证明。
- 每轮工具总预算为 6 次；例如 C03 有两次检索和五个必要单元，若都需完整补读可能超预算。后续必须记录实际补读与最终 prompt 证据，而不能用候选召回率代替。
- 本轮无真实模型、没有回答或引用评分；这些字段保留 `null`/`unverified`，没有用模拟结果填分。

## 4. 复跑方式与后续门槛

从项目根目录用项目 Node 执行以下 JavaScript（可保存为临时 `.mjs` 后运行）。它只读取题集和固定公开原文，索引使用内存。若材料未随环境保留，应先按 manifest 的相同版本/hash 恢复；不要改答案去匹配缺失材料。

```js
import fs from 'node:fs';
import { ContentIndex } from './server/content.mjs';
const qa = JSON.parse(fs.readFileSync('docs/evidence/reading-ai-qa.json', 'utf8'));
const content = await ContentIndex.load({ indexFile: ':memory:', readingDirectory: 'private/reading' });
for (const mode of ['direct', 'rewritten']) {
  let found = 0, total = 0, complete = 0;
  for (const item of qa.cases.slice(0, 20)) {
    const candidates = new Set(item.retrieval[mode].queries.flatMap(q =>
      content.index.search(q.query, {
        generation: content.generation, paperId: q.paperId, kind: 'original', limit: 12,
      }).map(hit => hit.id)));
    const missing = item.requiredEvidence.filter(e => !candidates.has(
      `original:${e.sourceRevisionId}:${e.parserRevision}:${e.sourceUnitId}`));
    total += item.requiredEvidence.length;
    found += item.requiredEvidence.length - missing.length;
    complete += Number(missing.length === 0);
    if (missing.length) console.log(mode, item.id, missing.map(e => e.sourceUnitId));
  }
  console.log(mode, { found, total, complete, questions: 20 });
}
content.close();
```

上述检索与逐项内容/hash检查已实际执行。个人记录相关执行 `npm exec -- playwright test tests/records.spec.ts tests/records-upgrade.spec.ts`：本审查者完成时 17 项通过（11.7 秒），使用隔离浏览器与合成数据，包含超过 5MiB、迁移失败回滚、两标签页冲突、导出一致性及损坏/取消恢复。后续其他作者新增测试的结果以集成报告为准，不能继承此处数字。

真实问答验收下一步应在读者授权的可用模型配置下运行同题，记录模型/配置、最终 prompt 证据、答案、引用、耗时及预算停止原因。前 20 题目标仍是正确至少 18/20，引用支持率与覆盖率分别至少 95%；不足题 4/4，探索题逐项检查近邻、假设、对照、混杂、反证与边界。存在关键事实错误或伪称创新时，不能以平均分抵消。当前交付状态为**内容增量通过、候选检索已实测、中文默认召回未通过、真实问答质量未验证**。
