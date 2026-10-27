# PaperDesk

本地论文阅读与研究积累平台，支持书架、导读卡、深入阅读、笔记、研究探索和可选 AI 问答。当前版本 **0.1.0**，产品规格 **1.1**；书架包含 **14 篇当前材料、21 个保留修订**。

![PaperDesk 书架](docs/images/library.png)

## 运行

使用 Node.js 22.13+（22.x），或 Node.js 24+。已验证的运行时为 Node 22.23.3、npm 10.9.9。

```text
npm ci
npm run build
npm start
```

`npm start` 同时启动网站和本地 AI 服务，打开 [PaperDesk](http://127.0.0.1:4173/library)；Ctrl+C 一起退出。开发使用 `npm run dev`。保持固定的访问地址，浏览器记录按来源保存；Windows 下重新安装依赖前先停止项目服务。

阅读、笔记和探索在本地积累。需要 AI 时，在 **AI 设置** 中使用官方 ChatGPT 授权或配置兼容 API；密钥只由后端保存。问答在主动提交后运行，联网查证单独开启。配置、三类备份与内容导入见[运行说明](docs/development/OPERATIONS.md)。

## 学习与维护

从[中文项目导览](docs/learning/README.md)开始，沿着一次导读、一次 AI 问答和一次记录保存阅读代码。

| 位置 | 职责 |
|---|---|
| `src/` | 前端页面、阅读交互和浏览器记录 |
| `server/` | 本地接口、AI、材料检索和会话存储 |
| `shared/` | 前后端与命令共用的纯规则 |
| `content/`、`schemas/` | 已审核内容、全部修订和格式约束 |
| `scripts/`、`tests/` | 启动、内容维护与合成检查 |
| `docs/` | 学习入口、当前契约、内容规范、来源核验和历史 |

常用检查：

```text
npm run validate:content
npm test
npm run build
npm run test:e2e
```

当前能力见[项目状态](docs/development/PROJECT-STATE.md)，继续开发看[开始说明](docs/development/START-HERE.md)和 [AGENTS](AGENTS.md)，其他材料从[文档索引](docs/README.md)查找。论文选择可参考[记忆与动态决策阅读路线](docs/content/LEARNING-ROUTE.md)，版本记录见 [CHANGELOG](CHANGELOG.md)。

审核内容按不可变修订维护；正文哈希、来源身份与旧引用受到保护。打开文章不会自动标记已读。个人记录、模型凭据、原文材料备份与回滚收据不能作为普通缓存清理，见[隐私](docs/development/PRIVACY.md)和 [Git 规则](docs/development/GIT-POLICY.md)。

`node_modules/`、`dist/` 和 `.cache/` 是依赖、构建与开发产物，保持忽略；`private/` 和 `server/config.local.json` 是本地运行数据与配置。部署、同步和云服务仍在当前范围之外。学术归属保留在内容和来源记录中；本项目尚未添加许可证授权。
