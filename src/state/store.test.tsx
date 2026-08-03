import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  StoreProvider,
  useIsOwner,
  useReservation,
  useStore,
  type State,
} from './store';

const wrap = (initial?: Partial<State>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <StoreProvider initial={initial}>{children}</StoreProvider>;
  };

describe('navigation', () => {
  it('follows the tab when moving to a tabbed screen', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    act(() => result.current.dispatch({ type: 'go', screen: 'search' }));
    expect(result.current.state.screen).toBe('search');
    expect(result.current.state.tab).toBe('search');
  });

  it('keeps the active tab on screens outside the tab bar', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    act(() => result.current.dispatch({ type: 'go', screen: 'settings' }));
    expect(result.current.state.screen).toBe('settings');
    expect(result.current.state.tab).toBe('home');
  });

  it('routes a collaborative gift to the pot screen', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    act(() =>
      result.current.dispatch({ type: 'openGift', id: 'g3', pot: true }),
    );
    expect(result.current.state.screen).toBe('pot');
    expect(result.current.state.current).toBe('g3');
  });

  it('advances onboarding then lands on home', () => {
    const { result } = renderHook(() => useStore(), {
      wrapper: wrap({ screen: 'onboarding' }),
    });
    act(() => result.current.dispatch({ type: 'onbNext' }));
    act(() => result.current.dispatch({ type: 'onbNext' }));
    expect(result.current.state.onb).toBe(2);
    act(() => result.current.dispatch({ type: 'onbNext' }));
    expect(result.current.state.screen).toBe('home');
  });
});

describe('reservations', () => {
  it('reserves and releases a gift for a friend', () => {
    const { result } = renderHook(
      () => ({ store: useStore(), res: useReservation('g1') }),
      { wrapper: wrap() },
    );
    expect(result.current.res).toBeNull();
    act(() => result.current.store.dispatch({ type: 'reserve', id: 'g1' }));
    expect(result.current.res).toBe('you');
    act(() => result.current.store.dispatch({ type: 'unreserve', id: 'g1' }));
    expect(result.current.res).toBeNull();
  });

  it("shows a friend that someone else holds a gift", () => {
    const { result } = renderHook(() => useReservation('g2'), {
      wrapper: wrap(),
    });
    expect(result.current).toBe('other');
  });
});

describe('the secrecy rule', () => {
  it('hides every reservation from the owner', () => {
    const { result } = renderHook(
      () => ({ g1: useReservation('g1'), g2: useReservation('g2') }),
      { wrapper: wrap({ role: 'owner', reserved: { g1: 'you', g2: 'other' } }) },
    );
    expect(result.current.g1).toBeNull();
    expect(result.current.g2).toBeNull();
  });

  it('reveals them again to a friend', () => {
    const { result } = renderHook(() => useReservation('g2'), {
      wrapper: wrap({ role: 'friend', reserved: { g2: 'other' } }),
    });
    expect(result.current).toBe('other');
  });

  it('keeps reservations intact under the owner, it only stops reporting them', () => {
    // Switching roles must not destroy data; the friend view still works after.
    const { result } = renderHook(
      () => ({ store: useStore(), res: useReservation('g1') }),
      { wrapper: wrap() },
    );
    act(() => result.current.store.dispatch({ type: 'reserve', id: 'g1' }));
    act(() =>
      result.current.store.dispatch({ type: 'setRole', role: 'owner' }),
    );
    expect(result.current.res).toBeNull();
    act(() =>
      result.current.store.dispatch({ type: 'setRole', role: 'friend' }),
    );
    expect(result.current.res).toBe('you');
  });

  it('reports ownership through useIsOwner', () => {
    const { result } = renderHook(() => useIsOwner(), {
      wrapper: wrap({ role: 'owner' }),
    });
    expect(result.current).toBe(true);
  });
});

describe('the collaborative pot', () => {
  it('adds a contribution', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    act(() => result.current.dispatch({ type: 'contribute', amount: 50 }));
    expect(result.current.state.pot).toBe(700);
  });

  it('never overshoots the target', () => {
    const { result } = renderHook(() => useStore(), {
      wrapper: wrap({ pot: 1590 }),
    });
    act(() => result.current.dispatch({ type: 'contribute', amount: 200 }));
    expect(result.current.state.pot).toBe(1599);
  });
});

describe('toasts', () => {
  it('shows a message then clears it', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    act(() => result.current.flash('Réservé'));
    expect(result.current.toast).toBe('Réservé');
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current.toast).toBeNull();
    vi.useRealTimers();
  });
});
