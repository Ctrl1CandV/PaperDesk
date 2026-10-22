import { useEffect, useId, useRef, type ReactNode } from 'react';
import '../styles/reader-tools.css';

export function Dialog({ title, children, onClose, className = '', busy = false }: { title: string; children: ReactNode; onClose: () => void; className?: string; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef(document.activeElement as HTMLElement | null);
  const titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  const outsidePointer = useRef<number | null>(null);
  const dismiss = () => { if (!busy && !ref.current?.querySelector('[aria-busy="true"]')) close.current(); };
  const outside = (x: number, y: number) => {
    const box = ref.current!.getBoundingClientRect();
    return x < box.left || x > box.right || y < box.top || y > box.bottom;
  };
  useEffect(() => {
    const trigger = triggerRef.current;
    const y = window.scrollY, overflow = document.body.style.overflow;
    const dialog = ref.current!;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = overflow; window.scrollTo(0, y);
      (trigger?.isConnected ? trigger : trigger?.id ? document.getElementById(trigger.id) : null)?.focus({ preventScroll: true });
      requestAnimationFrame(() => (trigger?.isConnected ? trigger : trigger?.id ? document.getElementById(trigger.id) : null)?.focus({ preventScroll: true }));
    };
  }, []);
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy || undefined}
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onPointerDown={event => { outsidePointer.current = event.target === event.currentTarget && outside(event.clientX, event.clientY) ? event.pointerId : null; }}
    onPointerUp={event => {
      const startedOutside = outsidePointer.current === event.pointerId;
      outsidePointer.current = null;
      if (startedOutside && event.target === event.currentTarget && outside(event.clientX, event.clientY)) dismiss();
    }}
    onPointerCancel={() => { outsidePointer.current = null; }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const focusable = [...ref.current!.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element => element.getClientRects().length && !element.matches(':disabled'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className="workspace-dialog-heading"><h2 id={titleId}>{title}</h2><button aria-label="关闭" disabled={busy} onClick={dismiss}>×</button></div>
    {children}
  </dialog>;
}
