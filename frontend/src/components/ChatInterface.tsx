import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { friendlyMessage, isApiError, streamChat } from '../api/client';
import type { Message } from '../api/types';
import { useConversation } from '../hooks/useApi';
import { renderMarkdown } from '../utils/markdown';
import { cx, formatDate } from '../utils/format';
import ModelSelector, { useEffectiveModel } from './ModelSelector';
import { ErrorState, Spinner } from './states';

const MAX_LEN = 8000;

function Bubble({ msg }: { msg: Message }): ReactNode {
  const mine = msg.role === 'user';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed md:max-w-[75%]',
          mine
            ? 'rounded-br-md bg-indigo-600 text-white'
            : 'rounded-bl-md bg-white shadow-sm dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800',
        )}
      >
        {mine ? (
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        ) : (
          <div className="md break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
        )}
        <p className={cx('mt-1 text-[11px]', mine ? 'text-indigo-200' : 'text-slate-400')} title={msg.createdAt}>
          {msg.model ? `${msg.model} · ` : ''}{formatDate(msg.createdAt)}
          {!mine && msg.completionTokens > 0 && ` · ${msg.promptTokens + msg.completionTokens} tok`}
        </p>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Meri productivity kaise badhaun?',
  'Ek week ka learning plan banao',
  'Is dashboard me kya-kya kar sakta hoon?',
];

export default function ChatInterface(): ReactNode {
  const [params, setParams] = useSearchParams();
  const convId = params.get('c');
  const qc = useQueryClient();
  const model = useEffectiveModel();
  const convQuery = useConversation(convId);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveUser, setLiveUser] = useState<string | null>(null);
  const [liveAi, setLiveAi] = useState('');
  const [error, setError] = useState<{ message: string; requestId?: string; retryText?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = convQuery.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, liveAi, liveUser]);

  // Conversation switch par composer reset
  useEffect(() => {
    setError(null);
    setLiveUser(null);
    setLiveAi('');
  }, [convId]);

  const send = (text: string): void => {
    const clean = text.trim();
    if (!clean || streaming || clean.length > MAX_LEN) return;
    setError(null);
    setInput('');
    setLiveUser(clean);
    setLiveAi('');
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    void streamChat(
      { conversationId: convId, model, message: clean },
      {
        onMeta: (m) => {
          if (!convId) setParams({ c: m.conversationId }, { replace: true });
          void qc.invalidateQueries({ queryKey: ['conversations'] });
        },
        onToken: (t) => setLiveAi((prev) => prev + t),
        onDone: (d) => {
          setStreaming(false);
          setLiveUser(null);
          setLiveAi('');
          if (!convId) setParams({ c: d.conversationId }, { replace: true });
          void qc.invalidateQueries({ queryKey: ['conversation', d.conversationId] });
          void qc.invalidateQueries({ queryKey: ['conversations'] });
          void qc.invalidateQueries({ queryKey: ['usage'] });
        },
        onError: (e) => {
          setStreaming(false);
          const requestId = isApiError(e) ? e.requestId : undefined;
          // Partial stream bacha ho to server truth refetch karo
          if (convId) void qc.invalidateQueries({ queryKey: ['conversation', convId] });
          setError({ message: friendlyMessage(e), requestId, retryText: clean });
          setLiveUser(null);
        },
      },
      ctrl.signal,
    );
  };

  const stop = (): void => {
    abortRef.current?.abort();
    setStreaming(false);
    // Partial save server par ho chuka hoga — refetch truth
    if (convId) void qc.invalidateQueries({ queryKey: ['conversation', convId] });
    setLiveUser(null);
    setLiveAi('');
  };

  const newChat = (): void => {
    stop();
    setParams({}, { replace: true });
    inputRef.current?.focus();
  };

  const title = convQuery.data?.conversation.title ?? 'New chat';

  return (
    <section aria-label="Chat" className="flex min-h-[calc(100dvh-12rem)] flex-col lg:min-h-[calc(100dvh-6rem)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-lg font-semibold">{convId ? title : 'Chat'}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <ModelSelector compact />
          <button
            onClick={newChat}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + New
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="slim-scroll flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50 md:p-4"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        aria-busy={streaming}
      >
        {!convId && !liveUser && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="text-4xl" aria-hidden="true">⚡</div>
            <div>
              <p className="text-lg font-semibold">UtkForce se kuch puchho</p>
              <p className="mt-1 text-sm text-slate-500">Streaming answers · history auto-saved · quota-protected</p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {convId && convQuery.isLoading && <Spinner label="Loading conversation…" />}
        {convId && convQuery.isError && (
          <ErrorState
            message={friendlyMessage(convQuery.error)}
            onRetry={() => void convQuery.refetch()}
            requestId={isApiError(convQuery.error) ? convQuery.error.requestId : undefined}
          />
        )}

        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}

        {liveUser && (
          <Bubble
            msg={{ id: 'live-user', conversationId: convId ?? '', userId: '', role: 'user', content: liveUser, model: null, promptTokens: 0, completionTokens: 0, createdAt: new Date().toISOString() }}
          />
        )}
        {(streaming || liveAi) && !error && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 md:max-w-[75%]">
              {liveAi ? (
                <div className="md break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(liveAi) }} />
              ) : (
                <span className="inline-flex gap-1 py-1" role="status" aria-label="AI is thinking">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} aria-hidden="true" />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <ErrorState
            message={error.message}
            requestId={error.requestId}
            onRetry={error.retryText ? () => send(error.retryText as string) : undefined}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Message UtkForce</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN + 200))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Message UtkForce… (Enter send, Shift+Enter newline)"
          className="max-h-36 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[15px] dark:border-slate-700 dark:bg-slate-900"
          aria-describedby="chat-hint"
        />
        {streaming ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
      <p id="chat-hint" className="mt-1 text-right text-[11px] text-slate-400">
        {input.length}/{MAX_LEN} · {model}
      </p>
    </section>
  );
}
