import { TextEncoder } from 'node:util';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatInterface from '../components/ChatInterface';
import { emptyPage, jsonRes, renderWithProviders } from './test-utils';

const MODELS = {
  data: [
    { id: 'mock-1', label: 'Mock', provider: 'mock', contextWindow: 8192, maxOutput: 1024, costPer1k: { in: 0, out: 0 }, enabled: true, description: 'd' },
  ],
};

function sseStream(body: string): Response {
  let sent = false;
  const reader = {
    read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
      if (sent) return { done: true, value: undefined };
      sent = true;
      return { done: false, value: new TextEncoder().encode(body) };
    },
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe('ChatInterface', () => {
  it('fresh chat shows welcome + suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/models')) return Promise.resolve(jsonRes(MODELS));
      return Promise.resolve(jsonRes(emptyPage()));
    }));
    renderWithProviders(<ChatInterface />);
    expect(await screen.findByText(/utkforce se kuch puchho/i)).toBeInTheDocument();
    expect(screen.getByRole('log', { name: /chat messages/i })).toBeInTheDocument();
  });

  it('send → streaming tokens appear in aria-live log', async () => {
    const sse = [
      'event: meta\ndata: {"conversationId":"c1","model":"mock-1"}\n',
      'event: token\ndata: {"text":"Hello "}\n',
      'event: token\ndata: {"text":"world"}\n',
      'event: done\ndata: {"conversationId":"c1","message":{"id":"m2","conversationId":"c1","userId":"u-1","role":"assistant","content":"Hello world","model":"mock-1","promptTokens":5,"completionTokens":2,"createdAt":"2026-01-01T00:00:00.000Z"},"usage":{"promptTokens":5,"completionTokens":2,"estCostUsd":0}}\n',
    ].join('\n');
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/models')) return Promise.resolve(jsonRes(MODELS));
      if (url.includes('/api/chat/stream')) return Promise.resolve(sseStream(sse));
      if (url.includes('/api/conversations/c1')) {
        return Promise.resolve(jsonRes({ conversation: { id: 'c1', title: 't', model: 'mock-1', messageCount: 2 }, messages: [] }));
      }
      return Promise.resolve(jsonRes(emptyPage()));
    }));
    renderWithProviders(<ChatInterface />);
    const input = await screen.findByLabelText(/message utkforce/i);
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    // Optimistic user bubble + streamed assistant text
    expect(await screen.findByText('hi')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Hello world'));
  });

  it('stream error → ErrorState with retry', async () => {
    const sse = 'event: meta\ndata: {"conversationId":"c1","model":"mock-1"}\n\nevent: error\ndata: {"code":"AI_UPSTREAM_ERROR"}\n\n';
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/models')) return Promise.resolve(jsonRes(MODELS));
      if (url.includes('/api/chat/stream')) return Promise.resolve(sseStream(sse));
      return Promise.resolve(jsonRes(emptyPage()));
    }));
    renderWithProviders(<ChatInterface />);
    const input = await screen.findByLabelText(/message utkforce/i);
    fireEvent.change(input, { target: { value: 'boom' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
