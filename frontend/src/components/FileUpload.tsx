import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { downloadFileBlob, friendlyMessage, isApiError } from '../api/client';
import { useDeleteFile, useFiles, useUploadFile } from '../hooks/useApi';
import { formatBytes, timeAgo } from '../utils/format';
import { EmptyState, ErrorState, LoadingSkeleton } from './states';

// Client-side pre-checks (UX only — server zod+MIME+magic-bytes = truth, doc 08-T4)
const MAX_MB = 15;
const ALLOWED = new Set(['text/plain', 'text/markdown', 'application/pdf', 'image/png', 'image/jpeg']);

export default function FileUpload(): ReactNode {
  const [page, setPage] = useState(1);
  const list = useFiles(page);
  const uploader = useUploadFile();
  const deleter = useDeleteFile();
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null): void => {
    setLocalError(null);
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.size > MAX_MB * 1024 * 1024) {
      setLocalError(`“${f.name}” is too big (max ${MAX_MB}MB).`);
      return;
    }
    if (f.type && !ALLOWED.has(f.type)) {
      setLocalError(`“${f.name}” type not allowed. Use txt, md, pdf, png, jpg.`);
      return;
    }
    uploader.mutate(f, {
      onError: (e) => setLocalError(friendlyMessage(e)),
      onSuccess: () => setPage(1),
    });
  };

  const download = async (id: string, name: string): Promise<void> => {
    setDownloading(id);
    try {
      const blob = await downloadFileBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setLocalError(friendlyMessage(e));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section aria-label="Files">
      <h1 className="mb-3 text-lg font-semibold">Files</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        className={`mb-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-label="Choose file to upload"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="text-3xl" aria-hidden="true">📤</div>
        <p className="mt-2 text-sm font-medium">
          {uploader.isPending ? 'Uploading…' : 'Drag & drop a file here'}
        </p>
        <p className="mt-1 text-xs text-slate-500">txt · md · pdf · png · jpg — max {MAX_MB}MB</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploader.isPending}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploader.isPending ? 'Uploading…' : 'Choose file'}
        </button>
      </div>

      {(localError || uploader.isError) && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {localError ?? friendlyMessage(uploader.error)}
        </p>
      )}

      {list.isLoading && <LoadingSkeleton rows={3} />}
      {list.isError && (
        <ErrorState
          message={friendlyMessage(list.error)}
          onRetry={() => void list.refetch()}
          requestId={isApiError(list.error) ? list.error.requestId : undefined}
        />
      )}
      {list.data && list.data.total === 0 && (
        <EmptyState icon="📁" title="No files yet" hint="Upload docs, notes or images — they're private to your account." />
      )}

      <ul className="space-y-2">
        {list.data?.data.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(f.sizeBytes)} · {f.mime} · {timeAgo(f.createdAt)}
              </p>
            </div>
            <button
              onClick={() => void download(f.id, f.name)}
              disabled={downloading === f.id}
              className="rounded-lg border px-3 py-1.5 text-xs dark:border-slate-700"
            >
              {downloading === f.id ? '…' : 'Download'}
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete “${f.name}”?`)) deleter.mutate(f.id);
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              aria-label={`Delete ${f.name}`}
            >
              Delete
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
