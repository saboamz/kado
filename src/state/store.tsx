import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Reserver, Role } from '../data/types';
import { POT_TOTAL } from '../data/fixtures';
import { useViewer } from '../auth/SessionContext';

/**
 * What is left of the store after the router took its share.
 *
 * The prototype kept 18 fields in one flat object: navigation, UI preferences
 * and domain data together. Navigation now lives in the URL, so `screen`,
 * `tab`, `current`, `query`, `filter`, `addStep` and `onb` are gone from here —
 * they are `useParams`/`useSearchParams`/`useMatches` at the point of use.
 *
 * What remains is two different things that will separate again in P6:
 *
 *   - UI preferences (`dark`, `layout`) — genuinely client state, and the only
 *     part of this store with a long-term future.
 *   - Domain data (`reserved`, `pot`, `contrib`, `liked`) — placeholders for
 *     server state. These disappear when TanStack Query and the Supabase RPCs
 *     land; nothing new should be added alongside them.
 */
export type State = {
  dark: boolean;
  layout: 'grid' | 'rows';
  /** Gift id -> who holds it. Never read directly; use useReservation(). */
  reserved: Record<string, Reserver>;
  pot: number;
  contrib: number;
  liked: Record<string, boolean>;
};

const INITIAL: State = {
  dark: false,
  layout: 'grid',
  reserved: { g2: 'other' },
  pot: 650,
  contrib: 50,
  liked: { c1: true },
};

type Action =
  | { type: 'setDark'; dark: boolean }
  | { type: 'toggleLayout' }
  | { type: 'reserve'; id: string }
  | { type: 'unreserve'; id: string }
  | { type: 'contribute'; amount: number }
  | { type: 'setContrib'; amount: number }
  | { type: 'toggleLike'; id: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setDark':
      return { ...s, dark: a.dark };
    case 'toggleLayout':
      return { ...s, layout: s.layout === 'grid' ? 'rows' : 'grid' };
    case 'reserve':
      return { ...s, reserved: { ...s.reserved, [a.id]: 'you' } };
    case 'unreserve': {
      const reserved = { ...s.reserved };
      delete reserved[a.id];
      return { ...s, reserved };
    }
    case 'contribute':
      return { ...s, pot: Math.min(POT_TOTAL, s.pot + a.amount) };
    case 'setContrib':
      return { ...s, contrib: a.amount };
    case 'toggleLike':
      return { ...s, liked: { ...s.liked, [a.id]: !s.liked[a.id] } };
  }
}

type Store = {
  state: State;
  dispatch: (a: Action) => void;
  toast: string | null;
  flash: (msg: string) => void;
};

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<State>;
}) {
  const [state, dispatch] = useReducer(reducer, { ...INITIAL, ...initial });
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The theme is a document-level concern now: Tailwind's dark variants key off
  // a `.dark` class on <html>, so components no longer thread it through React.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.dark);
  }, [state.dark]);

  const value = useMemo(
    () => ({ state, dispatch, toast, flash }),
    [state, toast, flash],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used inside a StoreProvider');
  return v;
}

/**
 * Who the current viewer is relative to the wishlist being shown.
 *
 * The prototype had a `role` field flipped by a toggle in the dev chrome; the
 * router phase replaced it with a hardcoded handle; this compares the list's
 * owner against the actual signed-in profile.
 *
 * This decides what to RENDER and nothing more. It is not a security boundary
 * and must never be treated as one: the server makes every secrecy decision
 * from `auth.uid()`, so a viewer who tampers with this changes what their own
 * UI draws and not one byte of what the API will hand them.
 *
 * Signed out, everyone is a friend. That direction matters — failing the other
 * way would show an unauthenticated visitor the owner's view, which is the
 * view that hides things and would therefore look like it worked.
 */
export function useViewerRole(ownerHandle: string | undefined): Role {
  const viewer = useViewer();
  if (!viewer || !ownerHandle) return 'friend';
  return ownerHandle === viewer.handle ? 'owner' : 'friend';
}

/*
 * useReservation, useReservedCount and usePotState lived here.
 *
 * They filtered data the browser already held — correct, and never a
 * guarantee: the secret sat in the store either way, one devtools inspection
 * from being read. Their replacements in src/api/useReservations.ts ask a
 * server that refuses to send it, so there is nothing left to filter.
 *
 * They are deleted rather than deprecated on purpose. A working selector with
 * the right-looking shape is the thing a future screen copies.
 */
