import { useState } from 'react';
import type { ReactNode } from 'react';
import { friendlyMessage } from '../api/client';
import { useUsage } from '../hooks/useApi';
import { formatCost, formatNum } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function UsageStats(): ReactNode {
  const [days, setDays] = useState(30);
  const usage = useUsage(days);
  const d = usage.data;

  const maxDay = Math.max(1, ...(d?.byDay.map((x) => x.totalTokens) ?? [1]));
  const quotaPct = d ? Math.min(100, Math.round((d.quota.used / Math.max(1, d.quota.limit)) * 100)) : 0;

  return (
    <section aria-label="Usage statistics">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Usage</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Range</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {usage.isLoading && <LoadingSkeleton rows={3} />}
      {usage.isError && (
        <ErrorState message={friendlyMessage(usage.error)} onRetry={() => void usage.refetch()} />
      )}
      {d && d.totals.requests === 0 && (
        <EmptyState icon="📊" title="No usage yet" hint="Chat with UtkForce and your token spend will appear here." />
      )}

      {d && d.totals.requests > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Card label="Requests" value={formatNum(d.totals.requests)} />
            <Card label="Tokens" value={formatNum(d.totals.totalTokens)} sub={`${formatNum(d.totals.promptTokens)} in · ${formatNum(d.totals.completionTokens)} out`} />
            <Card label="Est. cost" value={formatCost(d.totals.estCostUsd)} sub="rate-card estimate" />
            <Card label="Quota left" value={formatNum(d.quota.remaining)} sub={`of ${formatNum(d.quota.limit)}/day`} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">Daily quota</span>
              <span className="text-slate-500">{quotaPct}% used</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={quotaPct} aria-valuemin={0} aria-valuemax={100} aria-label="Daily quota used">
              <div
                className={`h-full rounded-full ${quotaPct >= 90 ? 'bg-red-500' : quotaPct >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-medium">Tokens per day</h2>
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Bar chart of daily tokens">
              {d.byDay.map((b) => (
                <div key={b.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${b.date}: ${formatNum(b.totalTokens)} tokens`}>
                  <div
                    className="w-full rounded-t bg-indigo-500/80"
                    style={{ height: `${Math.max(3, Math.round((b.totalTokens / maxDay) * 100))}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{d.byDay[0]?.date.slice(5)}</span>
              <span>{d.byDay[d.byDay.length - 1]?.date.slice(5)}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <h2 className="p-4 pb-0 text-sm font-medium">By model</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="p-4 pb-2 font-medium">Model</th>
                  <th className="p-4 pb-2 text-right font-medium">Reqs</th>
                  <th className="p-4 pb-2 text-right font-medium">Tokens</th>
                  <th className="p-4 pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {d.byModel.map((m) => (
                  <tr key={m.model} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-4 font-mono text-xs">{m.model}</td>
                    <td className="p-4 text-right">{formatNum(m.requests)}</td>
                    <td className="p-4 text-right">{formatNum(m.totalTokens)}</td>
                    <td className="p-4 text-right">{formatCost(m.estCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
