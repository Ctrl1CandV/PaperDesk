import './reading-aids.css';
import { useState } from 'react';
import type { FigureInfo } from '../content/types';
import { Dialog } from '../ui/Dialog';

/**
 * An original paper figure: caption from the Markdown title, source and
 * permission from the declared asset. Clicking opens it at full size.
 */
export function PaperFigure({ figure, caption, compact = false, language = 'zh' }: { figure: FigureInfo & { url: string }; caption?: string; compact?: boolean; language?: 'zh' | 'en' }) {
  const [open, setOpen] = useState(false);
  const label = caption || figure.alt;
  const sourceLabel = language === 'en' ? 'Original page' : '原页';
  const enlargeLabel = language === 'en' ? 'Enlarge' : '放大查看';
  const rightsLabel = language === 'en' ? 'Source and permission' : '来源与许可';
  const size = figure.width && figure.height ? { width: figure.width, height: figure.height } : {};
  return <figure className={`paper-figure${compact ? ' compact' : ''}`}>
    <button type="button" className="paper-figure-frame" aria-label={`${enlargeLabel}: ${label}`} onClick={() => setOpen(true)}>
      <img src={figure.url} alt={figure.alt} loading="lazy" decoding="async" {...size} />
    </button>
    {/* The caption stays one quiet line; the full attribution and permission
        note is one click away here and always shown in the enlarged view. */}
    <figcaption>
      {caption && <span className="paper-figure-caption">{caption}</span>}
      <span className="paper-figure-meta">
        <a href={figure.origin} target="_blank" rel="noopener noreferrer">{sourceLabel} ↗</a>
        <details className="paper-figure-rights"><summary>{rightsLabel}</summary><span className="paper-figure-source">{figure.rights}</span></details>
      </span>
    </figcaption>
    {open && <Dialog title={label} className="figure-dialog" onClose={() => setOpen(false)}>
      <div className="figure-dialog-image"><img src={figure.url} alt={figure.alt} {...size} /></div>
      <p className="paper-figure-source">{figure.rights} <a href={figure.origin} target="_blank" rel="noopener noreferrer">{sourceLabel} ↗</a></p>
    </Dialog>}
  </figure>;
}
