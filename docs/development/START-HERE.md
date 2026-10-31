# 继续开发 PaperDesk

PaperDesk 0.1.0 的功能开发已收口，产品规格为 1.1。先从[项目学习导览](../learning/README.md)认识代码，再看[当前状态](PROJECT-STATE.md)。

后续研究助手工作的最新入口是[问题到方向与选文文件的交接](RESEARCH-ASSISTANT-HANDOFF.md)。它说明了需求与缺口；当前实现改为在阅读的 AI 对话中用 `/方向`、`/选文` 指令建立方向和生成选文实施文件，探索页为方向概览，见[对话指令](RESEARCH-ASSISTANT.md)和[项目状态](PROJECT-STATE.md)。

当前方向页以研究工作稿为主体，侧栏集中阶段、阶段记录、相关文献和选文文件，支持一键生成积累类文件；旧本库匹配入口已移除。当前书架18篇的分组、取舍、固定来源与审阅记录见[通信、评价与基础学习阅读集合](../content/RESEARCH-READING-SET.md)。

最新增量是[研究工作稿](RESEARCH-NOTEBOOK.md)：每个方向一份按论文项目起始文件组织的 Markdown，读者编辑或“记一笔”，AI 通过 `/记录` 按小节整理，保留历史与改动说明，可导出为项目起始文件；按方向交付的文献通过明确的内容批次自动建立关联，不再要求逐篇手动设置。

研究助手扩展从[产品与三阶段流程](RESEARCH-ASSISTANT.md)、[数据契约](RESEARCH-CONTRACTS.md)、[第一版检查](RESEARCH-ACCEPTANCE.md)继续。本次优先交付可用版本，工程检查和真实模型使用情况分别记录。

在项目根目录运行：

```text
npm ci
npm run build
npm start
```

网站地址固定为 `http://127.0.0.1:4173/library`；启动命令同时管理本地 AI 服务，Ctrl+C 一起退出。开发用 `npm run dev`。修改前端后重新构建，修改后端后重启服务。详细配置、内容导入和三类备份见[运行说明](OPERATIONS.md)。

修改前阅读根目录 [AGENTS](../../AGENTS.md)，以及[产品](PRODUCT.md)、[架构](ARCHITECTURE.md)、[隐私](PRIVACY.md)和[Git 规则](GIT-POLICY.md)。按改动范围继续阅读[内容契约](../content/CONTENT.md)、[个人记录](RECORDS.md)、[AI 阅读](AI-READING.md)或[内容更新](../content/CONTENT-UPDATES.md)。

日常开发先运行相关检查，收尾使用 `npm test` 和 `npm run build`。页面改动还要检查实际渲染；保存格式、导入或备份改动使用合成数据验证兼容性。构建与测试不能代替论文事实、真实模型回答或真机体验的检查。

当前以个人使用够用为准，针对具体问题改进。保留完整自然段、审核内容及其旧版本、明确来源、个人记录和固定访问地址。模型配置保存在本地后端，网页不接收已保存的密钥。只在明确提问时调用模型；联网查证单独启用。

已结束任务和旧测试结果归[历史记录](../history/README.md)。其中的路径、阶段门槛与测试数字描述当时的快照；继续开发以当前文档、代码和 npm 命令为准。
