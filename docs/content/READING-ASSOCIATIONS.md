# 按研究方向交付文献关联

为某个方向筛选、制作和加入文献时，交付应同时包含固定版本的关联清单。导读入库与清单经过同一次 catalog 校验、暂存和原子切换；不要求读者再次逐篇选择。清单只描述公开主题与书目，不包含私人探索 ID、问题、笔记或研究记录正文。

## 内容包中的交付清单

`catalog.json` 支持可选 `readingAssignments`：

```json
{
  "readingAssignments": {
    "batches": [
      {
        "id": "synthetic-topic-reading-1",
        "collectionId": "synthetic-topic",
        "titleAliases": ["Synthetic public topic"],
        "guides": [{ "guideId": "synthetic-guide", "revision": 1 }]
      }
    ],
    "activeBatchIds": ["synthetic-topic-reading-1"]
  }
}
```

上例全部为合成字段。实际交付时：

1. 为公开主题选定稳定 `collectionId`，之后的追加文献沿用它。先检查已有批次，避免另建集合。
2. 每次交付使用新的不可变 `id`。`guides` 写出已经审阅、在该内容包内实际保留的 `guideId + revision`，不能依赖“当前版本”替换旧引用。
3. 首批 `titleAliases` 仅写公开主题的明确标题/已知拼写，不写私人问题或研究设想，不使用关键词、包含匹配或相似度推断。匹配仅归一化 Unicode、大小写和空白，必须唯一。
4. 在 `activeBatchIds` 激活该批次，保留所有历史批次。相同 ID 的内容不许修改或移除；需要停止交付就从激活列表移除。
5. 按正常流程执行 `npm run import:content -- --from incoming/reviewed-release --dry-run`，核对输出的 `activeReadingAssignmentIds` 和固定书目，再执行 `--apply`、`npm run build`。实际浏览器刷新后消费清单。清单生效不需要模型请求。

读者自己的完整问题和私密方向名不能为了自动匹配而进入公共内容仓库。未能提供明确公开主题标签或存在重名时，不猜测目标，可在方向页手动关联；后续需要不同的私密交付通道时另行实现。

## 浏览器中的关联行为

第一次交付只绑定唯一精确匹配的既有研究方向，不创建方向，不改变阅读标记、摘录或研究结论。匹配成功后，把书目追加到 `research.relatedGuides`，同时以同一次预期修订保存 `research.readingAssignmentReceipts`。绑定记录此后即使改名，同一 collection 的新批次仍交给该记录。

一个批次每个方向只消费一次：手动移除文献后刷新不会把它加回来。已有相同 guide ID 的手工固定修订优先保留，自动交付不会升级它。单方向最多 50 个显式关联、512 条交付记录；超出上限时不部分写入该批次。复制/备份导入导致同一集合绑定多个方向、标题重名、固定版本不可用等情况不覆盖，页面显示未完成关联的提示。

保存使用记录修订检查；并发修改后重新读取再计算，持续冲突会保留原记录并提示重试。历史交付记录随个人备份保留，不能通过普通编辑删掉。内容回滚只恢复清单的激活选择，并保留所有不可变批次；已写入个人方向的书目不会因内容回滚消失。

## 当前公开阅读集合

当前包含 `multi-agent-communication` 与 `agent-model-evaluation` 两个集合，各 2 篇综述、3 篇论文。具体篇目与采用版本以 `content/catalog.json` 的关联批次和[阅读集合说明](RESEARCH-READING-SET.md)为准。基础学习组属于通用阅读，不自动强塞进这两个方向。

此机制是明确交付指令的消费，不是“本库匹配”或选文推荐。相关文献会沿用已有逻辑进入方向页、方向上下文和文档导出附录；它们仍然只是关联书目，不能被解释为读者已读或已经验证的依据。
