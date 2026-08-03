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
import type { Reserver, Role, ScreenId, TabId } from '../data/types';
import { POT_TOTAL } from '../data/fixtures';

const TAB_OF: Partial<Record<ScreenId, TabId>> = {
  home: 'home',
  search: 'search',
  notifs: 'notifs',
  profile: 'profile',
  add: 'add',
};

export type State = {
  screen: ScreenId;
  tab: TabId;
  dark: boolean;
  role: Role;
  onb: number;
  current: string;
  /** Gift id -> who holds it. Never read directly; use useReservation(). */
  reserved: Record<string, Reserver>;
  pot: number;
  contrib: number;
  layout: 'grid' | 'rows';
  link: string;
  addStep: 0 | 1 | 2;
  addList: string;
  addPrio: 1 | 2 | 3;
  query: string;
  filter: string;
  liked: Record<string, boolean>;
};

const INITIAL: State = {
  screen: 'home',
  tab: 'home',
  dark: false,
  role: 'friend',
  onb: 0,
  current: 'g1',
  reserved: { g2: 'other' },
  pot: 650,
  contrib: 50,
  layout: 'grid',
  link: '',
  addStep: 0,
  addList: 'Anniversaire',
  addPrio: 3,
  query: '',
  filter: 'Amis',
  liked: { c1: true },
};

type Action =
  | { type: 'go'; screen: ScreenId }
  | { type: 'openGift'; id: string; pot?: boolean }
  | { type: 'setRole'; role: Role }
  | { type: 'setDark'; dark: boolean }
  | { type: 'onbNext' }
  | { type: 'reserve'; id: string }
  | { type: 'unreserve'; id: string }
  | { type: 'contribute'; amount: number }
  | { type: 'setContrib'; amount: number }
  | { type: 'toggleLayout' }
  | { type: 'setLink'; link: string }
  | { type: 'setAddStep'; step: 0 | 1 | 2 }
  | { type: 'setAddList'; list: string }
  | { type: 'setAddPrio'; prio: 1 | 2 | 3 }
  | { type: 'setQuery'; query: string }
  | { type: 'setFilter'; filter: string }
  | { type: 'toggleLike'; id: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return { ...s, screen: a.screen, tab: TAB_OF[a.screen] ?? s.tab };
    case 'openGift':
      return { ...s, screen: a.pot ? 'pot' : 'detail', current: a.id };
    case 'setRole':
      return { ...s, role: a.role };
    case 'setDark':
      return { ...s, dark: a.dark };
    case 'onbNext':
      return s.onb < 2
        ? { ...s, onb: s.onb + 1 }
        : { ...s, screen: 'home', tab: 'home' };
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
    case 'toggleLayout':
      return { ...s, layout: s.layout === 'grid' ? 'rows' : 'grid' };
    case 'setLink':
      return { ...s, link: a.link };
    case 'setAddStep':
      return { ...s, addStep: a.step };
    case 'setAddList':
      return { ...s, addList: a.list };
    case 'setAddPrio':
      return { ...s, addPrio: a.prio };
    case 'setQuery':
      return { ...s, query: a.query };
    case 'setFilter':
      return { ...s, filter: a.filter };
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
 * The one way to ask "is this gift reserved?".
 *
 * For an owner this ALWAYS returns null — not "reserved by someone unnamed",
 * but nothing at all. The owner's UI cannot render a reservation state it is
 * never handed. Reading `state.reserved` directly in a screen defeats this;
 * don't.
 */
export function useReservation(giftId: string): Reserver | null {
  const { state } = useStore();
  if (state.role === 'owner') return null;
  return state.reserved[giftId] ?? null;
}

/** True when the viewer is the list owner. */
export function useIsOwner(): boolean {
  return useStore().state.role === 'owner';
}
