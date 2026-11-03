/** Navigation metadata is scoped to the guide units supplied this turn.
 * Keep provenance and coverage whole; unrelated teaching targets and references
 * stay in the reviewed guide rather than crowding out its actual text.
 */
export function guidePromptMetadata(metadata, units, evidence, terms = []) {
  const { title, paperId, paperTitle, source, orientation, coverage, citations } = metadata;
  const selected = new Set(units.map(unit => unit.id));
  const targets = orientation?.readingTargets.filter(target => selected.has(target.unitId)) ?? [];
  const references = citations.filter(citation => units.some(unit => unit.text.includes(citation.url)));
  return { title, paperId, paperTitle, source, coverage, evidence,
    orientation: orientation ? { shortTitle: orientation.shortTitle, bibliography: orientation.bibliography, readingTargets: targets } : null,
    citations: references,
    ...(terms.length ? { terms, termsNote: '术语名称来自平台审核术语表，只帮助识别缩写和方法名，不是原文证据。' } : {}),
    metadataProjection: { scope: 'bibliography-and-selected-guide-units', unitIds: [...selected],
      omittedReadingTargets: (orientation?.readingTargets.length ?? 0) - targets.length,
      omittedCitations: citations.length - references.length,
      omittedOrientationFields: orientation ? ['topics', 'summary', 'value', 'prerequisites', 'boundaries'] : [],
      note: '仅附所选导读章节的阅读目标和链接出处；未附项目仍在已审核导读中。coverage与原文身份完整保留；章节实际文本范围见guideRanges。' } };
}
