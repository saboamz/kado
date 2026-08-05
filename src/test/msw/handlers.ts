import { http, HttpResponse } from 'msw';
import { GIFTS, POT_TOTAL } from '../../data/fixtures';
import { NOT_FOUND } from '../../api/reservations';

/**
 * A PostgREST stand-in, seeded from the same fixtures the screens used to
 * import directly.
 *
 * This is how src/data/ keeps its value while disappearing from the source:
 * the fixtures become the seed for a fake server rather than module-level
 * constants the screens read synchronously.
 *
 * The handlers model the SECRECY BEHAVIOUR, not just the happy path. An owner
 * asking about their own list gets a 404 with code 42704 here exactly as the
 * database gives them — so a test can prove the client does the right thing
 * with that answer, and so a future change that starts throwing on it fails
 * here rather than in production.
 */

const BASE = 'http://localhost:54321';

/** Whose list is whose, mirroring the seed. */
export const OWNER_HANDLE = 'sophie';
export const LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** Mutable per-test state; reset between tests by resetDb(). */
type Db = {
  /** wish item id -> reserver ('you' = the signed-in viewer). */
  reserved: Record<string, 'you' | 'other'>;
  potRaised: number;
  /** The handle the current session belongs to. */
  sessionHandle: string;
};

const INITIAL: Db = {
  reserved: { g2: 'other' },
  potRaised: 65000,
  sessionHandle: 'marc',
};

export let db: Db = structuredClone(INITIAL);

export function resetDb(overrides: Partial<Db> = {}) {
  db = { ...structuredClone(INITIAL), ...overrides };
}

/** The 42704 the server raises for owner / stranger / unknown alike. */
const notFound = () =>
  HttpResponse.json(
    { code: NOT_FOUND, message: 'not found', details: null, hint: null },
    { status: 404 },
  );

const viewerIsOwner = () => db.sessionHandle === OWNER_HANDLE;

export const handlers = [
  http.post(`${BASE}/rest/v1/rpc/list_reservation_state`, () => {
    // The guard that matters. Note it is checked BEFORE any data is assembled:
    // the owner's response is not a filtered version of the friend's, it is a
    // refusal.
    if (viewerIsOwner()) return notFound();

    return HttpResponse.json(
      GIFTS.map((g) => ({
        wish_item_id: g.id,
        taken: Boolean(db.reserved[g.id]),
        mine: db.reserved[g.id] === 'you',
      })),
    );
  }),

  http.post(`${BASE}/rest/v1/rpc/get_pot_state`, async ({ request }) => {
    if (viewerIsOwner()) return notFound();

    const { p_item } = (await request.json()) as { p_item: string };
    const gift = GIFTS.find((g) => g.id === p_item);
    if (!gift?.pot) return notFound();

    const n = Object.keys(db.reserved).length + 2;
    return HttpResponse.json([
      {
        target_cents: POT_TOTAL * 100,
        raised_cents: db.potRaised,
        currency: 'EUR',
        state: 'open',
        // Bucketed, as the database does it.
        contributors: n <= 1 ? String(n) : n <= 5 ? '2-5' : '6+',
        mine_cents: 5000,
      },
    ]);
  }),

  http.post(`${BASE}/rest/v1/rpc/reserve_item`, async ({ request }) => {
    if (viewerIsOwner()) return notFound();
    const { p_item } = (await request.json()) as { p_item: string };
    db.reserved[p_item] = 'you';
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/rest/v1/rpc/release_item`, async ({ request }) => {
    const { p_item } = (await request.json()) as { p_item: string };
    // A silent no-op for an owner, matching release_item(): it must not be
    // usable to probe whether a hold exists.
    if (!viewerIsOwner() && db.reserved[p_item] === 'you') {
      delete db.reserved[p_item];
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // Anything not modelled yet fails loudly rather than silently returning
  // undefined and surfacing as a confusing render error three layers up.
  http.all(`${BASE}/rest/v1/*`, ({ request }) => {
    throw new Error(`Unhandled request in test: ${request.method} ${request.url}`);
  }),
];
