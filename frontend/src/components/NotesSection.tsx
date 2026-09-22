import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { friendlyMessage, isApiError } from '../api/client';
import type { Note } from '../api/types';
import { useCreateNote, useDebounced, useDeleteNote, useNotes, usePatchNote } from '../hooks/useApi';
import { renderMarkdown } from '../utils/markdown';
import { timeAgo } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

interface Draft {
  id: string | null;
  title: string;
  content: string;
  tags: string;
  pinned: boolean;
}

const blank: Draft = { id: null, title: '', content: '', tags: '', pinned: false };

export default function NotesSection(): ReactNode {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const list = useNotes({ q: dq, tag: '', page });
  const creator = useCreateNote();
  const patcher = usePatchNote();
  const deleter = useDeleteNote();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deep-link: /notes?open=<id> (search se)
  useEffect(() => {
    const open = params.get('open');
    if (open && list.data) {
      const n = list.data.data.find((x) => x.id === open);
      if (n) {
        setDraft({ id: n.id, title: n.title, content: n.content, tags: n.tags.join(', '), pinned: n.pinned });
        setParams({}, { replace: true });
      }
    }
  }, [params, list.data, setParams]);

  const openNote = (n: Note): void => {
    setFormError(null);
    setPreview(false);
    setDraft({ id: n.id, title: n.title, content: n.content, tags: n.tags.join(', '), pinned: n.pinned });
  };

  const save = (): void => {
    if (!draft || !draft.title.trim()) {
      setFormError('Title zaroori hai.');
      return;
    }
    const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
    const body = { title: draft.title.trim(), content: draft.content, tags, pinned: draft.pinned };
    setFormError(null);
    if (draft.id) {
      patcher.mutate(
        { id: draft.id, patch: body },
        { onSuccess: () => setDraft(null), onError: (e) => setFormError(friendlyMessage(e)) },
      );
    } else {
      creator.mutate(body, {
        onSuccess: () => {
          setDraft(null);
          setPage(1);
        },
        onError: (e) => setFormError(friendlyMessage(e)),
      });
    }
  };

  const saving = creator.isPending || patcher.isPending;

  // ---- editor ----
  if (draft) {
    return (
      <section aria-label="Note editor">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setDraft(null)} className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
            ← Back
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setPreview((p) => !p)}
              className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700"
              aria-pressed={preview}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {formError && (
          <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {formError}
          </p>
        )}
        <label className="mb-2 block">
          <span className="sr-only">Title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Note title…"
            maxLength={200}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-medium dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        {preview ? (
          <div
            className="md min-h-64 rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content || '*Nothing to preview*') }}
          />
        ) : (
          <label className="block">
            <span className="sr-only">Content (Markdown supported)</span>
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Write in Markdown… **bold**, - lists, ```code```"
              rows={12}
              maxLength={50000}
              className="slim-scroll w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="shrink-0 text-slate-500">Tags:</span>
            <input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="comma, separated"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
              className="h-4 w-4"
            />
            Pinned
          </label>
        </div>
        {draft.id && (
          <button
            onClick={() => {
              if (window.confirm('Delete this note?')) {
                deleter.mutate(draft.id as string, { onSuccess: () => setDraft(null) });
              }
            }}
            className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 dark:border-red-900"
          >
            Delete note
          </button>
        )}
      </section>
    );
  }

  // ---- list ----
  return (
    <section aria-label="Notes">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Notes</h1>
        <button
          onClick={() => {
            setFormError(null);
            setDraft({ ...blank });
          }}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New note
        </button>
      </div>
      <label className="mb-3 block">
        <span className="sr-only">Search notes</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search notes…"
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
          icon="📝"
          title={dq ? 'No matching notes' : 'No notes yet'}
          hint="Markdown notes with tags — your personal knowledge base."
          action={
            !dq ? (
              <button
                onClick={() => setDraft({ ...blank })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Write first note
              </button>
            ) : undefined
          }
        />
      )}

      <ul className="grid gap-2 md:grid-cols-2">
        {list.data?.data.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => openNote(n)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="block truncate text-sm font-medium">
                {n.pinned && <span aria-label="pinned">📌 </span>}{n.title}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-slate-500">
                {n.content.slice(0, 140) || '—'}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {n.tags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                    #{t}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-slate-400">{timeAgo(n.updatedAt)}</span>
              </span>
            </button>
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
          <span className="text-xs text-slate-500">Page {page} of {list.data.totalPages}</span>
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
