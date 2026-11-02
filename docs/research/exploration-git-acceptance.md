# 探索项目文件传递检查 · 2026-11-02

## 实现

探索由原来的浏览器单独保存，扩展为浏览器工作状态和可随私人Git传递的不可变项目修订。原浏览器启动新版后自动迁出；另一台电脑拉取后载入完整记录。原ID、工作稿及历史、文献关联、交付凭据、决定和选文文件保持完整。不同电脑的并行修改保留为分支，显式选择后追加解决版本；删除使用墓碑，不根据时间戳判断胜者。

新增 `revisionHashes` 历史成员清单，拒绝缺失既有同步基线的旧分支回退；冲突选择过程中若Git又引入分支，则停止并重新比较。清除浏览器记录会暂停项目同步，不误删项目数据。

## 实际检查

- `npm test`：447项通过，0失败，0跳过。包含协议、哈希/DAG、幂等、CAS、Git分叉、墓碑、坏文件/缺失父修订/符号链接/容量拒绝、HTTP来源和token、无模型配置时仍可保存。
- `npm run build -- --logLevel warn`：通过内容校验、TypeScript与构建，保留原有大chunk提示。
- `node node_modules/@playwright/test/cli.js test tests/e2e/exploration-sync.spec.ts tests/e2e/exploration.spec.ts tests/e2e/research-notebook.spec.ts tests/e2e/reading-assignments.spec.ts tests/e2e/accumulation-redesign.spec.ts --reporter=dot --global-timeout=180000`：21项通过。
- `git diff --check`：通过。

浏览器检查使用两个独立合成上下文模拟电脑，验证首次迁出、新电脑载入、反向更新幂等、并行修改比较及保留未选版本、删除传递、清除后暂停/恢复、冲突选择中的Git竞态、有效祖先分支缺失新基线时拒绝回退。未连接真实模型，未用私人研究作为测试样例。

已查看 `.cache/screenshots/exploration-sync/` 中的保存状态、桌面冲突比较及390px窄屏比较截图。窄屏为模拟视口，非真机。

完成构建后通过 `npm start` 正常启动原固定地址；原使用浏览器已自动生成实际探索文件。只核对结构、数量与保存完整性，未将私人正文复制进源码、测试、日志、截图或本报告。真实数据仅在授权的 `research-workspace/` 中保存。其他个人记录和模型凭据仍在原有独立存储中。

没有云同步服务或自动Git推送；页面的“已保存到项目”表示本地文件已完成，跨电脑仍通过提交、推送和拉取。完整操作见[使用说明](../development/EXPLORATION-GIT.md)。
