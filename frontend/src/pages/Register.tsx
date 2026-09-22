import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendlyMessage } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export default function Register(): ReactNode {
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      setError(friendlyMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white" aria-hidden="true">⚡</div>
          <h1 className="text-2xl font-bold">Join UtkForce</h1>
          <p className="text-sm text-slate-500">Free personal AI dashboard</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Create account</h2>
          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
              {error}
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="pw-hint"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            />
            <span id="pw-hint" className="mt-1 block text-xs text-slate-500">Min 8 characters, with a letter and a digit.</span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Have an account? <Link to="/login" className="font-medium text-indigo-600 hover:underline">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
