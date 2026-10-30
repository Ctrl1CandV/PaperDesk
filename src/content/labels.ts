export function coverageLabel(scope: string) {
  return ({ abstract: '仅依据摘要', selected: '覆盖选定章节', mainline: '覆盖论文主线', 'full-survey': '覆盖综述全篇' } as Record<string, string>)[scope] ?? scope;
}
/** What a coverage level means for the reader, shown on hover beside the label. */
export function coverageHint(scope: string) {
  return ({ abstract: '导读只依据摘要，没有讲解方法与实验细节。', selected: '导读只讲解了部分章节，其余内容需要回到原文。', mainline: '导读讲清了主要论证和关键证据，没有逐一展开全部分支、附录或引用工作。', 'full-survey': '导读实质讲解了综述的全部主要分支及必要证据。' } as Record<string, string>)[scope] ?? '';
}
