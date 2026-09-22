import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { friendlyMessage } from '../api/client';
import { useModels, usePutSettings, useSettingsQuery } from '../hooks/useApi';
import { useUiStore } from '../stores/uiStore';
import { formatNum } from '../utils/format';
import { cx } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

export default function ModelsView(): ReactNode {
  const models = useModels();
  const settingsQ = useSettingsQuery();
  const putter = usePutSettings();
  const setActiveModel = useUiStore((s) => s.setActiveModel);
  const navigate = useNavigate();

  const currentDefault = settingsQ.data?.defaultModel;

  const setDefault = (id: string): void => {
    const s = settingsQ.data;
    if (!s) return;
    putter.mutate({ theme: s.theme, defaultModel: id, temperature: s.temperature, maxTokens: s.maxTokens, emailNotifs: s.emailNotifs });
  };

  return (
    <section aria-label="AI models">
      <h1 className="mb-1 text-lg font-semibold">Models</h1>
      <p className="mb-3 text-sm text-slate-500">
        Server allowlist — unavailable models need an API key on the server (see README).
      </p>

      {models.isLoading && <LoadingSkeleton rows={3} />}
      {models.isError && (
        <ErrorState message={friendlyMessage(models.error)} onRetry={() => void models.refetch()} />
      )}
      {models.data && models.data.data.length === 0 && (
        <EmptyState icon="🧠" title="No models configured" />
      )}

      <ul className="space-y-2">
        {models.data?.data.map((m) => (
          <li
            key={m.id}
            className={cx(
              'rounded-xl border p-4 dark:border-slate-800',
              m.enabled ? 'border-slate-200 bg-white dark:bg-slate-900' : 'border-slate-200 bg-slate-50 opacity-75 dark:bg-slate-900/50',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{m.label}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] dark:bg-slate-800">{m.id}</span>
              {currentDefault === m.id && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                  default
                </span>
              )}
              <span
                className={cx(
                  'ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
                  m.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-slate-200 text-slate-500',
                )}
              >
                {m.enabled ? 'available' : 'unavailable'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{m.description}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              context {formatNum(m.contextWindow)} · in ${m.costPer1k.in}/1k · out ${m.costPer1k.out}/1k
            </p>
            {m.enabled && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setActiveModel(m.id);
                    navigate('/');
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Use in chat
                </button>
                {currentDefault !== m.id && (
                  <button
                    onClick={() => setDefault(m.id)}
                    disabled={putter.isPending}
                    className="rounded-lg border px-3 py-1.5 text-xs dark:border-slate-700"
                  >
                    Set as default
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
