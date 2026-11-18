import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rodizio.theme';

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return 'dark'; // Modo escuro como padrão
}

let currentTheme: Theme = readInitialTheme();
const listeners = new Set<() => void>();

function applyDomTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0c0c0e' : '#ffffff');
}

applyDomTheme(currentTheme);

export function setTheme(next: Theme): void {
  currentTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyDomTheme(next);
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => currentTheme,
  );
  return { theme, toggleTheme, setTheme };
}
