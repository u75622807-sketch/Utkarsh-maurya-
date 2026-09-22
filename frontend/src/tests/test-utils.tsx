import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export const demoUser = {
  id: 'u-1',
  email: 'test@example.com',
  name: 'Tester',
  avatarUrl: null,
  provider: 'local' as const,
  role: 'user',
  createdAt: new Date().toISOString(),
  lastLoginAt: null,
};

export const demoSettings = {
  userId: 'u-1',
  theme: 'light' as const,
  defaultModel: 'mock-1',
  temperature: 0.7,
  maxTokens: 1024,
  emailNotifs: false,
  updatedAt: new Date().toISOString(),
};

export function renderWithProviders(ui: ReactElement, opts?: RenderOptions & { route?: string }) {
  useAuthStore.setState({ status: 'authed', accessToken: 'test-token', user: demoUser, settings: demoSettings });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const { route, ...rest } = opts ?? {};
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
    rest,
  );
}

export function jsonRes(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'test-req' }),
    json: async () => data,
  } as unknown as Response;
}

export function errorRes(code: string, message: string, status: number): Response {
  return jsonRes({ error: { code, message, requestId: 'test-req' } }, status);
}

export function emptyPage(): Record<string, unknown> {
  return { data: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
}
