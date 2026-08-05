import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../auth/SessionContext';
import { hasBackend } from '../lib/supabase';

/**
 * Sends signed-out visitors to /connexion.
 *
 * A convenience, not a control. Every route behind it would return nothing
 * useful to an anonymous session anyway — RLS sees no rows, and the secrecy
 * RPCs raise — so removing this guard would produce empty screens rather than
 * a leak.
 *
 * While the session is still resolving we render nothing rather than
 * redirecting, because a redirect fired during that window bounces an
 * already-signed-in user to the login screen on every cold load.
 */
export function RequireAuth() {
  const { session, loading } = useSession();
  const location = useLocation();

  // Without a configured backend there is no auth to require, and the app runs
  // on fixtures. Production builds cannot reach this: lib/supabase throws.
  if (!hasBackend) return <Outlet />;

  if (loading) return null;

  if (!session) {
    // Remember where they were headed so the magic link lands them there.
    return <Navigate to="/connexion" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
