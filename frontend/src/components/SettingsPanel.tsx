import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { friendlyMessage } from '../api/client';
import { useDeleteAccount, useModels, usePutSettings, useSettingsQuery } from '../hooks/useApi';
import { useAuthStore } from '../stores/authStore';
import type { Theme } from '../stores/uiStore';
import { cx } from '../utils/format';
import { EmptyState, ErrorState, Spinner } from './states';

export default function SettingsPanel(): ReactNode {
  const settingsQ = useSettingsQuery();
  const modelsQ = useModels();
  const putter = usePutSettings();
  const deleter = useDeleteAccount();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [theme, setTheme] = useState<Theme>('system');
  const [defaultModel, setDefaultModel] = useState('mock-1');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    const s = settingsQ.data;
    if (s) {
      setTheme(s.theme);
      setDefaultModel(s.defaultModel);
      setTemperature(s.temperature);
      setMaxTokens(s.maxTokens);
      setEmailNotifs(s.emailNotifs);
    }
  }, [settingsQ.data]);

  if (settingsQ.isLoading) return <Spinner label="Loading settings…" />;
  if (settingsQ.isError) {
    return <ErrorState message={friendlyMessage(settingsQ.error)} onRetry={() => void settingsQ.refetch()} />;
  }
  if (!settingsQ.data) return <EmptyState icon="⚙️" title="Settings unavailable" />;

  const save = (): void => {
    setSaved(false);
    setSaveError(null);
    putter.mutate(
      { theme, defaultModel, temperature, maxTokens, emailNotifs },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setSaveError(friendlyMessage(e)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <section aria-label="Settings">
        <h1 className="mb-1 text-lg font-semibold">Settings</h1>
        <p className="mb-3 text-sm text-slate-500">{user?.email}</p>

        {saveError && (
          <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {saveError}
          </p>
        )}
        {saved && (
          <p className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-200" role="status">
            Saved ✓
          </p>
        )}

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <span className="mb-1 block text-sm font-medium" id="theme-label">Appearance</span>
            <div className="flex gap-2" role="group" aria-labelledby="theme-label">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className={cx(
                    'rounded-lg border px-4 py-2 text-sm capitalize',
                    theme === t ? 'border-indigo-600 bg-indigo-50 font-medium dark:bg-indigo-950/40' : 'dark:border-slate-700',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Default model</span>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {(modelsQ.data?.data ?? []).map((m) => (
                <option key={m.id} value={m.id} disabled={!m.enabled}>
                  {m.label}{m.enabled ? '' : ' (unavailable)'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-sm font-medium">
              Temperature <span className="font-mono text-slate-500">{temperature.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
              aria-valuetext={`${temperature.toFixed(1)} (0 = precise, 2 = creative)`}
            />
            <span className="flex justify-between text-[11px] text-slate-400"><span>precise</span><span>creative</span></span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Max response tokens</span>
            <input
              type="number"
              min={1}
              max={8192}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.max(1, Math.min(8192, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailNotifs}
              onChange={(e) => setEmailNotifs(e.target.checked)}
              className="h-4 w-4"
            />
            Email notifications (product updates)
          </label>

          <button
            onClick={save}
            disabled={putter.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {putter.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </section>

      <section aria-label="Session" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-medium">Session</h2>
        <p className="mt-1 text-sm text-slate-500">Logged in as {user?.email} ({user?.provider} account)</p>
        <button
          onClick={() => void logout()}
          className="mt-3 rounded-lg border px-4 py-2 text-sm dark:border-slate-700"
        >
          Log out
        </button>
      </section>

      <section aria-label="Danger zone" className="rounded-xl border border-red-300 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20">
        <h2 className="font-medium text-red-700 dark:text-red-300">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Delete your account and <strong>all</strong> data — chats, notes, files, usage. This cannot be undone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="delete-confirm">Type DELETE to confirm</label>
          <input
            id="delete-confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="min-w-0 flex-1 rounded-lg border border-red-300 bg-white px-2 py-2 text-sm dark:border-red-900 dark:bg-slate-900"
          />
          <button
            onClick={() => {
              if (deleteConfirm === 'DELETE') deleter.mutate();
            }}
            disabled={deleteConfirm !== 'DELETE' || deleter.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleter.isPending ? 'Deleting…' : 'Delete everything'}
          </button>
        </div>
        {deleter.isError && (
          <p className="mt-2 text-sm text-red-600" role="alert">{friendlyMessage(deleter.error)}</p>
        )}
      </section>
    </div>
  );
}
