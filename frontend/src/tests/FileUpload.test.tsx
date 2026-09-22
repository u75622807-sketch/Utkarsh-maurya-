import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileUpload from '../components/FileUpload';
import { emptyPage, jsonRes, renderWithProviders } from './test-utils';

describe('FileUpload', () => {
  it('empty list → EmptyState', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(emptyPage())));
    renderWithProviders(<FileUpload />);
    await waitFor(() => expect(screen.getByText(/no files yet/i)).toBeInTheDocument());
  });

  it('oversize file blocked client-side (no upload attempt)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(emptyPage()));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<FileUpload />);
    await waitFor(() => expect(screen.getByText(/no files yet/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/choose file to upload/i) as HTMLInputElement;
    const big = new File(['x'], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/too big/i);
    const posts = fetchMock.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('disallowed type blocked client-side', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(emptyPage())));
    renderWithProviders(<FileUpload />);
    await waitFor(() => expect(screen.getByText(/no files yet/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/choose file to upload/i) as HTMLInputElement;
    const exe = new File(['MZ'], 'evil.exe', { type: 'application/x-msdownload' });
    fireEvent.change(input, { target: { files: [exe] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/not allowed/i);
  });
});
