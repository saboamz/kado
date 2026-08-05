import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether the app is wired to a real backend.
 *
 * Until a project is provisioned the screens still run on fixtures, so a
 * missing URL is a normal state rather than a crash. Fail loudly in production
 * though: a deployed build silently serving fixture data would be worse than
 * an error page.
 */
export const hasBackend = Boolean(url && anonKey);

if (!hasBackend && import.meta.env.PROD) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in a production build',
  );
}

/**
 * The one Supabase client.
 *
 * ONLY the anon key belongs here. The service_role key bypasses RLS entirely
 * and must never reach a browser bundle — CI greps dist/ for it on every PR.
 *
 * Note there is no way to reach reservations, pots or contributions through
 * this client's `.from()`: those tables are in a schema PostgREST does not
 * expose. `.rpc()` is the only door, and the functions behind it refuse an
 * owner asking about their own list.
 */
const client = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The session lands in the URL fragment after a magic-link click; strip
      // it once consumed so the access token does not sit in history or get
      // copy-pasted into a bug report.
      detectSessionInUrl: true,
    },
  },
);

/**
 * Without a configured project, `.rpc()` is answered by the mock transport.
 *
 * The point is that src/api/ never learns which one replied: it awaits a
 * `{ data, error }` either way, and an owner gets the same 42704 refusal from
 * both. Branching in the UI instead would mean keeping a client-side owner
 * check alive for the fixture case, which is the pattern the private schema
 * exists to delete.
 */
if (!hasBackend) {
  const rpc = client.rpc.bind(client);
  // @ts-expect-error — deliberately narrowing a heavily-overloaded signature.
  client.rpc = async (name: string, args: Record<string, unknown>) => {
    const { mockRpc } = await import('./mockTransport');
    const fn = mockRpc[name as keyof typeof mockRpc];
    if (!fn) return rpc(name as never, args as never);
    try {
      return { data: fn(args as never) ?? null, error: null };
    } catch (e) {
      const err = e as Error & { code?: string };
      return { data: null, error: { code: err.code, message: err.message } };
    }
  };

  // Edge functions too, for the same reason.
  //
  // `functions` is a GETTER that builds a fresh FunctionsClient on every
  // access, so assigning to `client.functions.invoke` writes to an object that
  // is thrown away immediately. The getter itself has to be replaced.
  const mockFunctions = {
    invoke: async (name: string, opts?: { body?: unknown }) => {
      const { mockScrape } = await import('./mockTransport');
      if (name === 'scrape-product') {
        const url = (opts?.body as { url?: string } | undefined)?.url ?? '';
        // A beat of latency, so the loading state is real rather than skipped.
        await new Promise((r) => setTimeout(r, 50));
        // Same envelope as the real function: { product, extracted_by }.
        return {
          data: { product: mockScrape(url), extracted_by: 'json-ld' },
          error: null,
        };
      }
      return {
        data: null,
        error: new Error(`mockTransport has no stub for function "${name}"`),
      };
    },
  };
  Object.defineProperty(client, 'functions', {
    get: () => mockFunctions,
    configurable: true,
  });

  // `.from()` needs the same treatment: left alone it waits out a network
  // timeout against a URL that does not exist, which reads as "the app is
  // slow" rather than "there is no backend".
  //
  // This models only the slice of PostgREST's builder the queries use. It is
  // chainable and thenable, so `await supabase.from(t).select(...).eq(...)`
  // resolves like the real thing.
  // @ts-expect-error — same narrowing as above.
  client.from = (table: string) => {
    const filters: { op: string; column: string; value: unknown }[] = [];
    let limitTo = Infinity;
    let single = false;

    const run = async () => {
      const { mockSelect } = await import('./mockTransport');
      try {
        const rows = mockSelect(table, filters).slice(0, limitTo);
        return single
          ? { data: rows[0] ?? null, error: null }
          : { data: rows, error: null };
      } catch (e) {
        const err = e as Error & { code?: string };
        return { data: null, error: { code: err.code, message: err.message } };
      }
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      /**
       * PostgREST's `or` takes a filter string: `col.ilike.%x%,other.ilike.%x%`.
       *
       * This was a no-op, which meant every search returned every row — search
       * appeared to work while filtering nothing, and the screen's empty state
       * was unreachable. Parsing the few operators the app uses is cheap and
       * makes the fixture path behave like the real one.
       */
      or: (expr: string) => {
        const clauses = expr.split(',').map((clause) => {
          const [column, op, ...rest] = clause.split('.');
          return { op, column, value: rest.join('.') };
        });
        filters.push({ op: 'or', column: '', value: clauses });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return builder;
      },
      not: (column: string, _op: string, value: unknown) => {
        filters.push({ op: 'not.is', column, value });
        return builder;
      },
      ilike: (column: string, value: unknown) => {
        filters.push({ op: 'ilike', column, value });
        return builder;
      },
      limit: (n: number) => {
        limitTo = n;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return run();
      },
      single: () => {
        single = true;
        return run();
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
    };
    return builder;
  };
}

export const supabase = client;
