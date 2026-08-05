import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  isNotFound,
  potStateQuery,
  reservationStateQuery,
  reserveItem,
  NOT_FOUND,
} from './reservations';
import { server } from '../test/msw/server';
import { db, resetDb } from '../test/msw/handlers';

/**
 * The client half of the secrecy contract.
 *
 * The database refuses an owner (supabase/tests/0002_secrecy.test.sql proves
 * that). These tests prove the CLIENT does the right thing with that refusal:
 * renders as if there were nothing, rather than throwing — because an error
 * screen on the owner's own list is itself a signal that the list has
 * something to hide.
 */

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const LIST = 'aaaaaaaa-0000-0000-0000-000000000001';

describe('reservation state', () => {
  it('gives a friend the taken and mine flags', async () => {
    resetDb({ sessionHandle: 'marc', reserved: { g1: 'you', g2: 'other' } });
    const { result } = renderHook(
      () => useQuery(reservationStateQuery(LIST)),
      { wrapper: wrap() },
    );

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
    resetDb({ sessionHandle: 'marc', reserved: { g2: 'other' } });
    const { result } = renderHook(
      () => useQuery(reservationStateQuery(LIST)),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = result.current.data?.get('g2');
    // A friend must not learn WHICH friend took it: that lets an owner
    // social-engineer one person into revealing the whole set.
    expect(row).not.toHaveProperty('reserver_id');
    expect(Object.keys(row ?? {}).sort()).toEqual(['mine', 'taken', 'wish_item_id']);
  });

  it('hands an owner an empty map, not an error', async () => {
    resetDb({ sessionHandle: 'sophie', reserved: { g1: 'you', g2: 'other' } });
    const { result } = renderHook(
      () => useQuery(reservationStateQuery(LIST)),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Empty, and specifically NOT isError: an error screen on your own list
    // tells you the list has something worth hiding.
    expect(result.current.data?.size).toBe(0);
    expect(result.current.isError).toBe(false);
  });
});

describe('pot state', () => {
  it('gives a friend the total and a bucketed contributor count', async () => {
    resetDb({ sessionHandle: 'marc', potRaised: 65000 });
    const { result } = renderHook(() => useQuery(potStateQuery('g3')), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.raised_cents).toBe(65000);
    // Bucketed, never exact: a number that ticks up is a channel of its own.
    expect(result.current.data?.contributors).toMatch(/^(\d|\d-\d|\d\+)$/);
  });

  it('hands an owner null, not a total', async () => {
    resetDb({ sessionHandle: 'sophie' });
    const { result } = renderHook(() => useQuery(potStateQuery('g3')), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});

describe('reserving', () => {
  it('records a friend reservation', async () => {
    resetDb({ sessionHandle: 'marc', reserved: {} });
    await reserveItem('g1');
    expect(db.reserved.g1).toBe('you');
  });

  it('refuses an owner reserving on their own list', async () => {
    resetDb({ sessionHandle: 'sophie', reserved: {} });
    // Unlike a read, a write SHOULD throw: the caller asked for a state change
    // that did not happen, and silently swallowing that would leave the UI
    // claiming success.
    await expect(reserveItem('g1')).rejects.toMatchObject({ code: NOT_FOUND });
    expect(db.reserved.g1).toBeUndefined();
  });
});

describe('isNotFound', () => {
  it('recognises the code the server uses for owner, stranger and unknown', () => {
    expect(isNotFound({ code: NOT_FOUND })).toBe(true);
    expect(isNotFound({ code: '23505' })).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
