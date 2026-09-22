import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendlyMessage, isApiError } from '../api/client';
import { useDebounced, useConversations, useDeleteConversation, usePatchConversation } from '../hooks/useApi';
import { timeAgo } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

export default function ConversationHistory(): ReactNode {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  const list = useConversations(dq, page);
  const patcher = usePatchConversation();
  const deleter = useDeleteConversation();
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <section aria-label="Conversation history">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">History</h1>
        <Link
          to="/"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New chat
        </Link>
      </div>

      <label className="mb-3 block">
        <span className="sr-only">Search conversations</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search conversations…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      {list.isLoading && <LoadingSkeleton rows={4} />}
      {list.isError && (
        <ErrorState
          message={friendlyMessage(list.error)}
          onRetry={() => void list.refetch()}
          requestId={isApiError(list.error) ? list.error.requestId : undefined}
        />
      )}
      {list.data && list.data.total === 0 && (
        <EmptyState
          icon="💬"
          title={dq ? 'No matches' : 'No conversations yet'}
          hint={dq ? 'Try a different search.' : 'Start a chat — it will appear here automatically.'}
          action={
            !dq ? (
              <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Start chatting
              </Link>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2">
        {list.data?.data.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            {editing === c.id ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editTitle.trim()) return;
                  patcher.mutate(
                    { id: c.id, patch: { title: editTitle.trim() } },
                    { onSuccess: () => setEditing(null) },
                  );
                }}
              >
                <label className="sr-only" htmlFor={`rename-${c.id}`}>Rename conversation</label>
                <input
                  id={`rename-${c.id}`}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white" disabled={patcher.isPending}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-3 text-sm dark:border-slate-700">
                  Cancel
                </button>
              </form>
            ) : confirmDelete === c.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">Delete “{c.title}”?</p>
                <button
                  onClick={() =>
                    deleter.mutate(c.id, { onSuccess: () => setConfirmDelete(null) })
                  }
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
                  disabled={deleter.isPending}
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-slate-700">
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to={`/?c=${c.id}`} className="min-w-0 flex-1 rounded-lg p-1">
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {c.messageCount} msgs · {c.model} · {timeAgo(c.updatedAt)}
                  </span>
                </Link>
                <button
                  onClick={() => {
                    setEditing(c.id);
                    setEditTitle(c.title);
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label={`Rename ${c.title}`}
                >
                  Rename
                </button>
                <button
                  onClick={() => setConfirmDelete(c.id)}
                  className="rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label={`Delete ${c.title}`}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {list.data && list.data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">Page {page} of {list.data.totalPages} ({list.data.total})</span>
          <button
            onClick={() => setPage((p) => Math.min(list.data?.totalPages ?? p, p + 1))}
            disabled={page >= (list.data?.totalPages ?? 1)}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
