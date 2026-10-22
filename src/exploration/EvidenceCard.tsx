import { AppLink } from '../navigation';
import type { Evidence, GuideTarget } from '../records/types';
import { isSafeExternalUrl } from '../../scripts/content-policy.mjs';
import { targetLabel, targetPath } from './model';

export function ReadingTarget({ target, id }: { target: GuideTarget; id?: string }) {
  const label = targetLabel(target);
  return label ? <AppLink id={id} className="exploration-reading-target" to={targetPath(target)}>{label} <span aria-hidden="true">→</span></AppLink>
    : <span className="exploration-missing">对应导读版本或章节暂不可用；已保存的文字仍保留。</span>;
}

export function EvidenceCard({ evidence, noteExists }: { evidence: Evidence; noteExists?: boolean }) {
  const label = evidence.provenance === 'guide-excerpt' ? '导读摘录' : evidence.provenance === 'original-excerpt' ? '原文摘录 · 手动归属' : '个人观察';
  return <article className="exploration-evidence" data-evidence-id={evidence.id}>
    <div className="exploration-evidence-header"><h3 className="exploration-provenance">{label}</h3>
      {evidence.provenance === 'guide-excerpt' && <span>导读修订 {evidence.target.revision}</span>}
    </div>
    <blockquote>{evidence.text}</blockquote>
    {evidence.target && <ReadingTarget id={`evidence-reading-${evidence.id}`} target={evidence.target} />}
    {evidence.provenance === 'guide-excerpt' && <>
      <p className="exploration-small">这段文字来自导读。列出的原始来源用于回查，不表示已亲自读过原文。</p>
      {evidence.sources.length > 0 && <ul className="exploration-sources">{evidence.sources.map((source, index) => <li key={`${source.url}-${index}`}>
        <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.label} ↗</a>
        <span>{source.version ?? '未指定固定版本'}</span>
      </li>)}</ul>}
    </>}
    {evidence.provenance === 'original-excerpt' && <div className="exploration-original-source">
      <p>{isSafeExternalUrl(evidence.source.identity) ? <a href={evidence.source.identity} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{evidence.source.identity} ↗</a> : evidence.source.identity}</p>
      <p>位置：{evidence.source.locator} · 版本：{evidence.source.version ?? '未指定固定版本'}</p>
      <p className="exploration-small">来源与摘录由你手动填写，平台未独立核实其归属或支持范围。</p>
    </div>}
    {evidence.comment && <div className="exploration-comment"><span>我的批注</span><p>{evidence.comment}</p></div>}
    {evidence.relatedNoteId && noteExists === false && <p className="exploration-missing">关联笔记已不可用；此处的摘录和批注仍完整保留。</p>}
  </article>;
}
