// Questions worth holding while reading each article type, condensed from the
// content workflow's extraction checklist. They prompt the reader's own
// judgement and make no claim about any particular paper.
const lenses: Record<string, { name: string; questions: string[] }> = {
  survey: { name: '综述', questions: [
    '作者按什么依据分类？类别之间是否互斥，又怎样相互联系？',
    '每个分支靠哪些代表工作和证据支撑，哪些只是列举？',
    '文中的挑战截止到哪个时间？今天是否仍成立需要另查。',
  ] },
  method: { name: '方法论文', questions: [
    '输入、输出和中间状态分别是什么？真正改变的是哪个组件？',
    '对照和消融是否只改变了一个因素？用了哪些额外数据、预算或先验？',
    '结论在什么设置下成立，失败情形出现在哪里？',
  ] },
  evaluation: { name: '评测论文', questions: [
    '测量的是什么能力，样本和协议怎样选定？',
    '指标方向、聚合口径和适配方式会怎样改变比较结果？',
    '数据污染、评分者影响和不确定性是否交代清楚？',
  ] },
  theory: { name: '理论论文', questions: [
    '问题怎样定义，依赖哪些假设？',
    '结论是充分还是必要条件，是上界还是实际表现？',
    '假设不成立时，结论会怎样变化？',
  ] },
  system: { name: '系统论文', questions: [
    '架构中的状态与数据怎样流动，各组件负责什么？',
    '指标是在什么负载、并发和成本条件下测得的？',
    '瓶颈在哪里，出错时怎样恢复？',
  ] },
};
const general = { name: '论文', questions: [
  '作者要解决什么问题，为什么现有做法不够？',
  '方法中真正起作用的是哪一步？',
  '证据能支持到什么程度，哪些条件不能推广？',
] };

export const readingLens = (type: string) => lenses[type] ?? general;
