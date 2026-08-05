import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './queryKeys';

/**
 * The client's only access to reservation and pot state.
 *
 * There is deliberately no `.from('reservations')` in this file, and there
 * cannot be one: those tables live in a Postgres schema that PostgREST does
 * not expose, so `GET /rest/v1/reservations` is a 404 for every caller
 * including this app. The RPCs below are the entire surface.
 *
 * See supabase/migrations/0009_secrets.sql for why that is the primary control
 * rather than an RLS policy on a public table.
 */

/** Per-item reservation state, as returned by list_reservation_state(). */
export type ReservationState = {
  wish_item_id: string;
  /** Someone holds this item. Never says who — not even to a friend. */
  taken: boolean;
  /** The viewer is the one holding it. */
  mine: boolean;
};

export type PotState = {
  target_cents: number;
  raised_cents: number;
  currency: string;
  state: 'open' | 'funded' | 'closed' | 'refunded';
  /**
   * Bucketed ('0', '1', '2-5', '6+'), never exact. An exact count that ticks
   * up over time is a channel in its own right.
   */
  contributors: string;
  mine_cents: number;
};

/**
 * Postgres undefined_object. The server raises this — with an identical
 * message — for a list that does not exist, one the viewer cannot see, and one
 * the viewer OWNS. Collapsing the three is the point: distinct errors would
 * let an owner enumerate which of their lists carry reservations.
 *
 * So this is not an error to report. It means "there is nothing here for you",
 * and the UI renders exactly as if there were no reservations.
 */
export const NOT_FOUND = '42704';

export function isNotFound(error: { code?: string } | null): boolean {
  return error?.code === NOT_FOUND;
}

/**
 * Reservation state for a whole list, as a Map keyed by wish item.
 *
 * An owner gets an empty Map, because the server refused to tell them
 * anything. That is the guarantee working, not a failure — and note the
 * failure mode if this were ever written the other way round: throwing on
 * 42704 would make an owner's list render an error, which is itself a signal
 * that the list has something to hide.
 */
export const reservationStateQuery = (wishlistId: string | undefined) =>
  queryOptions({
    queryKey: qk.reservations.ofList(wishlistId ?? 'none'),
    enabled: Boolean(wishlistId),
    queryFn: async (): Promise<Map<string, ReservationState>> => {
      const { data, error } = await supabase.rpc('list_reservation_state', {
        p_wishlist: wishlistId!,
      });
      if (isNotFound(error)) return new Map();
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.wish_item_id, r]));
    },
    // Reservation state changes underneath the viewer while they browse, and
    // a stale "available" that turns out to be taken is a wasted click.
    staleTime: 30_000,
  });

/**
 * Pot state for one item. Null when there is no pot, when the viewer cannot
 * see the list, and when the viewer is the owner — all indistinguishable, by
 * design.
 */
export const potStateQuery = (itemId: string | undefined) =>
  queryOptions({
    queryKey: qk.pot.ofItem(itemId ?? 'none'),
    enabled: Boolean(itemId),
    queryFn: async (): Promise<PotState | null> => {
      const { data, error } = await supabase.rpc('get_pot_state', {
        p_item: itemId!,
      });
      if (isNotFound(error)) return null;
      if (error) throw error;
      return (data?.[0] as PotState | undefined) ?? null;
    },
    staleTime: 30_000,
  });

/** Reserve an item. Throws if the server refuses — which it does for an owner. */
export async function reserveItem(itemId: string, message?: string) {
  const { error } = await supabase.rpc('reserve_item', {
    p_item: itemId,
    p_message: message,
  });
  if (error) throw error;
}

export async function releaseItem(itemId: string) {
  const { error } = await supabase.rpc('release_item', { p_item: itemId });
  if (error) throw error;
}

/**
 * After a reservation changes, only the list's own reservation state is stale.
 *
 * Deliberately does NOT invalidate the wishlist itself: nothing in
 * `public.wish_items` varies with reservation state — that is the invariant
 * asserted in supabase/tests/0002_secrecy.test.sql — so refetching it would be
 * a pointless round trip, and a habit that invites someone to later add a
 * counter column "since we refetch anyway".
 */
export function invalidateReservations(qc: QueryClient, wishlistId: string) {
  return qc.invalidateQueries({ queryKey: qk.reservations.ofList(wishlistId) });
}
