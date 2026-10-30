import { useEffect, useState } from 'react';
import { personalStore } from '../records/store';
import type { Preferences } from '../records/types';

export type ThemeChoice = NonNullable<Preferences['theme']>;
export type Theme = 'light' | 'dark';
const cacheKey = 'paperdesk-theme';
const night = () => window.matchMedia('(prefers-color-scheme: dark)');
const resolve = (choice: ThemeChoice): Theme => choice === 'system' ? (night().matches ? 'dark' : 'light') : choice;

function readCache(): ThemeChoice {
  try { const value = localStorage.getItem(cacheKey); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; }
}
function writeCache(choice: ThemeChoice) {
  try { if (choice === 'system') localStorage.removeItem(cacheKey); else localStorage.setItem(cacheKey, choice); } catch { /* The saved preference still applies on the next load. */ }
}
function apply(choice: ThemeChoice) {
  const theme = resolve(choice);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Applied before the first render so the page never flashes the other theme. */
export function applyInitialTheme() { apply(readCache()); }

/** Day (light) or night (dark). Without an explicit choice the system setting decides. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readCache);
  const [system, setSystem] = useState(() => night().matches);
  useEffect(() => {
    let live = true;
    // Personal preferences are the durable record (and travel with backups). The local
    // cache is written first, so on startup an explicit cached choice repairs a save that
    // a quick navigation interrupted; later changes from other tabs or a restore win.
    const adopt = (saved: ThemeChoice) => { if (live) { writeCache(saved); setChoice(saved); } };
    personalStore.getPreferences().then(preferences => {
      const cached = readCache(), saved = preferences.theme ?? 'system';
      if (cached !== 'system' && cached !== saved) personalStore.savePreferences({ theme: cached }).catch(() => {});
      else adopt(saved);
    }).catch(() => {});
    const unsubscribe = personalStore.subscribe(store => { if (!store || store === 'preferences') personalStore.getPreferences().then(preferences => adopt(preferences.theme ?? 'system')).catch(() => {}); });
    const media = night(), change = () => setSystem(media.matches);
    media.addEventListener('change', change);
    return () => { live = false; unsubscribe(); media.removeEventListener('change', change); };
  }, []);
  useEffect(() => apply(choice), [choice, system]);
  const theme = resolve(choice);
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setChoice(next); writeCache(next);
    personalStore.savePreferences({ theme: next }).catch(() => {});
  }
  return { theme, toggle };
}

/** The theme currently on the page, for drawings that bake colours in. */
export function useActiveTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
