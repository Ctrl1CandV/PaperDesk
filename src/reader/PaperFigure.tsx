import './reading-aids.css';
import { useState } from 'react';
import type { FigureInfo } from '../content/types';
import { Dialog } from '../ui/Dialog';

/**
 * An original paper figure: caption from the Markdown title, source and
 * permission from the declared asset. Clicking opens it at full size.
 */
export function PaperFigure({ figure, caption, compact = false }: { figure: FigureInfo & { url: string }; caption?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = caption || figure.alt;
  const size = figure.width && figure.height ? { width: figure.width, height: figure.height } : {};
  return <figure className={`paper-figure${compact ? ' compact' : ''}`}>
    <button type="button" className="paper-figure-frame" aria-label={`放大查看：${label}`} onClick={() => setOpen(true)}>
      <img src={figure.url} alt={figure.alt} loading="lazy" decoding="async" {...size} />
    </button>
    <figcaption>
      {caption && <span className="paper-figure-caption">{caption}</span>}
      <span className="paper-figure-source">{figure.rights} <a href={figure.origin} target="_blank" rel="noopener noreferrer">原页 ↗</a></span>
    </figcaption>
    {open && <Dialog title={label} className="figure-dialog" onClose={() => setOpen(false)}>
      <div className="figure-dialog-image"><img src={figure.url} alt={figure.alt} {...size} /></div>
      <p className="paper-figure-source">{figure.rights} <a href={figure.origin} target="_blank" rel="noopener noreferrer">原页 ↗</a></p>
    </Dialog>}
  </figure>;
}
