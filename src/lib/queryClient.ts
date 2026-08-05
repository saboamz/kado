import { QueryClient } from '@tanstack/react-query';

/**
 * Shared cache configuration.
 *
 * `retry` is deliberately conservative for this app: a 42704 from a secrecy
 * RPC is a permanent, intentional answer, not a transient failure, and
 * hammering it three times would only add latency to the owner's own list
 * view. The reservation queries already convert that code into an empty
 * result before it can reach here, so anything that does reach here is a real
 * error worth surfacing quickly.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const code = (error as { code?: string } | null)?.code;
          // Postgres error classes 42xxx (syntax/access) and 23xxx
          // (constraint) will never succeed on retry.
          if (code && /^(42|23)/.test(code)) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}
