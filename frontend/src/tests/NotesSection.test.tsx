import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotesSection from '../components/NotesSection';
import { emptyPage, jsonRes, renderWithProviders } from './test-utils';

describe('NotesSection', () => {
  it('empty → EmptyState + CTA opens editor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(emptyPage())));
    renderWithProviders(<NotesSection />);
    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /write first note/i }));
    expect(screen.getByPlaceholderText(/note title/i)).toBeInTheDocument();
  });

  it('save without title → inline error (no API call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(emptyPage()));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NotesSection />);
    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /write first note/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/title/i);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/notes'), expect.objectContaining({ method: 'POST' }));
  });

  it('create note → POST + list refetch', async () => {
    const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
      if (url.includes('/api/notes') && init?.method === 'POST') {
        return Promise.resolve(
          jsonRes({ id: 'n1', userId: 'u-1', title: 'My note', content: 'hi', tags: [], pinned: false, createdAt: '', updatedAt: '' }, 201),
        );
      }
      return Promise.resolve(jsonRes(emptyPage()));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NotesSection />);
    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /write first note/i }));
    fireEvent.change(screen.getByPlaceholderText(/note title/i), { target: { value: 'My note' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/notes'), expect.objectContaining({ method: 'POST' })),
    );
  });
});
