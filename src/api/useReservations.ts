import { useQuery } from '@tanstack/react-query';
import type { Reserver } from '../data/types';
import { reservationStateQuery, potStateQuery, type PotState } from './reservations';

/**
 * Reservation and pot state for the screens.
 *
 * These replace the store selectors of the same shape. The shape is
 * deliberately identical — nothing for an owner — so screens do not change
 * behaviour, only where the answer comes from.
 *
 * The difference the types cannot show: the store selectors filtered data the
 * browser already held, so the secret was one devtools inspection away. These
 * ask a server that refuses to send it.
 *
 * There is ONE code path here, on purpose. An earlier draft branched on
 * whether a backend was configured and kept a client-side `role === 'owner'`
 * check alive for the fixture case — which is precisely the pattern P5 exists
 * to delete, sitting in the codebase looking load-bearing. The fixture data
 * now arrives through a mock transport instead (src/lib/mockTransport.ts), so
 * the only thing that ever decides what an owner sees is a refusal from
 * whatever is answering.
 */

/** Per-item reservation state. Empty for an owner, because the server says so. */
export function useReservations(wishlistId: string | undefined) {
  const query = useQuery(reservationStateQuery(wishlistId));
  const map = query.data;

  return {
    isLoading: query.isLoading,
    get(itemId: string): Reserver | null {
      const row = map?.get(itemId);
      if (!row?.taken) return null;
      return row.mine ? 'you' : 'other';
    },
    /**
     * How many items in this list are taken.
     *
     * No role check: an owner's map is empty because the RPC raised, so this
     * is 0 for them without anyone having to remember to ask.
     */
    count: map ? [...map.values()].filter((r) => r.taken).length : 0,
  };
}

/**
 * Pot state for one item, or null.
 *
 * Null covers "no pot", "cannot see this list" and "you are the owner"
 * indistinguishably — exactly how the server answers, and exactly why a caller
 * cannot tell the three apart either.
 */
export function usePot(itemId: string | undefined): {
  pot: PotState | null;
  isLoading: boolean;
} {
  const query = useQuery(potStateQuery(itemId));
  return { pot: query.data ?? null, isLoading: query.isLoading };
}
