# 研究记录与方向文献关联检查 · 2026-10-30

## 交付与边界

方向页新增持续研究记录，支持手动 Markdown 写入、预览、下载、历史恢复和 `/记录` AI 整理。当前正文进入已关联方向的主动请求；旧版本保留本地，未保存草稿不发送。版本冲突、方向删除、正文超限和上下文预算不足都不会覆盖现有记录。恢复旧版追加新版本。

两个公开阅读集合的交付批次均包含 2 篇综述、3 篇论文。浏览器首次对唯一精确标题建立关联，以集合凭据接收后续批次；幂等消费，手动移除后不反复添加。导入预览、不可变批次验证和回滚保留已接通。个人问题和阅读标记不随关联更改。实现与使用说明见[研究记录](../development/RESEARCH-NOTEBOOK.md)和[关联交付](../content/READING-ASSOCIATIONS.md)。

## 实际执行

- `npm test`：434 项通过，0 失败，0 跳过。包含新增 notebook 契约、快照摘要、工具授权、两个模拟 provider、AI 备份往返，以及文献交付与导入/回滚检查。
- `npm run build -- --logLevel warn`：通过内容校验、TypeScript 和生产构建。31 个保留导读修订、262 单元、251 个引用 URL、27 份简介不变；保留既有大 chunk 提示。
- `npx playwright test tests/e2e/research-notebook.spec.ts tests/e2e/research-discussion.spec.ts --reporter=line`：第一轮 12 项通过。
- `node node_modules/@playwright/test/cli.js test tests/e2e/research-notebook.spec.ts tests/e2e/research-notebook-safety.spec.ts tests/e2e/reading-assignments.spec.ts tests/e2e/exploration.spec.ts tests/e2e/research-assistant.spec.ts tests/e2e/accumulation-redesign.spec.ts tests/e2e/research-workspace.spec.ts --reporter=dot --global-timeout=180000`：最终 22 项通过。与上一组去重后覆盖 30 项浏览器用例。
- `git diff --check`：通过。内容工作流修改后的引用 hash 已更新。

浏览器检查包括：两个方向默认各 5 篇且个人问题不变；手动移除后刷新不恢复；单次 AI 回答重复应用不新增版本；旧历史不可覆盖；恢复保留全部版本；个人档案导出再预览识别为重复；已删除方向不能被迟到 AI 回答重建；编辑草稿在站内导航、并发冲突及方向删除时可取回；普通问答不写入；正文公式、固定导读链接可显示，HTML 和远程图片不会执行或自动加载。

一次经 npx 包装并重定向日志的 22 项浏览器检查执行到最后用例后未正常退出，被主动中断，未计为通过。随后用项目本地 CLI 和总时限完整重跑，22 项在 29.2 秒内通过。早期导入专项的旧 fixture 因删除固定修订但保留新关联清单而失败；修正合成 fixture 后通过，完整 npm 检查也通过。

## 视觉审查

已实际查看 `.cache/screenshots/notebook/` 中桌面白天、桌面夜间、历史弹窗、编辑态，以及 390px 白天/夜间模拟窄屏截图。依据桌面效果把相关文献侧栏由380px收窄为320px，让正文获得更多空间；修正首张桌面截图滚动位置。正文、操作和历史层级延续现有暖灰/酒红主题。窄屏没有页面横向溢出；表格提供内部横向滚动。

截图和测试全部使用显式 SYNTHETIC 记录，未读取原使用浏览器的私人问题或笔记。外站参考依据为 Outline 与 AFFiNE 官方功能说明；外站浏览器截图超时，未将其记为已完成视觉审查。

## 未验证

未调用真实模型检验整理质量；模型功能检查使用模拟 provider。没有真机测试。尚未在原使用浏览器里确认其私人方向的最终关联状态；交付逻辑已用相同公开标题和合成问题验证，原浏览器打开新版后消费批次。没有执行 Git 提交、推送或部署。

正文24000字符、500个版本之外，还受8MiB单探索容量限制，较长记录可能先触及容量限制。当前模型预算不足会明确拒绝，不截断后整体覆盖；需通过整理正文或调整适用模型的本地服务预算处理。下载不会自动删除历史以释放空间。
