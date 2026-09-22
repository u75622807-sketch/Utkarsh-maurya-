import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendlyMessage } from '../api/client';
import { useSearch } from '../hooks/useApi';
import { timeAgo } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

export default function SearchView(): ReactNode {
  const [q, setQ] = useState('');
  const search = useSearch(q);
  const trimmed = q.trim();
  const r = search.data?.results;
  const total =
    (r?.conversations.length ?? 0) + (r?.notes.length ?? 0) + (r?.files.length ?? 0);

  return (
    <section aria-label="Global search">
      <h1 className="mb-3 text-lg font-semibold">Search</h1>
      <label className="mb-3 block">
        <span className="sr-only">Search conversations, notes and files</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything… (min 2 characters)"
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
          role="searchbox"
        />
      </label>

      {trimmed.length < 2 && (
        <EmptyState icon="🔍" title="Type to search" hint="Conversations, notes and file names — results appear as you type." />
      )}
      {trimmed.length >= 2 && search.isLoading && <LoadingSkeleton rows={3} />}
      {trimmed.length >= 2 && search.isError && (
        <ErrorState message={friendlyMessage(search.error)} onRetry={() => void search.refetch()} />
      )}
      {trimmed.length >= 2 && search.data && total === 0 && (
        <EmptyState icon="🕳️" title={`No results for “${trimmed}”`} hint="Try different keywords." />
      )}

      {r && total > 0 && (
        <div className="space-y-5" role="status" aria-label={`${total} results`}>
          {r.conversations.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Chats</h2>
              <ul className="space-y-2">
                {r.conversations.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Link to={`/?c=${c.id}`} className="block">
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{c.snippet}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(c.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.notes.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
              <ul className="space-y-2">
                {r.notes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Link to={`/notes?open=${n.id}`} className="block">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{n.snippet}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.files.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Files</h2>
              <ul className="space-y-2">
                {r.files.map((f) => (
                  <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Link to="/files" className="block truncate text-sm font-medium">{f.name}</Link>
                    <span className="text-xs text-slate-500">{f.mime}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
