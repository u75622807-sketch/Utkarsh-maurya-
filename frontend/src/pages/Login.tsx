import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendlyMessage } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export default function Login(): ReactNode {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('demo@utkforce.ai');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(friendlyMessage(err));
      pwRef.current?.focus(); // a11y: error ke baad focus wapas
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white" aria-hidden="true">⚡</div>
          <h1 className="text-2xl font-bold">UtkForce</h1>
          <p className="text-sm text-slate-500">Your AI knowledge dashboard</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Log in</h2>
          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
              {error}
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              ref={pwRef}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <p className="text-center text-sm text-slate-500">
            New here? <Link to="/register" className="font-medium text-indigo-600 hover:underline">Create account</Link>
          </p>
        </form>
        <p className="mt-3 rounded-lg bg-slate-200/60 p-2 text-center text-xs text-slate-500 dark:bg-slate-800/60">
          Dev demo: <code>demo@utkforce.ai</code> / <code>Demo@1234!</code>
        </p>
      </div>
    </div>
  );
}
