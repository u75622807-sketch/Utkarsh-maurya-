import { QueryClient } from '@tanstack/react-query';

// Singleton taaki logout par cache clear kar sakein (cross-account leak guard).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});
