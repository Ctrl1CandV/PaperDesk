import { Children, isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Citation, Guide } from '../content/types';
import { contentRepository } from '../content/repository';
import { AppLink } from '../navigation';
import { Diagram } from './Diagram';
import { isSafeExternalUrl } from '../../scripts/content-policy.mjs';

function textOf(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}
// Compact only display notation; original labels remain in the accessible name and source dialog.
function citationDisplay(label: string) {
  return label.replace(/PDF\s*第([^页]+)页/g, 'p.$1').replace(/(原文(?:论)?(?:文)?)\s*v\d+(?:[.\d]*)[，,、]?\s*/g, '$1 ');
}
export function Formula({ source, display }: { source: string; display: boolean }) {
  try {
    const html = katex.renderToString(source, { displayMode: display, trust: false, strict: 'error', throwOnError: true, maxExpand: 200, maxSize: 20, macros: {} });
    if (!display) return <span className="inline-formula" dangerouslySetInnerHTML={{ __html: html }} />;
    return <span className="formula-block"><span className="overflow-hint">公式可横向滚动，键盘聚焦后用方向键查看。</span><span className="formula-scroll" role="region" tabIndex={0} aria-label="公式，可横向滚动" dangerouslySetInnerHTML={{ __html: html }} /></span>;
  } catch {
    return <span className="formula-error">公式未能显示：<code>{source}</code></span>;
  }
}
export const Markdown = memo(function Markdown({ guide, markdown, unitId, onCitation }: {
  guide: Guide; markdown: string; unitId: string;
  onCitation: (citation: Citation, label: string, trigger: HTMLButtonElement) => void;
}) {
  let citationIndex = 0;
  let paragraphIndex = 0;
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    urlTransform={url => isSafeExternalUrl(url) || contentRepository.resolveRelated(guide, url) || contentRepository.resolveAsset(guide, url) ? url : ''}
    components={{
      p: ({ children }) => <p data-paragraph={`${unitId}-p${++paragraphIndex}`}>{children}</p>,
      h1: ({ children }) => <h1>{children}</h1>,
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        const citation = guide.metadata.citations.find(item => item.url === href);
        if (citation) { const label = textOf(children); return <button id={`${unitId}-citation-${citationIndex++}`} className="citation-button" aria-label={label} title={label} onClick={event => onCitation(citation, label, event.currentTarget)}><span aria-hidden="true" className="citation-display">{citationDisplay(label)}<span className="citation-arrow">↗</span></span><span className="visually-hidden">{children}</span></button>; }
        const related = contentRepository.resolveRelated(guide, href);
        if (related) return <AppLink id={`${unitId}-related-${href.replace('.md', '')}`} to={related}>{children}<span aria-hidden="true"> →</span></AppLink>;
        return <span>{children}</span>;
      },
      img: ({ src, alt }) => {
        const asset = src && contentRepository.resolveAsset(guide, src);
        return asset ? <img src={asset} alt={alt} loading="lazy" /> : <span className="content-fallback">{alt ? `图片：${alt}` : '未提供可显示的本地图片'}</span>;
      },
      pre: ({ children }) => <div className="code-block">{children}</div>,
      code: ({ className, children }) => {
        const source = String(children).trimEnd();
        if (className === 'language-mermaid') return <Diagram source={source} />;
        if (className?.includes('language-math')) return <Formula source={source} display={className.includes('math-display')} />;
        return <code className={className}>{children}</code>;
      },
      table: ({ children }) => <div className="table-wrap"><p className="overflow-hint">表格可横向滚动，键盘聚焦后用方向键查看。</p><div className="table-scroll" role="region" tabIndex={0} aria-label="正文表格，可横向滚动"><table>{children}</table></div></div>,
    }}>{markdown}</ReactMarkdown>;
});
