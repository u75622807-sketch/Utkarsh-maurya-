import type { ReactNode } from 'react';
import { useModels } from '../hooks/useApi';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

/** Compact model dropdown — chat header me. Server allowlist hi source of truth. */
export default function ModelSelector({ compact = false }: { compact?: boolean }): ReactNode {
  const { data, isLoading } = useModels();
  const settings = useAuthStore((s) => s.settings);
  const activeModel = useUiStore((s) => s.activeModel);
  const setActiveModel = useUiStore((s) => s.setActiveModel);

  const models = data?.data ?? [];
  const value = activeModel ?? settings?.defaultModel ?? 'mock-1';

  if (isLoading) {
    return (
      <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" role="status" aria-label="Loading models" />
    );
  }

  return (
    <label className={compact ? 'flex min-w-0 items-center gap-1 text-xs' : 'flex flex-col gap-1 text-sm'}>
      {!compact && <span className="font-medium">Model</span>}
      <select
        aria-label="AI model"
        value={value}
        onChange={(e) => setActiveModel(e.target.value)}
        className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.enabled}>
            {m.label}{m.enabled ? '' : ' (unavailable)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Effective model hook (override → settings default → mock-1). */
export function useEffectiveModel(): string {
  const settings = useAuthStore((s) => s.settings);
  const activeModel = useUiStore((s) => s.activeModel);
  return activeModel ?? settings?.defaultModel ?? 'mock-1';
}
