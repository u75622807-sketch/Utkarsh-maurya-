import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Chat-level model override (null = settings.defaultModel). */
  activeModel: string | null;
  setActiveModel: (m: string | null) => void;
}

const THEME_KEY = 'utk-theme';

export function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(t: Theme): void {
  const resolved = resolveTheme(t);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // private mode — ignore
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#020617' : '#f1f5f9');
}

/** Boot-time paint (login se pehle bhi sahi theme). */
export function initTheme(): void {
  let saved: Theme = 'system';
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') saved = raw;
  } catch {
    // ignore
  }
  useUiStore.setState({ theme: saved });
  applyTheme(saved);
  // System change follow (sirf theme=system par)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (useUiStore.getState().theme === 'system') applyTheme('system');
  });
}

export const useUiStore = create<UiState>()((set) => ({
  theme: 'system',
  setTheme: (t) => {
    set({ theme: t });
    applyTheme(t);
  },
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  activeModel: null,
  setActiveModel: (m) => set({ activeModel: m }),
}));
