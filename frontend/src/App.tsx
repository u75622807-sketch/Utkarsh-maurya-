import { Component, lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

// Code-split pages (mobile perf: initial bundle chhota)
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Splash(): ReactNode {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 dark:bg-slate-950" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" aria-hidden="true" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading UtkForce…</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    if (status === 'loading') void init();
  }, [status, init]);
  if (status === 'loading') return <Splash />;
  if (status === 'guest') return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }): ReactNode {
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    if (status === 'loading') void init();
  }, [status, init]);
  if (status === 'loading') return <Splash />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return children;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Kuch toot gaya 😢</h1>
          <p className="max-w-sm text-sm text-slate-500">Unexpected app error. Reload karke dekho — data server par safe hai.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(): ReactNode {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
