import './reading-aids.css';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { englishGlossaryEntry, glossaryEntry } from '../content/glossary';
import { AppLink } from '../app/navigation';

// One open card at a time across the page.
let closeOpen: (() => void) | undefined;

/** A quiet underline on the first mention of a term; tap or click opens a small card. */
export function TermHint({ id, children, language = 'zh' }: { id: string; children: ReactNode; language?: 'zh' | 'en' }) {
  const entry = language === 'en' ? englishGlossaryEntry(id) : glossaryEntry(id);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean }>();
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cardId = useId();
  const close = (restore = false) => { setOpen(false); if (restore) button.current?.focus({ preventScroll: true }); };
  const place = () => {
    const box = button.current?.getBoundingClientRect(), panel = card.current;
    if (!box || !panel) return;
    const width = panel.offsetWidth, height = panel.offsetHeight, gap = 8, edge = 12;
    const left = Math.min(Math.max(edge, box.left), window.innerWidth - width - edge);
    const above = box.bottom + gap + height > window.innerHeight - edge && box.top - gap - height > edge;
    setPosition({ left, top: above ? box.top - gap - height : box.bottom + gap, above });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const mine = () => setOpen(false);
    closeOpen?.(); closeOpen = mine;
    card.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!card.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', place, { passive: true }); window.addEventListener('resize', place);
    return () => {
      if (closeOpen === mine) closeOpen = undefined;
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', place); window.removeEventListener('resize', place);
    };
  }, [open]);
  if (!entry) return <>{children}</>;
  const english = language === 'en';
  const names = english ? (entry.full && entry.full !== entry.term ? entry.full : '') : [entry.full, entry.zh].filter(Boolean).join(' · ');
  // A link back into the article being read adds nothing.
  const guide = entry.guide && !entry.guide.startsWith(`${window.location.pathname}#`) && entry.guide !== window.location.pathname ? entry.guide : undefined;
  return <>
    <button ref={button} type="button" className="term-hint" aria-expanded={open} aria-controls={open ? cardId : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>{children}</button>
    {open && createPortal(<div ref={card} id={cardId} className="term-card" role="dialog" aria-label={english ? `Term: ${entry.term}` : `术语：${entry.term}`} tabIndex={-1} data-above={position?.above || undefined}
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 }}>
      <p className="term-card-name"><strong lang={/^[\x20-\x7e]+$/.test(entry.term) ? 'en' : undefined}>{entry.term}</strong>{names && <span>{names}</span>}</p>
      <p className="term-card-field">{entry.field}</p>
      <p className="term-card-explain">{entry.explain}</p>
      {entry.builds && <p className="term-card-builds"><span>{english ? 'Background' : '来龙去脉'}</span>{entry.builds}</p>}
      {(guide || entry.source) && <p className="term-card-links" onClickCapture={() => close()}>
        {guide && <AppLink to={guide}>{english ? 'Guide in library' : '本库导读'} →</AppLink>}
        {entry.source && <a href={entry.source.url} target="_blank" rel="noopener noreferrer" title={entry.source.label}>{english ? 'Original paper' : '原始论文'} ↗</a>}
      </p>}
    </div>, document.body)}
  </>;
}
