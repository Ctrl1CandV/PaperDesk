import { Children, isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Citation, Guide } from '../content/types';
import { contentRepository } from '../content/repository';
import { AppLink } from '../app/navigation';
import { Diagram } from './Diagram';
import { PaperFigure } from './PaperFigure';
import { TermHint } from './TermHint';
import { remarkTerms } from './remark-terms';
import { englishGlossaryMatcher, glossaryMatcher } from '../content/glossary';
import { isSafeExternalUrl } from '../../shared/content-policy.mjs';
import { readingMathText } from '../../shared/reading-text.mjs';

function textOf(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '').join('');
}
// Compact only display notation; original labels remain in the accessible name and source dialog.
function citationDisplay(label: string) {
  return label.replace(/PDF\s*第([^页]+)页/g, 'p.$1').replace(/(原文(?:论)?(?:文)?)\s*v\d+(?:[.\d]*)[，,、]?\s*/g, '$1 ');
}
export function Formula({ source, display, language = 'zh' }: { source: string; display: boolean; language?: 'zh' | 'en' }) {
  try {
    const html = katex.renderToString(source, { displayMode: display, trust: false, strict: 'error', throwOnError: true, maxExpand: 200, maxSize: 20, macros: {} });
    if (!display) return <span className="inline-formula" data-reading-text={readingMathText(source)} dangerouslySetInnerHTML={{ __html: html }} />;
    return <span className="formula-block" data-reading-text={readingMathText(source, true)}><span className="formula-scroll" role="region" tabIndex={0} aria-label={language === 'en' ? 'Formula, horizontally scrollable' : '公式，可横向滚动'} dangerouslySetInnerHTML={{ __html: html }} /><span className="overflow-hint">{language === 'en' ? 'Long formulas can scroll horizontally; focus and use the arrow keys.' : '长公式可横向滚动，键盘聚焦后用方向键查看。'}</span></span>;
  } catch {
    return <span className="formula-error" data-reading-text={readingMathText(source, display)}>{language === 'en' ? 'Formula could not be displayed:' : '公式未能显示：'}<code>{source}</code></span>;
  }
}
export const Markdown = memo(function Markdown({ guide, markdown, unitId, onCitation, language = 'zh' }: {
  guide: Guide; markdown: string; unitId: string; language?: 'zh' | 'en';
  onCitation: (citation: Citation, label: string, trigger: HTMLButtonElement) => void;
}) {
  let citationIndex = 0;
  let paragraphIndex = 0;
  const matcher = language === 'en' ? englishGlossaryMatcher : glossaryMatcher;
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath, [remarkTerms, { title: guide.metadata.title, matcher }]]}
    urlTransform={url => isSafeExternalUrl(url) || contentRepository.resolveRelated(guide, url) || contentRepository.resolveAsset(guide, url) ? url : ''}
    components={{
      p: ({ node, children }) => {
        // A paragraph holding only an image becomes a figure, which cannot sit inside <p>.
        const content = node?.children.filter(child => child.type !== 'text' || child.value.trim()) ?? [];
        if (content.length === 1 && content[0].type === 'element' && content[0].tagName === 'img') return <>{children}</>;
        return <p data-paragraph={`${unitId}-p${++paragraphIndex}`}>{children}</p>;
      },
      abbr: ({ children, ...props }) => {
        const id = (props as Record<string, unknown>)['data-term'];
        return typeof id === 'string' ? <TermHint id={id} language={language}>{children}</TermHint> : <>{children}</>;
      },
      h1: ({ children }) => <h1>{children}</h1>,
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        const citation = guide.metadata.citations.find(item => item.url === href);
        if (citation) { const label = textOf(children); return <button id={`${unitId}-citation-${citationIndex++}`} className="citation-button" data-reading-text={label} aria-label={label} title={label} onClick={event => onCitation(citation, label, event.currentTarget)}><span aria-hidden="true" className="citation-display">{citationDisplay(label)}<span className="citation-arrow">↗</span></span><span className="visually-hidden">{children}</span></button>; }
        const related = contentRepository.resolveRelated(guide, href);
        if (related) return <AppLink id={`${unitId}-related-${href.replace('.md', '')}`} to={related}>{children}<span aria-hidden="true"> →</span></AppLink>;
        return <span>{children}</span>;
      },
      img: ({ src, alt, title }) => {
        const figure = typeof src === 'string' ? contentRepository.figure(guide.metadata.id, guide.metadata.revision, src) : undefined;
        const asset = typeof src === 'string' ? guide.metadata.assets.find(item => item.path === src) : undefined;
        return figure ? <PaperFigure figure={{ ...figure, alt: alt || asset?.alt || figure.alt, rights: asset?.rights || figure.rights }} caption={title ?? undefined} language={language} /> : <span className="content-fallback" data-reading-ignore>{alt ? `${language === 'en' ? 'Image' : '图片'}：${alt}` : (language === 'en' ? 'No local image available' : '未提供可显示的本地图片')}</span>;
      },
      pre: ({ children }) => <div className="code-block">{children}</div>,
      code: ({ className, children }) => {
        const source = String(children).trimEnd();
        if (className === 'language-mermaid') return <Diagram source={source} language={language} />;
        if (className?.includes('language-math')) return <Formula source={source} display={className.includes('math-display')} language={language} />;
        return <code className={className}>{children}</code>;
      },
      table: ({ children }) => <div className="table-wrap"><p className="overflow-hint">{language === 'en' ? 'Tables can scroll horizontally; focus and use the arrow keys.' : '表格可横向滚动，键盘聚焦后用方向键查看。'}</p><div className="table-scroll" role="region" tabIndex={0} aria-label={language === 'en' ? 'Article table, horizontally scrollable' : '正文表格，可横向滚动'}><table>{children}</table></div></div>,
    }}>{markdown}</ReactMarkdown>;
});
