import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase, hasBackend } from '../lib/supabase';
import { setMockViewer } from '../lib/mockTransport';
import { qk } from '../api/queryKeys';

export type Viewer = {
  id: string;
  handle: string;
  displayName: string;
  onboarded: boolean;
};

type SessionValue = {
  session: Session | null;
  viewer: Viewer | null;
  /** True until the initial session lookup settles. */
  loading: boolean;
};

const SessionCtx = createContext<SessionValue | null>(null);

/**
 * Who you are when running against fixtures.
 *
 * Without a backend there is no sign-in, so there would be no viewer at all —
 * and a null viewer is a *friend*, which meant the fixture app could never
 * show the owner's view and its secrecy behaviour went untested by anyone
 * clicking around. This gives the fixture path an identity that matches the
 * seed, so `/u/sophie/...` is genuinely your own list.
 *
 * Overridable with `?as=marc` to look at the same list as a friend, which is
 * the manual equivalent of the two viewers in the test suite.
 */
function devViewer(): Viewer {
  const as =
    new URLSearchParams(window.location.search).get('as') ?? 'sophie';
  return {
    id: `dev-${as}`,
    handle: as,
    displayName: as === 'sophie' ? 'Sophie Marchand' : as,
    onboarded: true,
  };
}

/**
 * The signed-in user, from Supabase Auth.
 *
 * Replaces the hardcoded `SESSION_HANDLE = 'sophie'` the router phase used as
 * a placeholder. That constant decided who counted as an owner, which made
 * "am I the owner" a client-side opinion. It is now a fact about the session.
 *
 * Worth being precise about what this does and does not buy: the server does
 * not trust this value at all. Every secrecy decision is made in Postgres from
 * `auth.uid()`, so a tampered viewer here changes what the UI draws and
 * nothing about what the API returns.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(hasBackend);

  useEffect(() => {
    if (!hasBackend) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The profile row, not the auth user: `handle` and `display_name` live in
  // public.profiles, and the auth user carries neither.
  const { data: profile } = useQuery({
    queryKey: qk.profile.me(),
    enabled: Boolean(session?.user.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, display_name, onboarded_at')
        .eq('id', session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const viewer = useMemo<Viewer | null>(() => {
    if (!hasBackend) return devViewer();
    if (!profile) return null;
    return {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.display_name,
      onboarded: profile.onboarded_at !== null,
    };
  }, [profile]);

  // Tell the mock transport who is asking, so its 42704 refusal fires for the
  // same person the UI believes is signed in. Layout effect, not passive:
  // queries go out during the children's first commit.
  useLayoutEffect(() => {
    if (!hasBackend) setMockViewer(viewer?.handle ?? null);
  }, [viewer]);

  const value = useMemo<SessionValue>(
    () => ({ session, viewer, loading }),
    [session, viewer, loading],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession must be used inside a SessionProvider');
  return v;
}

/**
 * The signed-in profile, or null when signed out.
 *
 * Returns null rather than throwing outside a provider. That is on purpose:
 * the only consumer is useViewerRole, and a null viewer there means "friend" —
 * the safe direction. Throwing would make a missing provider fail closed in
 * the wrong sense, turning a wiring mistake into an owner-view render.
 */
export function useViewer(): Viewer | null {
  return useContext(SessionCtx)?.viewer ?? null;
}

/**
 * A fixed session, for tests and stories.
 *
 * Real code never uses this — SessionProvider talks to Supabase. It exists so
 * a test can say "look at this as Marc" without standing up an auth server.
 */
export function StubSessionProvider({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: ReactNode;
}) {
  // Keep the mock transport's idea of "who is asking" in step with the stub,
  // so its 42704 refusal fires for the same viewer the UI thinks is signed in.
  // Without this a test could render as the owner and still be served a
  // friend's data, and the assertion would pass for the wrong reason.
  //
  // Layout effect rather than useEffect: queries fire during the children's
  // first commit, and a passive effect would run after that, so the first
  // request of a test would go out under the previous viewer.
  useLayoutEffect(() => {
    if (!hasBackend) setMockViewer(viewer?.handle ?? null);
  }, [viewer]);

  const value = useMemo<SessionValue>(
    () => ({ session: null, viewer, loading: false }),
    [viewer],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
