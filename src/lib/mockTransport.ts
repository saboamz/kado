import { GIFTS, POT_TOTAL } from '../data/fixtures';
import { SCRAPED } from '../data/add';
import {
  BIRTHDAYS,
  COLLECTIONS,
  NOTIFICATIONS,
  PEOPLE,
  PROFILE_BIO,
  INTERESTS,
} from '../data/social';

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

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
//
// `.from()` needs answering too. Without this every screen waits out a network
// timeout against a URL that does not exist, which reads as "the app is slow"
// rather than "there is no backend".
//
// Only the columns the queries actually select are modelled. A table with no
// entry here throws rather than returning [], because an empty array is
// indistinguishable from "no rows yet" and would hide the omission.

const handleOf = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(' ')[0];

const uuid = (n: number) =>
  `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

const PROFILES = PEOPLE.map((p, i) => ({
  id: uuid(i + 1),
  handle: handleOf(p.name),
  display_name: p.name,
  avatar_url: null,
  bio: PROFILE_BIO,
  interests: INTERESTS,
  // BIRTHDAYS carries relative copy ("dans 12 j"), not dates. The screens
  // format from `birthday`, so give the first few a real one.
  birthday:
    i < BIRTHDAYS.length ? `1990-0${(i % 9) + 1}-1${(i % 9) + 1}` : null,
  onboarded_at: '2024-01-01T00:00:00Z',
}));

const NOTIFICATION_ROWS = NOTIFICATIONS.map((n, i) => ({
  id: uuid(100 + i),
  // The fixture text is prose; the real table is structured. Map onto the
  // nearest kind so the client renders from a template, as it will in
  // production.
  kind: n.hot
    ? ('pot_progress' as const)
    : n.who === 'Kado'
      ? ('system' as const)
      : ('wish_added' as const),
  actor_id: null,
  subject_type: null,
  subject_id: null,
  payload: { who: n.who, text: n.text, time: n.time },
  read_at: n.unread ? null : '2024-01-01T00:00:00Z',
  created_at: `2024-01-0${(i % 9) + 1}T00:00:00Z`,
}));

/** Matches supabase/seed.sql, so ids mean the same thing in both. */
export const FIXTURE_LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const WISHLIST_ROWS = COLLECTIONS.map((c, i) => ({
  // The first collection IS the seeded list; the rest are extra.
  id: i === 0 ? FIXTURE_LIST_ID : uuid(200 + i),
  owner_id: PROFILES[0].id,
  title: c.name,
  slug: c.id,
  occasion: null,
  event_date: null,
  cover_url: null,
  archived_at: null,
}));

/**
 * The fixture gifts as wish_items rows.
 *
 * Note the shape difference that matters: `price` was a formatted string
 * ('1 599 €') and `price_cents` is an integer. The screens format for display
 * now instead of printing a stored string, which is what lets a price be
 * compared, summed or converted rather than only shown.
 */
const WISH_ITEM_ROWS = GIFTS.map((g, i) => ({
  id: g.id,
  wishlist_id: FIXTURE_LIST_ID,
  owner_id: PROFILES[0].id,
  product_id: null,
  title: g.name,
  note: g.desc,
  image_url: null,
  price_cents: Number(g.price.replace(/[^\d]/g, '')) * 100,
  currency: 'EUR',
  priority: g.prio,
  quantity: 1,
  status: 'active' as const,
  is_pot: Boolean(g.pot),
  position: i,
  // Kept so the screens can go on rendering the hatch placeholders and the
  // merchant card until products land in P7.
  art: g.art,
  cat: g.cat,
  merchant: g.merchant,
  url: g.url,
}));

export const mockTables: Record<string, unknown[]> = {
  profiles: PROFILES,
  notifications: NOTIFICATION_ROWS,
  wishlists: WISHLIST_ROWS,
  wish_items: WISH_ITEM_ROWS,
};

// ---------------------------------------------------------------------------
// Edge functions
// ---------------------------------------------------------------------------

/**
 * Stands in for the `scrape-product` Edge Function until P7 builds it.
 *
 * Returns the fixture the prototype's fake scraper used, so the add flow is
 * exercisable end to end. `product_id` is null on purpose: nothing has been
 * written to a catalogue, and pretending otherwise would let the add flow
 * "succeed" against a product that does not exist.
 */
export function mockScrape(url: string) {
  const host = (() => {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      return 'inconnu';
    }
  })();

  return {
    product_id: null,
    title: SCRAPED.name,
    // The fixture holds a formatted string; cents is what crosses the wire.
    price_cents: 27900,
    currency: 'EUR',
    image_url: null,
    description: SCRAPED.desc,
    merchant: host.replace(/^www\./, ''),
    source: `${host.replace(/^www\./, '')} · récupéré automatiquement`,
  };
}

/** Applies the subset of PostgREST filters the queries use. */
export function mockSelect(
  table: string,
  filters: { op: string; column: string; value: unknown }[],
): unknown[] {
  const rows = mockTables[table];
  if (!rows) {
    throw Object.assign(
      new Error(
        `mockTransport has no fixture for table "${table}". Add one rather ` +
          `than letting the screen see an empty list, which looks like real data.`,
      ),
      { code: 'MOCK_MISSING_TABLE' },
    );
  }

  const test = (
    row: unknown,
    op: string,
    column: string,
    value: unknown,
  ): boolean => {
    const cell = (row as Record<string, unknown>)[column];
    switch (op) {
      case 'eq':
        return String(cell) === String(value);
      case 'is':
        return value === null ? cell === null : cell === value;
      case 'not.is':
        return value === null ? cell !== null : cell !== value;
      case 'ilike':
        return String(cell ?? '')
          .toLowerCase()
          .includes(String(value).replace(/%/g, '').toLowerCase());
      default:
        return true;
    }
  };

  return rows.filter((row) =>
    filters.every(({ op, column, value }) => {
      // `or` carries a list of clauses; any one matching is enough.
      if (op === 'or') {
        const clauses = value as {
          op: string;
          column: string;
          value: unknown;
        }[];
        return clauses.some((c) => test(row, c.op, c.column, c.value));
      }
      const cell = (row as Record<string, unknown>)[column];
      switch (op) {
        case 'eq':
          return String(cell) === String(value);
        case 'is':
          return value === null ? cell === null : cell === value;
        case 'not.is':
          return value === null ? cell !== null : cell !== value;
        case 'ilike':
          return String(cell ?? '')
            .toLowerCase()
            .includes(String(value).replace(/%/g, '').toLowerCase());
        default:
          return true;
      }
    }),
  );
}
