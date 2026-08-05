import { GIFTS, POT_TOTAL } from '../data/fixtures';

/**
 * A stand-in PostgREST, for running the app before a Supabase project exists.
 *
 * This is a TRANSPORT, not a fallback code path. The screens call the same
 * hooks either way; only what answers them changes. That matters because the
 * alternative — branching in the UI on whether a backend is configured — would
 * mean keeping a client-side `role === 'owner'` filter alive somewhere, which
 * is the exact pattern the private schema was built to delete.
 *
 * So this mock ENFORCES THE SAME REFUSAL the database does: asked about a list
 * the caller owns, it raises 42704 rather than returning filtered data. The
 * fixture path is therefore secret-preserving for the same structural reason
 * the real one is, not by a separate mechanism that could drift.
 *
 * It is installed only when VITE_SUPABASE_URL is absent, and production builds
 * throw at import when that is missing (see ./supabase), so this cannot ship.
 */

/** Mirrors the seed: Sophie owns the fixture list. */
const OWNER_HANDLE = 'sophie';

type MockState = {
  reserved: Record<string, 'you' | 'other'>;
  potRaisedCents: number;
  contribCents: number;
  /** Who is signed in. Set by the session provider on sign-in. */
  viewerHandle: string | null;
};

const SEED: Omit<MockState, 'viewerHandle'> = {
  reserved: { g2: 'other' },
  potRaisedCents: 65000,
  contribCents: 5000,
};

const state: MockState = { ...structuredClone(SEED), viewerHandle: null };

export function setMockViewer(handle: string | null) {
  state.viewerHandle = handle;
}

/**
 * Back to the seed.
 *
 * The state above is module-level, so without this one test's reservation
 * leaks into the next and a suite passes or fails depending on file order.
 * Tests call it in beforeEach; nothing in the app does.
 */
export function resetMockData(overrides: Partial<MockState> = {}) {
  Object.assign(state, structuredClone(SEED), overrides);
}

const notFound = () =>
  Object.assign(new Error('not found'), { code: '42704' });

const viewerOwnsTheList = () => state.viewerHandle === OWNER_HANDLE;

/** The RPCs, with the same guards the SQL functions carry. */
export const mockRpc = {
  list_reservation_state() {
    // The guard runs BEFORE any data is assembled: an owner's answer is a
    // refusal, not a filtered version of a friend's.
    if (viewerOwnsTheList()) throw notFound();
    return GIFTS.map((g) => ({
      wish_item_id: g.id,
      taken: Boolean(state.reserved[g.id]),
      mine: state.reserved[g.id] === 'you',
    }));
  },

  get_pot_state({ p_item }: { p_item: string }) {
    if (viewerOwnsTheList()) throw notFound();
    const gift = GIFTS.find((g) => g.id === p_item);
    if (!gift?.pot) throw notFound();

    const n = Object.keys(state.reserved).length + 2;
    return [
      {
        target_cents: POT_TOTAL * 100,
        raised_cents: state.potRaisedCents,
        currency: 'EUR',
        state: 'open' as const,
        // Bucketed, as the database does it.
        contributors: n <= 1 ? String(n) : n <= 5 ? '2-5' : '6+',
        mine_cents: state.contribCents,
      },
    ];
  },

  reserve_item({ p_item }: { p_item: string }) {
    if (viewerOwnsTheList()) throw notFound();
    state.reserved[p_item] = 'you';
  },

  release_item({ p_item }: { p_item: string }) {
    // Silent no-op for an owner, matching release_item(): it must not be
    // usable to probe whether a hold exists.
    if (!viewerOwnsTheList() && state.reserved[p_item] === 'you') {
      delete state.reserved[p_item];
    }
  },

  contribute({
    p_item,
    p_amount_cents,
  }: {
    p_item: string;
    p_amount_cents: number;
  }) {
    if (viewerOwnsTheList()) throw notFound();
    const gift = GIFTS.find((g) => g.id === p_item);
    if (!gift?.pot) throw notFound();
    state.contribCents = p_amount_cents;
    state.potRaisedCents = Math.min(
      POT_TOTAL * 100,
      state.potRaisedCents + p_amount_cents,
    );
  },
};

export type MockRpcName = keyof typeof mockRpc;
