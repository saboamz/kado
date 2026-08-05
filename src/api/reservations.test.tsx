import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  isNotFound,
  potStateQuery,
  reservationStateQuery,
  reserveItem,
  NOT_FOUND,
} from './reservations';
import { resetMockData, setMockViewer } from '../lib/mockTransport';

/**
 * The client half of the secrecy contract.
 *
 * supabase/tests/0002_secrecy.test.sql proves the DATABASE refuses an owner.
 * These prove the CLIENT does the right thing with that refusal: renders as if
 * there were nothing, rather than throwing — because an error on the owner's
 * own list is itself a signal that the list has something to hide.
 *
 * They run against the mock transport, which is what answers `.rpc()` when no
 * Supabase project is configured. That is deliberate rather than convenient:
 * the mock carries the same guards as the SQL functions, so these tests
 * exercise the refusal path the app actually takes in development, and a
 * change that softened either one would fail here.
 */

const LIST = 'aaaaaaaa-0000-0000-0000-000000000001';

/** The mock treats `sophie` as the owner of the fixture list. */
const asOwner = () => setMockViewer('sophie');
const asFriend = () => setMockViewer('marc');

beforeEach(() => resetMockData());

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('reservation state', () => {
  it('gives a friend the taken and mine flags', async () => {
    asFriend();
    resetMockData({ reserved: { g1: 'you', g2: 'other' } });

    const { result } = renderHook(() => useQuery(reservationStateQuery(LIST)), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.get('g1')).toMatchObject({
      taken: true,
      mine: true,
    });
    expect(result.current.data?.get('g2')).toMatchObject({
      taken: true,
      mine: false,
    });
  });

  it('never exposes who holds a gift, only that someone does', async () => {
    asFriend();
    const { result } = renderHook(() => useQuery(reservationStateQuery(LIST)), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = result.current.data?.get('g2');
    // A friend must not learn WHICH friend took it: that lets an owner
    // social-engineer one person into revealing the whole set.
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'mine',
      'taken',
      'wish_item_id',
    ]);
  });

  it('hands an owner an empty map, not an error', async () => {
    asOwner();
    resetMockData({ reserved: { g1: 'you', g2: 'other' } });

    const { result } = renderHook(() => useQuery(reservationStateQuery(LIST)), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Empty, and specifically NOT isError: an error on your own list tells you
    // the list has something worth hiding.
    expect(result.current.data?.size).toBe(0);
    expect(result.current.isError).toBe(false);
  });
});

describe('pot state', () => {
  it('gives a friend the total and a bucketed contributor count', async () => {
    asFriend();
    const { result } = renderHook(() => useQuery(potStateQuery('g3')), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.raised_cents).toBe(65000);
    // Bucketed, never exact: a number that ticks up is a channel of its own.
    expect(result.current.data?.contributors).toMatch(/^(\d|\d-\d|\d\+)$/);
  });

  it('hands an owner null, not a total', async () => {
    asOwner();
    const { result } = renderHook(() => useQuery(potStateQuery('g3')), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('returns null for a gift that simply has no pot', async () => {
    asFriend();
    const { result } = renderHook(() => useQuery(potStateQuery('g1')), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Same answer as "you are the owner" and "you cannot see this list". The
    // caller cannot tell the three apart, which is the point.
    expect(result.current.data).toBeNull();
  });
});

describe('reserving', () => {
  it('records a friend reservation', async () => {
    asFriend();
    await reserveItem('g1');

    const { result } = renderHook(() => useQuery(reservationStateQuery(LIST)), {
      wrapper: wrap(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.get('g1')).toMatchObject({ mine: true });
  });

  it('refuses an owner reserving on their own list', async () => {
    asOwner();
    // Unlike a read, a write SHOULD throw: the caller asked for a state change
    // that did not happen, and swallowing that would leave the UI claiming
    // success.
    await expect(reserveItem('g1')).rejects.toMatchObject({ code: NOT_FOUND });
  });
});

describe('isNotFound', () => {
  it('recognises the code the server uses for owner, stranger and unknown', () => {
    expect(isNotFound({ code: NOT_FOUND })).toBe(true);
    expect(isNotFound({ code: '23505' })).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
