import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  StoreProvider,
  usePotState,
  useReservation,
  useReservedCount,
  useStore,
  useViewerRole,
  type State,
} from './store';

const wrap = (initial?: Partial<State>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <StoreProvider initial={initial}>{children}</StoreProvider>;
  };

describe('reservations', () => {
  it('reserves and releases a gift for a friend', () => {
    const { result } = renderHook(
      () => ({ store: useStore(), res: useReservation('g1', 'friend') }),
      { wrapper: wrap() },
    );
    expect(result.current.res).toBeNull();
    act(() => result.current.store.dispatch({ type: 'reserve', id: 'g1' }));
    expect(result.current.res).toBe('you');
    act(() => result.current.store.dispatch({ type: 'unreserve', id: 'g1' }));
    expect(result.current.res).toBeNull();
  });

  it('shows a friend that someone else holds a gift', () => {
    const { result } = renderHook(() => useReservation('g2', 'friend'), {
      wrapper: wrap(),
    });
    expect(result.current).toBe('other');
  });
});

describe('the secrecy rule', () => {
  it('hides every reservation from the owner', () => {
    const { result } = renderHook(
      () => ({
        g1: useReservation('g1', 'owner'),
        g2: useReservation('g2', 'owner'),
      }),
      { wrapper: wrap({ reserved: { g1: 'you', g2: 'other' } }) },
    );
    expect(result.current.g1).toBeNull();
    expect(result.current.g2).toBeNull();
  });

  it('reveals them again to a friend', () => {
    const { result } = renderHook(() => useReservation('g2', 'friend'), {
      wrapper: wrap({ reserved: { g2: 'other' } }),
    });
    expect(result.current).toBe('other');
  });

  it('keeps reservations intact under the owner, it only stops reporting them', () => {
    // Changing viewpoint must not destroy data; the friend view still works.
    const { result, rerender } = renderHook(
      ({ role }: { role: 'owner' | 'friend' }) => ({
        store: useStore(),
        res: useReservation('g1', role),
      }),
      {
        wrapper: wrap(),
        initialProps: { role: 'friend' } as { role: 'owner' | 'friend' },
      },
    );
    act(() => result.current.store.dispatch({ type: 'reserve', id: 'g1' }));
    expect(result.current.res).toBe('you');

    rerender({ role: 'owner' });
    expect(result.current.res).toBeNull();

    rerender({ role: 'friend' });
    expect(result.current.res).toBe('you');
  });

  it('gives the owner no count to render, not a zero', () => {
    // A zero would still be a number the UI could print next to "réservées".
    const { result } = renderHook(
      () => ({
        owner: useReservedCount('owner'),
        friend: useReservedCount('friend'),
      }),
      { wrapper: wrap({ reserved: { g1: 'you', g2: 'other' } }) },
    );
    expect(result.current.owner).toBeNull();
    expect(result.current.friend).toBe(2);
  });

  it('gives the owner no pot state at all', () => {
    const { result } = renderHook(
      () => ({ owner: usePotState('owner'), friend: usePotState('friend') }),
      { wrapper: wrap() },
    );
    expect(result.current.owner).toBeNull();
    expect(result.current.friend).toMatchObject({ total: 650 });
  });
});

describe('useViewerRole', () => {
  it('treats the signed-in handle as the owner', () => {
    const { result } = renderHook(() => useViewerRole('sophie'), {
      wrapper: wrap(),
    });
    expect(result.current).toBe('owner');
  });

  it('treats anyone else as a friend', () => {
    const { result } = renderHook(() => useViewerRole('marc'), {
      wrapper: wrap(),
    });
    expect(result.current).toBe('friend');
  });

  it('defaults an unknown handle to friend rather than owner', () => {
    // Failing open here would show reservations to someone who should not see
    // them; failing closed only hides a badge.
    const { result } = renderHook(() => useViewerRole(undefined), {
      wrapper: wrap(),
    });
    expect(result.current).toBe('friend');
  });
});

describe('the collaborative pot', () => {
  it('adds a contribution', () => {
    const { result } = renderHook(
      () => ({ store: useStore(), pot: usePotState('friend') }),
      { wrapper: wrap() },
    );
    act(() => result.current.store.dispatch({ type: 'contribute', amount: 50 }));
    expect(result.current.pot?.total).toBe(700);
  });

  it('never overshoots the target', () => {
    const { result } = renderHook(
      () => ({ store: useStore(), pot: usePotState('friend') }),
      { wrapper: wrap({ pot: 1590 }) },
    );
    act(() =>
      result.current.store.dispatch({ type: 'contribute', amount: 200 }),
    );
    expect(result.current.pot?.total).toBe(1599);
  });
});

describe('layout', () => {
  it('toggles between grid and rows', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    expect(result.current.state.layout).toBe('grid');
    act(() => result.current.dispatch({ type: 'toggleLayout' }));
    expect(result.current.state.layout).toBe('rows');
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
