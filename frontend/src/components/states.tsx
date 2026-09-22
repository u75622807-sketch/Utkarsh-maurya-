import type { ReactNode } from 'react';

// Shared async states — har view me loading/error/empty (R8).

export function Spinner({ label = 'Loading…' }: { label?: string }): ReactNode {
  return (
    <div className="flex items-center justify-center gap-2 py-8" role="status" aria-label={label}>
      <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-indigo-500 border-t-transparent" aria-hidden="true" />
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3, className = '' }: { rows?: number; className?: string }): ReactNode {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading content">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-slate-200 p-4 dark:bg-slate-800" aria-hidden="true">
          <div className="h-3 w-2/5 rounded bg-slate-300 dark:bg-slate-700" />
          <div className="mt-2 h-3 w-4/5 rounded bg-slate-300 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  requestId,
}: {
  message: string;
  onRetry?: () => void;
  requestId?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40" role="alert">
      <div className="text-2xl" aria-hidden="true">⚠️</div>
      <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      {requestId && <p className="font-mono text-[11px] text-slate-400">ref: {requestId}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <div className="text-3xl" aria-hidden="true">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
