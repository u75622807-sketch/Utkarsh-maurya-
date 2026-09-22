import { create } from 'zustand';
import { api, setAuthHooks } from '../api/client';
import type { PublicUser, UserSettings } from '../api/types';
import { queryClient } from '../lib/queryClient';
import { applyTheme } from './uiStore';

interface AuthState {
  status: 'loading' | 'authed' | 'guest';
  accessToken: string | null; // memory only — kabhi localStorage me nahi (doc 05)
  user: PublicUser | null;
  settings: UserSettings | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  refresh: () => Promise<string | null>;
  logout: (opts?: { server?: boolean }) => Promise<void>;
  setSettings: (s: UserSettings) => void;
}

// Single-flight refresh (parallel 401s par ek hi /refresh call)
let refreshPromise: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  settings: null,

  init: async () => {
    if (get().status !== 'loading') return;
    try {
      const token = await get().refresh();
      if (!token) {
        set({ status: 'guest' });
        return;
      }
      const me = await api.me();
      set({ user: me.user, settings: me.settings, status: 'authed' });
      applyTheme(me.settings.theme);
    } catch {
      set({ status: 'guest', accessToken: null, user: null, settings: null });
    }
  },

  login: async (email, password) => {
    const res = await api.login({ email, password });
    set({ accessToken: res.accessToken, user: res.user });
    const me = await api.me();
    set({ settings: me.settings, status: 'authed' });
    applyTheme(me.settings.theme);
  },

  register: async (email, password, name) => {
    const res = await api.register({ email, password, name });
    set({ accessToken: res.accessToken, user: res.user });
    const me = await api.me();
    set({ settings: me.settings, status: 'authed' });
    applyTheme(me.settings.theme);
  },

  refresh: () => {
    if (refreshPromise) return refreshPromise;
    refreshPromise = api
      .refresh()
      .then((res) => {
        set({ accessToken: res.accessToken, user: res.user });
        return res.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  },

  logout: async (opts) => {
    if (opts?.server !== false) {
      try {
        await api.logout();
      } catch {
        // best-effort — local state to clear karna hi hai
      }
    }
    queryClient.clear(); // dusre account ko purana cache kabhi nahi
    set({ status: 'guest', accessToken: null, user: null, settings: null });
  },

  setSettings: (s) => set({ settings: s }),
}));

// api client ↔ store wiring (module load par ek baar)
setAuthHooks({
  getToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().refresh(),
  logout: () => {
    void useAuthStore.getState().logout({ server: false });
  },
});
