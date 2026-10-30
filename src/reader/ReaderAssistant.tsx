import { useEffect, useRef } from 'react';
import type { Guide } from '../content/types';
import { AiPanel, type TopicRequest } from '../assistant/AiPanel';
import '../styles/reader-assistant.css';

// Keep one panel mounted when the viewport changes so an active answer survives.
export function ReaderAssistant({ guide, unitId, selection, wide, topicRequest, onClose }: {
  guide: Guide; unitId: string; selection?: string; wide: boolean; topicRequest?: TopicRequest; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const readingOverflow = useRef(document.body.style.overflow);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const returnFocusFrame = useRef<number | undefined>(undefined);
  const dismiss = useRef(onClose); dismiss.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current!;
    const focus = document.activeElement as HTMLElement | null;
    const left = window.scrollX, top = window.scrollY;
    const nested = [...dialog.querySelectorAll<HTMLDialogElement>('dialog[open]')]
      .map(element => ({ element, modal: element.matches(':modal'), scrollTop: element.scrollTop }));
    dialog.close();
    if (wide) dialog.show();
    else dialog.showModal();
    // Resizing must keep an already-open settings/material dialog above its parent.
    // Re-enter the top layer without remounting the React dialog or its form draft.
    for (const { element, modal, scrollTop } of nested) {
      if (!modal) continue;
      element.close(); element.showModal(); element.scrollTop = scrollTop;
    }
    if (focus && focus !== document.body && focus !== document.documentElement) focus.focus({ preventScroll: true });
    else if (wide && document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) document.activeElement.blur();
    if (window.scrollX !== left || window.scrollY !== top) window.scrollTo(left, top);
    const syncOverflow = () => { document.body.style.overflow = document.querySelector('dialog:modal') ? 'hidden' : readingOverflow.current; };
    syncOverflow();
    const observer = new MutationObserver(syncOverflow);
    observer.observe(dialog, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => {
      observer.disconnect(); dialog.close();
      if (!document.querySelector('dialog:modal')) document.body.style.overflow = readingOverflow.current;
    };
  }, [wide]);
  useEffect(() => {
    // Effect replay is not a user closing the panel. Cancel its queued focus
    // return so it cannot steal focus from a freshly navigated chapter.
    if (returnFocusFrame.current !== undefined) cancelAnimationFrame(returnFocusFrame.current);
    const fallback = document.getElementById('reader-ai-action');
    return () => {
      const trigger = opener.current;
      returnFocusFrame.current = requestAnimationFrame(() => {
        if (!document.querySelector('dialog:modal')) document.body.style.overflow = readingOverflow.current;
        const active = document.activeElement;
        if (active && active !== document.body && active !== document.documentElement) return;
        (trigger?.isConnected ? trigger : fallback?.isConnected ? fallback : null)?.focus({ preventScroll: true });
      });
    };
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
      <AiPanel guide={guide} unitId={unitId} selection={selection} topicRequest={topicRequest} onClose={onClose} />
    </dialog>
  </aside>;
}
