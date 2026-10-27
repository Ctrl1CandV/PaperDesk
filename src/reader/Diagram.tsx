import { useEffect, useId, useState } from 'react';
import DOMPurify from 'dompurify';
import { isSafeDiagram } from '../../scripts/content-policy.mjs';

export function Diagram({ source }: { source: string }) {
  const id = `diagram-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);
  const labels = new Map([...source.matchAll(/([A-Za-z][A-Za-z0-9_]*)\[([^\]]+)\]/g)].map(match => [match[1], match[2]]));
  const steps = source.trim().split(/\r?\n/).slice(1).map(line => line.trim().split(/\s*-->\s*/).map(node => labels.get(node.match(/^[A-Za-z][A-Za-z0-9_]*/)?.[0] ?? '')).filter(Boolean).join(' → ')).filter(Boolean);
  useEffect(() => {
    let cancelled = false;
    if (!isSafeDiagram(source)) { setFailed(true); return; }
    import('mermaid').then(async ({ default: mermaid }) => {
      const theme = getComputedStyle(document.documentElement);
      const color = (token: string) => theme.getPropertyValue(token).trim();
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base',
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
        flowchart: { htmlLabels: false, useMaxWidth: false, padding: 18, nodeSpacing: 26, rankSpacing: 34 },
        themeVariables: { primaryColor: color('--surface-selected'), primaryTextColor: color('--ink'), primaryBorderColor: color('--line-strong'), lineColor: color('--accent'), secondaryColor: color('--surface-soft'), tertiaryColor: color('--surface'), edgeLabelBackground: color('--surface'), fontSize: '16px', dropShadow: 'none' },
      });
      const result = await mermaid.render(id, source);
      const safe = DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a', 'image', 'script'], FORBID_ATTR: ['href', 'xlink:href'] });
      if (!cancelled) setSvg(safe);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, source]);
  return <figure className="teaching-diagram">
    <figcaption><span className="figure-label">教学示意</span><span>组成之间的联系 · 非原论文图</span></figcaption>
    {failed ? <p role="status">图示暂时无法绘制，可阅读下方文字流程与相邻讲解。</p> :
      <div className="diagram-scroll" role="region" tabIndex={0} aria-label="教学流程图，可横向滚动" aria-busy={!svg}>
        {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="diagram-loading">正在绘制流程图…</p>}
      </div>}
    <p className="overflow-hint">图示可横向滚动，键盘聚焦后用方向键查看。</p>
    <details className="diagram-text"><summary>查看文字流程</summary><ul>{steps.map((step, index) => <li key={index}>{step}</li>)}</ul></details>
  </figure>;
}
