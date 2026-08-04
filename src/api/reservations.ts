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

/** Pot state, as returned by get_pot_state(). */
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
 * So this is not an error condition to report. It means "there is nothing here
 * for you", and the UI renders exactly as if there were no reservations.
 */
export const NOT_FOUND = '42704';

export function isNotFound(error: { code?: string } | null): boolean {
  return error?.code === NOT_FOUND;
}

/*
 * Query options land here in P6, alongside the Supabase client. The shape:
 *
 *   export const reservationStateQuery = (wishlistId: string) =>
 *     queryOptions({
 *       queryKey: ['reservations', wishlistId],
 *       queryFn: async () => {
 *         const { data, error } = await supabase
 *           .rpc('list_reservation_state', { p_wishlist: wishlistId });
 *         // An owner gets 42704 here. That is the guarantee working, not a
 *         // failure: return empty and render a list with no reservation state.
 *         if (isNotFound(error)) return new Map<string, ReservationState>();
 *         if (error) throw error;
 *         return new Map(data.map((r) => [r.wish_item_id, r]));
 *       },
 *     });
 *
 * If you are tempted to add `enabled: !isOwner` as an optimisation, write the
 * comment saying it is an optimisation. It must never become the thing the
 * guarantee rests on — that is precisely the mistake the prototype made.
 */
