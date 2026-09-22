import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useAuthStore.setState({ status: 'guest', accessToken: null, user: null, settings: null });
});

// matchMedia (theme store)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom lacks scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// crypto.randomUUID (idempotency keys) — jsdom me missing ho sakta hai
const existingCrypto = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
if (!existingCrypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    writable: true,
    value: { ...(existingCrypto as object), randomUUID: () => 'test-uuid-1234' },
  });
}
