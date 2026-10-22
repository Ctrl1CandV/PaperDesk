export function coverageLabel(scope: string) {
  return ({ abstract: '摘要范围', selected: '选定章节', mainline: '研究主线', 'full-survey': '综述全篇范围' } as Record<string, string>)[scope] ?? scope;
}
