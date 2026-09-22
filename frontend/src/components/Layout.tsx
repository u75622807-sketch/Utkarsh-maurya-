import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { cx } from '../utils/format';

function Icon({ d }: { d: string }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Chat', end: true, d: 'M8 10h8M8 14h5M21 12a9 9 0 01-13.2 8L3 21l1.2-4.6A9 9 0 1121 12z' },
  { to: '/history', label: 'History', d: 'M12 8v4l3 2m6-2a9 9 0 11-2.6-6.3M18 4v4h-4' },
  { to: '/search', label: 'Search', d: 'M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z' },
  { to: '/notes', label: 'Notes', d: 'M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18 2l4 4-9 9H9v-4l9-9z' },
  { to: '/files', label: 'Files', d: 'M12 16V4m0 0L7 9m5-5l5 5M4 20h16' },
  { to: '/models', label: 'Models', d: 'M9 3H5a2 2 0 00-2 2v4m18 0V5a2 2 0 00-2-2h-4m0 18h4a2 2 0 002-2v-4M3 15v4a2 2 0 002 2h4M9 9h6v6H9z' },
  { to: '/usage', label: 'Usage', d: 'M4 20V10m6 10V4m6 16v-7m6 7H2' },
  { to: '/settings', label: 'Settings', d: 'M12 15a3 3 0 100-6 3 3 0 000 6zm8-3a8 8 0 01-.2 1.7l2 1.6-2 3.4-2.4-1a8 8 0 01-2.9 1.7L14 21h-4l-.5-2.6a8 8 0 01-2.9-1.7l-2.4 1-2-3.4 2-1.6A8 8 0 014 12c0-.6.1-1.1.2-1.7l-2-1.6 2-3.4 2.4 1a8 8 0 012.9-1.7L10 3h4l.5 2.6a8 8 0 012.9 1.7l2.4-1 2 3.4-2 1.6c.1.6.2 1.1.2 1.7z' },
];

const PRIMARY_MOBILE = ['/', '/history', '/notes', '/files'];

function NavItem({ to, label, d, end, onClick }: { to: string; label: string; d: string; end?: boolean; onClick?: () => void }): ReactNode {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
        )
      }
    >
      <Icon d={d} />
      {label}
    </NavLink>
  );
}

export default function Layout(): ReactNode {
  const user = useAuthStore((s) => s.user);
  const [moreOpen, setMoreOpen] = useState(false);
  const initial = (user?.name || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:flex" aria-label="Primary">
        <Link to="/" className="mb-6 flex items-center gap-2 px-1 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white" aria-hidden="true">⚡</span>
          UtkForce
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <NavItem key={n.to} to={n.to} label={n.label} d={n.d} end={n.to === '/'} />
          ))}
        </nav>
        <Link
          to="/settings"
          className="mt-4 flex items-center gap-3 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Account settings"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200" aria-hidden="true">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user?.name || 'User'}</span>
            <span className="block truncate text-xs text-slate-500">{user?.email}</span>
          </span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white" aria-hidden="true">⚡</span>
            UtkForce
          </Link>
          <Link
            to="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200"
            aria-label="Account settings"
          >
            {initial}
          </Link>
        </header>

        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-4 lg:px-6 lg:pb-10" tabIndex={-1}>
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden" aria-label="Primary mobile">
          <div className="grid grid-cols-5">
            {NAV.filter((n) => PRIMARY_MOBILE.includes(n.to)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                    isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
                  )
                }
              >
                <Icon d={n.d} />
                {n.label}
              </NavLink>
            ))}
            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500 dark:text-slate-400"
              aria-haspopup="dialog"
            >
              <Icon d="M5 12h.01M12 12h.01M19 12h.01M5 12a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z" />
              More
            </button>
          </div>
        </nav>

        {/* More sheet */}
        {moreOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
            <button className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} aria-label="Close menu" />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8 dark:bg-slate-900">
              <div className="mx-auto mb-3 h-1 w-10 rounded bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
              <div className="grid grid-cols-2 gap-1">
                {NAV.map((n) => (
                  <NavItem key={n.to} to={n.to} label={n.label} d={n.d} end={n.to === '/'} onClick={() => setMoreOpen(false)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
