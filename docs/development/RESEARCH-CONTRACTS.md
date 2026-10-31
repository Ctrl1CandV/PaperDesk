# 研究数据与交接契约

实现入口为 `shared/research-contract.mjs`、`shared/research-materials.mjs` 与 `shared/research-artifacts.mjs`；前后端共享数据校验和规范 JSON 摘要，不执行记录中的指令。正文、引用与模型分析保留原性质。

当前交付边界止于授权的实施文件；外部执行与回执属于可选延伸。以下回执格式继续保持兼容，但不构成本助手的产品验收门槛。笔记和已保存文档只有经界面选择才作为附加材料进入模型，探索证据的 `relatedNoteId` 本身不授权读取笔记正文。

## 持续记录与内容交付增量

`research.notebook` 是可选的 `{versions: NotebookVersion[]}`。每版含连续 `version`、Markdown `body`、`author: reader|assistant`、UTC `createdAt`；AI 版必须含 UUID `sourceTurnId`，读者恢复可含指向较早版本的 `restoredFrom`，任一版可带可选 `note`（非空，不超过 300 字的改动说明；旧版本缺省）。最多 24000 字符/版、500 版，仍受 8 MiB 单探索限制。普通保存只可追加，不可改写/移除旧版；恢复是追加保存。当前版可作为 `snapshot.notebook` 进入快照，参与 hash；旧记录缺省时摘要不变。研究记录不是 `researchMaterials.artifacts`，不发送历史或编辑草稿。

`command: {name:'notebook'}` 对应 `/记录`，要求已关联方向。工具 `update_research_notebook` 仅在该指令轮次开放，生成 `context.notebookDraft: {body,summary,baseNotebookVersion}`；保存时 `summary` 截为该版的 `note`。指令要求附带工作稿六个小节的约定（`WORKING_PAPER_SECTIONS`）、阶段记录行格式 `- YYYY-MM-DD · 内容` 和服务端当天日期。`/方向` 建立方向时，浏览器用同一 `directionDraft` 生成第一版工作稿，`author: assistant`、`sourceTurnId` 为该指令轮次。浏览器在有效完整回答后检查原方向、探索修订、文档基础版本及快照摘要，再追加版本；同一 sourceTurnId 同正文无重复写入。冲突、删除、不同正文或无工具结果不会报告保存成功；草稿保留在回答中。两个 provider 与 AI 导出/导入使用相同契约。

`research.readingAssignmentReceipts?: {batchId,collectionId}[]` 保存明确内容交付的消费凭据，最多512项、batchId唯一。普通保存不能删除或改写旧凭据；它不进入模型快照。关联与凭据在同一浏览器事务保存，固定文献进入既有 `relatedGuides`。内容端 `catalog.readingAssignments` 版本保留与激活规则见[交付契约](../content/READING-ASSOCIATIONS.md)。

## 当前状态、快照与提案

### 指令版新增（均为可选字段，旧记录与旧快照摘要不变）

- 提问可带 `command`：`{name:'direction'}` 或 `{name:'reading-brief',purpose:'accumulation'|'research'}`；推进类选文必须关联方向。`/选文` 可同时带 `readingProgress`（当前导读的导读/原文阅读标记）。二者记录在该轮上下文并进入 AI 备份。指令要求、本库公开目录与阅读标记按 `shared/research-documents.mjs` 组装，只在带指令的那一轮发送并计入预算。
- 未关联方向的 `/方向` 可调用 `create_research_direction`，校验后存为该轮 `context.directionDraft`；浏览器在回答完成后据此建立方向，并以 `research.createdFromTurnId` 防止重复。已关联方向的 `/方向` 使用 `propose_research_changes`，浏览器在回答完成后直接采纳第一份提案（同一审计路径）。
- `PROPOSAL_FIELDS` = `title`、`stage` + 原七个字段；`stage` ∈ `broaden/narrow/question/validate/write`。提案类型 `set-next-action` 可设置或清除下一步，`read-guide` 的目标须来自本轮读取的导读章节。
- `research.stage`、`research.purpose`（仅 `accumulation`，表示阅读积累而非研究方向）、`research.createdFromTurnId`、`research.seedDiscussion`（至多 3 轮、4 KiB 的起点讨论节选）。`stage` 与 `seedDiscussion` 存在时才进入快照；节选列出的问答可由 `read_topic_turn` 回看。
- `research.relatedGuides` 为可选 `{guideId,revision}[]`，至多50项，同一导读ID只允许一项。它是读者明确关联的固定修订，不是阅读标记或证据。字段存在时进入研究快照与摘要；缺省时不改变旧快照。后端按固定修订补充书目和章节信息并计入预算，正文仍需按需读取；不可用修订保留不可用状态。保存关联不写入已读状态、摘录或决定。
- 文档类型 `reading-brief`（选文实施文件）可带 `purpose` 与 `librarySnapshot`（保存时本库导读 ID）。快照继续保留，但方向页不再据“此后入库”推断相关文献。`research-line` 与其他历史文档仍可读取，不再从方向页生成手写文档、固定任务或回执。
- `GET /api/ai/topics/:id/summary` 只读返回该方向的讨论段数、问答轮数、最近时间，以及讨论时在读和被引用的导读计数，不含回答正文。
- 研究会话的工作说明只在研究主题请求中发送；工具事件 `argumentsJson` 上限为 40000 字符。

前端的一键积累通过 `ResearchRequest.autoSend` 携带明确的 `/选文 积累` 请求，在同一 `AiPanel` 连接就绪后发送；该标志不成为后端新增执行权限。请求发送前重读当前方向生成快照，读取选文所需阅读标记，使用当前本库目录；不把编辑框草稿或草稿选中的 `researchMaterials` 带入快捷请求。原草稿保留。连接、并发回答或请求失败不会触发后台自动重试；由读者重试生成，完成回答的保存失败则重试该轮保存。两种选文目的仍使用同一 `command` 契约和保存路径。

`Exploration.research` 是可选扩展：`scope/constraints/candidates/deferred/decisions/appliedProposalIds/appliedProposals/artifacts`。旧探索不填充推断结果。决定包含类型、读者处理状态、理由、来源问答、证据、时间与可选替代关系。决定状态只表示工作选择。

`conversationScope` 区分论文与探索；原 `context.scope` 仍描述实际材料范围。探索请求可以没有论文附件，也可携带原先的固定导读字段。每轮 `researchSnapshot` 有记录版本和 SHA-256，保存当时实际发出的研究字段。快照不含全部文档、回执或未选择笔记。

可选 `researchMaterials` v1 与研究状态分别计算摘要：`explorationId/notes/artifacts/materialsSha256`。笔记固定 ID、记录修订、导读定位、正文、可选摘录、状态及更新时间；文档固定 ID、修订、类型、标题、正文、来源研究版本、来源问答、引用及更新时间，不带入其他文档、任务版本或回执。最多 8 条笔记、3 份文档，总 JSON 不超过 48 KiB UTF-8；超出拒绝，不截断。此上限不保证能装入模型的实际上下文额度，模型预算另行检查。

发送前重读选择项并比较摘要。修订变化或删除阻止本次发送、保留问题草稿，由读者预览后更新或撤销选择。前后端验证归属、结构和摘要，后端记录当时副本；这不改变原研究状态摘要或提案采纳规则。取消选择仅影响后续附加材料，不删除已经发送的历史问答。

提案只允许修改标题、阶段、问题、解释、未知、范围、约束、候选、暂缓，设置或清除下一步，或追加带出处的决定。ID、基础研究版本和快照摘要由本地服务提供。来源必须来自该轮实际读取的来源。采纳在一次 IndexedDB 事务内写入状态与完整提案审计；重复同 ID 同内容无变化，ID 内容冲突拒绝，版本或快照不一致拒绝。采纳不依赖跨 SQLite/IndexedDB 事务。

`search_topic_history` 与 `read_topic_turn` 由当前主题限定；支持多个词项和中文片段匹配，仍属于词法检索而非语义检索。可选 `topicHistory` 记录预算内最近同主题讨论节选，用于新会话的连续性，并与正常会话历史排重。历史模型回答不是论文事实证据；当前研究状态优先。两条模型路径和额度 fallback 使用相同的上下文组装函数。当前实现没有模型自动生成的长期摘要，不把历史生成文本恢复为当前状态。

快照保留全部明确文本和未被替代的决定；从最新证据开始，在 14000 UTF-8 字节投影预算内按完整条目加入。`omitted` 记录未纳入证据与被替代决定的 ID，当前预览和历史回放显示数量与清单。有效决定本身超大时不静默删减，正常模型预算检查仍可拒绝。历史工具根据剩余预算裁剪返回并记录截断、遗漏条目；预算耗尽返回小型错误供模型解释。

## 文档与任务

研究文档嵌入所属探索的 `research.artifacts`，而非另设同义状态或独立关联表。文档有有限类型、草稿修订、来源研究版本、正文及持久证据引用。单探索仍受 8 MiB 限制；最多 100 份文档，每份最多 50 个任务版本、200 个回执。大规模文档库不是当前实现目标。

持久引用是 `turnId + citationId + source`，保存必要摘录；导读保存版本和可用的正文摘要，原文保存材料与解析身份、定位、范围和核验状态。不同问答的同名编号不会互相替代。

当前方向页直接下载选文实施文件 Markdown，包含已保存正文、来源讨论与修订、固定公开来源及摘录、覆盖缺口、明确关联的固定文献书目，以及导出时当前研究状态与决定理由。书目关联单独说明不代表已读或证据核验；不可用关联保留身份与缺口。附录注明导出时研究修订与正文形成时修订的区别；导出不会自动修改正文或新增执行权限。无需先填写固定任务表单，也不读取未选笔记或其他文档。

以下固定任务与回执是保留兼容的扩展契约，方向页已移除对应操作区；不能将其格式兼容描述为当前页面必须走完的步骤。

任务格式 `paperdesk-task-brief` v1 包含任务 ID、版本、摘要、研究引用与完整研究快照、计划正文、公开来源、结构化子任务、行动预算、工作流文件摘要、验收和时间。Markdown 从该对象确定性生成。公开来源补齐学术身份、URL、版本、定位和必要摘录；缺失导读或无法转为公开 URL 的手工原文标识阻止冻结并保留草稿。

任务版本不可通过普通保存删除或改写；新版本追加。备份恢复冲突使用现有保留本地/导入/两份机制；复制探索只改变容器身份，冻结任务的原身份、正文和摘要保持不变。工作流摘要由 `src/research/workflow-refs.json` 固定，修改相应规范时需同步重算。

## 回执

`paperdesk-execution-receipt` v1 记录 `runId/taskRef/status/taskResults/unresolvedQuestions/suggestedNextActions/createdAt`。任务引用必须精确匹配 ID、版本和摘要。每个结果有稳定子任务 ID、报告正文、产物、证据、未满足标准、阻塞和内容阶段。`completed` 必须覆盖全部子任务且没有未满足项；这只是结构一致性，不验证实验真实性。

重复相同回执无变化；同 ID 异内容保留原记录并报告冲突。部分结果和迟到结果可以保存；不自动更新研究决定、内容目录或阅读状态。

## 存储和备份

- IndexedDB layout 3 连续迁移旧版本，保留升级前记录；个人新导出为 archive v3，旧 v1 JSON/v2 archive 可读，旧格式不接受研究字段。旧 v1 导出遇到扩展拒绝而不丢字段。研究文档、任务与回执一起备份。
- SQLite layout 3 增加探索归属；升级前保留可验证副本。AI 新导出 v4，旧 v1/v2 JSON、v3 流备份继续可读。问答快照、已选材料、实际近期主题节选和提案在 AI 备份内；浏览器当前状态不由 AI 备份恢复。
- 原文材料继续单独备份，凭据不进入任何研究文件。容量、来源不可用与冲突均显示失败，不默默删减当前状态。
