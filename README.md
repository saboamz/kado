# Kado

> Des listes de souhaits que vos proches remplissent en secret.

## The rule this app is built around

**The owner never learns that a gift has been reserved.** Not who reserved it,
not how many are taken, not that anything happened at all. The surprise is
structural, not a setting.

That rule is enforced in two places, and it needs both.

### On the server, which is the half that holds

`reservations`, `pots` and `contributions` live in a Postgres schema that
PostgREST **does not expose**. `GET /rest/v1/reservations` is a 404 for
everyone, always, including this app. There is no policy to get wrong and no
query shape to audit, because there is no reachable table.

The client's entire access is four `SECURITY DEFINER` functions
(`supabase/migrations/0010_secret_rpcs.sql`). Asked about a list they own, they
raise `42704` — **the same error a stranger gets for a list they cannot see**.
Not an empty result, because "empty" and "forbidden" are distinguishable and
the difference is itself the secret.

Some consequences worth knowing before you change anything:

- `wish_items` has no `reserved_count` column and never will. A reservation
  writing to the owner's own row is a Realtime timing oracle regardless of RLS.
- Contributor counts are bucketed (`2-5`, `6+`), never exact.
- An owner cannot reserve their own item — a constraint, because otherwise they
  could read it back through "my reservations" and confirm the table holds
  their list.
- Notifications carry a `kind` and a payload, never free text, so
  "Marc a réservé les AirPods" cannot be generated for the wrong recipient.

### On the client, which is presentation only

```ts
// src/state/store.tsx
export function useReservation(giftId: string, role: Role): Reserver | null {
  const { state } = useStore();
  if (role === 'owner') return null;
  return state.reserved[giftId] ?? null;
}
```

Screens never read `state.reserved`. An owner is handed `null`, so there is no
reservation state for a component to accidentally render — no badge, no
counter, no disabled button hinting at what lies underneath. `useReservedCount`
and `usePotState` do the same for the aggregates.

This half is **cosmetic on its own** and always was. It stops the UI drawing
the secret; it does not stop the server sending it. That is why the tests come
in pairs.

## Tests

| Suite | Proves |
| --- | --- |
| `npm test` | The UI never renders a reservation to the owner (135 tests) |
| `supabase/tests/0002_secrecy.test.sql` | The server never sends one (36 assertions) |
| `supabase/tests/0001_schema.test.sql` | Schema invariants hold (75 assertions) |

The database job is a **required check**. Schema exposure is a dashboard
toggle, outside version control — exactly the kind of thing flipped during an
incident and never flipped back.

Both database suites have been verified to fail when the guarantee is broken:
granting `authenticated` access to the private schema, adding a
`reserved_count` column, or removing the owner guard from an RPC each turn them
red by name.

## Getting started

```bash
npm install
npm run dev
```

```bash
# Database (requires the Supabase CLI, or any Postgres 16 + pgvector)
supabase db reset
supabase test db
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the test suite |

## Architecture

```
src/
  app/          router, layouts, route-level error boundary
  api/          the typed data layer (RPC wrappers; no direct table access)
  ui/           design-system primitives (Button, Card, Chip, ScreenShell…)
  components/   shared app components
  screens/      one file per screen, mounted by the route table
  state/        UI state, and the selectors that hold the rule
  styles/       Tailwind entry and design tokens
  data/         fixtures, on their way out as the API lands

supabase/
  migrations/   0001-0008 public schema · 0009-0010 the secret layer
  tests/        pgTAP: schema invariants, and the secrecy guarantee
  seed.sql      deterministic fixtures
```

Navigation is URL-based (React Router v7). **Ownership is derived from the
handle in the URL, never from client state** — the prototype's role toggle is
gone, and with it the idea that a viewpoint is something you can switch.

Styling is Tailwind v4 with the palette as CSS custom properties. The two token
files (`src/theme/tokens.ts` for TypeScript, `src/styles/tokens.css` for CSS)
are pinned to each other by a test, because CSS cannot import from TypeScript
and the pair would otherwise drift in silence.

## Status

Shipped: design tokens and primitives, the router, the public schema, and the
secrecy layer.

Next: authentication and real data (replacing `src/data/`), product ingestion
with URL deduplication, then recommendations — popularity and content-based
first, collaborative filtering only once there is enough signal to beat them.
Deduplication quality caps CF quality, so it is measured before CF is built.

## Contributing

`main` is protected; every change lands through a pull request.

```bash
git checkout -b my-change
npm run lint && npm run build && npm test
gh pr create
```
