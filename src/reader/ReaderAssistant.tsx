import { useEffect, useRef } from 'react';
import type { Guide } from '../content/types';
import { AiPanel } from '../assistant/AiPanel';
import '../styles/reader-assistant.css';

// Keep one panel mounted when the viewport changes so an active answer survives.
export function ReaderAssistant({ guide, unitId, selection, wide, onClose }: {
  guide: Guide; unitId: string; selection?: string; wide: boolean; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const dismiss = useRef(onClose); dismiss.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.close();
    const overflow = document.body.style.overflow;
    if (wide) {
      const focus = document.activeElement as HTMLElement | null;
      dialog.show(); focus?.focus({ preventScroll: true });
    }
    else { dialog.showModal(); document.body.style.overflow = 'hidden'; }
    return () => { dialog.close(); if (!wide) document.body.style.overflow = overflow; };
  }, [wide]);
  useEffect(() => () => {
    const trigger = opener.current;
    requestAnimationFrame(() => (trigger?.isConnected ? trigger : document.getElementById('reader-ai-action'))?.focus({ preventScroll: true }));
  }, []);
  return <aside className="reader-assistant-slot">
    <dialog ref={dialogRef} id="reader-assistant" className={`reader-assistant-dialog${wide ? ' is-docked' : ''}`}
      aria-label="AI 解读" role={wide ? 'region' : 'dialog'}
      onClick={event => {
        // On a narrow screen, reveal the article when following a guide source.
        const link = (event.target as HTMLElement).closest('a');
        if (!wide && link?.getAttribute('href')?.startsWith('/read/')) onClose();
      }}
      onCancel={event => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault(); dismiss.current();
      }}>
      <AiPanel guide={guide} unitId={unitId} selection={selection} onClose={onClose} />
    </dialog>
  </aside>;
}
