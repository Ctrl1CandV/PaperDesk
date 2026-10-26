import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

type Position = { y: number; focus?: HTMLElement };
const positions = new Map<string, Position>();
let activeKey = String(history.state?.paperdeskKey ?? 'initial');
history.replaceState({ ...history.state, paperdeskKey: activeKey }, '');
history.scrollRestoration = 'manual';
let returning = false;
let historyNavigation = false;
let initialNavigation = true;
let lastLibraryPath: string | undefined;
let lastLibraryKey: string | undefined;
let navigationTarget: { focusId?: string; scrollToId?: string } | undefined;
const currentLocation = () => window.location.pathname + window.location.search + window.location.hash;
function rememberLibrary() {
  if (window.location.pathname === '/' || window.location.pathname === '/library') { lastLibraryPath = currentLocation(); lastLibraryKey = activeKey; }
}
rememberLibrary();
export function libraryReturnPath(guideId?: string) { return lastLibraryPath ?? `/library${guideId ? `?article=${encodeURIComponent(guideId)}` : ''}`; }
export function isHistoryNavigation() { return historyNavigation; }
export function isReloadNavigation() { return initialNavigation && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'; }

function remember() { positions.set(activeKey, { y: window.scrollY, focus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined }); }
export function navigate(to: string, options: { replace?: boolean; preservePosition?: boolean; focusId?: string; scrollToId?: string } = {}) {
  const destination = new URL(to, window.location.href);
  if (destination.href === window.location.href) {
    const target = destination.hash ? document.getElementById(destination.hash.slice(1)) : undefined;
    if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }); }
    else window.scrollTo(0, 0);
    return;
  }
  remember();
  rememberLibrary();
  initialNavigation = false;
  historyNavigation = false;
  const returningToLibrary = window.location.pathname !== '/' && window.location.pathname !== '/library'
    && destination.pathname + destination.search + destination.hash === lastLibraryPath;
  const retained = returningToLibrary && lastLibraryKey ? positions.get(lastLibraryKey) : options.preservePosition ? positions.get(activeKey) : undefined;
  navigationTarget = options.focusId || options.scrollToId ? { focusId: options.focusId, scrollToId: options.scrollToId } : undefined;
  if (!options.replace) activeKey = crypto.randomUUID();
  history[options.replace ? 'replaceState' : 'pushState']({ paperdeskKey: activeKey }, '', to);
  if (retained) positions.set(activeKey, retained);
  returning = Boolean(retained);
  rememberLibrary();
  window.dispatchEvent(new Event('paperdesk:navigate'));
}
window.addEventListener('popstate', () => {
  initialNavigation = false;
  historyNavigation = true;
  remember();
  const nextKey = String(history.state?.paperdeskKey ?? 'initial');
  // Native fragment navigation copies the current entry's state. Give it its
  // own identity so the new anchor wins, while Back still restores the old view.
  if (!history.state?.paperdeskKey || nextKey === activeKey) {
    activeKey = crypto.randomUUID();
    history.replaceState({ ...history.state, paperdeskKey: activeKey }, '');
    returning = false;
    historyNavigation = false;
  } else { activeKey = nextKey; returning = true; }
  rememberLibrary();
  window.dispatchEvent(new Event('paperdesk:navigate'));
});

export function useLocation() {
  const [location, setLocation] = useState(currentLocation);
  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener('paperdesk:navigate', update);
    window.addEventListener('hashchange', update);
    return () => { window.removeEventListener('paperdesk:navigate', update); window.removeEventListener('hashchange', update); };
  }, []);
  useEffect(() => {
    const previous = returning ? positions.get(activeKey) : undefined;
    const requestedTarget = navigationTarget;
    navigationTarget = undefined;
    returning = false;
    const started = performance.now();
    let frame: number;
    let interrupted = false;
    // A later keyboard/pointer action takes precedence over a queued restore.
    // In particular, filtering must not steal focus back while the reader opens a row.
    const interrupt = () => { interrupted = true; cancelAnimationFrame(frame); };
    const restore = () => {
      if (interrupted) return;
      if (requestedTarget) {
        const focus = requestedTarget.focusId ? document.getElementById(requestedTarget.focusId) : undefined;
        const scroll = requestedTarget.scrollToId ? document.getElementById(requestedTarget.scrollToId) : undefined;
        if ((!focus?.getClientRects().length && requestedTarget.focusId || !scroll?.getClientRects().length && requestedTarget.scrollToId) && performance.now() - started < 1000) { frame = requestAnimationFrame(restore); return; }
        scroll?.scrollIntoView({ block: 'start' });
        focus?.focus({ preventScroll: true });
      } else if (previous) {
        // The old element was unmounted; restore its stable ID when available.
        const target = previous.focus?.id ? document.getElementById(previous.focus.id) : undefined;
        const waiting = document.querySelector('[data-navigation-pending="true"], [aria-busy="true"]')
          || (previous.focus?.id && !target)
          || document.documentElement.scrollHeight - window.innerHeight < previous.y - 1;
        if (waiting && performance.now() - started < 3000) { frame = requestAnimationFrame(restore); return; }
        window.scrollTo(0, previous.y);
        target?.focus({ preventScroll: true });
      } else if (window.location.hash) {
        const target = document.getElementById(window.location.hash.slice(1));
        target?.scrollIntoView(); target?.focus({ preventScroll: true });
      } else {
        const preview = document.getElementById('article-preview');
        // A direct library URL can select a row far down the page. History and
        // reader return use the saved position above; fresh links reveal the card.
        if (preview && !preview.hidden) {
          preview.scrollIntoView({ block: 'start' });
          document.getElementById('orientation-title')?.focus({ preventScroll: true });
        } else window.scrollTo(0, 0);
      }
    };
    window.addEventListener('keydown', interrupt, { once: true });
    window.addEventListener('pointerdown', interrupt, { once: true });
    frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', interrupt);
      window.removeEventListener('pointerdown', interrupt);
    };
  }, [location]);
  return location;
}

type AppLinkProps = { to: string; children: ReactNode; className?: string; id?: string; current?: boolean }
  & Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'title' | 'aria-label' | 'aria-current'>;
export function AppLink({ to, children, className, id, current, ...attributes }: AppLinkProps) {
  return <a {...attributes} href={to} id={id} className={className} aria-current={current ? 'page' : attributes['aria-current']} onClick={(event: MouseEvent) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(to);
    }
  }}>{children}</a>;
}
