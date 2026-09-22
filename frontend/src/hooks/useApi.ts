import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../api/client';
import type { Conversation, Message, Note } from '../api/types';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------- queries

export function useConversations(q: string, page = 1) {
  return useQuery({
    queryKey: ['conversations', q, page],
    queryFn: () => api.conversations(q, page, 20),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.conversation(id as string, 50),
    enabled: !!id,
  });
}

export function useNotes(params: { q: string; tag: string; page: number }) {
  return useQuery({
    queryKey: ['notes', params.q, params.tag, params.page],
    queryFn: () => api.notes({ q: params.q || undefined, tag: params.tag || undefined, page: params.page }),
  });
}

export function useModels() {
  return useQuery({ queryKey: ['models'], queryFn: () => api.models(), staleTime: 60_000 });
}

export function useUsage(days = 30) {
  return useQuery({ queryKey: ['usage', days], queryFn: () => api.usage(days) });
}

export function useSearch(q: string) {
  const dq = useDebounced(q.trim(), 300);
  return useQuery({
    queryKey: ['search', dq],
    queryFn: () => api.search(dq, 8),
    enabled: dq.length >= 2,
  });
}

export function useFiles(page = 1) {
  return useQuery({ queryKey: ['files', page], queryFn: () => api.files(page, 20) });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.settings(), staleTime: 60_000 });
}

// ---------------------------------------------------------------- mutations

export function usePatchConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: { title?: string; model?: string } }) =>
      api.patchConversation(v.id, v.patch),
    onSuccess: (conv: Conversation) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', conv.id] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; content?: string; tags?: string[]; pinned?: boolean }) => api.createNote(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function usePatchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'pinned'>> }) =>
      api.patchNote(v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: File) => uploadFile(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function usePutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.putSettings,
    onSuccess: (s) => {
      useAuthStore.getState().setSettings(s);
      useUiStore.getState().setTheme(s.theme);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.deleteAccount(),
    onSuccess: () => {
      void useAuthStore.getState().logout({ server: false });
    },
  });
}

// ---------------------------------------------------------------- chat cache helpers (optimistic streaming)

/** Streaming token append ke liye conversation cache me assistant draft upsert karo. */
export function upsertStreamingMessage(
  qc: { setQueryData: (k: unknown[], fn: (old: unknown) => unknown) => void },
  conversationId: string,
  msg: Message,
): void {
  qc.setQueryData(['conversation', conversationId], (old: unknown) => {
    const prev = old as { conversation: Conversation; messages: Message[] } | undefined;
    if (!prev) return prev;
    const idx = prev.messages.findIndex((m) => m.id === msg.id);
    const messages =
      idx === -1 ? [...prev.messages, msg] : prev.messages.map((m) => (m.id === msg.id ? msg : m));
    return { ...prev, messages };
  });
}
