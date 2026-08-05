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
export const supabase = createClient<Database>(
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
