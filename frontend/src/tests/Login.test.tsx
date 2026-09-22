import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Login from '../pages/Login';
import { useAuthStore } from '../stores/authStore';
import { demoSettings, demoUser, errorRes, jsonRes, renderWithProviders } from './test-utils';

describe('Login', () => {
  it('renders email + password fields', () => {
    useAuthStore.setState({ status: 'guest' });
    renderWithProviders(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('401 → inline error + focus returns to password (a11y)', async () => {
    useAuthStore.setState({ status: 'guest' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errorRes('UNAUTHORIZED', 'Invalid email or password', 401)),
    );
    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Wrong1234' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i));
    expect(screen.getByLabelText(/password/i)).toHaveFocus();
  });

  it('successful login stores session', async () => {
    useAuthStore.setState({ status: 'guest' });
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/auth/login')) return Promise.resolve(jsonRes({ user: demoUser, accessToken: 'tok' }));
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonRes({ user: demoUser, settings: demoSettings }));
      return Promise.resolve(jsonRes({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 't@e.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
    expect(useAuthStore.getState().accessToken).toBe('tok');
  });
});
