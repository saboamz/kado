import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StoreProvider, useStore, useViewerRole, type State } from './store';
import { StubSessionProvider, type Viewer } from '../auth/SessionContext';
import { MARC, SOPHIE } from '../test/render';

/**
 * What the store still owns after the API took the domain data.
 *
 * The secrecy selectors that used to live here — useReservation,
 * useReservedCount, usePotState — are gone, and so are their tests. Their
 * replacements are covered in src/api/reservations.test.tsx, against a server
 * that refuses rather than a filter that hides. That is the same guarantee
 * tested one layer down, where it actually holds.
 */
const wrap = (initial?: Partial<State>, viewer: Viewer | null = MARC) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StubSessionProvider viewer={viewer}>
        <StoreProvider initial={initial}>{children}</StoreProvider>
      </StubSessionProvider>
    );
  };

describe('useViewerRole', () => {
  it('treats the signed-in handle as the owner', () => {
    // Sophie, looking at Sophie's list.
    const { result } = renderHook(() => useViewerRole('sophie'), {
      wrapper: wrap(undefined, SOPHIE),
    });
    expect(result.current).toBe('owner');
  });

  it('treats anyone else as a friend', () => {
    // Marc, looking at Sophie's list.
    const { result } = renderHook(() => useViewerRole('sophie'), {
      wrapper: wrap(undefined, MARC),
    });
    expect(result.current).toBe('friend');
  });

  it('treats a signed-out visitor as a friend, never as the owner', () => {
    // Failing open here would hand an anonymous visitor the OWNER's view —
    // the view that hides reservations, the pot and the count — so the leak
    // would look exactly like the feature working.
    const { result } = renderHook(() => useViewerRole('sophie'), {
      wrapper: wrap(undefined, null),
    });
    expect(result.current).toBe('friend');
  });

  it('defaults an unknown handle to friend rather than owner', () => {
    const { result } = renderHook(() => useViewerRole(undefined), {
      wrapper: wrap(undefined, SOPHIE),
    });
    expect(result.current).toBe('friend');
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

describe('theme', () => {
  it('drives the dark class on the document', () => {
    const { result } = renderHook(() => useStore(), { wrapper: wrap() });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    act(() => result.current.dispatch({ type: 'setDark', dark: true }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => result.current.dispatch({ type: 'setDark', dark: false }));
  });
});

describe('toasts', () => {
  it('shows a message then clears it', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useStore(), { wrapper: wrap() });
      act(() => result.current.flash('Réservé'));
      expect(result.current.toast).toBe('Réservé');
      act(() => vi.advanceTimersByTime(2600));
      expect(result.current.toast).toBeNull();
    } finally {
      // In a finally: a failed assertion would otherwise leak fake timers into
      // every test after it, turning one failure into a cascade of timeouts.
      vi.useRealTimers();
    }
  });
});
